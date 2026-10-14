// Mastra platform injects TURSO_* when a hosted database is attached. Locally, DATABASE_URL
// (or a file) is used instead.
export const databaseUrl = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? 'file:./tagbot.db';
export const databaseAuthToken = process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN;
