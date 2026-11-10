/**
 * Golden transcripts: Harbor Foods paper LBO (fin-lbo-harbor-foods), all five
 * variants. Benchmark: equity $400M, paydown $270M, exit equity $1,170M,
 * MOIC ≈ 2.9×, IRR ≈ 24% (strong band MOIC 2.8–3.0×, IRR 22–26%).
 */

import type { GoldenTranscript, GoldenTurn } from "./types";

const OPEN: GoldenTurn[] = [
  {
    role: "assistant",
    t: 0,
    content:
      "Thanks for coming in. We'll start with a quick question about you, then a problem, then your questions. Why private equity?",
  },
  {
    role: "user",
    t: 10,
    content:
      "I spent last summer at a middle-market bank on a sell-side process for a food distributor, and the part I enjoyed most was the buyer meetings — the sponsors were asking how they'd actually grow the business, not just what it was worth. I want to be on the side that owns the outcome after the deal closes.",
  },
  {
    role: "assistant",
    t: 70,
    content:
      "Good. Here's a paper LBO. A private equity firm is buying Harbor Foods, a specialty food maker. I've put the deal terms on your screen. Work out the sponsor's returns out loud, with pen and paper, and tell me whether you'd do the deal.",
  },
];

const CLOSE: GoldenTurn[] = [
  { role: "assistant", t: 600, content: "Let's stop there. What questions do you have for me?" },
  { role: "user", t: 606, content: "What does a first-year associate's week look like on a live deal?" },
  { role: "assistant", t: 618, content: "Mostly the model and diligence calls, and a lot of both. Thanks for your time today." },
];

const EX1 = { exhibitId: "ex1", atSeconds: 70 };

const INPUTS_Q: GoldenTurn = {
  role: "user",
  t: 95,
  content:
    "So to play it back: we're buying Harbor at 10 times $100 million of LTM EBITDA, with 6 turns of debt at 8%, holding five years and exiting at 10 times. Before I start — what tax rate should I use, is the interest charged on the starting debt balance, how do capex and D&A compare, and is there any change in working capital?",
};
const INPUTS_A: GoldenTurn = {
  role: "assistant",
  t: 120,
  content:
    "25% tax. Charge interest on the starting balance, for simplicity. D&A and capex are both $10 million a year. No change in working capital.",
};
const ENTRY: GoldenTurn = {
  role: "user",
  t: 135,
  content:
    "Great. Entry: 10 times 100 is a $1,000 million purchase price. Debt is 6 times 100, so $600 million, and the sponsor puts in the remaining $400 million of equity — I'll ignore fees since none were mentioned. Interest is 8% of 600, which is $48 million a year. Next I need the EBITDA path — how does EBITDA grow over the five years?",
};
const PROJ: GoldenTurn = { role: "assistant", t: 165, content: "I'm putting the projections on your screen now." };
const EX2 = { exhibitId: "ex2", atSeconds: 165 };

export const HARBOR_STRONG: GoldenTranscript = {
  id: "lbo-strong",
  questionId: "fin-lbo-harbor-foods",
  variant: "strong",
  nudgesIssued: [],
  exhibitsRevealed: [EX1, EX2],
  turns: [
    ...OPEN,
    INPUTS_Q,
    INPUTS_A,
    ENTRY,
    PROJ,
    {
      role: "user",
      t: 180,
      content:
        "So EBITDA goes 110, 120, 130, 140, 150. Free cash flow each year is EBITDA minus D&A minus interest, taxed at 25%; adding back D&A and subtracting capex cancel out. Year 1: 110 minus 10 minus 48 is 52, times 0.75 is 39. Year 2: 62 times 0.75 is 46.5. Year 3: 72, so 54. Year 4: 82, so 61.5. Year 5: 92, so 69. Adding up: 39 plus 46.5 is 85.5, plus 54 is 139.5, plus 61.5 is 201, plus 69 is 270. So about $270 million of debt is paid down, leaving $330 million at exit.",
    },
    {
      role: "user",
      t: 245,
      content:
        "At exit, $150 million of EBITDA times 10 is $1,500 million of enterprise value. Less the $330 million of remaining debt, the sponsor's equity is worth $1,170 million. MOIC is 1,170 over 400, about 2.9 times. For the IRR over five years: 2x is roughly 15% and 3x is roughly 25%, so 2.9x is about 24%. Does the fund have a return target?",
    },
    { role: "assistant", t: 280, content: "They look for roughly a 20% IRR." },
    {
      role: "user",
      t: 290,
      content:
        "Then at about 24% it clears the hurdle. Breaking down where the return comes from: equity value goes from 400 to 1,170, up $770 million. $500 million of that is EBITDA growing by 50 at a flat 10x multiple, and $270 million is debt paydown — none of it is multiple expansion, which I like. So yes, I'd do the deal. The main risk is that it depends on EBITDA growing 50% in five years: if EBITDA only reached 130, exit EV would be about 1,300 and the return drops to roughly 2.4x, under the 20% hurdle. So I'd want serious diligence on the growth plan before committing.",
    },
    ...CLOSE,
  ],
  expect: { allHit: true, processRigorMin: 4, technicalMin: 4, commercialMin: 4 },
};

export const HARBOR_SKIPPED: GoldenTranscript = {
  id: "lbo-skipped",
  questionId: "fin-lbo-harbor-foods",
  variant: "skipped",
  nudgesIssued: [],
  exhibitsRevealed: [EX1],
  turns: [
    ...OPEN,
    {
      role: "user",
      t: 90,
      content:
        "Okay. 10 times 100 is a billion, 6 turns of debt is 600 so equity is 400. I'll assume EBITDA grows to about 150 by year five and roughly half the debt gets paid off, say 300 left. Exit is 150 times 10, 1,500, minus 300 is 1,200 of equity. So that's 3x your money, which is about 25%. It's a 3x, 25% deal.",
    },
    { role: "assistant", t: 130, content: "Okay. Anything else you'd add?" },
    { role: "user", t: 136, content: "No, I think that's the answer — 3x and 25%." },
    ...CLOSE,
  ],
  expect: {
    processRigorMax: 2,
    commercialMax: 3,
    steps: {
      confirm_inputs: ["missed"],
      project_cash_flow: ["missed"],
      drivers_sanity: ["missed"],
    },
  },
};

export const HARBOR_MATH_WRONG: GoldenTranscript = {
  id: "lbo-mathwrong",
  questionId: "fin-lbo-harbor-foods",
  variant: "mathwrong",
  nudgesIssued: [],
  exhibitsRevealed: [EX1, EX2],
  turns: [
    ...OPEN,
    INPUTS_Q,
    INPUTS_A,
    ENTRY,
    PROJ,
    {
      role: "user",
      t: 180,
      content:
        "So EBITDA goes 110, 120, 130, 140, 150. Free cash flow is EBITDA minus D&A, taxed at 25%, and capex offsets D&A. Year 1: 110 minus 10 is 100, times 0.75 is 75. Then 82.5, 90, 97.5 and 105. Adding up: 75 plus 82.5 is 157.5, plus 90 is 247.5, plus 97.5 is 345, plus 105 is 450. So $450 million of debt is paid down, leaving $150 million.",
    },
    {
      role: "user",
      t: 245,
      content:
        "At exit, 150 times 10 is $1,500 million of enterprise value, less $150 million of debt, so $1,350 million of equity. MOIC is 1,350 over 400, about 3.4 times. That's a 240% gain over five years, so roughly 48% a year. Does the fund have a return target?",
    },
    { role: "assistant", t: 280, content: "They look for roughly a 20% IRR." },
    {
      role: "user",
      t: 290,
      content:
        "Then at 48% this blows through the hurdle. The value comes from $500 million of EBITDA growth at a flat multiple and $450 million of debt paydown. I'd definitely do the deal; the main risk is the growth plan, so I'd diligence that.",
    },
    ...CLOSE,
  ],
  expect: {
    technicalMax: 2,
    steps: {
      project_cash_flow: ["missed"],
      returns_math: ["missed"],
    },
  },
};

export const HARBOR_SLOPPY: GoldenTranscript = {
  id: "lbo-sloppy",
  questionId: "fin-lbo-harbor-foods",
  variant: "sloppy",
  nudgesIssued: [],
  exhibitsRevealed: [EX1, EX2],
  turns: [
    ...OPEN,
    INPUTS_Q,
    INPUTS_A,
    ENTRY,
    PROJ,
    {
      role: "user",
      t: 180,
      content:
        "So EBITDA goes 110 up to 150. Free cash flow is EBITDA minus D&A minus interest, times 0.75. Year 1: 52 times 0.75 is 39. Year 2: 62 times 0.75 is 45. Year 3: 72, so 54. Year 4: 82 times 0.75 is 63. Year 5: 92, so 69. 39 plus 45 plus 54 plus 63 plus 69 is 270, so $270 million paid down and $330 million left.",
    },
    {
      role: "user",
      t: 240,
      content:
        "Exit is 150 times 10, so 1,500, less 330 is 1,170. That's around 2.9x, so somewhere around 24% IRR. Does the fund have a return target?",
    },
    { role: "assistant", t: 265, content: "They look for roughly a 20% IRR." },
    {
      role: "user",
      t: 272,
      content:
        "Then it clears 20%, so I'd do it. Most of the return is the EBITDA growth from 100 to 150 at a flat multiple, plus the debt paydown; the risk is that the growth doesn't happen.",
    },
    ...CLOSE,
  ],
  expect: { technicalMin: 2, technicalMax: 3 },
};

export const HARBOR_NUDGED: GoldenTranscript = {
  id: "lbo-nudged",
  questionId: "fin-lbo-harbor-foods",
  variant: "nudged",
  nudgesIssued: [
    { stepKey: "confirm_inputs", atSeconds: 100 },
    { stepKey: "drivers_sanity", atSeconds: 270 },
  ],
  exhibitsRevealed: [EX1, EX2],
  turns: [
    ...OPEN,
    {
      role: "user",
      t: 90,
      content: "Okay. Ten times 100 is a $1,000 million purchase price, and six times debt is $600 million…",
    },
    { role: "assistant", t: 100, content: "Before you start, is there anything you'd want to know?" },
    {
      role: "user",
      t: 108,
      content:
        "Yes, sorry — just to confirm, we exit at 10 times after five years. What tax rate should I use, is interest charged on the starting debt balance, how do capex and D&A compare, and is there any working capital change?",
    },
    INPUTS_A,
    {
      role: "user",
      t: 135,
      content:
        "Thanks. So the sponsor puts in $1,000 million minus $600 million of debt, which is $400 million of equity; no fees. Interest is 8% of 600, $48 million a year. How does EBITDA grow?",
    },
    PROJ,
    {
      role: "user",
      t: 180,
      content:
        "EBITDA goes 110, 120, 130, 140, 150. Free cash flow is EBITDA minus 10 of D&A minus 48 of interest, times 0.75, with capex and D&A cancelling. That's 39, 46.5, 54, 61.5 and 69: 39 plus 46.5 is 85.5, plus 54 is 139.5, plus 61.5 is 201, plus 69 is 270. So $270 million paid down, $330 million of debt left.",
    },
    {
      role: "user",
      t: 235,
      content:
        "Exit EV is 150 times 10, $1,500 million, less $330 million of debt is $1,170 million of equity. MOIC is 1,170 over 400, about 2.9x. Since 2x over five years is about 15% and 3x is about 25%, the IRR is about 24%.",
    },
    { role: "assistant", t: 270, content: "What's doing most of the work in that return?" },
    {
      role: "user",
      t: 278,
      content:
        "Equity grows by $770 million: $500 million from EBITDA growing by 50 at a flat 10x, and $270 million from paying down debt; no multiple expansion. If the fund targets something like 20%, 24% clears it, so I'd do the deal — but it leans on 50% EBITDA growth, so if EBITDA only got to 130 the return would fall to roughly 2.4x, below the hurdle. I'd want diligence on that growth plan.",
    },
    ...CLOSE,
  ],
  expect: {
    processRigorMin: 3,
    processRigorMax: 3,
    commercialMax: 3,
    steps: {
      confirm_inputs: ["prompted"],
      entry_sources_uses: ["hit"],
      project_cash_flow: ["hit"],
      exit_equity: ["hit"],
      returns_math: ["hit"],
      drivers_sanity: ["prompted"],
    },
  },
};

export const HARBOR_GOLDENS: GoldenTranscript[] = [
  HARBOR_STRONG,
  HARBOR_SKIPPED,
  HARBOR_MATH_WRONG,
  HARBOR_SLOPPY,
  HARBOR_NUDGED,
];
