import { timingSafeEqual } from 'node:crypto';
import { registerApiRoute } from '@mastra/core/server';
import { z } from 'zod';
import { getMentionStore, type MentionStore } from './mention-store';
import { demoPage } from './demo-page';

const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export async function handleDemoRuns(request: Request, store?: MentionStore, token = process.env.TAGBOT_API_TOKEN) {
  // A missing token must not turn the feed into a public endpoint, even in local builds.
  if (!token) return Response.json({ error: 'Demo access is not configured.' }, { status: 503, headers: noStore });
  const authorization = request.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${token}`);
  const supplied = Buffer.from(authorization);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return Response.json({ error: 'A demo access token is required.' }, { status: 401, headers: noStore });
  }
  try {
    const runs = await (store ?? getMentionStore()).listDemoRuns();
    const destination = z.string().regex(/^[\w.-]+\/[\w.-]+$/).safeParse(
      process.env.GITHUB_OWNER && process.env.GITHUB_REPO ? `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}` : '',
    );
    return Response.json({ runs, serverTime: new Date().toISOString(), ...(destination.success ? { destination: destination.data } : {}) }, { headers: noStore });
  } catch {
    return Response.json({ error: 'The request feed is temporarily unavailable.' }, { status: 503, headers: noStore });
  }
}

export function createDemoRoutes() {
  return [
    registerApiRoute('/demo', {
      method: 'GET', requiresAuth: false,
      handler: () => new Response(demoPage, { headers: {
        ...noStore, 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; frame-ancestors 'self'; form-action 'none'",
      } }),
    }),
    registerApiRoute('/demo/runs', {
      method: 'GET', requiresAuth: true,
      handler: c => handleDemoRuns(c.req.raw),
    }),
  ];
}
