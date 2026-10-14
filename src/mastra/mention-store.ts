import { createClient, type Client } from '@libsql/client';
import { databaseAuthToken, databaseUrl } from './database';

/** Persistent claim before any external action. Failed/incomplete claims require manual review. */
export class MentionStore {
  private ready?: Promise<unknown>;
  constructor(private db: Client) {}

  private initialize() {
    return this.ready ??= this.db.batch([
      `CREATE TABLE IF NOT EXISTS tagbot_mentions (
        id TEXT PRIMARY KEY, status TEXT NOT NULL, issue_url TEXT, reply_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      // One row per counted action, so limits hold across restarts and redeploys.
      `CREATE TABLE IF NOT EXISTS tagbot_usage (
        mention_id TEXT NOT NULL, kind TEXT NOT NULL, author_id TEXT NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY (mention_id, kind)
      )`,
    ], 'write');
  }

  /** Counts this mention against its author. Returns false once they're over the hourly cap. */
  async allowMention(mentionId: string, authorId: string, perHour: number) {
    await this.initialize();
    const recent = await this.count('mention', isoAgo(HOUR), authorId);
    await this.db.execute({ sql: 'INSERT OR IGNORE INTO tagbot_usage VALUES (?, ?, ?, ?)', args: [mentionId, 'mention', authorId, new Date().toISOString()] });
    return recent < perHour;
  }

  /** Holds an issue slot for this mention before any GitHub call. Release it if no issue gets created. */
  async reserveIssue(mentionId: string, authorId: string, limits: { perAuthorPerHour: number; perDay: number }) {
    await this.initialize();
    if (await this.count('issue', isoAgo(HOUR), authorId) >= limits.perAuthorPerHour) return { ok: false as const, reason: 'author' as const };
    if (await this.count('issue', isoAgo(DAY)) >= limits.perDay) return { ok: false as const, reason: 'daily' as const };
    await this.db.execute({ sql: 'INSERT OR IGNORE INTO tagbot_usage VALUES (?, ?, ?, ?)', args: [mentionId, 'issue', authorId, new Date().toISOString()] });
    return { ok: true as const };
  }

  async releaseIssue(mentionId: string) {
    await this.db.execute({ sql: "DELETE FROM tagbot_usage WHERE mention_id = ? AND kind = 'issue'", args: [mentionId] });
  }

  private async count(kind: 'mention' | 'issue', since: string, authorId?: string) {
    const result = await this.db.execute(authorId
      ? { sql: 'SELECT COUNT(*) AS n FROM tagbot_usage WHERE kind = ? AND created_at >= ? AND author_id = ?', args: [kind, since, authorId] }
      : { sql: 'SELECT COUNT(*) AS n FROM tagbot_usage WHERE kind = ? AND created_at >= ?', args: [kind, since] });
    return Number(result.rows[0]?.n ?? 0);
  }

  async claim(id: string) {
    await this.initialize();
    const result = await this.db.execute({ sql: "INSERT OR IGNORE INTO tagbot_mentions (id, status) VALUES (?, 'processing')", args: [id] });
    return result.rowsAffected === 1;
  }

  async recordIssue(id: string, url: string) {
    await this.db.execute({ sql: 'UPDATE tagbot_mentions SET issue_url = ? WHERE id = ?', args: [url, id] });
  }

  async finish(id: string, status: 'completed' | 'failed' | 'limited', replyId?: string) {
    await this.db.execute({ sql: 'UPDATE tagbot_mentions SET status = ?, reply_id = ? WHERE id = ?', args: [status, replyId ?? null, id] });
  }

  async getToken<T>(key: string): Promise<T | null> {
    await this.initializeTokens();
    const result = await this.db.execute({ sql: 'SELECT value FROM tagbot_oauth WHERE id = ?', args: [key] });
    return result.rows.length ? JSON.parse(String(result.rows[0].value)) as T : null;
  }

  async setToken(key: string, value: unknown) {
    await this.initializeTokens();
    await this.db.execute({ sql: 'INSERT INTO tagbot_oauth (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value', args: [key, JSON.stringify(value)] });
  }

  async clearToken(key: string) {
    await this.initializeTokens();
    await this.db.execute({ sql: 'DELETE FROM tagbot_oauth WHERE id = ?', args: [key] });
  }

  private initializeTokens() {
    return this.db.execute('CREATE TABLE IF NOT EXISTS tagbot_oauth (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();

let store: MentionStore | undefined;
export function getMentionStore() {
  return store ??= new MentionStore(createClient({
    url: databaseUrl,
    authToken: databaseAuthToken,
  }));
}
