// The X threads the demo plays through. The first post starts the thread, the rest are replies,
// and each ends with someone tagging the bot. Edit freely, the bot reads them like real threads.
export type XThread = {
  posts: { from: string; text: string }[];
  mention: { from: string; text: string };
};

export const scenario: XThread[] = [
  {
    posts: [
      { from: '@dana_ships', text: 'Upgraded to Node 24 this morning and the CLI won’t even start. Just throws ERR_REQUIRE_ESM 😩' },
      { from: '@kev_codes', text: 'Same on my machine. Works fine on Node 22, breaks on 24.0 and 24.1' },
      { from: '@dana_ships', text: 'Happens on a fresh install too, so it’s not my setup' },
    ],
    mention: { from: '@dana_ships', text: '@mergeapibot can you open an issue for this?' },
  },
  {
    posts: [
      { from: '@agentpatterns', text: 'Hot take. Agents should never hold their own API keys. Credentials belong in a broker the agent calls through.' },
      { from: '@sam_builds', text: 'Agree for prod. For prototypes it slows you down a lot though' },
      { from: '@riya_dev', text: 'The broker also gives you one place to see every action the agent took. That alone is worth it' },
      { from: '@agentpatterns', text: 'Exactly. And you can revoke one user’s access without redeploying anything' },
      { from: '@sam_builds', text: 'Fair. Prototype with keys, move to a broker before real users touch it' },
    ],
    mention: { from: '@priya_pm', text: '@mergeapibot summarize this thread' },
  },
];
