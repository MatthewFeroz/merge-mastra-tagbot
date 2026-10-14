import type { ChannelHandler } from '@mastra/core/channels';
import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import { getMentionStore, type MentionStore } from './mention-store';
import type { ThreadXAdapter } from './x-adapter';

export type XRequest = {
  mentionId: string;
  sourceUrl: string;
  allowIssueCreation: boolean;
  issueAttempted?: boolean;
  issue?: { number: number; url: string };
  recordIssue: (url: string) => Promise<void>;
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
  return /\b(?:open|file|create|raise)\s+(?:(?:a|an|the|github)\s+){0,2}(?:issue|bug(?:\s+report)?|ticket)\b/i.test(text)
    && !/\b(?:do not|don['’]?t|never)\b/i.test(text);
}

type Runner = (prompt: string, requestContext: RequestContext, allowIssue: boolean) => Promise<string>;

export function createMentionHandler(adapter: ThreadXAdapter, run: Runner, store?: MentionStore): ChannelHandler {
  return async (thread, message, _defaultHandler, ctx) => {
    if (thread.isDM || !message.isMention || message.author.isMe || message.author.userId === adapter.botUserId) return;
    const ledger = store ?? getMentionStore();
    if (!await ledger.claim(message.id)) return;
    let request: XRequest | undefined;
    let replyAttempted = false;
    try {
      const history = await adapter.readReplyChain(thread.id, message.id);
      request = createVerifiedXRequest({
        mentionId: message.id,
        sourceUrl: `https://x.com/i/status/${message.id}`,
        allowIssueCreation: asksForIssue(message.text),
        recordIssue: url => ledger.recordIssue(message.id, url),
      });
      ctx.requestContext.set('x-request', request);
      const prompt = JSON.stringify({
        latestRequest: { author: message.author.userName, text: message.text },
        thread: history.messages.map(m => ({ author: m.author.userName, id: m.id, text: m.text })),
        contextTruncated: history.truncated,
      });
      const text = await run(prompt, ctx.requestContext, request.allowIssueCreation);
      // The live issue URL is server-verified, never copied from model-generated prose.
      const reply = request.issue
        ? `Thanks for the report! Opened an issue: ${request.issue.url}`
        : request.allowIssueCreation
          ? 'No issue was created. Please include the bug details and reproduction steps in a new mention.'
          : replySchema.parse(text);
      replyAttempted = true;
      const posted = await adapter.replyToMention(thread.id, message.id, replySchema.parse(reply));
      await ledger.finish(message.id, 'completed', posted.id);
    } catch {
      ctx.mastra?.getLogger().warn('X mention failed; retained for manual review', {
        mentionId: message.id, issueRecorded: Boolean(request?.issue), replyAttempted,
      });
      await ledger.finish(message.id, 'failed');
      // Avoid provider errors or credentials in a public reply. A successful issue is still linked.
      const reply = request?.issue
        ? `Issue created: ${request.issue.url}`
        : "I couldn't finish this request. Please try a new mention with the bug details or ask for a summary.";
      // A failed post is not retried here: its outcome may be ambiguous.
      if (!replyAttempted) await adapter.replyToMention(thread.id, message.id, replySchema.parse(reply));
    }
  };
}
