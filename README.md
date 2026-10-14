# Merge × Mastra Bot

Someone hits a bug, tags @mergeapibot in the thread on X, and asks it to file an issue. The bot reads the original post and reply chain, opens a GitHub issue, and replies under the mention with the link. Mastra runs the agent, Merge Gateway provides inference, and Merge Agent Handler brokers the GitHub action.

```bash
npm install
cp .env.example .env   # add MERGE_GATEWAY_API_KEY
npm run demo
```

## What the demo plays

| X thread | Someone tags the bot with | What the bot does |
|---|---|---|
| Users report the CLI crashing on Node 24 | can you open an issue for this? | Opens a GitHub issue with the details from the thread and replies with the link |
| A debate about where agents should keep credentials | summarize this thread | Replies with the main points, no tools |

Edit `scripts/scenario.ts` to change the threads. Only the threads are scripted. The agent decides what to do.

## Why Merge matters here

The public bot has a narrow action surface.

- Configure the Agent Handler Tool Pack to expose only `github__create_issue`, with GitHub access restricted to the demo repo. The app exposes one tool and fixes the owner and repo on the server. Repository restrictions should also be enforced by the GitHub connection and Tool Pack.
- Merge holds the GitHub credentials, so they never live in the bot.
- Every call is recorded in Tool Call Logs, and every issue gets a `from-x` label.
- The model runs through Merge Gateway, so model spend and traffic are in one place too.

## Dry run or live

The CLI demo and Studio are dry runs by default, even when Agent Handler credentials are present. The model reads each thread and decides, but the tool returns an issue preview with `dryRun: true`. Set `DEMO_LIVE_ACTIONS=true` only for an intentional live CLI demo. Keep it false on a public server, since it also enables writes from Studio/API runs.

`npm test` runs the scripted agent loop and a signed-webhook integration test against local fake X and Agent Handler services. It covers thread ancestry, fixed-repo issue creation, source links, summary requests, forged request context, duplicate delivery after restart, bounded replies, and encrypted OAuth token persistence. It uses no real service credentials or public posts.

`npm run test:live` checks the real Agent Handler tool catalog, X managed OAuth identity, and Merge Gateway inference for both scenarios. Issue requests remain dry runs and no X posts are sent. The test permits Agent Handler's `authenticate_github` helper alongside `github__create_issue`, but rejects other actions. Use `npm run test:live -- --connections-only` to check connections without inference. These checks do not prove that a real GitHub issue or X reply can be written.

To open real issues:

1. In Merge Agent Handler, connect GitHub for a Registered User.
2. Create a Tool Pack with `github__create_issue` and nothing else.
3. Fill in `AGENT_HANDLER_*`, `GITHUB_OWNER` and `GITHUB_REPO` in `.env`. The repo needs the labels `from-x`, `bug`, `regression`, `docs` and `feature request`.

## Real mentions on X

Run `npm run dev` to open Mastra Studio locally. The X webhook is:

```text
/webhooks/x
```

X sends `post.mention.create` events to this endpoint. It accepts signed POST delivery and GET CRC challenges, delegating to the Mastra channel adapter. The extra route is necessary because Mastra's generated channel route accepts POST only. Configure the bot with `tweet.read`, `tweet.write`, `users.read`, and `offline.access`; DMs and email access are unnecessary. `npm run x-auth` authorizes @mergeapibot and saves tokens locally.

For each mention, the app fetches up to ten posts along its reply ancestry, including the original post. It does not retrieve every branch of a conversation. Long chains are marked as truncated. If a required post is unavailable or X refuses a read, the bot returns a generic failure instead of inventing context. X API reads and writes require available credits and appropriate account access.

Only the latest mention can request an issue. The server checks for an explicit request to open, file, create, or raise an issue, bug report, or ticket. Summary requests disable tool calls. Earlier posts are data, and their instructions cannot grant write access. This intent check is a small workshop policy, not a general prompt-injection detector.

Each mention is claimed in LibSQL before model or tool execution. The bot allows one issue attempt per mention, stores the verified issue URL, and posts one plain-text reply of at most 240 characters. A replay of the same mention is skipped after a restart. A new mention is a new request and can create another issue for the same bug. Failed or interrupted claims are retained for manual inspection, because a timeout can leave an external action's outcome uncertain. Inspect GitHub/X before clearing a claim; do not retry ambiguous writes automatically.

The bot does not subscribe to conversations or answer DMs. X replies use the mention as their reply target. Public failures never include provider error text. Client-supplied JSON request context cannot grant the signed handler's issue authority.

OAuth refresh tokens rotate. The X adapter stores rotated tokens in the same LibSQL database rather than Mastra's transient cache. Set `X_ENCRYPTION_KEY` to a base64-encoded 32-byte key, generated with `openssl rand -base64 32`, and preserve it across deployments. Keep the database and environment private.

## Mastra Platform setup

This repository uses Mastra's standard build output:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm start
```

Connect the GitHub repository to a Mastra Platform project and provide the values from `.env.example` through its environment settings. Use a persistent LibSQL database for `DATABASE_URL` and its `DATABASE_AUTH_TOKEN` if required. A local file on ephemeral hosting loses mention claims and rotated tokens. Start with one running instance; channel locks are in memory and this template does not coordinate OAuth refreshes across replicas.

After deploying, register `https://<your-host>/webhooks/x` in X and subscribe @mergeapibot to `post.mention.create`. Protect Studio and administrative APIs with the platform's access controls while leaving this signed webhook reachable. Keep `DEMO_LIVE_ACTIONS=false`. Verify the deployed CRC challenge and a real mention before the workshop.

## Workshop checklist

- [x] Standalone Mastra agent repository and reusable scaffold.
- [x] Model inference configured through Merge Gateway.
- [x] GitHub action connected through Agent Handler, with a fixed repository and bounded input schemas.
- [x] Signed X webhook, original-post/reply-chain context, issue link reply, and summary path.
- [x] Local smoke/integration tests and production build.
- [ ] Verify the live Tool Pack exposes only the intended GitHub tool and the connection is restricted to the demo repo.
- [ ] Create/configure the Mastra Platform project, persistent database, and hosted environment.
- [ ] Register the hosted X webhook and mention subscription; verify one real mention.
- [ ] Give Brandon access to the deployed demo.
- [ ] Refresh the architecture slides for this tagbot demo and share the demo/slides.
- [ ] Submit the required integration PR and arrange repository access for `@bookercodes` with explicit permission.
- [ ] Record the 2–3 minute demo in 16:9, 1080p, and share the downloadable original for Alex Booker.
- [ ] Complete the October 16 and 19 dry runs for the October 20 workshop.

The workshop deliverables above come from Brandon Barros's `Mastra-Merge-Gameplan.pdf`. Deployment, account invitations, and a recorded live demo remain separate steps.
