import type { Agent } from '@mastra/core/agent';
import { agentHandlerConfigured } from '../src/mastra/agent-handler';
import type { XThread } from './scenario';

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const short = (v: unknown, n = 110) => {
  const s = JSON.stringify(v) ?? '';
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const indent = (s: string, pad: string) => s.split('\n').join(`\n${pad}`);

/** Plays each X thread through the agent and prints what it did. Returns the tools called per thread. */
export async function runDemo(agent: Agent, scenario: XThread[], { pauseMs = 800 } = {}) {
  const pause = () => new Promise(r => setTimeout(r, pauseMs));
  const mode = agentHandlerConfigured ? green('live, Linear through Merge Agent Handler') : dim('dry run, Linear is simulated');
  console.log(`\n${bold('𝕏  @MergeMastraBot')}  ${mode}\n`);

  const calls: string[][] = [];
  for (const thread of scenario) {
    thread.posts.forEach((p, i) => console.log(`  ${i === 0 ? '' : dim('↳ ')}${dim(p.from)}  ${p.text}`));
    console.log(`  ${dim('↳ ')}${bold(thread.mention.from)}  ${thread.mention.text.replace('@MergeMastraBot', blue('@MergeMastraBot'))}\n`);
    await pause();

    const transcript = thread.posts.map(p => `${p.from}: ${p.text}`).join('\n');
    const stream = await agent.stream(
      `${thread.mention.from} tagged you in a thread on X.\n\nThread:\n${transcript}\n\nTheir post: ${thread.mention.text}`,
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
        else if (r?.id) console.log(`      ${green('✓ created in Linear')} ${r.id} ${dim(r.url)}`);
      } else if (chunk.type === 'tool-error') {
        console.log(`      ${red('✗ failed')} ${dim(String((chunk.payload as any).error?.message ?? chunk.payload))}`);
      } else if (chunk.type === 'error') {
        throw new Error(`The agent stopped. ${String((chunk.payload as any)?.error?.message ?? chunk.payload)}`);
      }
    }
    calls.push(called);

    const reply = await stream.text;
    const length = reply.length > 280 ? red(`(${reply.length} chars, over X's 280 limit)`) : dim(`(${reply.length} chars)`);
    console.log(`\n  ${dim('↳ ')}${blue('@MergeMastraBot')}  ${indent(reply, '                    ')}  ${length}\n`);
    console.log(dim('  ─────────────────────────────────────────\n'));
    await pause();
  }

  if (agentHandlerConfigured) console.log(dim('Every Linear call is in Merge Agent Handler → Tool Call Logs.'));
  return calls;
}
