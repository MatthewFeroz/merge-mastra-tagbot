// Runs the whole demo loop with a scripted stand-in model, so the plumbing (agent, tools,
// streaming, output, duplicate check) can be checked without an API key.
//   npm test
import { Agent } from '@mastra/core/agent';
import { teammateInstructions } from '../src/mastra/agents/teammate';
import { teammateTools } from '../src/mastra/tools';
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
    if (/summarize/i.test(request)) return say('• Staging deploys fail on the payments sandbox\n• Decision is to mock it in CI\n• Riya owns the PR');

    const results = prompt
      .slice(lastUser + 1)
      .filter(m => m.role === 'tool')
      .flatMap(m => m.content)
      .filter((p: any) => p.type === 'tool-result');
    const last: any = results.at(-1);
    const value = last?.output?.value ?? last?.result;

    if (!last) return call('findSimilarTickets', { keyword: 'export' });
    if (last.toolName === 'findSimilarTickets' && value?.tickets?.length) {
      return say(`This is already tracked as ${value.tickets[0].id}, so I didn’t file a duplicate.`);
    }
    if (last.toolName === 'findSimilarTickets') {
      return call('createTicket', {
        title: 'CSV export times out for files over 50MB',
        description: '**What’s happening** Exports over ~50MB time out since Tuesday’s deploy.\n**Impact** Acme, board meeting Thursday, renewal next month.\n**Reported by** Jordan (Support)',
        priority: 'high',
      });
    }
    return say(`Filed ${value?.id}, CSV export times out for files over 50MB (high priority).`);
  },
};

const agent = new Agent({
  id: 'teammate-smoke',
  name: 'Merge × Mastra Teammate (smoke test)',
  instructions: teammateInstructions,
  model: scriptedModel as any,
  tools: teammateTools,
});

const calls = await runDemo(agent, scenario, { pauseMs: 0 });
const expected = [['findSimilarTickets', 'createTicket'], [], ['findSimilarTickets']];
if (JSON.stringify(calls) !== JSON.stringify(expected)) {
  console.error(`\x1b[31mSmoke test failed\nexpected ${JSON.stringify(expected)}\ngot      ${JSON.stringify(calls)}\x1b[0m`);
  process.exit(1);
}
console.log('\x1b[32mSmoke test passed\x1b[0m');
process.exit(0);
