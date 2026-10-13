import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agentHandlerConfigured, callAgentHandler } from './agent-handler';

// The bot's three actions. The model fills in a few plain fields, and each tool builds the
// full Agent Handler request. Without AGENT_HANDLER_* set, they run as a dry run.

const outputSchema = z.object({ ok: z.boolean(), link: z.string().optional(), dryRun: z.boolean().optional() });

const dryRun = (app: string) => ({ ok: true, dryRun: true, link: `(dry run, nothing was sent to ${app})` });

/** Finds the first value under one of these keys anywhere in a tool result. */
function pick(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k) && typeof v === 'string') return v;
    const nested = pick(v, keys);
    if (nested) return nested;
  }
  return undefined;
}

export const addToCalendar = createTool({
  id: 'add-to-calendar',
  description: 'Add an event to the user’s Google Calendar.',
  inputSchema: z.object({
    title: z.string(),
    start: z.string().describe('Local start time, ISO 8601 without offset, e.g. 2026-10-20T12:00:00'),
    end: z.string().describe('Local end time, ISO 8601 without offset'),
    details: z.string().describe('Short description, including any link from the tweet'),
  }),
  outputSchema,
  execute: async ({ title, start, end, details }) => {
    if (!agentHandlerConfigured) return dryRun('Google Calendar');
    const timeZone = process.env.DEMO_TIMEZONE ?? 'America/New_York';
    const at = (dateTime: string) => ({ date: null, date_time: dateTime, time_zone: timeZone });
    const event = await callAgentHandler('google_calendar__create_event', {
      ...nulls(CALENDAR_OPTIONAL),
      calendar_id: null,
      summary: title,
      description: details,
      start: at(start),
      end: at(end),
      send_updates: 'none',
    });
    return { ok: true, link: pick(event, ['htmlLink', 'html_link']) };
  },
});

export const saveToReadingList = createTool({
  id: 'save-to-reading-list',
  description: 'Save something to the user’s Notion reading list.',
  inputSchema: z.object({
    title: z.string(),
    summary: z.string().describe('One or two sentences on why it’s worth reading'),
    sourceUrl: z.string().optional(),
  }),
  outputSchema,
  execute: async ({ title, summary, sourceUrl }) => {
    if (!agentHandlerConfigured) return dryRun('Notion');
    const paragraph = (content: string) => ({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content } }] },
    });
    const page = await callAgentHandler('notion__create_page', {
      parent: {
        type: 'page_id',
        page_id: requireEnv('DEMO_NOTION_PAGE_ID'),
        database_id: null,
        data_source_id: null,
        workspace: null,
        block_id: null,
      },
      properties: { title: [{ text: { content: title } }] },
      children: [paragraph(summary), ...(sourceUrl ? [paragraph(sourceUrl)] : [])],
      icon: { type: 'emoji', emoji: '🔖', custom_emoji: null, external: null, file: null, file_upload: null, icon: null },
      cover: null,
    });
    return { ok: true, link: pick(page, ['url']) };
  },
});

export const tellTheTeam = createTool({
  id: 'tell-the-team',
  description: 'Post a message to the team’s Slack channel.',
  inputSchema: z.object({ message: z.string().describe('What the team needs to know, with the original quote') }),
  outputSchema,
  execute: async ({ message }) => {
    if (!agentHandlerConfigured) return dryRun('Slack');
    const channel = requireEnv('DEMO_SLACK_CHANNEL_ID');
    const posted = await callAgentHandler('slack__post_message', {
      ...nulls(SLACK_OPTIONAL),
      channel,
      text: message,
    });
    return { ok: true, link: pick(posted, ['permalink']) ?? `Slack channel ${channel}` };
  },
});

export const tagbotTools = { addToCalendar, saveToReadingList, tellTheTeam };

// Agent Handler marks every field required and lets optional ones be null.
const CALENDAR_OPTIONAL = [
  'location', 'attendees', 'conference_data', 'reminders', 'recurrence', 'status', 'event_id',
  'extended_properties', 'transparency', 'visibility', 'color_id', 'event_type', 'birthday_properties',
  'focus_time_properties', 'out_of_office_properties', 'working_location_properties',
  'guests_can_invite_others', 'guests_can_modify', 'guests_can_see_other_guests', 'max_attendees',
  'supports_attachments',
];
const SLACK_OPTIONAL = [
  'blocks', 'attachments', 'thread_ts', 'reply_broadcast', 'unfurl_links', 'unfurl_media',
  'link_names', 'parse', 'metadata', 'mrkdwn',
];

function nulls(keys: string[]) {
  return Object.fromEntries(keys.map(k => [k, null]));
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in .env`);
  return value;
}
