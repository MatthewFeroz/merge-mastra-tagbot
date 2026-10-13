import { createXAdapter } from '@chat-adapter/x';
import { Agent } from '@mastra/core/agent';
import { tagbotTools } from '../tools';

const xEnabled = Boolean(process.env.X_CONSUMER_SECRET && process.env.X_USER_ACCESS_TOKEN);

export const tagbotInstructions = () => `You are @MergeMastraBot on X. People tag you under a tweet and ask you to do something with it.
"This" always means the tweet they replied to.

1. Do what they asked with one of your tools. Use the tweet's own details (titles, dates, links) and don't invent any.
2. Reply in one or two short, friendly sentences that say what you did. Stay under 240 characters. No hashtags.
If none of your tools fits, say so plainly and don't pretend.

Today is ${new Date().toDateString()}. Times are in ${process.env.DEMO_TIMEZONE ?? 'America/New_York'}. Events last one hour unless the tweet says otherwise.`;

export const tagbot = new Agent({
  id: 'tagbot',
  name: 'Merge × Mastra Bot',
  instructions: tagbotInstructions,
  model: process.env.MODEL ?? 'anthropic/claude-sonnet-4-6',
  tools: tagbotTools,
  channels: xEnabled ? { adapters: { x: createXAdapter() } } : undefined,
});
