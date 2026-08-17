export interface GrammarRule {
  name: string;
  formula: string;
  when: string[];
  signal?: string[];
  examples: string[];
}

export const grammarRules: Record<string, GrammarRule> = {
  'present simple': {
    name: 'Present Simple',
    formula: 'subject + V1 (he/she/it → V1+s)',
    when: [
      'Permanent states and general truths (Water boils at 100°C)',
      'Habits and repeated actions (I drink coffee every morning)',
      'Scheduled events / timetables (The train leaves at 6)',
      'Instructions and directions (You turn left at the corner)',
    ],
    signal: ['always', 'usually', 'often', 'sometimes', 'never', 'every day', 'on Mondays'],
    examples: ['She reads every night.', 'The sun sets in the west.'],
  },
  'present continuous': {
    name: 'Present Continuous',
    formula: 'subject + am/is/are + V-ing',
    when: [
      'Action happening right now (She is sleeping)',
      'Temporary situation (I\'m staying at a hotel this week)',
      'Changing / developing situation (Prices are rising)',
      'Fixed future arrangement (We are meeting them tomorrow)',
      'Annoying repeated habit (with "always": He\'s always interrupting!)',
    ],
    signal: ['now', 'at the moment', 'currently', 'today', 'this week', 'still'],
    examples: ['They are watching a film.', 'The economy is improving slowly.'],
  },
  'present perfect': {
    name: 'Present Perfect',
    formula: 'subject + have/has + past participle',
    when: [
      'Past action with a present result (I\'ve lost my keys — I can\'t find them)',
      'Life experience up to now (Have you ever visited Rome?)',
      'Recent past (She has just left the office)',
      'Unfinished period of time (I\'ve worked here for five years)',
    ],
    signal: ['just', 'already', 'yet', 'ever', 'never', 'recently', 'for', 'since', 'so far'],
    examples: ['He has written three novels.', 'I haven\'t seen her since Monday.'],
  },
  'present perfect continuous': {
    name: 'Present Perfect Continuous',
    formula: 'subject + have/has been + V-ing',
    when: [
      'Activity that started in the past and is still continuing (I\'ve been studying for hours)',
      'Recent activity with a visible present result (You look tired — have you been running?)',
      'Emphasis on duration of an ongoing activity',
    ],
    signal: ['for', 'since', 'all day', 'all morning', 'lately', 'recently'],
    examples: ['It has been raining since morning.', 'She\'s been working on that project for months.'],
  },
  'past simple': {
    name: 'Past Simple',
    formula: 'subject + V2 (irregular) or V1+ed (regular)',
    when: [
      'Completed action at a specific time in the past (She left at 8)',
      'Series of completed past actions — narrative (He came in, sat down, and opened his book)',
      'Habits or states that no longer exist (We lived in Paris for ten years)',
      'Action completed before the present moment when the time is stated',
    ],
    signal: ['yesterday', 'ago', 'last week/month/year', 'in 1990', 'when', 'then', 'at that time'],
    examples: ['The war ended in 1945.', 'She walked into the room and smiled.'],
  },
  'past simple passive': {
    name: 'Past Simple Passive',
    formula: 'subject + was/were + past participle',
    when: [
      'Completed past action where the focus is on the receiver, not the doer',
      'The agent (doer) is unknown, unimportant, or obvious',
      'Formal or scientific writing where objectivity is required',
    ],
    signal: ['was', 'were', 'by'],
    examples: ['The studio was filled with the rich odour of roses.', 'The letter was written by hand.'],
  },
  'past continuous': {
    name: 'Past Continuous',
    formula: 'subject + was/were + V-ing',
    when: [
      'Action in progress at a specific moment in the past (At 6 pm I was cooking)',
      'Background action interrupted by a shorter one (I was reading when he called)',
      'Two simultaneous past actions (She was singing while he was playing piano)',
      'Polite or tentative requests (I was wondering if you could help)',
    ],
    signal: ['while', 'when', 'at that moment', 'all day', 'as'],
    examples: ['It was raining when we arrived.', 'They were discussing the plan when she walked in.'],
  },
  'past continuous passive': {
    name: 'Past Continuous Passive',
    formula: 'subject + was/were being + past participle',
    when: [
      'Ongoing past action in the passive voice',
      'Background action where the focus is on what was being done to the subject',
    ],
    examples: ['The road was being repaired when we passed.', 'Dinner was being prepared by the time we arrived.'],
  },
  'past perfect': {
    name: 'Past Perfect',
    formula: 'subject + had + past participle',
    when: [
      '"Past of the past" — action completed before another past action (He had left before she arrived)',
      'Reported speech backshift (She said she had seen it before)',
      'Third conditional (If I had known, I would have helped)',
      'To show cause of a past situation',
    ],
    signal: ['already', 'just', 'never', 'before', 'after', 'by the time', 'when (= after)'],
    examples: ['By the time he arrived, the show had already started.', 'She had never seen snow before that winter.'],
  },
  'past perfect continuous': {
    name: 'Past Perfect Continuous',
    formula: 'subject + had been + V-ing',
    when: [
      'Activity in progress over a period before another past event',
      'Emphasises the duration of a background activity',
      'Explains the cause of a past state (He was tired — he had been working all night)',
    ],
    signal: ['for', 'since', 'how long', 'before', 'by the time'],
    examples: ['She had been waiting for an hour when the bus finally came.', 'They had been arguing all evening.'],
  },
  'past perfect passive': {
    name: 'Past Perfect Passive',
    formula: 'subject + had been + past participle',
    when: [
      'Action completed before a past moment, passive voice (focus on receiver)',
      'Formal narrative where the doer is secondary',
    ],
    examples: ['The letter had been sent before he changed his mind.', 'The castle had been abandoned for years.'],
  },
  'future simple': {
    name: 'Future Simple (will)',
    formula: 'subject + will + V1',
    when: [
      'Spontaneous decision made at the moment of speaking (I\'ll have the soup)',
      'Prediction without present evidence (I think it will rain tomorrow)',
      'Promise, offer, or threat (I\'ll help you with that)',
      'Inevitable future fact (She will be 30 next year)',
    ],
    signal: ['tomorrow', 'next week', 'soon', 'in the future', 'I think', 'probably'],
    examples: ['I\'ll call you later.', 'They will finish the project by Friday.'],
  },
  'going to': {
    name: 'Going to (Future)',
    formula: 'subject + am/is/are going to + V1',
    when: [
      'Pre-decided plan or intention (I\'m going to study medicine)',
      'Prediction based on present evidence (Look at those clouds — it\'s going to rain)',
    ],
    signal: ['soon', 'this evening', 'next week', 'look', 'obviously'],
    examples: ['She\'s going to start a new job next month.', 'Be careful — you\'re going to drop that!'],
  },
  'future continuous': {
    name: 'Future Continuous',
    formula: 'subject + will be + V-ing',
    when: [
      'Action in progress at a specific future moment (This time tomorrow I\'ll be flying)',
      'Planned or expected future event (I\'ll be meeting them at noon)',
      'Polite enquiry about plans (Will you be using the car tonight?)',
    ],
    signal: ['this time tomorrow', 'at 6 pm next Friday', 'all day'],
    examples: ['At 10 o\'clock tomorrow I\'ll be sitting in the exam.', 'She\'ll be working late tonight.'],
  },
  'future perfect': {
    name: 'Future Perfect',
    formula: 'subject + will have + past participle',
    when: [
      'Action that will be completed before a specific future time (By 2030, they will have launched the product)',
      'With "by" or "by the time" to show completion deadline',
    ],
    signal: ['by', 'by the time', 'before', 'by next year'],
    examples: ['By the time she arrives, I will have finished cooking.', 'They will have left before midnight.'],
  },
  'conditional': {
    name: 'Conditional (would)',
    formula: 'subject + would + V1',
    when: [
      'Second conditional — unreal/hypothetical present or future (If I had time, I would help)',
      'Third conditional — unreal past (If I had known, I would have told you)',
      'Polite requests and offers (Would you mind opening the window?)',
      'Reported speech for future actions (She said she would come)',
      'Habits in the past — with "used to" flavour (We would walk to school every day)',
    ],
    signal: ['if', 'would', 'could', 'might', 'unless'],
    examples: ['If he worked harder, he would pass.', 'She said she would call back.'],
  },
  'present simple passive': {
    name: 'Present Simple Passive',
    formula: 'subject + am/is/are + past participle',
    when: [
      'General truth or fact, passive focus (Coffee is grown in Brazil)',
      'Processes and procedures (The data is collected every hour)',
      'Rules and regulations (Visitors are not allowed past this point)',
    ],
    examples: ['English is spoken worldwide.', 'The reports are submitted every Monday.'],
  },
};

export const VALID_TENSES = Object.keys(grammarRules);
