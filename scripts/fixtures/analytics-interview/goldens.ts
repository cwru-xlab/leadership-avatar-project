/**
 * The six golden transcripts for the data-analytics grading study. See
 * ./types.ts for what each variant is meant to demonstrate.
 */

import type { GoldenTranscript, GoldenTurn } from "./types";

const open = (prompt: string): GoldenTurn[] => [
  {
    role: "assistant",
    t: 0,
    content:
      "Hi, thanks for joining. I'll start with a quick question about you, then we'll spend most of our time on one analytics problem, and you'll have time for questions at the end. So — what drew you to product analytics?",
  },
  {
    role: "user",
    t: 12,
    content:
      "In my internship at a regional bank I built the weekly dashboard for the mobile app team. I noticed our 'active users' number counted people who only received a push notification, so I rebuilt it from session events and it dropped by about a fifth. That changed which features the team prioritized, and I realized I like being the person who makes sure the number means what people think it means.",
  },
  { role: "assistant", t: 75, content: `Thanks. Let's get into the problem. ${prompt}` },
];

const close = (t: number): GoldenTurn[] => [
  { role: "assistant", t, content: "Let's stop there. What questions do you have for me?" },
  { role: "user", t: t + 8, content: "How does the analytics team decide which experiments get a full readout versus an automated one?" },
  { role: "assistant", t: t + 25, content: "Mostly by risk and size of the change — big launches get a person. Thanks for your time today." },
];

// ---------------------------------------------------------------------------
// A. strong — one-page checkout experiment design
// ---------------------------------------------------------------------------
export const CHECKOUT_STRONG: GoldenTranscript = {
  id: "checkout-strong",
  questionId: "da-ab-one-page-checkout",
  variant: "strong",
  nudgesIssued: [],
  exhibitsRevealed: [],
  turns: [
    ...open(
      "ShopCart, an e-commerce app, built a one-page checkout to replace its current three-page checkout. How would you design the experiment to decide whether to launch it?",
    ),
    {
      role: "user",
      t: 90,
      content:
        "A few questions first. What's the baseline — how many users reach the cart each day, and what share of them buy? And what's the smallest lift the team would consider worth shipping?",
    },
    {
      role: "assistant",
      t: 104,
      content:
        "About 50,000 users reach the cart page a day, 20% of them buy, and the team would ship for a 5% relative lift — one percentage point.",
    },
    {
      role: "user",
      t: 115,
      content:
        "Great. My hypothesis: collapsing three pages into one removes drop-off points, so among users who reach the cart, purchase conversion should go up from 20% toward 21%. Is anything else different in the new design besides the page count?",
    },
    { role: "assistant", t: 132, content: "The promo-code field and gift-wrap option are now behind a link." },
    {
      role: "user",
      t: 140,
      content:
        "That matters for guardrails. My primary metric is purchase conversion: users who complete a purchase divided by users who reached the cart during the test, per user not per session. Guardrails: revenue per cart visitor and average order value, because hiding the promo field could change basket size or promo usage; payment error rate; and checkout page latency, since a single heavier page could load slower. If conversion goes up but revenue per user drops, that's not a win.",
    },
    {
      role: "user",
      t: 190,
      content:
        "For the unit: do people shop on both web and app logged in?",
    },
    { role: "assistant", t: 198, content: "Yes, most are logged in and use both." },
    {
      role: "user",
      t: 205,
      content:
        "Then I'd randomize by logged-in user, not session or device, so someone doesn't see the old checkout on web and the new one in the app. Eligibility triggers on the first cart visit during the test, so we only analyze people who could see the change. A shopper doesn't affect other shoppers here, so I don't expect interference.",
    },
    {
      role: "user",
      t: 240,
      content:
        "Sizing. What power and significance does the team use?",
    },
    { role: "assistant", t: 246, content: "80% power, 5% significance, two-sided." },
    {
      role: "user",
      t: 252,
      content:
        "Using the rule of thumb n ≈ 16 times p times one minus p over delta squared: 16 times 0.2 times 0.8 is 2.56, divided by 0.01 squared, 0.0001, gives 25,600 users per arm, so about 51,000 total. At 50,000 cart users a day that's only a day or so of traffic — but I'd still run two full weeks. Are there weekly patterns?",
    },
    { role: "assistant", t: 280, content: "Traffic and conversion are higher on weekends." },
    {
      role: "user",
      t: 286,
      content:
        "Then two full weeks covers two weekend cycles and gives returning users time to get past any novelty — a new layout can get a curiosity bump or a learning dip in the first days. I'd also check the effect by day to see if it's stable.",
    },
    {
      role: "user",
      t: 315,
      content:
        "Decision rule, written down before launch: ship if purchase conversion is up with a 95% confidence interval excluding zero and a point estimate of at least about one point, and revenue per cart visitor is not significantly worse. If conversion is up but revenue per user is down because promo usage collapsed, iterate on the promo link instead of shipping. Pitfalls I'd guard against: no peeking and stopping on the first significant day, a sample-ratio check on the 50/50 split before reading anything, and I'd keep the guardrail list short to limit multiple-comparison noise.",
    },
    {
      role: "user",
      t: 360,
      content:
        "So my recommendation: a two-week, 50/50 user-level test triggered at the cart, about 25,600 users per arm, primary metric purchase conversion, guardrails revenue per visitor and payment errors. If it hits the one-point lift, that's about 500 more orders a day — 50,000 times one point — or roughly $30,000 a day at a $60 order.",
    },
    ...close(400),
  ],
  expect: { allHit: true, processRigorMin: 5, statisticalMin: 4, businessMin: 4 },
};

// ---------------------------------------------------------------------------
// B. skips-steps — DAU drop, jumps to a cause
// ---------------------------------------------------------------------------
export const DAU_SKIPS: GoldenTranscript = {
  id: "dau-skips-steps",
  questionId: "da-diag-dau-drop",
  variant: "skips-steps",
  nudgesIssued: [],
  exhibitsRevealed: [],
  turns: [
    ...open(
      "Snapsy, a photo-sharing app, saw daily active users drop 8% this week compared with last week. How would you figure out what happened?",
    ),
    {
      role: "user",
      t: 90,
      content:
        "An 8% weekly drop is big. Did anything ship recently?",
    },
    {
      role: "assistant",
      t: 100,
      content:
        "Android app version 5.2 shipped Monday evening and reached all Android users by Tuesday. Nothing shipped on iOS or web.",
    },
    {
      role: "user",
      t: 110,
      content:
        "Then that's almost certainly it. The new Android version probably made the app worse — maybe the new camera flow is confusing or it's slower — and users are leaving for competitors. Users are very sensitive to performance in photo apps.",
    },
    { role: "assistant", t: 130, content: "Okay. What would you do about it?" },
    {
      role: "user",
      t: 136,
      content:
        "I'd roll back 5.2 immediately and then run user research to figure out which part of the redesign people dislike. I'd also look at app-store reviews for complaints about the new version. Once we know, we can fix it and re-release behind an A/B test so this doesn't happen again.",
    },
    { role: "assistant", t: 165, content: "How big a deal is this for the business?" },
    {
      role: "user",
      t: 171,
      content:
        "Pretty big — 8% of daily users is a lot of engagement, and if they churn for good it hurts ad revenue. So the rollback is urgent.",
    },
    ...close(190),
  ],
  expect: {
    processRigorMax: 2,
    statisticalMax: 2,
    businessMax: 2,
    steps: {
      check_data_integrity: ["missed"],
      segment_and_locate: ["missed"],
      hypothesize_and_test: ["missed"],
    },
  },
};

// ---------------------------------------------------------------------------
// C. stats-wrong — morning push, sample size and peeking errors
// ---------------------------------------------------------------------------
export const PUSH_STATS_WRONG: GoldenTranscript = {
  id: "push-stats-wrong",
  questionId: "da-ab-morning-push",
  variant: "stats-wrong",
  nudgesIssued: [],
  exhibitsRevealed: [],
  turns: [
    ...open(
      "Daily Brief is a news app. The team wants to send a 7 a.m. push notification with the top three stories to new users. How would you test it?",
    ),
    {
      role: "user",
      t: 88,
      content:
        "Let me start with the hypothesis. A morning digest gives new users a daily reason to open the app, so I expect day-7 retention of new users to go up. What's the current day-7 retention, and what lift matters?",
    },
    {
      role: "assistant",
      t: 102,
      content: "40% of new users are active on day 7, and the team cares about 2 percentage points.",
    },
    {
      role: "user",
      t: 110,
      content:
        "Primary metric: day-7 retention of new users, meaning share of users who installed during the test and were active on their seventh day. Guardrails: notification opt-out rate and uninstalls, because an extra daily push could annoy people into turning notifications off, which would hurt the breaking-news alerts too.",
    },
    {
      role: "user",
      t: 145,
      content:
        "Randomize at the new-user level at install, 50/50. Users don't affect each other in a news app, so user-level is fine.",
    },
    {
      role: "user",
      t: 165,
      content:
        "For sample size, the central limit theorem kicks in around 30 observations, so we don't need much. To be safe I'd use 500 users per group — a thousand total. With 200,000 installs a week we'd fill that in about an hour.",
    },
    { role: "assistant", t: 190, content: "And how long would it run?" },
    {
      role: "user",
      t: 195,
      content:
        "I'd check the dashboard every morning and stop as soon as the p-value goes below 0.05 — that way we don't waste time. If we hit significance on day two, we ship on day two.",
    },
    { role: "assistant", t: 212, content: "Suppose the results come back — what would make you ship it?" },
    {
      role: "user",
      t: 218,
      content:
        "If the p-value is under 0.05 it means there's a 95% chance the push works, so we ship. If opt-outs go up a lot we'd reconsider.",
    },
    {
      role: "user",
      t: 240,
      content:
        "So overall: 500 per group, check daily, ship once it's significant, and watch opt-outs.",
    },
    ...close(255),
  ],
  expect: {
    statisticalMax: 2,
    processRigorMax: 2,
    steps: {
      state_hypothesis: ["hit"],
      choose_metrics: ["hit"],
      power_and_duration: ["missed"],
      decision_rule: ["missed"],
    },
  },
};

// ---------------------------------------------------------------------------
// D. needs-nudges — marketplace health; guardrails and commit only after nudges
// ---------------------------------------------------------------------------
export const MARKETPLACE_NUDGED: GoldenTranscript = {
  id: "marketplace-nudged",
  questionId: "da-metric-marketplace-health",
  variant: "needs-nudges",
  nudgesIssued: [
    { stepKey: "guardrails_and_gaming", atSeconds: 300 },
    { stepKey: "validate_and_commit", atSeconds: 350 },
  ],
  exhibitsRevealed: [{ exhibitId: "ex1", atSeconds: 180 }],
  turns: [
    ...open(
      "TaskNest is a marketplace that connects people with local handypeople. The CEO wants one number for 'marketplace health'. What would you propose?",
    ),
    {
      role: "user",
      t: 90,
      content:
        "What does TaskNest make money on, and what does the CEO look at today?",
    },
    {
      role: "assistant",
      t: 100,
      content:
        "TaskNest keeps 15% of each completed job, average job $120. Today the CEO looks at the number of job requests posted.",
    },
    {
      role: "user",
      t: 110,
      content:
        "So the goal is completed jobs, and the CEO's number only counts demand. Health has to capture both sides actually matching. Walk me through how a job flows?",
    },
    {
      role: "assistant",
      t: 125,
      content:
        "A customer posts a request, taskers send quotes, the customer books one, the job gets completed, and both sides rate each other.",
    },
    {
      role: "user",
      t: 135,
      content:
        "Then the user actions that show value are: a customer getting a quote quickly, booking, and the job being completed — and on the tasker side, getting booked. A request posted with no quote is just unmet demand. Could I see how requests turn into completed jobs, by city?",
    },
    { role: "assistant", t: 180, content: "I've put that on your screen." },
    {
      role: "user",
      t: 190,
      content:
        "Overall, 18,210 completed out of 36,000 requests, about 50.6%. Booking is about 70% of quoted and completion about 95% of booked everywhere, but Phoenix only gets quotes on 5,500 of 10,000 requests — 55% versus about 84% elsewhere. So Phoenix has a supply shortage that the request count completely hides.",
    },
    {
      role: "user",
      t: 230,
      content:
        "My metric: fulfillment rate — completed jobs divided by job requests, per city per week. Concretely: from the requests table, left join bookings on request_id, count requests whose booking has a non-null completed_at, divide by all requests created in the week, dedupe requests that were re-posted by the same customer for the same job within a day. If Phoenix got to an 85% quote rate, that's 10,000 times 0.85 times 0.7 times 0.95, about 5,650 completed jobs instead of 3,660, so roughly 2,000 more a month.",
    },
    {
      role: "assistant",
      t: 300,
      content: "How could that number go up while things actually get worse?",
    },
    {
      role: "user",
      t: 306,
      content:
        "Good point. You could raise fulfillment by pushing taskers to accept low-paying jobs, so I'd pair it with tasker earnings per hour and tasker retention as guardrails. And customers could get worse quality from rushed jobs, so average rating and repeat booking rate as a second guardrail. Time to first quote is also worth watching because it leads fulfillment.",
    },
    {
      role: "assistant",
      t: 350,
      content: "So which one would you put in front of the team, and why should they trust it?",
    },
    {
      role: "user",
      t: 356,
      content:
        "I'd put fulfillment rate in front of the CEO, with tasker earnings and customer rating as guardrails beside it. To trust it, I'd check that cities and weeks with higher fulfillment have higher 90-day repeat bookings and revenue, and that it would have flagged Phoenix earlier than request volume did. The first action is tasker recruiting in Phoenix — about 2,000 more jobs a month is around $36,000 a month in take at $120 and 15%.",
    },
    ...close(400),
  ],
  expect: {
    processRigorMin: 3,
    processRigorMax: 3,
    businessMax: 3,
    steps: {
      clarify_goal: ["hit"],
      define_precisely: ["hit"],
      guardrails_and_gaming: ["prompted"],
      validate_and_commit: ["prompted"],
    },
  },
};

// ---------------------------------------------------------------------------
// E. readout-misread — onboarding SRM ignored
// ---------------------------------------------------------------------------
const SRM_PROMPT =
  "FitTrack, a fitness app, ran a two-week A/B test of a redesigned onboarding flow with a planned 50/50 split. The team says onboarding completion went up three points and wants to ship. What would you tell them?";

export const SRM_MISREAD: GoldenTranscript = {
  id: "srm-misread",
  questionId: "da-readout-onboarding-srm",
  variant: "readout-misread",
  nudgesIssued: [{ stepKey: "check_validity", atSeconds: 160 }],
  exhibitsRevealed: [{ exhibitId: "ex1", atSeconds: 100 }],
  turns: [
    ...open(SRM_PROMPT),
    { role: "user", t: 90, content: "Can I see the results?" },
    { role: "assistant", t: 100, content: "They're on your screen now." },
    {
      role: "user",
      t: 110,
      content:
        "Okay — control completion is 60% and treatment is 63%, so three points, a 5% relative lift. With about fifty thousand users per arm that's definitely significant. Week-one retention is also up, 35 to 36.4. Both metrics moving together is a good sign.",
    },
    { role: "assistant", t: 160, content: "Before we talk about the lift — how much do you trust these numbers?" },
    {
      role: "user",
      t: 166,
      content:
        "I trust them. It ran the full two weeks and the groups are basically equal — 50,000 and 48,600 is close enough; you never get a perfect 50/50, and with almost a hundred thousand users a gap of 1,400 is just noise.",
    },
    {
      role: "user",
      t: 200,
      content:
        "The 3-point lift is about 1,500 more people finishing onboarding per 50,000 new users, and since retention moved too, I'd expect it to show up in long-term engagement.",
    },
    {
      role: "user",
      t: 230,
      content:
        "So my recommendation is to ship the new onboarding to everyone and keep monitoring completion on the dashboard.",
    },
    ...close(250),
  ],
  expect: {
    statisticalMax: 2,
    businessMax: 2,
    processRigorMax: 2,
    steps: {
      check_validity: ["missed"],
      read_primary_result: ["missed"],
    },
  },
};

// ---------------------------------------------------------------------------
// F. readout-strong — onboarding SRM caught
// ---------------------------------------------------------------------------
export const SRM_STRONG: GoldenTranscript = {
  id: "srm-strong",
  questionId: "da-readout-onboarding-srm",
  variant: "readout-strong",
  nudgesIssued: [],
  exhibitsRevealed: [
    { exhibitId: "ex1", atSeconds: 100 },
    { exhibitId: "ex2", atSeconds: 215 },
  ],
  turns: [
    ...open(SRM_PROMPT),
    {
      role: "user",
      t: 88,
      content:
        "Before I look at the lift: did it run the full two weeks as planned, and how was it randomized? And could I see the results?",
    },
    {
      role: "assistant",
      t: 100,
      content: "Two full weeks, not stopped early, randomized by new user at install. The results are on your screen.",
    },
    {
      role: "user",
      t: 112,
      content:
        "First thing I check is the split. It was designed 50/50 but we have 50,000 in control and 48,600 in treatment. Expected is 49,300 each, so each arm is 700 off. The standard deviation of a 50/50 count with 98,600 users is the square root of 98,600 times a quarter, about 157, so 700 is roughly four and a half standard deviations — a chi-square around 20, p well under 0.001. That's a sample ratio mismatch, so I don't trust the 3-point lift yet.",
    },
    {
      role: "user",
      t: 170,
      content:
        "The reason it matters: if users are missing from treatment, they're probably not missing at random. If the new flow lost people who struggled, the remaining treatment users look better than they are. Can I see the assignment counts by platform?",
    },
    { role: "assistant", t: 215, content: "That's on your screen now." },
    {
      role: "user",
      t: 222,
      content:
        "iOS and web are within about 50 users, but Android has 21,000 in control and only 19,500 in treatment — the whole shortfall, 1,500 users, is Android. Was there any bug on Android in the new flow?",
    },
    {
      role: "assistant",
      t: 240,
      content:
        "The new flow crashed on older Android versions before the analytics SDK started, so those users were never logged.",
    },
    {
      role: "user",
      t: 248,
      content:
        "That explains it: those users crashed out and were never counted, so treatment's 63% is computed on survivors. Taken at face value the topline says 60.0% to 63.0%, plus 3 points, and retention 35.0 to 36.4 — but under this mismatch neither number is interpretable; the true effect could be zero or even negative for Android. iOS and web alone are balanced, so they can give a directional read, but I wouldn't base a launch on a post-hoc subset.",
    },
    {
      role: "user",
      t: 300,
      content:
        "My recommendation: don't ship on these numbers. Fix the Android crash, rerun for two weeks, and add an automated SRM check so a mismatch like this blocks the readout. If the rerun shows even half this lift — about 1.5 points — that's roughly 750 more completed onboardings per 50,000 new users, which is worth it.",
    },
    ...close(340),
  ],
  expect: {
    allHit: true,
    processRigorMin: 5,
    statisticalMin: 4,
    businessMin: 4,
  },
};

export const ANALYTICS_GOLDENS: GoldenTranscript[] = [
  CHECKOUT_STRONG,
  DAU_SKIPS,
  PUSH_STATS_WRONG,
  MARKETPLACE_NUDGED,
  SRM_MISREAD,
  SRM_STRONG,
];
