import { createXAdapter } from '@chat-adapter/x';
import { Agent } from '@mastra/core/agent';
import { agentHandlerConfigured, getAgentHandlerTools } from '../agent-handler';
import { dryRunTools } from '../dry-run-tools';

const xEnabled = Boolean(process.env.X_CONSUMER_SECRET && process.env.X_USER_ACCESS_TOKEN);

export const tagbot = new Agent({
  id: 'tagbot',
  name: 'Merge × Mastra Bot',
  instructions: () => `You are @MergeMastraBot on X. People tag you under a tweet and ask you to do something with it.
"This" always means the tweet they replied to.

1. Do what they asked with your tools. Use the tweet's details (titles, dates, links) rather than inventing any.
2. Reply in one or two short, friendly sentences that say what you did. Stay under 240 characters. No hashtags.
If none of your tools can do it, say so plainly and don't pretend.

Defaults for this account
- Today is ${new Date().toDateString()}. Timezone ${process.env.DEMO_TIMEZONE ?? 'America/New_York'}. Calendar events go on the primary calendar and last one hour unless the tweet says otherwise.
- Reading list is the Notion page ${process.env.DEMO_NOTION_PAGE_ID ?? '(not set)'}. Save each tweet as a child page.
- "The team" is the Slack channel ${process.env.DEMO_SLACK_CHANNEL_ID ?? '(not set)'}.`,
  model: process.env.MODEL ?? 'anthropic/claude-sonnet-4-6',
  tools: async () => (agentHandlerConfigured ? getAgentHandlerTools() : dryRunTools),
  channels: xEnabled ? { adapters: { x: createXAdapter() } } : undefined,
});
