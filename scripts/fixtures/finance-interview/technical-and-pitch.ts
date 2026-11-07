/**
 * Golden transcripts: the $10 depreciation technical
 * (fin-tech-depreciation-10) and the Cobalt Trail stock pitch
 * (fin-pitch-cobalt-trail).
 */

import type { GoldenTranscript, GoldenTurn } from "./types";

const FIT: GoldenTurn[] = [
  { role: "assistant", t: 0, content: "Thanks for coming in. Quick one first: why investment banking?" },
  {
    role: "user",
    t: 8,
    content:
      "I run the investment club's consumer sector, and building our models for a packaged-food company made me realize I like understanding how a business is valued and what a deal changes. Banking is the fastest way to see a lot of deals early and learn that properly.",
  },
];

const CLOSE: GoldenTurn[] = [
  { role: "assistant", t: 500, content: "Let's leave it there. Any questions for me?" },
  { role: "user", t: 506, content: "How are analysts staffed across sectors in the first year?" },
  { role: "assistant", t: 515, content: "Mostly generalist pool for the first year. Thanks for your time." },
];

// ---------------------------------------------------------------------------
// $10 depreciation
// ---------------------------------------------------------------------------

const DEP_PROMPT: GoldenTurn = {
  role: "assistant",
  t: 60,
  content:
    "Let's start with an accounting question. Walk me through how the three financial statements change if a company's depreciation expense goes up by ten dollars.",
};

export const DEP_STRONG: GoldenTranscript = {
  id: "dep-strong",
  questionId: "fin-tech-depreciation-10",
  variant: "strong",
  nudgesIssued: [],
  exhibitsRevealed: [],
  turns: [
    ...FIT,
    DEP_PROMPT,
    {
      role: "user",
      t: 70,
      content:
        "Sure. I'll assume a 25% tax rate and that the depreciation is deductible for tax too — is that fine?",
    },
    { role: "assistant", t: 78, content: "Yes, 25%, and it's deductible." },
    {
      role: "user",
      t: 84,
      content:
        "Starting on the income statement: operating income falls by $10, so pre-tax income falls by $10, taxes fall by $2.50, and net income is down $7.50. Then the cash flow statement: net income is down $7.50, but depreciation is non-cash so I add back the $10, which makes cash from operations up $2.50, and nothing else changes, so cash is up $2.50. Then the balance sheet: on the assets side cash is up $2.50 and PP&E is down $10, so total assets are down $7.50. On the other side retained earnings are down $7.50 from the lower net income. Assets down $7.50, equity down $7.50, so it balances. The intuition is that depreciation isn't a cash cost, but it is tax-deductible, so the only cash effect is the $2.50 tax shield — which is why, all else equal, more depreciation actually raises cash flow.",
    },
    ...CLOSE,
  ],
  expect: { allHit: true, processRigorMin: 4, technicalMin: 4 },
};

export const DEP_SKIPPED: GoldenTranscript = {
  id: "dep-skipped",
  questionId: "fin-tech-depreciation-10",
  variant: "skipped",
  nudgesIssued: [],
  exhibitsRevealed: [],
  turns: [
    ...FIT,
    DEP_PROMPT,
    {
      role: "user",
      t: 70,
      content:
        "Net income goes down, PP&E goes down, and cash goes up a little because of taxes. Everything balances.",
    },
    { role: "assistant", t: 80, content: "Okay. Anything else?" },
    { role: "user", t: 84, content: "No, that's it." },
    ...CLOSE,
  ],
  expect: {
    processRigorMax: 2,
    technicalMax: 2,
    steps: {
      state_assumptions: ["missed"],
      quantify_lines: ["missed"],
      tie_out: ["missed"],
    },
  },
};

// ---------------------------------------------------------------------------
// Cobalt Trail stock pitch
// ---------------------------------------------------------------------------

const PITCH_PROMPT: GoldenTurn = {
  role: "assistant",
  t: 60,
  content:
    "Here's a different kind of pitch. I've put a one-page summary of Cobalt Trail Outfitters, a mid-cap outdoor-apparel company, on your screen. Ask me anything you need, and then pitch it to me — long or short, with a price target.",
};
const EX1 = { exhibitId: "ex1", atSeconds: 60 };

const PITCH_QA: GoldenTurn[] = [
  {
    role: "user",
    t: 75,
    content:
      "A few questions first. What does consensus assume about the direct-to-consumer business, and has management said anything about it recently?",
  },
  {
    role: "assistant",
    t: 88,
    content:
      "Analysts model DTC staying at 25% of revenue next year. At last month's investor day management targeted 35%; the stock barely moved.",
  },
  { role: "user", t: 98, content: "How much margin does DTC mix add, and what's next year's revenue?" },
  {
    role: "assistant",
    t: 106,
    content: "Management says each 5 points of DTC mix adds about 1 point of operating margin. Revenue next year is about $2.0 billion; tax rate 25%.",
  },
  { role: "user", t: 116, content: "Any capital return planned? And why is inventory up 30% on 5% sales growth?" },
  {
    role: "assistant",
    t: 124,
    content:
      "A $150 million buyback is authorized for the next year. Management says the inventory is a pre-buy for the DTC launch.",
  },
  { role: "user", t: 133, content: "Is there an event coming up where we'd see DTC numbers?" },
  {
    role: "assistant",
    t: 139,
    content: "Q3 earnings in about six weeks will be the first quarter with DTC mix disclosed.",
  },
];

export const PITCH_STRONG: GoldenTranscript = {
  id: "pitch-strong",
  questionId: "fin-pitch-cobalt-trail",
  variant: "strong",
  nudgesIssued: [],
  exhibitsRevealed: [EX1],
  turns: [
    ...FIT,
    PITCH_PROMPT,
    ...PITCH_QA,
    {
      role: "user",
      t: 150,
      content:
        "Okay. I'm long Cobalt Trail at $48 with a 12-month price target of about $61, roughly 27% upside. Quick snapshot: it's a mid-cap outdoor-apparel brand, about $2 billion of revenue, growing 5%, selling mostly through wholesale today with 25% direct-to-consumer, and it trades at 16 times next year's $3.00 consensus EPS versus 18 times for peers.",
    },
    {
      role: "user",
      t: 190,
      content:
        "Two thesis points. First, the market isn't pricing the DTC shift: consensus keeps DTC at 25%, but management is targeting 35%. Ten points of mix is two points of operating margin on $2 billion — $40 million pre-tax, $30 million after tax, about 30 cents of EPS. Second, the $150 million buyback at $48 retires about 3 million shares, so EPS goes from $3.30 to roughly $3.40. The stock didn't move on the investor day, so I think the market simply doesn't believe the target yet. The catalyst is Q3 earnings in six weeks, the first time DTC mix is disclosed — if it's tracking up, estimates move.",
    },
    {
      role: "user",
      t: 240,
      content:
        "Valuation: at the peer multiple of 18 times my $3.40, that's about $61, and I think 18 times is fair because DTC improves the margin profile toward peers. Risks: the biggest one is the inventory build — inventory up 30% against 5% sales growth could mean markdowns if DTC launches slowly; second, a consumer slowdown hits discretionary apparel. My bear case is about $2.70 of EPS at 14 times, roughly $38, down about 21%, so the skew is favorable. What would make me wrong is Q3 showing DTC flat and inventory still climbing — then I'd exit.",
    },
    ...CLOSE,
  ],
  expect: { allHit: true, processRigorMin: 4, commercialMin: 4, technicalMin: 4 },
};

export const PITCH_NUDGED: GoldenTranscript = {
  id: "pitch-nudged",
  questionId: "fin-pitch-cobalt-trail",
  variant: "nudged",
  nudgesIssued: [
    { stepKey: "call_and_target", atSeconds: 250 },
    { stepKey: "risks_mitigants", atSeconds: 270 },
  ],
  exhibitsRevealed: [EX1],
  turns: [
    ...FIT,
    PITCH_PROMPT,
    ...PITCH_QA,
    {
      role: "user",
      t: 150,
      content:
        "Okay. Cobalt Trail is a mid-cap outdoor-apparel brand with about $2 billion of revenue growing 5%, 25% direct-to-consumer today, and it trades at 16 times next year's $3.00 consensus EPS versus 18 times for peers.",
    },
    {
      role: "user",
      t: 180,
      content:
        "The interesting thing is that consensus keeps DTC at 25% even though management is targeting 35%. Ten points of mix is two points of margin on $2 billion — $40 million pre-tax, $30 million after tax, about 30 cents of EPS. And the $150 million buyback at $48 retires about 3 million shares, so EPS gets to roughly $3.40. The stock didn't react to the investor day, so the market doesn't believe it yet; Q3 earnings in six weeks is when we first see DTC mix. At 18 times $3.40 the stock would be worth about $61.",
    },
    { role: "assistant", t: 250, content: "So what would you actually do with the stock?" },
    {
      role: "user",
      t: 256,
      content: "I'd buy it. Long at $48 with a $61 target over the next 12 months, about 27% upside.",
    },
    { role: "assistant", t: 270, content: "What would make you wrong?" },
    {
      role: "user",
      t: 276,
      content:
        "The inventory build — inventory up 30% on 5% sales growth could turn into markdowns if the DTC launch is slow. And a consumer slowdown would hit discretionary apparel. In a bear case of about $2.70 of EPS at 14 times, the stock is around $38, down about 21%. If Q3 shows DTC flat and inventory still rising, I'd get out.",
    },
    ...CLOSE,
  ],
  expect: {
    processRigorMin: 3,
    processRigorMax: 3,
    commercialMax: 3,
    steps: {
      call_and_target: ["prompted"],
      business_snapshot: ["hit"],
      variant_thesis: ["hit"],
      catalysts: ["hit"],
      valuation: ["hit"],
      risks_mitigants: ["prompted"],
    },
  },
};

export const TECH_PITCH_GOLDENS: GoldenTranscript[] = [DEP_STRONG, DEP_SKIPPED, PITCH_STRONG, PITCH_NUDGED];
