// Runs the whole demo loop with a scripted stand-in model, so the plumbing (agent, tools,
// streaming, output, duplicate check) can be checked without an API key.
//   npm test
import { Agent } from '@mastra/core/agent';
import { tagbotInstructions } from '../src/mastra/agents/tagbot';
import { tagbotTools } from '../src/mastra/tools';
import { runDemo } from './run-demo';
import { scenario } from './scenario';

type PromptMessage = { role: string; content: any };

const usage = { inputTokens: 10, outputTokens: 10, totalTokens: 20 };
const streamOf = (parts: unknown[]) =>
  new ReadableStream({
    start(controller) {
      parts.forEach(p => controller.enqueue(p));
      controller.close();
    },
  });
const say = (text: string) => ({
  stream: streamOf([
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: text },
    { type: 'text-end', id: 't' },
    { type: 'finish', finishReason: 'stop', usage },
  ]),
});
const call = (toolName: string, input: unknown) => ({
  stream: streamOf([
    { type: 'stream-start', warnings: [] },
    { type: 'tool-call', toolCallId: `call-${toolName}-${Date.now()}`, toolName, input: JSON.stringify(input) },
    { type: 'finish', finishReason: 'tool-calls', usage },
  ]),
});

// Does what a good model should: summarize without tools, check for duplicates before filing.
const scriptedModel = {
  specificationVersion: 'v2',
  provider: 'scripted',
  modelId: 'scripted',
  supportedUrls: {},
  doGenerate: async () => {
    throw new Error('The smoke test only streams');
  },
  doStream: async ({ prompt }: { prompt: PromptMessage[] }) => {
    const lastUser = prompt.map(m => m.role).lastIndexOf('user');
    const request = JSON.stringify(prompt[lastUser]?.content);
    if (/summarize/i.test(request)) return say('Keep agent credentials in a broker, not the agent. You get one place to see every action and can revoke access without redeploying. Prototype with keys, switch before real users.');

    const results = prompt
      .slice(lastUser + 1)
      .filter(m => m.role === 'tool')
      .flatMap(m => m.content)
      .filter((p: any) => p.type === 'tool-result');
    const last: any = results.at(-1);
    const value = last?.output?.value ?? last?.result;

    if (!last) return call('findSimilarTickets', { keyword: 'export' });
    if (last.toolName === 'findSimilarTickets' && value?.tickets?.length) {
      return say('Already logged with the team and they’re on it. Thanks for reporting it.');
    }
    if (last.toolName === 'findSimilarTickets') {
      return call('createTicket', {
        title: 'CSV export times out for files over 50MB',
        description: '**What’s happening** Exports over ~50MB time out since Tuesday’s deploy.\n**Reported by** @dana_ships and @kev_codes on X',
        priority: 'high',
      });
    }
    return say('Logged with the team, thanks for flagging it. They’re looking at large CSV exports timing out.');
  },
};

const agent = new Agent({
  id: 'tagbot-smoke',
  name: 'Merge × Mastra Bot (smoke test)',
  instructions: tagbotInstructions,
  model: scriptedModel as any,
  tools: tagbotTools,
});

const calls = await runDemo(agent, scenario, { pauseMs: 0 });
const expected = [['findSimilarTickets', 'createTicket'], [], ['findSimilarTickets']];
if (JSON.stringify(calls) !== JSON.stringify(expected)) {
  console.error(`\x1b[31mSmoke test failed\nexpected ${JSON.stringify(expected)}\ngot      ${JSON.stringify(calls)}\x1b[0m`);
  process.exit(1);
}
console.log('\x1b[32mSmoke test passed\x1b[0m');
process.exit(0);
