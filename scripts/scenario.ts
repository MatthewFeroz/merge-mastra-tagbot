// The Slack threads the demo plays through. Each ends with someone @mentioning the bot.
// Edit freely, the bot reads them like real threads.
export type SlackThread = {
  channel: string;
  messages: { from: string; text: string }[];
  mention: { from: string; text: string };
};

export const scenario: SlackThread[] = [
  {
    channel: '#support',
    messages: [
      { from: 'Jordan (Support)', text: 'Acme is saying CSV exports time out. They tried three times this morning.' },
      { from: 'Sam (Eng)', text: 'Looks like it only happens for exports over ~50MB. Smaller ones are fine. Started after Tuesday’s deploy.' },
      { from: 'Jordan (Support)', text: 'They have a board meeting Thursday and need the data before then.' },
      { from: 'Alex (CSM)', text: 'Their renewal is next month too, so this one matters.' },
    ],
    mention: { from: 'Jordan (Support)', text: '@bot turn this thread into a Linear ticket' },
  },
  {
    channel: '#eng',
    messages: [
      { from: 'Sam (Eng)', text: 'Staging deploys have failed 4 of the last 10 runs. Always the integration test step.' },
      { from: 'Riya (Eng)', text: 'It’s the payments sandbox timing out. Their status page shows degraded since yesterday.' },
      { from: 'Sam (Eng)', text: 'Can we mock it in CI for now? Retrying just doubles the build time.' },
      { from: 'Lee (Eng Manager)', text: 'Yes, mock it this week. Riya, can you own that? We’ll revisit once their sandbox is stable.' },
      { from: 'Riya (Eng)', text: 'On it. Will have a PR up tomorrow.' },
    ],
    mention: { from: 'Priya (PM)', text: '@bot can you summarize this thread for me? I just got back' },
  },
  {
    channel: '#sales',
    messages: [
      { from: 'Morgan (AE)', text: 'Globex just told me their big CSV exports keep timing out. Anyone know about this?' },
    ],
    mention: { from: 'Morgan (AE)', text: '@bot can you file a ticket for this?' },
  },
];
