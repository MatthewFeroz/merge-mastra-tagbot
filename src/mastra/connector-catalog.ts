import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { isVerifiedXRequest } from './x-handler';

// Merge publishes the Agent Handler connector catalog as Markdown. The bot looks names up here
// instead of answering from memory, so a public reply never invents what Merge supports.
export const catalogUrl = 'https://docs.merge.dev/merge-agent-handler/connectors.md';
const pageBase = 'https://docs.merge.dev';
const cacheMs = 60 * 60 * 1000;

export type Connector = { name: string; url: string };
let cache: { at: number; connectors: Connector[] } | undefined;

/** Reads connector entries like `[![Notion](logo.png)Notion ](/merge-agent-handler/connectors/notion)`. */
export function parseCatalog(markdown: string): Connector[] {
  const seen = new Map<string, Connector>();
  for (const [, name, path] of markdown.matchAll(/\[!\[([^\]]+)\]\([^)]*\)[^\]]*\]\((\/merge-agent-handler\/connectors\/[^)\s]+)\)/g)) {
    seen.set(path, { name: name.trim(), url: `${pageBase}${path}` });
  }
  return [...seen.values()];
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Exact matches first, then names that contain the query or are contained by it. */
export function findConnectors(connectors: Connector[], query: string) {
  const q = normalize(query);
  if (!q) return { supported: false, matches: [] as Connector[] };
  const exact = connectors.filter(c => normalize(c.name) === q);
  const partial = q.length < 3 ? [] : connectors.filter(c => {
    const n = normalize(c.name);
    // A short name like "X" shouldn't match every query that happens to contain the letter.
    return n !== q && (n.includes(q) || (n.length >= 4 && q.includes(n)));
  });
  return { supported: exact.length > 0, matches: [...exact, ...partial].slice(0, 5) };
}

async function loadCatalog(fetchImpl: typeof fetch = fetch) {
  if (cache && Date.now() - cache.at < cacheMs) return cache.connectors;
  const response = await fetchImpl(catalogUrl, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('The connector catalog is unavailable');
  const connectors = parseCatalog(await response.text());
  if (connectors.length < 50) throw new Error('The connector catalog could not be read');
  cache = { at: Date.now(), connectors };
  return connectors;
}

export const checkConnector = createTool({
  id: 'check-connector',
  description:
    "Look up whether Merge Agent Handler has a connector for a tool or app, in Merge's public connector catalog. Use it whenever someone asks if Merge supports, integrates with or connects to something.",
  inputSchema: z.object({ name: z.string().trim().min(1).max(60).describe('The tool or app name, e.g. "Notion" or "Excalidraw"') }),
  outputSchema: z.object({
    query: z.string(),
    supported: z.boolean(),
    matches: z.array(z.object({ name: z.string(), url: z.string() })),
    catalogUrl: z.string(),
  }),
  execute: async ({ name }, context) => {
    const { supported, matches } = findConnectors(await loadCatalog(), name);
    // Shown on the /demo timeline. Only the signed X handler creates a verified request.
    const request = context?.requestContext?.get('x-request');
    if (isVerifiedXRequest(request)) request.catalogLookup = { query: name, found: supported };
    return { query: name, supported, matches, catalogUrl: 'https://docs.merge.dev/merge-agent-handler/connectors' };
  },
});
