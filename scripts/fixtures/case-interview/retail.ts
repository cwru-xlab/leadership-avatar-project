/**
 * Golden transcripts: Northpeak Outfitters falling profits
 * (case-retail-falling-profits). The strong run follows the classic
 * profitability walk-through (Bain FashionCo., Cheng's profitability tree):
 * profit = revenue − costs, isolate which line moved, find the root cause.
 */

import type { GoldenTranscript, GoldenTurn } from "./types";

const PROMPT =
  "Our client is Northpeak Outfitters, a US outdoor-apparel retailer with about 120 stores and a website. Over the last two years its operating profit has fallen sharply even though sales have grown a little. The CEO wants to know why, and what to do about it.";

const OPEN: GoldenTurn[] = [
  {
    role: "assistant",
    t: 0,
    content:
      "Thanks for joining. We'll do a quick question about you, then a case, then your questions. Tell me about a time you had to persuade someone who disagreed with you.",
  },
  {
    role: "user",
    t: 12,
    content:
      "In my internship at a regional bank, my manager wanted to cut a branch's Saturday hours to save staff cost. I pulled the transaction logs and showed that Saturdays had the highest share of new-account openings, about a fifth of the week's total. I proposed shifting Saturday staff from tellers to account specialists instead. He agreed to a two-month test, and new accounts at that branch rose about ten percent while staff hours stayed flat.",
  },
  { role: "assistant", t: 92, content: `Great, thanks. Let's turn to the case. ${PROMPT}` },
];

const CLOSE: GoldenTurn[] = [
  { role: "assistant", t: 820, content: "Let's stop there. What questions do you have for me?" },
  { role: "user", t: 828, content: "What's a project you worked on recently that surprised you?" },
  { role: "assistant", t: 845, content: "A retail pricing project, actually — the answer ended up being about returns, not price. Thanks for your time today." },
];

export const RETAIL_STRONG: GoldenTranscript = {
  id: "retail-strong",
  caseId: "case-retail-falling-profits",
  variant: "strong",
  nudgesIssued: [],
  turns: [
    ...OPEN,
    {
      role: "user",
      t: 120,
      content:
        "So to play it back: Northpeak is an outdoor-apparel retailer with about 120 stores plus e-commerce, sales are up slightly over two years but operating profit has dropped sharply, and the CEO wants the cause and a fix. A few clarifying questions: how big is the drop, and does the CEO have a target in mind? And are competitors seeing the same thing, or is it specific to Northpeak?",
    },
    {
      role: "assistant",
      t: 150,
      content: "Profit fell from 48 million to 30 million. The CEO wants it back above 45 million within two years. Competitors report roughly stable margins.",
    },
    {
      role: "user",
      t: 166,
      content:
        "So it's Northpeak-specific, which points inside the company rather than the market. I'll structure it as profit equals revenue minus costs. On revenue: price, volume, and channel mix between stores and online. On costs: cost of goods, store costs like labor and rent, fulfillment costs for online orders, and marketing. Since revenue actually grew while profit fell eighteen million, my hypothesis is that costs drove this, so I'd start on the cost side and look at which lines grew fastest. Do we have the P&L?",
    },
    { role: "assistant", t: 222, content: "Here's the profit and loss for both years." },
    {
      role: "user",
      t: 238,
      content:
        "Revenue went up eighteen million, from 600 to 618, but costs rose thirty-six million. The biggest jump is e-commerce shipping and returns: twelve to thirty, plus eighteen million — two and a half times. Cost of goods is up sixteen, which takes gross margin from forty-five to forty-four percent. Labor and rent are up about seven together, and marketing actually fell five. So shipping and returns is the single biggest driver, with a smaller gross-margin squeeze. Why did shipping and returns jump — did the online business grow, or did something change in the policy?",
    },
    {
      role: "assistant",
      t: 300,
      content: "They cut the free-shipping threshold from 99 dollars to zero early in FY2023 and offer free returns. Here's the channel picture.",
    },
    {
      role: "user",
      t: 318,
      content:
        "Online went from ten to twenty-five percent of sales — that's sixty million to about 155 million. Shipping and returns were about twenty percent of online revenue in both years, twelve over sixty and thirty over 155, so the cost per online dollar didn't change; the mix did. And online returns run at thirty percent versus eight in stores. So free shipping pushed sales online, into a channel that costs about twenty cents on the dollar to fulfill. That checks out against the eighteen-million jump.",
    },
    {
      role: "user",
      t: 400,
      content:
        "So, my recommendation: the profit drop is mainly a channel-mix problem caused by free shipping, and Northpeak should fix online economics rather than cut store costs. First, restore a free-shipping threshold, tested around the old 99 dollars. Second, bring returns down from thirty percent with better fit guidance and free in-store returns or a small mail-return fee. Third, push buy-online-pick-up-in-store to move fulfillment into stores. Together that should recover most of the eighteen-million shipping increase, and a look at discounting can address the one-point gross-margin slip. The main risk is slowing online growth; as next steps I'd build a channel-level P&L and A/B test threshold levels.",
    },
    ...CLOSE,
  ],
  expect: { processRigorMin: 4, allHit: true, quantitativeMin: 4, synthesisMin: 4 },
};

export const RETAIL_NUDGED: GoldenTranscript = {
  id: "retail-nudged",
  caseId: "case-retail-falling-profits",
  variant: "nudged",
  nudgesIssued: [
    { stepKey: "restate_prompt", atSeconds: 138 },
    { stepKey: "clarify_objective", atSeconds: 166 },
  ],
  turns: [
    ...OPEN,
    {
      role: "user",
      t: 120,
      content: "Okay. So profit fell while sales grew. I want to look at revenue and costs.",
    },
    { role: "assistant", t: 138, content: "Before you dive in, what's your read of what we're being asked here?" },
    {
      role: "user",
      t: 146,
      content:
        "Sure — Northpeak, a retailer with around 120 stores and a website, has seen operating profit fall over two years while sales grew a bit, and the CEO wants to know why and what to do. Is that right?",
    },
    { role: "assistant", t: 166, content: "That's right. Is there anything you'd want to know about the client before you get going?" },
    {
      role: "user",
      t: 174,
      content: "Yes — how much has profit fallen, what's the CEO's goal, and are competitors seeing the same drop?",
    },
    {
      role: "assistant",
      t: 188,
      content: "Profit fell from 48 million to 30 million. The CEO wants it back above 45 million within two years. Competitors' margins are roughly stable.",
    },
    {
      role: "user",
      t: 204,
      content:
        "Then it's internal to Northpeak. Let me lay out how I'd structure this before looking at any numbers. Profit is revenue minus costs, so two branches. Revenue: price, volume, and the channel mix between stores and online. Costs: cost of goods, store costs like labor and rent, online fulfillment, and marketing. Since revenue grew while profit fell, I suspect the cost branch, so I'll start there. Could I see the P&L?",
    },
    { role: "assistant", t: 240, content: "Here's the profit and loss for both years." },
    {
      role: "user",
      t: 256,
      content:
        "Costs rose thirty-six million against eighteen of revenue growth. The biggest line is shipping and returns, up eighteen million from twelve to thirty; cost of goods up sixteen, so gross margin went from forty-five to forty-four percent. What changed in online?",
    },
    { role: "assistant", t: 300, content: "They dropped the free-shipping threshold from 99 dollars to zero early in FY2023. Here's the channel picture." },
    {
      role: "user",
      t: 316,
      content:
        "Online grew from sixty million to about 155 million, ten to twenty-five percent of sales, and shipping and returns stayed about twenty percent of online revenue — so it's mix, driven by free shipping, plus a thirty percent return rate online.",
    },
    {
      role: "user",
      t: 380,
      content:
        "My recommendation: fix online economics. Bring back a free-shipping threshold near 99 dollars, cut returns with fit tools and in-store returns, and push store pickup. That should recover most of the eighteen million. Risk is slower online growth; next step is a channel P&L and a threshold test.",
    },
    ...CLOSE,
  ],
  expect: {
    processRigorMax: 3,
    steps: {
      restate_prompt: ["prompted"],
      clarify_objective: ["prompted"],
      structure: ["hit"],
      analyze_data: ["hit"],
      synthesize: ["hit"],
    },
  },
};

export const RETAIL_GOLDENS = [RETAIL_STRONG, RETAIL_NUDGED];
