import { Mastra } from '@mastra/core';
import { SimpleAuth } from '@mastra/core/server';
import { LibSQLStore } from '@mastra/libsql';
import { tagbot, xAdapter } from './agents/tagbot';
import { databaseAuthToken, databaseUrl } from './database';
import { createXWebhookRoutes } from './x-routes';
import { createDemoRoutes } from './demo-routes';

// The X webhook routes opt out with requiresAuth: false. Everything else under /api needs
// TAGBOT_API_TOKEN, so a public deploy can't be used to run the agent on our Gateway credit.
const apiToken = process.env.TAGBOT_API_TOKEN;

export const mastra = new Mastra({
  agents: { tagbot },
  server: {
    apiRoutes: [...createDemoRoutes(), ...(xAdapter ? createXWebhookRoutes(xAdapter, tagbot.getChannels()!) : [])],
    ...(apiToken ? { auth: new SimpleAuth({ tokens: { [apiToken]: { id: 'demo-admin', name: 'Demo admin', role: 'admin' } } }) } : {}),
  },
  storage: new LibSQLStore({ id: 'tagbot-storage', url: databaseUrl, authToken: databaseAuthToken }),
});
