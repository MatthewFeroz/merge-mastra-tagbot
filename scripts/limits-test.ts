// Checks the spam limits: per-person issue limit, daily cap, released slots, and the silent
// mention cap. Uses a throwaway database and a fake X adapter, so nothing touches X or GitHub.
//   npx tsx scripts/limits-test.ts
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { RequestContext } from '@mastra/core/request-context';
import { MentionStore } from '../src/mastra/mention-store';
import { executeIssue } from '../src/mastra/tools';
import { createMentionHandler, limitReply, type Limits } from '../src/mastra/x-handler';

process.env.GITHUB_OWNER = 'test-org';
process.env.GITHUB_REPO = 'test-repo';

const dbUrl = `file:${join(await mkdtemp(join(tmpdir(), 'tagbot-limits-')), 'test.db')}`;
const limits: Limits = { perAuthorPerHour: 2, perDay: 4, mentionsPerAuthorPerHour: 5 };

const replies = new Map<string, string>();
let issuesCreated = 0;
const fakeAdapter = {
  botUserId: '99',
  readReplyChain: async () => ({ messages: [{ id: '1', text: 'The toolbar covers the first line', author: { userName: 'dana' } }], truncated: false }),
  replyToMention: async (_threadId: string, mentionId: string, text: string) => {
    replies.set(mentionId, text);
    return { id: `reply-${mentionId}` };
  },
};
const dependencies = {
  configured: true,
  call: async () => ({ number: ++issuesCreated, html_url: `https://github.com/test-org/test-repo/issues/${issuesCreated}` }),
};

function handlerFor(store: MentionStore) {
  return createMentionHandler(fakeAdapter as any, async (_prompt, ctx, allowIssue) => {
    // "skip" stands in for a model that decides not to open an issue after all.
    const text = ctx.get('mention-text') as string;
    if (allowIssue && !text.includes('skip')) {
      await executeIssue({ title: 'Toolbar covers first line', body: 'Details from the thread', labels: ['bug'] }, ctx, dependencies);
    }
    return 'Summary of the thread.';
  }, store, limits);
}

let n = 0;
async function mention(store: MentionStore, authorId: string, text: string) {
  const id = String(++n);
  const requestContext = new RequestContext();
  requestContext.set('mention-text', text);
  await handlerFor(store)(
    { id: 'x:post:1', isDM: false } as any,
    { id, text, isMention: true, author: { userId: authorId, userName: `user${authorId}`, isMe: false } } as any,
    (async () => {}) as any,
    { requestContext, mastra: undefined } as any,
  );
  return id;
}

const store = new MentionStore(createClient({ url: dbUrl }));

// A request that ends without an issue gives its slot back.
const skipped = await mention(store, 'A', '@mergeapibot file this skip');
assert.equal(issuesCreated, 0);
assert.match(replies.get(skipped)!, /No issue was created/);

// Per-person limit: two issues, then a polite refusal with nothing created.
await mention(store, 'A', '@mergeapibot file this');
await mention(store, 'A', '@mergeapibot open an issue for this');
assert.equal(issuesCreated, 2);
const overAuthor = await mention(store, 'A', '@mergeapibot file this');
assert.equal(issuesCreated, 2);
assert.equal(replies.get(overAuthor), limitReply('author', limits));

// The limit survives a restart (a fresh store on the same database).
const restarted = new MentionStore(createClient({ url: dbUrl }));
const afterRestart = await mention(restarted, 'A', '@mergeapibot file this');
assert.equal(issuesCreated, 2);
assert.equal(replies.get(afterRestart), limitReply('author', limits));

// Daily cap across everyone: B gets two more (4 total), then C is refused.
await mention(restarted, 'B', '@mergeapibot file this');
await mention(restarted, 'B', '@mergeapibot report this');
assert.equal(issuesCreated, 4);
const overDaily = await mention(restarted, 'C', '@mergeapibot file this');
assert.equal(issuesCreated, 4);
assert.equal(replies.get(overDaily), limitReply('daily', limits));

// Summaries never use issue slots, but the silent mention cap still applies.
for (let i = 0; i < 5; i++) assert.equal(replies.get(await mention(restarted, 'D', '@mergeapibot summarize this thread')), 'Summary of the thread.');
const silenced = await mention(restarted, 'D', '@mergeapibot summarize this thread');
assert.equal(replies.has(silenced), false);

for (const text of replies.values()) assert.ok(Array.from(text).length <= 240);
console.log('Limits passed: per-person issue limit, restart, daily cap, released slots, silent mention cap.');
process.exit(0);
