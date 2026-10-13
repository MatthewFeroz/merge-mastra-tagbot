import type { Agent } from '@mastra/core/agent';
import { agentHandlerConfigured } from '../src/mastra/agent-handler';
import type { SlackThread } from './scenario';

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const purple = (s: string) => `\x1b[35m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const short = (v: unknown, n = 110) => {
  const s = JSON.stringify(v) ?? '';
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const indent = (s: string, pad: string) => s.split('\n').join(`\n${pad}`);

/** Plays each thread through the agent and prints what it did. Returns the tools called per thread. */
export async function runDemo(agent: Agent, scenario: SlackThread[], { pauseMs = 800 } = {}) {
  const pause = () => new Promise(r => setTimeout(r, pauseMs));
  const mode = agentHandlerConfigured ? green('live, Linear through Merge Agent Handler') : dim('dry run, Linear is simulated');
  console.log(`\n${bold('Merge × Mastra Teammate')}  ${mode}\n`);

  const calls: string[][] = [];
  for (const thread of scenario) {
    console.log(bold(`  ${thread.channel}`));
    for (const m of thread.messages) console.log(`  ${dim(m.from.padEnd(18))} ${m.text}`);
    console.log(`  ${bold(thread.mention.from.padEnd(18))} ${thread.mention.text.replace('@bot', purple('@bot'))}\n`);
    await pause();

    const transcript = thread.messages.map(m => `${m.from}: ${m.text}`).join('\n');
    const stream = await agent.stream(
      `${thread.mention.from} mentioned you in a thread in ${thread.channel}.\n\nThread so far:\n${transcript}\n\nTheir message: ${thread.mention.text}`,
      { maxSteps: 5 },
    );

    const called: string[] = [];
    for await (const chunk of stream.fullStream) {
      if (chunk.type === 'tool-call') {
        called.push(chunk.payload.toolName);
        console.log(`    → ${chunk.payload.toolName} ${dim(short(chunk.payload.args))}`);
      } else if (chunk.type === 'tool-result') {
        const r = chunk.payload.result as any;
        if (chunk.payload.isError) console.log(`      ${red('✗ failed')} ${dim(short(r, 200))}`);
        else if (r?.tickets) console.log(`      ${green('✓')} ${r.tickets.length ? r.tickets.map((t: any) => `${t.id} ${t.title}`).join(', ') : 'no open tickets match'}`);
        else if (r?.id) console.log(`      ${green('✓ created')} ${r.id} ${dim(r.url)}`);
      } else if (chunk.type === 'tool-error') {
        console.log(`      ${red('✗ failed')} ${dim(String((chunk.payload as any).error?.message ?? chunk.payload))}`);
      } else if (chunk.type === 'error') {
        throw new Error(`The agent stopped. ${String((chunk.payload as any)?.error?.message ?? chunk.payload)}`);
      }
    }
    calls.push(called);

    console.log(`\n  ${purple('bot'.padEnd(18))} ${indent(await stream.text, ' '.repeat(21))}\n`);
    console.log(dim('  ─────────────────────────────────────────\n'));
    await pause();
  }

  if (agentHandlerConfigured) console.log(dim('Every Linear call is in Merge Agent Handler → Tool Call Logs.'));
  return calls;
}
