import { z } from 'zod';
import type { MentionStore } from './mention-store';

const xUrl = z.url().refine(value => /^https:\/\/x\.com\/i\/status\/\d{1,25}$/.test(value));
const issueUrl = z.url().refine(value => /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/[1-9]\d*$/.test(value));
export const demoStageSchema = z.enum(['mention', 'thread', 'agent', 'handler', 'issue', 'reply']);
export const demoEventSchema = z.object({
  stage: demoStageSchema,
  state: z.enum(['running', 'complete', 'skipped', 'failed', 'blocked']),
  at: z.iso.datetime(),
  details: z.object({
    postCount: z.number().int().min(0).max(10).optional(),
    truncated: z.boolean().optional(),
    toolName: z.literal('github__create_issue').optional(),
    issueNumber: z.number().int().positive().optional(),
    issueUrl: issueUrl.optional(),
    replyUrl: xUrl.optional(),
    reason: z.enum(['author', 'daily', 'mention', 'no_issue', 'summary', 'blocked']).optional(),
    // The connector name the agent looked up in Merge's public catalog, and whether it was listed.
    catalogQuery: z.string().trim().min(1).max(60).optional(),
    catalogFound: z.boolean().optional(),
  }).strict().default({}),
}).strict();
export const demoRunSchema = z.object({
  id: z.string().regex(/^\d{1,25}$/),
  author: z.string().min(1).max(60),
  sourceUrl: xUrl,
  kind: z.enum(['issue', 'summary']),
  status: z.enum(['running', 'completed', 'failed', 'limited', 'blocked']),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().optional(),
  events: z.array(demoEventSchema).max(32),
}).strict();
export type DemoRun = z.infer<typeof demoRunSchema>;
export type DemoEvent = z.infer<typeof demoEventSchema>;
export type DemoRecorder = {
  record: (stage: DemoEvent['stage'], state: DemoEvent['state'], details?: DemoEvent['details']) => Promise<void>;
  finish: (status: Exclude<DemoRun['status'], 'running'>) => Promise<void>;
};

/** Observation must never grant authority, persist prompts, or fail an external action. */
export async function beginDemoRun(store: MentionStore, input: Pick<DemoRun, 'id' | 'author' | 'sourceUrl' | 'kind'>): Promise<DemoRecorder> {
  let active = false;
  try {
    await store.startDemoRun(demoRunSchema.parse({ ...input, status: 'running', startedAt: new Date().toISOString(), events: [] }));
    active = true;
  } catch { /* The request still proceeds when observation is unavailable. */ }
  return {
    async record(stage, state, details = {}) {
      if (!active) return;
      try { await store.recordDemoEvent(input.id, demoEventSchema.parse({ stage, state, details, at: new Date().toISOString() })); }
      catch { /* No provider error or credential is captured here. */ }
    },
    async finish(status) {
      if (!active) return;
      try { await store.finishDemoRun(input.id, status, new Date().toISOString()); }
      catch { /* Telemetry cannot change the request outcome. */ }
    },
  };
}
