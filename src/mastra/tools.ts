import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agentHandlerConfigured, callAgentHandler } from './agent-handler';

// The bot's one action. The model fills in a title, body and labels, and the tool builds the
// full Agent Handler request. Without AGENT_HANDLER_* set it's a dry run.

let dryRunCount = 0;

export const createIssue = createTool({
  id: 'create-issue',
  description: 'Open a GitHub issue for a bug someone reported on X.',
  inputSchema: z.object({
    title: z.string().max(90).describe('Short, specific title, e.g. "CLI crashes on Node 24 with ERR_REQUIRE_ESM"'),
    body: z
      .string()
      .describe('Markdown with sections for what’s happening, steps or details from the thread, and who reported it on X'),
    labels: z.array(z.enum(['bug', 'regression', 'docs', 'feature request'])).max(2),
  }),
  outputSchema: z.object({ number: z.number(), url: z.string() }),
  execute: async ({ title, body, labels }) => {
    const owner = process.env.GITHUB_OWNER ?? 'your-org';
    const repo = process.env.GITHUB_REPO ?? 'your-repo';
    if (!agentHandlerConfigured) {
      const number = ++dryRunCount;
      return { number, url: `https://github.com/${owner}/${repo}/issues/${number}` };
    }
    const issue = await callAgentHandler('github__create_issue', {
      owner,
      repo,
      title,
      body,
      // "from-x" marks everything the bot opened, so it's easy to filter.
      labels: ['from-x', ...labels],
      assignee: null,
      assignees: null,
      milestone: null,
      type: null,
    });
    return { number: issue.number, url: issue.html_url ?? issue.url };
  },
});

export const tagbotTools = { createIssue };
