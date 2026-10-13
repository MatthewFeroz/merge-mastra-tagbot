// Plays the scenario end to end. Each mention goes to the real Mastra agent, which acts
// through Merge Agent Handler (or the dry-run stand-ins) and writes its reply.
//   npm run demo
import { agentHandlerConfigured } from '../src/mastra/agent-handler';
import { mastra } from '../src/mastra';
import { scenario } from './scenario';

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const short = (v: unknown, n = 110) => {
  const s = JSON.stringify(v) ?? '';
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

const agent = mastra.getAgent('tagbot');
const mode = agentHandlerConfigured ? green('live, through Merge Agent Handler') : dim('dry run, no apps touched');
console.log(`\n${bold('Merge × Mastra Bot')}  ${mode}\n`);

let actions = 0;
for (const m of scenario) {
  console.log(dim(`  ${m.replyingTo.from}  ${m.replyingTo.text}`));
  console.log(`  ${bold(m.from)}  ${m.text.replace('@MergeMastraBot', blue('@MergeMastraBot'))}\n`);
  await pause(800);

  const stream = await agent.stream(
    `${m.from} tagged you on X.\nTheir request: ${m.text}\nThe tweet they replied to, from ${m.replyingTo.from}: ${m.replyingTo.text}`,
    { maxSteps: 6 },
  );

  for await (const chunk of stream.fullStream) {
    if (chunk.type === 'tool-call') {
      console.log(`    → ${chunk.payload.toolName.replace(/^merge_/, '')} ${dim(short(chunk.payload.args))}`);
    } else if (chunk.type === 'tool-result') {
      actions++;
      const ok = !chunk.payload.isError;
      console.log(`      ${ok ? green('✓ done') : red('✗ failed')} ${dim(short(chunk.payload.result, 90))}`);
    } else if (chunk.type === 'error') {
      console.error(red(`\n  The agent stopped. ${String((chunk.payload as any)?.error?.message ?? chunk.payload)}\n`));
      process.exit(1);
    }
  }

  console.log(`\n  ${bold('@MergeMastraBot')}  ${await stream.text}\n`);
  console.log(dim('  ─────────────────────────────────────────\n'));
  await pause(800);
}

console.log(`${bold(String(actions))} actions across ${scenario.length} mentions.`);
if (agentHandlerConfigured) console.log(dim('Every call is in Merge Agent Handler → Tool Call Logs.'));
process.exit(0);
