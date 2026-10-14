import { createClient, type Client } from '@libsql/client';
import { databaseAuthToken, databaseUrl } from './database';

/** Persistent claim before any external action. Failed/incomplete claims require manual review. */
export class MentionStore {
  private ready?: Promise<unknown>;
  constructor(private db: Client) {}

  private initialize() {
    return this.ready ??= this.db.execute(`CREATE TABLE IF NOT EXISTS tagbot_mentions (
      id TEXT PRIMARY KEY, status TEXT NOT NULL, issue_url TEXT, reply_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  async claim(id: string) {
    await this.initialize();
    const result = await this.db.execute({ sql: "INSERT OR IGNORE INTO tagbot_mentions (id, status) VALUES (?, 'processing')", args: [id] });
    return result.rowsAffected === 1;
  }

  async recordIssue(id: string, url: string) {
    await this.db.execute({ sql: 'UPDATE tagbot_mentions SET issue_url = ? WHERE id = ?', args: [url, id] });
  }

  async finish(id: string, status: 'completed' | 'failed', replyId?: string) {
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

let store: MentionStore | undefined;
export function getMentionStore() {
  return store ??= new MentionStore(createClient({
    url: databaseUrl,
    authToken: databaseAuthToken,
  }));
}
