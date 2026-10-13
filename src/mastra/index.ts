import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { teammate } from './agents/teammate';

export const mastra = new Mastra({
  agents: { teammate },
  // Channels keep thread state here, so the bot stays in the right Slack thread across restarts.
  storage: new LibSQLStore({ id: 'teammate-storage', url: process.env.DATABASE_URL ?? 'file:./teammate.db' }),
});
