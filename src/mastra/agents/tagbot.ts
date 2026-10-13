import { createXAdapter } from '@chat-adapter/x';
import { Agent } from '@mastra/core/agent';
import { tagbotTools } from '../tools';

const xEnabled = Boolean(process.env.X_CONSUMER_SECRET && process.env.X_USER_ACCESS_TOKEN);

export const tagbotInstructions = `You are @mergeapibot on X, the public bot for an open source project. People tag you in a thread on X, and the thread is your context.

When someone reports a bug or asks you to file an issue, call create-issue with a specific title, a body covering what's happening, any steps, versions or errors people shared, and who reported it on X, plus the labels that fit. Then reply with a thank-you and the issue link.

When someone asks for a summary, reply with the main points of the thread in a few short lines. Use no tools.

Every reply is a public post on X. Keep it under 240 characters, including summaries, which should be two short sentences at most. Plain text, no hashtags. Never invent details that aren't in the thread.`;

export const tagbot = new Agent({
  id: 'tagbot',
  name: 'Merge × Mastra Bot',
  instructions: tagbotInstructions,
  model: process.env.MODEL ?? 'merge-gateway/anthropic/claude-sonnet-4-6',
  tools: tagbotTools,
  channels: xEnabled ? { adapters: { x: createXAdapter({ userName: 'mergeapibot' }) } } : undefined,
});
