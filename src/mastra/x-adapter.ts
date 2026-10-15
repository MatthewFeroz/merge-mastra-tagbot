import { XAdapter, type XAdapterConfig, type XPost, type XUser } from '@chat-adapter/x';
import { ConsoleLogger, type ChatInstance } from 'chat';
import { getMentionStore, type MentionStore } from './mention-store';

type ThreadPost = XPost & { referenced_tweets?: { type: string; id: string }[] };

/** Adds public reply ancestry reads while keeping the adapter's signing and OAuth refresh. */
export class ThreadXAdapter extends XAdapter {
  constructor(config: XAdapterConfig & { consumerSecret: string }, private tokenStore?: MentionStore) {
    super({ ...config, logger: config.logger ?? new ConsoleLogger('warn', 'tagbot-x') });
  }

  override async initialize(chat: ChatInstance) {
    // Mastra's default channel state keeps generic cached values in memory. X rotates its
    // refresh token, so its OAuth values must survive a process restart independently.
    const state = chat.getState();
    const tokens = this.tokenStore ?? getMentionStore();
    const persistentState = new Proxy(state, {
      get(target, property) {
        if (property === 'get') return <T>(key: string) => key.startsWith('x:oauth:') ? tokens.getToken<T>(key) : target.get<T>(key);
        if (property === 'set') return (key: string, value: unknown, ttl?: number) => key.startsWith('x:oauth:') ? tokens.setToken(key, value) : target.set(key, value, ttl);
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const persistentChat = new Proxy(chat, {
      get(target, property) {
        if (property === 'getState') return () => persistentState;
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await super.initialize(persistentChat);
  }

  async readReplyChain(threadId: string, mentionId: string, limit = 10) {
    const rootId = this.decodeThreadId(threadId).conversationId;
    const messages = [];
    const visited = new Set<string>();
    let next: string | undefined = mentionId;
    // Reserve one slot for the original post if a long chain is truncated.
    while (next && !visited.has(next) && messages.length < limit - 1) {
      const result = await this.readPost(next);
      if (!result.data) throw new Error('An X thread post is unavailable');
      const post = result.data;
      if ((post.conversation_id ?? post.id) !== rootId) throw new Error('X thread mismatch');
      visited.add(post.id);
      messages.push(this.buildPostMessage({ kind: 'post', post, author: result.includes?.users?.find(u => u.id === post.author_id) }, threadId, {}));
      next = post.referenced_tweets?.find(ref => ref.type === 'replied_to')?.id;
    }
    if (!visited.has(rootId)) {
      const root = await this.readPost(rootId);
      if (!root.data) throw new Error('The original X post is unavailable');
      visited.add(rootId);
      messages.push(this.buildPostMessage({ kind: 'post', post: root.data, author: root.includes?.users?.find(u => u.id === root.data?.author_id) }, threadId, {}));
    }
    return { messages: messages.reverse(), truncated: Boolean(next && !visited.has(next)) };
  }

  async replyToMention(threadId: string, mentionId: string, text: string) {
    // Pin the target to this request. The base adapter's shared conversation target
    // can change when another mention arrives while the agent is still running.
    const result = await this.xApiFetch<{ id: string }>('/2/tweets', 'POST', {
      text, reply: { in_reply_to_tweet_id: mentionId },
    });
    const post = this.requireData(result, 'reply to mention');
    this.trackSentId(post.id);
    return this.finishSentPost(threadId, post.id, text);
  }

  async verifyBotIdentity() {
    const result = await this.xApiFetch<{ id: string; username: string }>('/2/users/me?user.fields=username', 'GET');
    const identity = this.requireData(result, 'verify bot identity');
    if (identity.username.toLowerCase() !== botUserName.toLowerCase()) throw new Error(`X credentials do not belong to @${botUserName}`);
    return identity;
  }

  private readPost(id: string) {
    const query = new URLSearchParams({
      expansions: 'author_id',
      'tweet.fields': 'author_id,conversation_id,created_at,referenced_tweets',
      'user.fields': 'name,username',
    });
    return this.xApiFetch<ThreadPost>(`/2/tweets/${encodeURIComponent(id)}?${query}`, 'GET') as Promise<{
      data?: ThreadPost; includes?: { users?: XUser[] };
    }>;
  }
}

// The bot's X handle, without the @. Replies and identity checks use it.
export const botUserName = (process.env.X_BOT_USERNAME || 'mergeapibot').replace(/^@/, '');

export function createThreadXAdapter() {
  if (process.env.X_CLIENT_ID && process.env.X_REFRESH_TOKEN && !process.env.X_ENCRYPTION_KEY) {
    throw new Error('Set X_ENCRYPTION_KEY before enabling managed X OAuth refresh');
  }
  return new ThreadXAdapter({
    consumerSecret: process.env.X_CONSUMER_SECRET!,
    apiBaseUrl: process.env.X_API_BASE_URL,
    userId: process.env.X_USER_ID,
    userAccessToken: process.env.X_USER_ACCESS_TOKEN,
    clientId: process.env.X_CLIENT_ID,
    clientSecret: process.env.X_CLIENT_SECRET,
    refreshToken: process.env.X_REFRESH_TOKEN,
    encryptionKey: process.env.X_ENCRYPTION_KEY,
    userName: botUserName,
  });
}
