/**
 * Golden transcripts: hair gel spend in Ohio (estimate-hair-gel-ohio), the
 * CWRU Career Center guesstimate example.
 */

import type { GoldenTranscript, GoldenTurn } from "./types";

const OPEN: GoldenTurn[] = [
  {
    role: "assistant",
    t: 0,
    content:
      "Thanks for coming in. Quick question about you first, then an estimation question, then your questions. What's something you've done that you're proud of?",
  },
  {
    role: "user",
    t: 10,
    content:
      "I rebuilt the budgeting process for my student theater group. We'd overspent three seasons in a row, so I set up a shared tracker with per-show limits and a weekly check-in with each director. That season we finished about two thousand dollars under budget, the first surplus in five years.",
  },
  { role: "assistant", t: 70, content: "Nice. Here's your question: how much do people in Ohio spend on hair gel in a year?" },
];

const CLOSE = (t: number): GoldenTurn[] => [
  { role: "assistant", t, content: "Okay, let's leave it there. Any questions for me?" },
  { role: "user", t: t + 8, content: "How much of the first year is spent on estimation-type work like this?" },
  { role: "assistant", t: t + 22, content: "More than you'd think — sizing comes up in most projects. Thanks for your time." },
];

export const HAIRGEL_STRONG: GoldenTranscript = {
  id: "hairgel-strong",
  caseId: "estimate-hair-gel-ohio",
  variant: "strong",
  nudgesIssued: [],
  turns: [
    ...OPEN,
    {
      role: "user",
      t: 82,
      content:
        "Just to pin down scope: are we talking about consumer retail spending on hair gel specifically — not all styling products, and not salons — in Ohio, over one year?",
    },
    { role: "assistant", t: 96, content: "Yes, consumer retail spend on hair gel, one year." },
    {
      role: "user",
      t: 104,
      content:
        "Great. I'll estimate it as number of gel users times tubes per user per year times price per tube. To get users, I'll split the population by gender and age, since gel use is much more common among younger men. Do you know Ohio's population?",
    },
    { role: "assistant", t: 128, content: "About 11.8 million." },
    {
      role: "user",
      t: 134,
      content:
        "Okay. Men are about half, call it 5.9 million, and roughly 60 percent of them are between fifteen and sixty-four, so about 3.5 million. I'd guess a quarter of those use gel — it's less popular than ten years ago, and from people I know, maybe one in four. That's about 875,000. For women, gel is rarer, say 5 percent of about six million, 300,000. So roughly 1.2 million users. A regular user goes through a tube about every two months, so six tubes a year, and a tube costs around six dollars at a drugstore.",
    },
    {
      role: "user",
      t: 214,
      content:
        "So 1.2 million times six tubes is 7.2 million tubes, times six dollars is about 43 million dollars. Let me sanity-check that: 43 million over 11.8 million people is about 3.60 dollars per Ohioan per year — a bit more than half a tube per person, which feels plausible given most people use none and users buy six. Scaling up, Ohio is about three and a half percent of the US, so that implies roughly 1.2 billion nationally for gel, which seems in the right ballpark for one styling category.",
    },
    {
      role: "user",
      t: 280,
      content:
        "So my answer is about 40 million dollars a year, call it 40 to 45. The assumption that moves it most is the share of men who use gel — if it's fifteen percent instead of twenty-five, it drops to about 30 million.",
    },
    ...CLOSE(300),
  ],
  expect: { processRigorMin: 4, allHit: true, quantitativeMin: 4, synthesisMin: 4 },
};

export const HAIRGEL_JUMP: GoldenTranscript = {
  id: "hairgel-jump",
  caseId: "estimate-hair-gel-ohio",
  variant: "jump",
  nudgesIssued: [],
  turns: [
    ...OPEN,
    {
      role: "user",
      t: 80,
      content: "Hmm. I'd say about 500 million dollars. Ohio's a big state, and a lot of people use hair products every day.",
    },
    { role: "assistant", t: 92, content: "Okay." },
    { role: "user", t: 96, content: "Yeah, I'll go with 500 million." },
    ...CLOSE(104),
  ],
  expect: {
    processRigorMax: 2,
    quantitativeMax: 2,
    steps: { clarify_scope: ["missed"], segment_structure: ["missed"], sanity_check: ["missed"] },
  },
};

export const HAIRGEL_BOTCH: GoldenTranscript = {
  id: "hairgel-botch",
  caseId: "estimate-hair-gel-ohio",
  variant: "botch",
  nudgesIssued: [],
  turns: [
    ...OPEN,
    {
      role: "user",
      t: 82,
      content: "Is this consumer retail spending on hair gel specifically, in Ohio, for one year?",
    },
    { role: "assistant", t: 92, content: "Yes, consumer retail spend on hair gel, one year." },
    {
      role: "user",
      t: 100,
      content:
        "Okay. I'll do users times tubes per year times price per tube, splitting users by men and women. Ohio has about twelve million people, so roughly six million men; about 3.5 million are working age, and maybe a quarter use gel, about 900,000. For women maybe 5 percent of six million, 300,000. So about 1.2 million users. Each uses about six tubes a year at about six dollars.",
    },
    {
      role: "user",
      t: 170,
      content:
        "So 1.2 million times six is 72 million tubes, and times six dollars that's about 4.3 billion dollars.",
    },
    {
      role: "user",
      t: 200,
      content:
        "Although honestly there are a lot of other factors — salons buy gel too, some people use way more than others, and prices range a lot between brands. So it could be a lot higher or lower depending on those things. I don't think I'd want to commit to one figure without more data on usage.",
    },
    ...CLOSE(240),
  ],
  expect: {
    quantitativeMax: 2,
    synthesisMax: 2,
    steps: {
      clarify_scope: ["hit"],
      segment_structure: ["hit"],
      calculate_aloud: ["missed"],
      sanity_check: ["missed"],
      state_answer: ["missed"],
    },
  },
};

export const HAIRGEL_GOLDENS = [HAIRGEL_STRONG, HAIRGEL_JUMP, HAIRGEL_BOTCH];
