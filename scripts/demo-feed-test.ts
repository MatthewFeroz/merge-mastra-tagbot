import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { MentionStore } from '../src/mastra/mention-store';
import { beginDemoRun } from '../src/mastra/demo-events';
import { handleDemoRuns } from '../src/mastra/demo-routes';
import { RequestContext } from '@mastra/core/request-context';
import { createVerifiedXRequest } from '../src/mastra/x-handler';
import { executeIssue } from '../src/mastra/tools';

const temp = await mkdtemp(join(tmpdir(), 'tagbot-feed-'));
const db = createClient({ url: `file:${join(temp, 'test.db')}` });
const store = new MentionStore(db);
const originalOwner = process.env.GITHUB_OWNER;
const originalRepo = process.env.GITHUB_REPO;
const request = (token?: string) => new Request('http://localhost/demo/runs', {
  headers: token ? { authorization: `Bearer ${token}` } : {},
});
try {
  assert.equal((await handleDemoRuns(request(), store, '')).status, 503);
  assert.equal((await handleDemoRuns(request(), store, 'local-test-token')).status, 401);
  assert.equal((await handleDemoRuns(request('wrong'), store, 'local-test-token')).status, 401);
  const recorder = await beginDemoRun(store, { id: '101', author: 'demo_builder', sourceUrl: 'https://x.com/i/status/101', kind: 'issue' });
  await recorder.record('mention', 'complete');
  // Input rejected by the strict telemetry schema cannot leak into storage.
  await recorder.record('handler', 'failed', { providerError: 'SECRET_MARKER' } as never);
  await recorder.record('handler', 'failed', { toolName: 'github__create_issue' });
  await recorder.finish('failed');
  const response = await handleDemoRuns(request('local-test-token'), store, 'local-test-token');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const feed = await response.json();
  assert.equal(feed.runs.length, 1);
  assert.equal(feed.runs[0].events.length, 2);
  assert.equal(feed.runs[0].status, 'failed');
  assert.equal(JSON.stringify(feed).includes('SECRET_MARKER'), false);
  assert.equal(Number.isFinite(Date.parse(feed.serverTime)), true);

  process.env.GITHUB_OWNER = 'test-org';
  process.env.GITHUB_REPO = 'test-repo';
  const ctx = new RequestContext();
  const toolRun = await beginDemoRun(store, { id: '103', author: 'demo_builder', sourceUrl: 'https://x.com/i/status/103', kind: 'issue' });
  ctx.set('x-request', createVerifiedXRequest({ mentionId: '103', sourceUrl: 'https://x.com/i/status/103', allowIssueCreation: true, recordIssue: async () => {}, demo: toolRun }));
  await assert.rejects(executeIssue({ title: 'Bug', body: 'Repro', labels: ['bug'] }, ctx, { configured: true, call: async () => { throw new Error('SECRET_MARKER'); } }));
  const toolEvents = (await store.listDemoRuns()).find(r => r.id === '103')!.events;
  assert.deepEqual(toolEvents.map(e => e.state), ['running', 'failed']);
  assert.equal(JSON.stringify(toolEvents).includes('SECRET_MARKER'), false);
  assert.equal((await (await handleDemoRuns(request('local-test-token'), store, 'local-test-token')).json()).destination, 'test-org/test-repo');
  delete process.env.GITHUB_OWNER;
  delete process.env.GITHUB_REPO;
  assert.equal((await (await handleDemoRuns(request('local-test-token'), store, 'local-test-token')).json()).destination, undefined);

  // Observation failures must not interrupt the action being observed.
  const unavailable = await beginDemoRun({ startDemoRun: async () => { throw new Error('offline'); } } as unknown as MentionStore,
    { id: '102', author: 'demo_builder', sourceUrl: 'https://x.com/i/status/102', kind: 'summary' });
  await unavailable.record('mention', 'complete');
  await unavailable.finish('completed');

  for (let i = 0; i < 55; i++) {
    await store.startDemoRun({ id: String(200 + i), author: 'demo_builder', sourceUrl: `https://x.com/i/status/${200 + i}`, kind: 'summary', status: 'running', startedAt: new Date(Date.now() + i * 1000).toISOString(), events: [] });
  }
  const latest = await store.listDemoRuns();
  assert.equal(latest.length, 20);
  assert.equal(latest[0].id, '254');
  assert.equal(Number((await db.execute('SELECT COUNT(*) AS n FROM tagbot_demo_runs')).rows[0].n), 50);
  assert.equal(Number((await db.execute('SELECT COUNT(*) AS n FROM tagbot_demo_events')).rows[0].n), 0); // Orphans pruned.
  for (let i = 0; i < 40; i++) await store.recordDemoEvent('254', { stage: 'agent', state: 'running', at: new Date().toISOString(), details: {} });
  assert.equal((await store.listDemoRuns())[0].events.length, 32);
  console.log('Demo feed passed: private access, sanitized events, observation isolation, persistence and bounded retention.');
} finally {
  if (originalOwner === undefined) delete process.env.GITHUB_OWNER; else process.env.GITHUB_OWNER = originalOwner;
  if (originalRepo === undefined) delete process.env.GITHUB_REPO; else process.env.GITHUB_REPO = originalRepo;
  db.close();
  await rm(temp, { recursive: true, force: true });
}
