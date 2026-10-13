# Merge × Mastra Bot

A Grok-style bot for X that can act on what it reads. Someone tags it in a thread, and it either summarizes the thread or turns it into a ticket in the company's Linear. It's built with Mastra and reaches Linear through Merge Agent Handler, so anyone on X can tag it but it can only ever do what Merge allows.

```bash
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY
npm run demo
```

## What the demo plays

| X thread | Someone tags the bot with | What the bot does |
|---|---|---|
| Users complaining that big CSV exports time out | can you turn this into a ticket for the team? | Checks Linear for an open ticket, finds none, files one with the details from the thread, replies that it's logged |
| A debate about where agents should keep credentials | summarize this thread | Replies with the main points, no tools |
| Another user hits the same export timeouts | can you report this? | Finds the ticket from the first thread and says it's already logged instead of filing a duplicate |

Edit `scripts/scenario.ts` to change the threads. Only the threads are scripted. The agent decides what to do.

## Why Merge matters here

The bot is public, so anyone can tag it. Merge Agent Handler is what makes that safe.

- The Tool Pack holds only `linear__get_issues` and `linear__create_issue`. Whatever someone tweets, the bot can't edit, delete or read anything else.
- Merge holds the Linear credentials, so they never live in the bot.
- Every call is recorded in Tool Call Logs.

## Dry run or live

With no `AGENT_HANDLER_*` values the demo is a dry run. The real model reads each thread and decides, but Linear is simulated in memory, so nothing is created.

`npm test` runs the whole loop with a scripted stand-in model, no API key needed.

To create real tickets:

1. In Merge Agent Handler, connect Linear for a Registered User.
2. Create a Tool Pack with `linear__get_issues` and `linear__create_issue`, and nothing else.
3. Fill in `AGENT_HANDLER_*` and `LINEAR_TEAM_ID` in `.env`.

## Real mentions on X

The same agent answers real tags once `X_CONSUMER_SECRET` and `X_USER_ACCESS_TOKEN` are set and it's deployed on the Mastra platform, with X's `post.mention.create` webhook pointed at it.
