import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agentHandlerConfigured, callAgentHandler } from './agent-handler';
import type { RequestContext } from '@mastra/core/request-context';
import { isVerifiedXRequest, type XRequest } from './x-handler';
import { checkConnector } from './connector-catalog';

// The bot's one action. The model fills in a title, body and labels, and the tool builds the
// full Agent Handler request. Without AGENT_HANDLER_* set it's a dry run.

let dryRunCount = 0;

export const issueInputSchema = z.object({
    title: z.string().trim().min(1).max(90).describe('Short, specific title, e.g. "CLI crashes on Node 24 with ERR_REQUIRE_ESM"'),
    body: z
      .string().trim().min(1).max(6000)
      .describe('Markdown with sections for what’s happening, steps or details from the thread, and who reported it on X'),
    labels: z.array(z.enum(['bug', 'regression', 'docs', 'feature request'])).max(2),
  });
export const issueOutputSchema = z.object({ number: z.number().int().positive(), url: z.url(), dryRun: z.boolean() });

type Dependencies = { configured: boolean; call: typeof callAgentHandler };
export async function executeIssue(
  input: z.infer<typeof issueInputSchema>, requestContext?: RequestContext,
  dependencies: Dependencies = { configured: agentHandlerConfigured, call: callAgentHandler },
) {
    const { title, body, labels } = issueInputSchema.parse(input);
    const request = requestContext?.get('x-request') as XRequest | undefined;
    const owner = process.env.GITHUB_OWNER ?? 'your-org';
    const repo = process.env.GITHUB_REPO ?? 'your-repo';
    if (request) {
      // HTTP clients can supply JSON requestContext. Only the signed channel handler
      // can mint this object; a client-provided allowIssueCreation flag is not authority.
      if (!isVerifiedXRequest(request)) throw new Error('Unverified X request context');
      if (!request.allowIssueCreation) throw new Error('The current mention did not request an issue');
      if (request.issue) return { ...request.issue, dryRun: false };
      if (request.issueAttempted) throw new Error('An issue was already attempted for this mention');
      if (!dependencies.configured || !process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) {
        throw new Error('Live issue creation is not configured');
      }
    }
    // Studio and the scripted CLI demo are dry runs unless explicitly opted into live actions.
    if (!request && (!dependencies.configured || process.env.DEMO_LIVE_ACTIONS !== 'true')) {
      const number = ++dryRunCount;
      return { number, url: `https://github.com/${owner}/${repo}/issues/${number}`, dryRun: true };
    }
    if (!dependencies.configured || !process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) throw new Error('Issue creation is not configured');
    if (request) request.issueAttempted = true;
    await request?.demo?.record('handler', 'running', { toolName: 'github__create_issue' });
    let issue;
    try {
      issue = await dependencies.call('github__create_issue', {
      owner,
      repo,
      title,
      body: request ? `${body}\n\n---\nReported on X: ${request.sourceUrl}` : body,
      // "from-x" marks everything the bot opened, so it's easy to filter.
      labels: ['from-x', ...new Set(labels)],
      assignee: null,
      assignees: null,
      milestone: null,
      type: null,
      });
      await request?.demo?.record('handler', 'complete', { toolName: 'github__create_issue' });
    } catch (error) {
      await request?.demo?.record('handler', 'failed', { toolName: 'github__create_issue' });
      throw error;
    }
    let number: number;
    let url: string;
    try {
      number = z.number().int().positive().parse(issue.number);
      url = `https://github.com/${owner}/${repo}/issues/${number}`;
      const returnedUrl = issue.html_url ?? issue.url;
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${number}`;
      if (returnedUrl !== url && returnedUrl !== apiUrl) throw new Error('Unexpected issue destination from Agent Handler');
    } catch (error) {
      await request?.demo?.record('issue', 'failed');
      throw error;
    }
    if (request) {
      request.issue = { number, url };
      await request.demo?.record('issue', 'complete', { issueNumber: number, issueUrl: url });
      await request.recordIssue(url);
    }
    return { number, url, dryRun: false };
}

export const createIssue = createTool({
  id: 'create-issue',
  description: 'Open one GitHub issue in the configured repository, only when the latest request asks for it. Dry runs return dryRun=true and do not create an issue.',
  inputSchema: issueInputSchema,
  outputSchema: issueOutputSchema,
  execute: (input, context) => executeIssue(input, context?.requestContext),
});

export const tagbotTools = { createIssue, checkConnector };
