# Merge × Mastra Bot

Run one command and watch a Mastra agent act on tweets in real apps. People "tag" the bot under a post and ask it to do something with it. The bot does it through Merge Agent Handler and writes its reply.

```bash
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY
npm run demo
```

## What the demo plays

| Someone tags the bot under… | and asks | The bot uses |
|---|---|---|
| A post announcing the Oct 20 workshop | put this on my calendar | `google_calendar__create_event` |
| A post about shipping agents to production | save this to my reading list | `notion__create_page` |
| A customer reporting checkout errors | send this to the team | `slack__post_message` |

Edit `scripts/scenario.ts` to change the tweets. The bot reads them like real mentions, nothing is scripted on its side.

## Dry run or live

With no `AGENT_HANDLER_*` values the demo is a dry run. The agent still reads each tweet, picks a tool, fills it in and replies, but stand-in tools report what they would have done.

To run it live:

1. In Merge Agent Handler, create a Tool Pack with `google_calendar__create_event`, `notion__create_page` and `slack__post_message`.
2. Connect Google Calendar, Notion and Slack for a Registered User.
3. Fill in `AGENT_HANDLER_*`, `DEMO_NOTION_PAGE_ID` and `DEMO_SLACK_CHANNEL_ID` in `.env`.

The bot can only do what's in the Tool Pack, Merge holds the credentials, and every call shows up in Tool Call Logs.

## Real mentions on X (later)

The same agent answers real tags once `X_CONSUMER_SECRET` and `X_USER_ACCESS_TOKEN` are set and it's deployed on the Mastra platform with X's mention webhook pointed at it.
