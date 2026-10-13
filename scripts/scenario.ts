// The X threads the demo plays through. The first post starts the thread, the rest are replies,
// and each ends with someone tagging the bot. Edit freely, the bot reads them like real threads.
export type XThread = {
  posts: { from: string; text: string }[];
  mention: { from: string; text: string };
};

export const scenario: XThread[] = [
  {
    posts: [
      { from: '@dana_ships', text: 'CSV exports have been timing out all morning. Tried three times. Board meeting Thursday and I need this data 😩' },
      { from: '@kev_codes', text: 'Same here. Anything over about 50MB just dies, smaller files go through fine' },
      { from: '@dana_ships', text: 'Started after the update on Tuesday I think' },
    ],
    mention: { from: '@dana_ships', text: '@MergeMastraBot can you turn this into a ticket for the team?' },
  },
  {
    posts: [
      { from: '@agentpatterns', text: 'Hot take. Agents should never hold their own API keys. Credentials belong in a broker the agent calls through.' },
      { from: '@sam_builds', text: 'Agree for prod. For prototypes it slows you down a lot though' },
      { from: '@riya_dev', text: 'The broker also gives you one place to see every action the agent took. That alone is worth it' },
      { from: '@agentpatterns', text: 'Exactly. And you can revoke one user’s access without redeploying anything' },
      { from: '@sam_builds', text: 'Fair. Prototype with keys, move to a broker before real users touch it' },
    ],
    mention: { from: '@priya_pm', text: '@MergeMastraBot summarize this thread' },
  },
  {
    posts: [
      { from: '@morgan_ops', text: 'Is anyone else unable to export big CSVs right now? Keeps timing out' },
    ],
    mention: { from: '@morgan_ops', text: '@MergeMastraBot can you report this?' },
  },
];
