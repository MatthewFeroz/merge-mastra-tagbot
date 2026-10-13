// The tweets the demo plays through. Each one is someone tagging the bot under another post.
// Edit freely, the bot reads them like real mentions.
export type Mention = {
  from: string;
  text: string;
  replyingTo: { from: string; text: string };
};

export const scenario: Mention[] = [
  {
    from: '@maya_builds',
    replyingTo: {
      from: '@mastra',
      text: 'Live next Tuesday, Oct 20 at 12pm ET. Merge and Mastra show how to give one agent access to hundreds of apps without losing control. mastra.ai/workshops',
    },
    text: '@MergeMastraBot put this on my calendar',
  },
  {
    from: '@devon_ships',
    replyingTo: {
      from: '@agentpatterns',
      text: 'Seven things we learned shipping agents to production this year. Scope tools per user, log every action, keep the model out of your credentials. Full write-up at agentpatterns.dev/production',
    },
    text: '@MergeMastraBot save this to my reading list',
  },
  {
    from: '@priya_codes',
    replyingTo: {
      from: '@a_customer',
      text: 'Checkout keeps failing with a 502 since about 9:40am. Tried three cards. Anyone else seeing this?',
    },
    text: '@MergeMastraBot send this to the team so someone looks at it',
  },
];
