// Runs the whole demo loop with a scripted stand-in model, so the plumbing (agent, tools,
// streaming, output) can be checked without an API key. It picks the tool a real model should pick.
//   npm test
import { Agent } from '@mastra/core/agent';
import { tagbotInstructions } from '../src/mastra/agents/tagbot';
import { tagbotTools } from '../src/mastra/tools';
import { runDemo } from './run-demo';
import { scenario } from './scenario';

const usage = { inputTokens: 10, outputTokens: 10, totalTokens: 20 };
const streamOf = (parts: unknown[]) =>
  new ReadableStream({
    start(controller) {
      parts.forEach(p => controller.enqueue(p));
      controller.close();
    },
  });

const scriptedCalls: [RegExp, string, Record<string, string>][] = [
  [/calendar/i, 'addToCalendar', { title: 'Merge × Mastra workshop', start: '2026-10-20T12:00:00', end: '2026-10-20T13:00:00', details: 'mastra.ai/workshops' }],
  [/reading list/i, 'saveToReadingList', { title: 'Seven things we learned shipping agents', summary: 'Scope tools per user and log every action.', sourceUrl: 'agentpatterns.dev/production' }],
  [/team/i, 'tellTheTeam', { message: 'A customer reports checkout failing with a 502 since about 9:40am.' }],
];

const scriptedModel = {
  specificationVersion: 'v2',
  provider: 'scripted',
  modelId: 'scripted',
  supportedUrls: {},
  doGenerate: async () => {
    throw new Error('The smoke test only streams');
  },
  doStream: async ({ prompt }: { prompt: { role: string; content: unknown }[] }) => {
    const last = prompt[prompt.length - 1]!;
    if (last.role === 'tool') {
      return {
        stream: streamOf([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: 'Done, it’s handled ✅' },
          { type: 'text-end', id: 't' },
          { type: 'finish', finishReason: 'stop', usage },
        ]),
      };
    }
    const text = JSON.stringify(last.content);
    const [, toolName, input] = scriptedCalls.find(([pattern]) => pattern.test(text)) ?? [];
    if (!toolName) throw new Error(`No scripted tool for ${text}`);
    return {
      stream: streamOf([
        { type: 'stream-start', warnings: [] },
        { type: 'tool-call', toolCallId: `call-${toolName}`, toolName, input: JSON.stringify(input) },
        { type: 'finish', finishReason: 'tool-calls', usage },
      ]),
    };
  },
};

const agent = new Agent({
  id: 'tagbot-smoke',
  name: 'Merge × Mastra Bot (smoke test)',
  instructions: tagbotInstructions,
  model: scriptedModel as any,
  tools: tagbotTools,
});

const actions = await runDemo(agent, scenario, { pauseMs: 0 });
if (actions !== scenario.length) {
  console.error(`\x1b[31mSmoke test failed, expected ${scenario.length} actions\x1b[0m`);
  process.exit(1);
}
console.log('\x1b[32mSmoke test passed\x1b[0m');
process.exit(0);
