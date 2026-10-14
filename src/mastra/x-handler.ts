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
          : fitReply(text);
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
