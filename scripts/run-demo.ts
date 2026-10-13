import type { Agent } from '@mastra/core/agent';
import { agentHandlerConfigured } from '../src/mastra/agent-handler';
import type { Mention } from './scenario';

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const short = (v: unknown, n = 110) => {
  const s = JSON.stringify(v) ?? '';
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

/** Plays each mention through the agent and prints what it did. Returns the number of completed actions. */
export async function runDemo(agent: Agent, scenario: Mention[], { pauseMs = 800 } = {}) {
  const pause = () => new Promise(r => setTimeout(r, pauseMs));
  const mode = agentHandlerConfigured ? green('live, through Merge Agent Handler') : dim('dry run, no apps touched');
  console.log(`\n${bold('Merge × Mastra Bot')}  ${mode}\n`);

  let actions = 0;
  for (const m of scenario) {
    console.log(dim(`  ${m.replyingTo.from}  ${m.replyingTo.text}`));
    console.log(`  ${bold(m.from)}  ${m.text.replace('@MergeMastraBot', blue('@MergeMastraBot'))}\n`);
    await pause();

    const stream = await agent.stream(
      `${m.from} tagged you on X.\nTheir request: ${m.text}\nThe tweet they replied to, from ${m.replyingTo.from}: ${m.replyingTo.text}`,
      { maxSteps: 4 },
    );

    for await (const chunk of stream.fullStream) {
      if (chunk.type === 'tool-call') {
        console.log(`    → ${chunk.payload.toolName} ${dim(short(chunk.payload.args))}`);
      } else if (chunk.type === 'tool-result') {
        const result = chunk.payload.result as { ok?: boolean; link?: string } | undefined;
        if (chunk.payload.isError || !result?.ok) {
          console.log(`      ${red('✗ failed')} ${dim(short(result, 200))}`);
        } else {
          actions++;
          console.log(`      ${green('✓ done')} ${result.link ? dim(result.link) : ''}`);
        }
      } else if (chunk.type === 'tool-error') {
        console.log(`      ${red('✗ failed')} ${dim(String((chunk.payload as any).error?.message ?? chunk.payload))}`);
      } else if (chunk.type === 'error') {
        throw new Error(`The agent stopped. ${String((chunk.payload as any)?.error?.message ?? chunk.payload)}`);
      }
    }

    console.log(`\n  ${bold('@MergeMastraBot')}  ${await stream.text}\n`);
    console.log(dim('  ─────────────────────────────────────────\n'));
    await pause();
  }

  console.log(`${bold(String(actions))} of ${scenario.length} actions completed.`);
  if (agentHandlerConfigured) console.log(dim('Every call is in Merge Agent Handler → Tool Call Logs.'));
  return actions;
}
