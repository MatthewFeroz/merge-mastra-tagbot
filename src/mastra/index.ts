import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { tagbot } from './agents/tagbot';

export const mastra = new Mastra({
  agents: { tagbot },
  // Channels keep thread state here, so replies stay in the right X thread across restarts.
  storage: new LibSQLStore({ id: 'tagbot-storage', url: process.env.DATABASE_URL ?? 'file:./tagbot.db' }),
});
