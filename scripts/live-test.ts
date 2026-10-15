// Real inference and read-only connection checks. Never creates a GitHub issue or X post.
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { replySchema } from '../src/mastra/x-handler';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { botUserName, createThreadXAdapter } from '../src/mastra/x-adapter';
import { databaseAuthToken, databaseUrl } from '../src/mastra/database';

process.env.DEMO_LIVE_ACTIONS = 'false';
// This test invokes the agent directly, not its X transport.

let failed = false;
async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed = true;
    // Provider errors can include request data. Report their class, not credentials or headers.
    console.log(`FAIL: ${name} (${error instanceof Error ? error.name : 'unknown error'})`);
  }
}

await check('Agent Handler connection and restricted tool catalog', async () => {
  assert.ok(process.env.AGENT_HANDLER_API_KEY, 'Missing Agent Handler key');
  assert.ok(process.env.AGENT_HANDLER_TOOL_PACK_ID);
  assert.ok(process.env.AGENT_HANDLER_REGISTERED_USER_ID);
  const client = new Client({ name: 'tagbot-read-only-test', version: '0.1.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(
      `https://ah-api.merge.dev/api/v1/tool-packs/${process.env.AGENT_HANDLER_TOOL_PACK_ID}/registered-users/${process.env.AGENT_HANDLER_REGISTERED_USER_ID}/mcp`,
    ), { requestInit: { headers: { Authorization: `Bearer ${process.env.AGENT_HANDLER_API_KEY}` }, signal: AbortSignal.timeout(15000) } }));
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      names.push(...page.tools.map(tool => tool.name));
      cursor = page.nextCursor;
      assert.ok(names.length < 100, 'Unexpectedly broad Tool Pack');
    } while (cursor);
    console.log(`Agent Handler tools: ${names.join(', ')}`);
    // Agent Handler includes its GitHub authentication helper alongside the action.
    // It is not another GitHub write tool and is never exposed to our agent.
    assert.ok(names.includes('github__create_issue'));
    assert.ok(names.every(name => ['github__create_issue', 'authenticate_github'].includes(name)));
  } finally {
    await client.close();
  }
});

await check('X managed refresh and bot identity (read-only)', async () => {
  assert.ok(process.env.X_CONSUMER_SECRET);
  const adapter = createThreadXAdapter();
  const agent = new Agent({
    id: 'tagbot-identity-check', name: 'X identity check', instructions: 'Identity check only',
    model: process.env.MODEL!, channels: {
      adapters: { x: adapter },
      handlers: { onMention: false, onDirectMessage: false, onSubscribedMessage: false },
    },
  });
  const mastra = new Mastra({ agents: { agent }, storage: new LibSQLStore({
    id: 'identity-check-storage', url: databaseUrl, authToken: databaseAuthToken,
  }) });
  await agent.getChannels()!.initialize(mastra);
  const identity = await adapter.verifyBotIdentity();
  assert.equal(identity.username.toLowerCase(), botUserName.toLowerCase());
  console.log(`X managed OAuth authenticated as @${botUserName}.`);
});

if (!process.argv.includes('--connections-only')) {
process.env.X_CONSUMER_SECRET = '';
const { tagbot } = await import('../src/mastra/agents/tagbot');
const thread = [
  { author: 'dana', id: '100', text: 'CLI v2 crashes on Node 24 with ERR_REQUIRE_ESM after a fresh install.' },
  { author: 'kev', id: '101', text: 'Same error on 24.0 and 24.1. Node 22 works.' },
];

await check('Real Merge Gateway summary, no tool calls, within 240 characters', async () => {
  const result = await tagbot.stream(JSON.stringify({
    latestRequest: { author: 'dana', text: '@mergeapibot summarize this thread' }, thread, contextTruncated: false,
  }), { maxSteps: 3, toolChoice: 'none' });
  let calls = 0;
  for await (const chunk of result.fullStream) {
    if (chunk.type === 'tool-call') calls++;
    if (chunk.type === 'error') throw new Error('Inference failed');
  }
  const reply = replySchema.parse(await result.text);
  assert.equal(calls, 0);
  assert.match(reply, /Node 24|ERR_REQUIRE_ESM/i);
  console.log(`Summary (${Array.from(reply).length} characters): ${reply}`);
});

await check('Real Merge Gateway issue request, one validated dry-run tool call', async () => {
  const result = await tagbot.stream(JSON.stringify({
    latestRequest: { author: 'dana', text: '@mergeapibot can you open an issue for this?' }, thread, contextTruncated: false,
  }), { maxSteps: 3 });
  const calls: string[] = [];
  const outputs: unknown[] = [];
  for await (const chunk of result.fullStream) {
    if (chunk.type === 'tool-call') calls.push(chunk.payload.toolName);
    if (chunk.type === 'tool-result') outputs.push(chunk.payload.result);
    if (chunk.type === 'error' || chunk.type === 'tool-error') throw new Error('Agent run failed');
  }
  assert.deepEqual(calls, ['createIssue']);
  assert.ok(outputs.some(output => typeof output === 'object' && output !== null && 'dryRun' in output && output.dryRun === true));
  const reply = replySchema.parse(await result.text);
  assert.match(reply, /preview|dry.?run|no issue|not created|no .*issue .*created/i);
  console.log(`Issue preview (${Array.from(reply).length} characters): ${reply}`);
});
}

console.log('No real GitHub issues or X posts were created.');
process.exit(failed ? 1 : 0);
