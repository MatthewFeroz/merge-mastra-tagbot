// One-time OAuth 2.0 sign-in for the bot account. Opens X's consent page, catches the
// redirect on http://127.0.0.1:3000/callback, and writes the bot's tokens into .env.
//   npm run x-auth
// Needs X_CLIENT_ID and X_CLIENT_SECRET in .env. Sign in as the bot (X_BOT_USERNAME) and click Authorize.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { execFile } from 'node:child_process';
import { getMentionStore } from '../src/mastra/mention-store';
import { botUserName } from '../src/mastra/x-adapter';

const clientId = process.env.X_CLIENT_ID;
const clientSecret = process.env.X_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error('Set X_CLIENT_ID and X_CLIENT_SECRET in .env first');

const redirectUri = 'http://127.0.0.1:3000/callback';
const scopes = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];
const verifier = randomBytes(32).toString('base64url');
const state = randomBytes(16).toString('hex');

const authorizeUrl = new URL('https://x.com/i/oauth2/authorize');
authorizeUrl.search = new URLSearchParams({
  response_type: 'code',
  client_id: clientId,
  redirect_uri: redirectUri,
  scope: scopes.join(' '),
  state,
  code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  code_challenge_method: 'S256',
}).toString();

const server = createServer((req, res) => {
  void handleCallback(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500).end('Sign-in could not be saved. Check your local configuration and try again.');
    finish(new Error('X sign-in failed. Check the network, local .env, and DATABASE_URL before trying again.'));
  });
});

async function handleCallback(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', redirectUri);
  if (url.pathname !== '/callback') return res.writeHead(404).end();
  if (url.searchParams.get('state') !== state || !url.searchParams.get('code')) {
    res.writeHead(400).end('Sign-in failed or was cancelled. You can close this tab.');
    return finish(new Error(`X returned: ${url.searchParams.get('error') ?? 'no code'}`));
  }

  const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: url.searchParams.get('code')!,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  const tokens = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; error?: string };
  if (!tokens.access_token || !tokens.refresh_token) {
    res.writeHead(500).end('Token exchange failed. Check the terminal.');
    return finish(new Error(`Token exchange failed (${tokenRes.status}): ${tokens.error ?? 'missing tokens'}`));
  }

  const meRes = await fetch('https://api.x.com/2/users/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const me = (await meRes.json()) as {
    data?: { username?: string };
  };
  if (!meRes.ok || me.data?.username?.toLowerCase() !== botUserName.toLowerCase()) {
    res.writeHead(400).end(`Sign-in did not verify @${botUserName}. No tokens were saved.`);
    return finish(new Error(`Expected the @${botUserName} account. No tokens were saved.`));
  }
  setEnv({ X_USER_ACCESS_TOKEN: tokens.access_token, X_REFRESH_TOKEN: tokens.refresh_token });
  // A new authorization supersedes any previously persisted rotated refresh token.
  await getMentionStore().clearToken(`x:oauth:${clientId}`);
  res.writeHead(200).end(`Signed in as @${me.data?.username ?? 'unknown'}. You can close this tab.`);
  console.log(`Saved tokens for @${me.data?.username ?? 'unknown'} to .env`);
  finish();
}

server.on('error', () => finish(new Error('Could not start the local OAuth callback server on port 3000.')));

function setEnv(values: Record<string, string>) {
  let env = readFileSync('.env', 'utf8');
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    env = new RegExp(`^${key}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${key}=.*$`, 'm'), line) : `${env.trimEnd()}\n${line}\n`;
  }
  writeFileSync('.env', env, { mode: 0o600 });
}

function finish(error?: Error) {
  server.close();
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  process.exit(0);
}

server.listen(3000, '127.0.0.1', () => {
  console.log('Waiting for X sign-in on http://127.0.0.1:3000/callback');
  console.log(`Authorize URL: ${authorizeUrl}`);
  if (process.env.X_AUTH_OPEN !== 'false') execFile('open', ['-a', 'Brave Browser', authorizeUrl.toString()]);
});
