import { MCPClient } from '@mastra/mcp';

const API_KEY = process.env.AGENT_HANDLER_API_KEY;
const TOOL_PACK_ID = process.env.AGENT_HANDLER_TOOL_PACK_ID;
const REGISTERED_USER_ID = process.env.AGENT_HANDLER_REGISTERED_USER_ID;

export const agentHandlerConfigured = Boolean(API_KEY && TOOL_PACK_ID && REGISTERED_USER_ID);

let client: MCPClient | undefined;

/**
 * Every tool in the Tool Pack, for the apps this Registered User has connected.
 * Merge decides what's in the pack, holds the credentials, and logs each call.
 * Mastra namespaces them as `merge_<tool>`, e.g. `merge_slack__post_message`.
 */
export async function getAgentHandlerTools() {
  client ??= new MCPClient({
    id: 'merge-agent-handler',
    servers: {
      merge: {
        url: new URL(
          `https://ah-api.merge.dev/api/v1/tool-packs/${TOOL_PACK_ID}/registered-users/${REGISTERED_USER_ID}/mcp`,
        ),
        requestInit: { headers: { Authorization: `Bearer ${API_KEY}` } },
      },
    },
  });
  return client.listTools();
}
