import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agentHandlerConfigured, callAgentHandler } from './agent-handler';

// The bot's one action. The model fills in a title, description and priority, and the tool
// builds the full Agent Handler request. Without AGENT_HANDLER_* set it's a dry run.

let dryRunCount = 0;

export const createTicket = createTool({
  id: 'create-ticket',
  description: 'Create a Linear issue for a bug someone reported on X.',
  inputSchema: z.object({
    title: z.string().max(90).describe('Short, specific title, e.g. "CSV export times out for files over 50MB"'),
    description: z
      .string()
      .describe('Markdown with sections for what’s happening, who reported it on X, and details from the thread'),
    priority: z.enum(['urgent', 'high', 'medium', 'low']),
  }),
  outputSchema: z.object({ id: z.string(), title: z.string(), url: z.string() }),
  execute: async ({ title, description, priority }) => {
    if (!agentHandlerConfigured) {
      return { id: `DEMO-${++dryRunCount}`, title, url: '(dry run, not sent to Linear)' };
    }
    const result = await callAgentHandler('linear__create_issue', {
      ...nulls(CREATE_ISSUE_FIELDS),
      team_id: requireEnv('LINEAR_TEAM_ID'),
      title,
      description,
      priority: { urgent: 1, high: 2, medium: 3, low: 4 }[priority],
    });
    const issue = result?.issue ?? result;
    return { id: issue.identifier ?? issue.id, title: issue.title ?? title, url: issue.url ?? '' };
  },
});

export const tagbotTools = { createTicket };

// Agent Handler marks every field required and lets optional ones be null.
const CREATE_ISSUE_FIELDS = [
  'assignee_id', 'estimate', 'state_id', 'label_ids', 'project_id', 'cycle_id', 'parent_id', 'due_date',
  'subscriber_ids',
];

function nulls(keys: string[]) {
  return Object.fromEntries(keys.map(k => [k, null]));
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in .env`);
  return value;
}
