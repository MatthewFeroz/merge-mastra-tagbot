import type { ChannelHandler } from '@mastra/core/channels';
import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import { getMentionStore, type MentionStore } from './mention-store';
import type { ThreadXAdapter } from './x-adapter';
import { beginDemoRun, type DemoRecorder, type DemoEvent } from './demo-events';

export type XRequest = {
  mentionId: string;
  sourceUrl: string;
  allowIssueCreation: boolean;
  issueAttempted?: boolean;
  issue?: { number: number; url: string };
  recordIssue: (url: string) => Promise<void>;
  demo?: DemoRecorder;
};
const verifiedRequests = new WeakSet<object>();
export function createVerifiedXRequest(request: XRequest) {
  verifiedRequests.add(request);
  return request;
}
export function isVerifiedXRequest(request: unknown): request is XRequest {
  return typeof request === 'object' && request !== null && verifiedRequests.has(request);
}

export const replySchema = z.string().trim().min(1).refine(text => Array.from(text).length <= 240, 'Reply exceeds 240 characters');
export function asksForIssue(text: string) {
  // A bug report alone or an instruction buried in thread history does not grant write access.
  // The latest mention has to ask for it, e.g. "open an issue", "file this", "turn this into a ticket".
  const requested = [
    /\b(?:open|file|create|raise|log|report|submit|track)\s+(?:(?:a|an|the|new|github)\s+){0,2}(?:issue|bug(?:\s+report)?|ticket)\b/i,
    /\b(?:file|report|log|track|submit)\s+(?:this|it|that)\b/i,
    /\b(?:turn|make)\s+(?:this|it|that)\s+(?:into\s+)?(?:(?:a|an|github)\s+){0,2}(?:issue|ticket|bug\s+report)\b/i,
  ].some(pattern => pattern.test(text));
  return requested && !/\b(?:do not|don['’]?t|never)\b/i.test(text);
}

/** Keeps a model reply within the 240-character limit instead of failing the mention. */
export function fitReply(text: string, limit = 240) {
  const chars = Array.from(text.trim());
  if (chars.length <= limit) return chars.join('');
  const cut = chars.slice(0, limit - 1).join('');
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentenceEnd >= limit / 2) return cut.slice(0, sentenceEnd + 1);
  const wordEnd = cut.lastIndexOf(' ');
  return `${(wordEnd > 0 ? cut.slice(0, wordEnd) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

type Runner = (prompt: string, requestContext: RequestContext, allowIssue: boolean) => Promise<string>;

export type Limits = { perAuthorPerHour: number; perDay: number; mentionsPerAuthorPerHour: number };
const fromEnv = (value: string | undefined, fallback: number) => (Number(value) > 0 ? Number(value) : fallback);
export const defaultLimits: Limits = {
  perAuthorPerHour: fromEnv(process.env.TAGBOT_ISSUES_PER_AUTHOR_PER_HOUR, 3),
  perDay: fromEnv(process.env.TAGBOT_ISSUES_PER_DAY, 25),
  mentionsPerAuthorPerHour: fromEnv(process.env.TAGBOT_MENTIONS_PER_AUTHOR_PER_HOUR, 10),
};
export const limitReply = (reason: 'author' | 'daily', limits: Limits) => reason === 'author'
  ? `Thanks for the report! You've hit the limit of ${limits.perAuthorPerHour} new issues an hour, so I didn't open this one. Please try again a little later.`
  : "Thanks for the report! I've opened as many issues as I can for today, so I didn't open this one. Please try again tomorrow.";

export function createMentionHandler(adapter: ThreadXAdapter, run: Runner, store?: MentionStore, limits: Limits = defaultLimits): ChannelHandler {
  return async (thread, message, _defaultHandler, ctx) => {
    if (thread.isDM || !message.isMention || message.author.isMe || message.author.userId === adapter.botUserId) return;
    const ledger = store ?? getMentionStore();
    if (!await ledger.claim(message.id)) return;
    const authorId = message.author.userId;
    const allowIssueCreation = asksForIssue(message.text);
    const demo = await beginDemoRun(ledger, {
      id: message.id, author: message.author.userName || 'X user',
      sourceUrl: `https://x.com/i/status/${message.id}`, kind: allowIssueCreation ? 'issue' : 'summary',
    });
    await demo.record('mention', 'complete');
    // Past the hourly mention cap, stay silent so a spammer can't spend our X or model credit.
    if (!await ledger.allowMention(message.id, authorId, limits.mentionsPerAuthorPerHour)) {
      ctx.mastra?.getLogger().warn('X mention ignored, author is over the hourly mention limit', { mentionId: message.id });
      await ledger.finish(message.id, 'limited');
      await demo.record('thread', 'skipped', { reason: 'mention' });
      await demo.finish('limited');
      return;
    }
    let request: XRequest | undefined;
    let replyAttempted = false;
    let reserved = false;
    let stage: DemoEvent['stage'] = 'thread';
    try {
      if (allowIssueCreation) {
        const quota = await ledger.reserveIssue(message.id, authorId, limits);
        if (!quota.ok) {
          await demo.record('thread', 'skipped', { reason: quota.reason });
          replyAttempted = true;
          stage = 'reply';
          await demo.record('reply', 'running');
          const posted = await adapter.replyToMention(thread.id, message.id, limitReply(quota.reason, limits));
          await demo.record('reply', 'complete', { replyUrl: `https://x.com/i/status/${posted.id}` });
          await ledger.finish(message.id, 'limited', posted.id);
          await demo.finish('limited');
          return;
        }
        reserved = true;
      }
      await demo.record('thread', 'running');
      const history = await adapter.readReplyChain(thread.id, message.id);
      await demo.record('thread', 'complete', { postCount: history.messages.length, truncated: history.truncated });
      request = createVerifiedXRequest({
        mentionId: message.id,
        sourceUrl: `https://x.com/i/status/${message.id}`,
        allowIssueCreation,
        recordIssue: url => ledger.recordIssue(message.id, url),
        demo,
      });
      ctx.requestContext.set('x-request', request);
      const prompt = JSON.stringify({
        latestRequest: { author: message.author.userName, text: message.text },
        thread: history.messages.map(m => ({ author: m.author.userName, id: m.id, text: m.text })),
        contextTruncated: history.truncated,
      });
      stage = 'agent';
      await demo.record('agent', 'running');
      const text = await run(prompt, ctx.requestContext, request.allowIssueCreation);
      await demo.record('agent', 'complete');
      if (!request.issueAttempted) {
        const reason = allowIssueCreation ? 'no_issue' : 'summary';
        await demo.record('handler', 'skipped', { reason });
        await demo.record('issue', 'skipped', { reason });
      }
      // The live issue URL is server-verified, never copied from model-generated prose.
      const reply = request.issue
        ? `Thanks for the report! Opened an issue: ${request.issue.url}`
        : request.allowIssueCreation
          ? 'No issue was created. Please include the bug details and reproduction steps in a new mention.'
          : fitReply(text);
      replyAttempted = true;
      stage = 'reply';
      await demo.record('reply', 'running');
      const posted = await adapter.replyToMention(thread.id, message.id, replySchema.parse(reply));
      await demo.record('reply', 'complete', { replyUrl: `https://x.com/i/status/${posted.id}` });
      await ledger.finish(message.id, 'completed', posted.id);
      await demo.finish(request.issueAttempted && !request.issue ? 'failed' : 'completed');
    } catch {
      ctx.mastra?.getLogger().warn('X mention failed; retained for manual review', {
        mentionId: message.id, issueRecorded: Boolean(request?.issue), replyAttempted,
      });
      await ledger.finish(message.id, 'failed');
      await demo.record(stage, 'failed');
      // Avoid provider errors or credentials in a public reply. A successful issue is still linked.
      const reply = request?.issue
        ? `Issue created: ${request.issue.url}`
        : "I couldn't finish this request. Please try a new mention with the bug details or ask for a summary.";
      // A failed post is not retried here: its outcome may be ambiguous.
      try {
        if (!replyAttempted) {
          await demo.record('reply', 'running');
          try {
            const posted = await adapter.replyToMention(thread.id, message.id, replySchema.parse(reply));
            await demo.record('reply', 'complete', { replyUrl: `https://x.com/i/status/${posted.id}` });
          } catch (error) {
            await demo.record('reply', 'failed');
            throw error;
          }
        }
      } finally { await demo.finish('failed'); }
    } finally {
      // Only issues that were actually created count toward the limits.
      if (reserved && !request?.issue) await ledger.releaseIssue(message.id);
    }
  };
}
