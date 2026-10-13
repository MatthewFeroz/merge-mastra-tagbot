import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Stand-ins for the Agent Handler tools, so the demo runs before the Tool Pack exists.
// They accept the same kind of request and report what would have happened.
const done = (app: string) => async (input: unknown) => ({
  ok: true,
  dryRun: true,
  note: `No ${app} call was made. Set the AGENT_HANDLER_* variables to run it for real.`,
  input,
});

export const dryRunTools = {
  google_calendar__create_event: createTool({
    id: 'google_calendar__create_event',
    description: 'Create an event on the user’s primary Google Calendar.',
    inputSchema: z.object({
      summary: z.string(),
      start: z.string().describe('ISO 8601 date-time with offset'),
      end: z.string().describe('ISO 8601 date-time with offset'),
      description: z.string().optional(),
    }),
    execute: done('Google Calendar'),
  }),
  notion__create_page: createTool({
    id: 'notion__create_page',
    description: 'Create a page in Notion under the given parent page.',
    inputSchema: z.object({ parentPageId: z.string(), title: z.string(), content: z.string() }),
    execute: done('Notion'),
  }),
  slack__post_message: createTool({
    id: 'slack__post_message',
    description: 'Post a message to a Slack channel by channel ID.',
    inputSchema: z.object({ channel: z.string(), text: z.string() }),
    execute: done('Slack'),
  }),
};
