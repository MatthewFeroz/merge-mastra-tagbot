import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const API_KEY = process.env.AGENT_HANDLER_API_KEY;
const TOOL_PACK_ID = process.env.AGENT_HANDLER_TOOL_PACK_ID;
const REGISTERED_USER_ID = process.env.AGENT_HANDLER_REGISTERED_USER_ID;

export const agentHandlerConfigured = Boolean(API_KEY && TOOL_PACK_ID && REGISTERED_USER_ID);

let client: Promise<Client> | undefined;

function connect() {
  client ??= (async () => {
    const c = new Client({ name: 'merge-mastra-bot', version: '0.1.0' });
    const url = new URL(
      `https://ah-api.merge.dev/api/v1/tool-packs/${TOOL_PACK_ID}/registered-users/${REGISTERED_USER_ID}/mcp`,
    );
    await c.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${API_KEY}` } } }));
    return c;
  })().catch(error => {
    client = undefined;
    throw error;
  });
  return client;
}

/**
 * Calls one Agent Handler tool, e.g. `github__create_issue`. Merge checks it against the
 * Tool Pack, uses the Registered User's credentials, and records it in Tool Call Logs.
 * Returns the tool's JSON result.
 */
export async function callAgentHandler(name: string, input: Record<string, unknown>): Promise<any> {
  const result = (await (await connect()).callTool({ name, arguments: { input } })) as {
    isError?: boolean;
    structuredContent?: unknown;
    content?: { type: string; text?: string }[];
  };
  const text = result.content?.find(c => c.type === 'text')?.text ?? '';
  if (result.isError) throw new Error(`${name} failed: ${text.slice(0, 300)}`);
  if (result.structuredContent) return result.structuredContent;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}
