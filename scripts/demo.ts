// Plays the X threads through the real agent.
//   npm run demo
import { mastra } from '../src/mastra';
import { runDemo } from './run-demo';
import { scenario } from './scenario';

try {
  await runDemo(mastra.getAgent('tagbot'), scenario);
  process.exit(0);
} catch (error) {
  console.error(`\n\x1b[31m${error instanceof Error ? error.message : error}\x1b[0m\n`);
  process.exit(1);
}
