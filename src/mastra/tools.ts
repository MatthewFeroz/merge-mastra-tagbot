import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agentHandlerConfigured, callAgentHandler } from './agent-handler';

// The bot's Linear actions. The model fills in a few plain fields, and each tool builds the
// full Agent Handler request. Without AGENT_HANDLER_* set, they use an in-memory Linear so the
// demo still behaves end to end (including spotting duplicates) without touching anything.

const ticketSchema = z.object({ id: z.string(), title: z.string(), url: z.string(), status: z.string() });
type Ticket = z.infer<typeof ticketSchema>;

const dryRunTickets: Ticket[] = [];

export const findSimilarTickets = createTool({
  id: 'find-similar-tickets',
  description:
    'Search open Linear tickets by title. Pass 1 to 3 single words that would appear in a ticket title, e.g. ["csv", "export"]. Call this before creating a ticket.',
  inputSchema: z.object({ keywords: z.array(z.string().min(2)).min(1).max(3) }),
  outputSchema: z.object({ tickets: z.array(ticketSchema) }),
  // Linear's title search is a plain substring match, so search each word on its own and merge.
  execute: async ({ keywords }) => {
    const words = keywords.flatMap(k => k.toLowerCase().split(/\s+/)).filter(w => w.length > 1).slice(0, 3);
    if (!agentHandlerConfigured) {
      return { tickets: dryRunTickets.filter(t => words.some(w => t.title.toLowerCase().includes(w))) };
    }
    const found = new Map<string, Ticket>();
    for (const word of words) {
      const result = await callAgentHandler('linear__get_issues', {
        ...nulls(GET_ISSUES_FIELDS),
        team_id: requireEnv('LINEAR_TEAM_ID'),
        query: word,
        open_only: true,
        limit: 5,
      });
      const issues: any[] = result?.issues ?? result?.nodes ?? result?.data ?? [];
      for (const i of issues) {
        const id = i.identifier ?? i.id;
        found.set(id, { id, title: i.title, url: i.url ?? '', status: i.state?.name ?? i.state ?? '' });
      }
    }
    return { tickets: [...found.values()] };
  },
});

export const createTicket = createTool({
  id: 'create-ticket',
  description: 'Create a Linear ticket from an X thread.',
  inputSchema: z.object({
    title: z.string().max(90).describe('Short, specific title, e.g. "CSV export times out for files over 50MB"'),
    description: z
      .string()
      .describe('Markdown with sections for what’s happening, who reported it on X, and details from the thread'),
    priority: z.enum(['urgent', 'high', 'medium', 'low']),
  }),
  outputSchema: ticketSchema,
  execute: async ({ title, description, priority }) => {
    if (!agentHandlerConfigured) {
      const ticket = { id: `DEMO-${dryRunTickets.length + 1}`, title, url: '(dry run, not sent to Linear)', status: 'Triage' };
      dryRunTickets.push(ticket);
      return ticket;
    }
    const result = await callAgentHandler('linear__create_issue', {
      ...nulls(CREATE_ISSUE_FIELDS),
      team_id: requireEnv('LINEAR_TEAM_ID'),
      title,
      description,
      priority: { urgent: 1, high: 2, medium: 3, low: 4 }[priority],
    });
    const issue = result?.issue ?? result;
    return { id: issue.identifier ?? issue.id, title: issue.title ?? title, url: issue.url ?? '', status: issue.state?.name ?? 'Triage' };
  },
});

export const tagbotTools = { findSimilarTickets, createTicket };

// Agent Handler marks every field required and lets optional ones be null.
const GET_ISSUES_FIELDS = [
  'team_key', 'assignee_id', 'project_id', 'project_milestone_id', 'state_name', 'state_type',
  'priority', 'label', 'updated_after', 'include_archived', 'order_by', 'cursor',
];
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
