// Runs the whole demo loop with a scripted stand-in model, so the plumbing (agent, tools,
// streaming, output) can be checked without an API key.
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

// Does what a good model should: open the issue, summarize without tools.
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

    const calledTool = prompt.slice(lastUser + 1).some(m => m.role === 'tool');
    if (!calledTool) {
      return call('createIssue', {
        title: 'CLI crashes on Node 24 with ERR_REQUIRE_ESM',
        body: '**What’s happening** The CLI throws ERR_REQUIRE_ESM on start with Node 24.\n**Reported by** @dana_ships and @kev_codes on X',
        labels: ['bug', 'regression'],
      });
    }
    return say('Issue preview only. No GitHub issue was created. The report covers the Node 24 CLI crash and ERR_REQUIRE_ESM.');
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
const expected = [['createIssue'], []];
if (JSON.stringify(calls) !== JSON.stringify(expected)) {
  console.error(`\x1b[31mSmoke test failed\nexpected ${JSON.stringify(expected)}\ngot      ${JSON.stringify(calls)}\x1b[0m`);
  process.exit(1);
}
console.log('\x1b[32mSmoke test passed\x1b[0m');
process.exit(0);
