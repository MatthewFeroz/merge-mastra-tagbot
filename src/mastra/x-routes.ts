import { registerApiRoute } from '@mastra/core/server';
import type { ThreadXAdapter } from './x-adapter';
import type { AgentChannels } from '@mastra/core/channels';

export function createXWebhookRoutes(adapter: ThreadXAdapter, channels: AgentChannels) {
  // Mastra's built-in channel route is POST-only. X needs one URL accepting both
  // GET CRC verification and signed POST delivery. Custom routes live outside /api.
  return [registerApiRoute('/webhooks/x', {
    method: 'GET',
    requiresAuth: false,
    handler: c => adapter.handleWebhook(c.req.raw),
  }), registerApiRoute('/webhooks/x', {
    method: 'POST',
    requiresAuth: false,
    handler: c => channels.handleWebhookEvent('x', c.req.raw),
  })];
}
