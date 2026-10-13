# Merge × Mastra Bot

Give your product its own @bot. Someone hits a bug, tags @MergeMastraBot in the thread on X, and the bot opens a GitHub issue and replies with the link. It's built with Mastra, runs its model through Merge Gateway, and reaches GitHub through Merge Agent Handler, so anyone on X can tag it but it can only ever open an issue.

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

The bot is public, so anyone can tag it. Merge is what makes that safe.

- The Agent Handler Tool Pack holds only `github__create_issue`. Whatever someone posts, the bot can't close, edit, comment on or touch code.
- Merge holds the GitHub credentials, so they never live in the bot.
- Every call is recorded in Tool Call Logs, and every issue gets a `from-x` label.
- The model runs through Merge Gateway, so model spend and traffic are in one place too.

## Dry run or live

With no `AGENT_HANDLER_*` values the demo is a dry run. The real model reads each thread and decides, but no issue is created.

`npm test` runs the whole loop with a scripted stand-in model, no API key needed.

To open real issues:

1. In Merge Agent Handler, connect GitHub for a Registered User.
2. Create a Tool Pack with `github__create_issue` and nothing else.
3. Fill in `AGENT_HANDLER_*`, `GITHUB_OWNER` and `GITHUB_REPO` in `.env`. The repo needs the labels `from-x`, `bug`, `regression`, `docs` and `feature request`.

## Real mentions on X

The same agent answers real tags once `X_CONSUMER_SECRET` and `X_USER_ACCESS_TOKEN` are set and it's deployed on the Mastra platform, with X's `post.mention.create` webhook pointed at it. X only sends the post that tags the bot, so a step that fetches the rest of the thread is still to come.
