# Merge × Mastra Teammate

Build your own Grok Bot style teammate. Someone @mentions the bot in a Slack thread, and it turns the thread into a Linear ticket or a summary. It's built with Mastra and reaches Linear through Merge Agent Handler, so access is scoped, credentials stay with Merge, and every action is logged.

```bash
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY
npm run demo
```

## What the demo plays

| Thread | Someone asks | What the bot does |
|---|---|---|
| `#support` Acme's CSV exports time out, renewal at risk | turn this thread into a Linear ticket | Checks Linear for an open ticket, finds none, files one with the details and impact |
| `#eng` long thread about flaky staging deploys | summarize this thread | Replies with the problem, decision and owner, no tools |
| `#sales` Globex hits the same export timeouts | file a ticket for this | Finds the ticket from the first thread and points to it instead of filing a duplicate |

Edit `scripts/scenario.ts` to change the threads. Only the threads are scripted. The agent decides what to do.

## Dry run or live

With no `AGENT_HANDLER_*` values the demo is a dry run. The real model reads each thread and decides, but Linear is simulated in memory, so nothing is created.

`npm test` runs the whole loop with a scripted stand-in model, no API key needed.

To create real tickets:

1. In Merge Agent Handler, connect Linear for a Registered User.
2. Create a Tool Pack with `linear__get_issues` and `linear__create_issue`, and nothing else.
3. Fill in `AGENT_HANDLER_*` and `LINEAR_TEAM_ID` in `.env`.

## How it works

| Piece | Job |
|---|---|
| Mastra agent (`src/mastra/agents/teammate.ts`) | Reads the thread, decides between summarizing, filing, or pointing to an existing ticket |
| Bot tools (`src/mastra/tools.ts`) | The model fills in a title, description and priority. The tool builds the full Agent Handler request |
| Merge Agent Handler | Holds the Linear credentials, allows only the tools in the Tool Pack, logs every call |
| Mastra Slack channel | When `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` are set, the same agent answers real @mentions and reads the thread itself |
