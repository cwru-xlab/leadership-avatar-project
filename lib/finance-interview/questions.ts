/**
 * The finance interview bank: accounting and valuation technicals, paper
 * LBOs, stock pitches, and market / deal discussions.
 *
 * Every question is modeled on a public example (see each `source`) and
 * paraphrased. All companies are fictional and all figures original.
 *
 * NUMBERS ARE CHECKED: `scripts/verify-finance-interview-bank.ts` recomputes
 * every benchmark each `strongAnswerNotes` quotes (every paper LBO's MOIC and
 * IRR, the DCF terminal value, the EV bridge, accretion / dilution) from the
 * exhibits and facts, so an edit that breaks the math fails loudly.
 *
 * Tolerance rule (orchestrator note 2026-11-06): numeric answers are graded
 * against the TOLERANCE band stated in `strongAnswerNotes`, never exact
 * match — mental math rounds, and interviewers accept a sensible rounding.
 *
 * SERVER-ONLY: registered in lib/problem-interview/banks.server.ts. Never
 * import this module from client code or from anything the engine registry
 * imports: `interviewerFacts`, exhibit `keyInsight` and `strongAnswerNotes`
 * must not reach the browser.
 */

import type { ProblemQuestion } from "@/lib/problem-interview/types";

import { FINANCE_SOURCES } from "./sources";

export const FINANCE_FAMILIES = [
  "technical-walkthrough",
  "paper-lbo",
  "stock-pitch",
  "market-deal",
] as const;
export type FinanceFamily = (typeof FINANCE_FAMILIES)[number];

// ---------------------------------------------------------------------------
// Technical walk-throughs
// ---------------------------------------------------------------------------

const TECH_DEPRECIATION: ProblemQuestion = {
  id: "fin-tech-depreciation-10",
  family: "technical-walkthrough",
  frameworkKey: "finance-technical",
  title: "$10 more depreciation",
  prompt:
    "Let's start with an accounting question. Walk me through how the three financial statements change if a company's depreciation expense goes up by ten dollars.",
  interviewerFacts: [
    "Tax rate: 25%, if the candidate asks.",
    "If asked: the extra depreciation is also deductible for tax purposes (book and tax treatment are the same).",
    "If asked: nothing else changes — no change in capex, working capital, or debt.",
  ],
  strongAnswerNotes:
    "Benchmark at 25% tax: Income statement — operating income and pre-tax income down $10, taxes down $2.50, net income down $7.50. " +
    "Cash flow statement — net income −$7.50, add back +$10 depreciation (non-cash), cash from operations +$2.50, so cash +$2.50. " +
    "Balance sheet — cash +$2.50, PP&E −$10, total assets −$7.50; retained earnings (equity) −$7.50; balances. " +
    "Intuition: depreciation is non-cash but tax-deductible, so the only cash effect is the $2.50 tax shield. " +
    "TOLERANCE: any tax rate the candidate states is fine if every figure follows from it (e.g. at 40%: NI −$6, cash +$4, assets −$6). " +
    "Saying cash falls, net income falls by the full $10 with taxes, or a balance sheet that does not balance is a material error.",
  difficulty: "Beginner",
  source: `${FINANCE_SOURCES.wspAccounting}; ${FINANCE_SOURCES.biws} (accounting section).`,
};

const TECH_DEBT_PPE: ProblemQuestion = {
  id: "fin-tech-debt-funded-ppe",
  family: "technical-walkthrough",
  frameworkKey: "finance-technical",
  title: "Debt-funded equipment, one year on",
  prompt:
    "A company borrows one hundred dollars and uses it to buy a piece of equipment. Walk me through the three statements right when that happens, and then again at the end of the first year.",
  interviewerFacts: [
    "The equipment is depreciated straight-line over 10 years, if asked.",
    "Interest rate on the debt: 5% per year, if asked.",
    "Tax rate: 25%, if asked.",
    "If asked: no principal is repaid in the first year.",
  ],
  strongAnswerNotes:
    "Day one: no income statement change; cash flow — capex −$100 investing, +$100 debt financing, net cash 0; balance sheet — PP&E +$100, debt +$100. " +
    "End of year one: depreciation $10 + interest $5 = pre-tax −$15; net income −$11.25 at 25% tax. Cash flow — NI −$11.25 + depreciation $10 = −$1.25 cash. " +
    "Balance sheet — cash −$1.25, PP&E +$90 (100 − 10) → assets +$88.75; debt +$100, retained earnings −$11.25 → liabilities + equity +$88.75; balances. " +
    "TOLERANCE: any stated tax rate with figures that follow from it is fine (e.g. at 40%: NI −$9, cash +$1, assets +$91)." +
    "Treating the $100 purchase as an expense, or forgetting interest in year one, is a material error.",
  difficulty: "Intermediate",
  source: `${FINANCE_SOURCES.biws} (accounting: multi-step scenarios); ${FINANCE_SOURCES.wspAccounting}.`,
};

const TECH_EV_BRIDGE: ProblemQuestion = {
  id: "fin-tech-ev-bridge",
  family: "technical-walkthrough",
  frameworkKey: "finance-technical",
  title: "Enterprise value vs. equity value",
  prompt:
    "What's the difference between enterprise value and equity value? I'll put some numbers for a company on your screen — once you've explained it, get me from its share price to its enterprise value and its EV-to-EBITDA multiple.",
  interviewerFacts: [
    "If asked: the share count on screen is already diluted (options and convertibles included).",
    "If asked: the cash on screen is all excess cash, not needed to run the business.",
    "If the candidate asks a follow-up hypothetical (e.g. what if the company raised debt): answer only what they ask; do not suggest one.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Lattice Instruments — capitalization",
      kind: "table",
      caption: "$ millions except per share. Fictional company.",
      columns: ["Item", "Value"],
      rows: [
        ["Share price", "$40.00"],
        ["Diluted shares outstanding", "50M"],
        ["Total debt", "$600M"],
        ["Preferred stock", "$100M"],
        ["Noncontrolling interest", "$50M"],
        ["Cash and equivalents", "$250M"],
        ["LTM EBITDA", "$250M"],
      ],
      revealWhen: "right after posing the question, or as soon as the candidate asks for the company's numbers",
      keyInsight:
        "Equity value = $40 × 50M = $2,000M. EV = 2,000 + 600 debt + 100 preferred + 50 NCI − 250 cash = $2,500M. EV/EBITDA = 10.0×. " +
        "Preferred and NCI are added because EBITDA includes the earnings that belong to them.",
    },
  ],
  strongAnswerNotes:
    "Concept: equity value is the value of the business to common shareholders (market cap on a diluted basis); enterprise value is the value of the core operations " +
    "to all capital providers — equity value + debt + preferred + noncontrolling interest − cash. Benchmark: equity value $2,000M, EV $2,500M, EV/EBITDA 10.0×. " +
    "A strong candidate explains why each bridge item is added or subtracted (claims on the operating assets; cash is non-operating), and that issuing debt " +
    "to hold as cash leaves EV unchanged. Tie-out: re-adds the bridge, or checks 2,500 / 250 = 10×. " +
    "TOLERANCE: EV within $2,450–2,550M (rounding) is strong; omitting preferred or NCI (EV $2,400–2,450M) is acceptable-with-error; " +
    "adding cash or omitting debt (EV off by ≥ $500M) is a material error.",
  difficulty: "Beginner",
  source: `${FINANCE_SOURCES.biws} (enterprise value vs. equity value); ${FINANCE_SOURCES.rosenbaumPearl} (ch. 1, EV bridge).`,
};

const TECH_DCF: ProblemQuestion = {
  id: "fin-tech-dcf-walkthrough",
  family: "technical-walkthrough",
  frameworkKey: "finance-technical",
  title: "Walk me through a DCF",
  prompt:
    "Walk me through a DCF. Once you've done that, I'll give you some numbers and ask you for a terminal value.",
  interviewerFacts: [
    "When the candidate has walked through the DCF (or asks for the numbers): final projected year is year 5; unlevered free cash flow in year 5 is $100 million.",
    "Long-term growth rate after year 5: 3%, if asked.",
    "WACC: 9%, if asked.",
    "If asked whether to use the exit-multiple method: use the perpetuity growth method for this question.",
    "If asked: use end-of-year discounting, no mid-year convention.",
  ],
  strongAnswerNotes:
    "Walk-through order: project unlevered free cash flow (EBIT × (1 − t) + D&A − capex − ΔNWC) for 5–10 years → discount rate (WACC: cost of equity via CAPM, after-tax cost of debt, weights) " +
    "→ terminal value (perpetuity growth or exit multiple) → discount cash flows and TV to present → sum = enterprise value → bridge to equity value (− net debt, etc.) → ÷ diluted shares. " +
    "Benchmark: TV at end of year 5 = 100 × 1.03 / (0.09 − 0.03) = $1,717M (≈ $1.7B); present value = 1,717 / 1.09^5 (≈ 1.54) ≈ $1,116M. " +
    "Sense check: implied exit multiple of FCF ≈ 17×, or the TV typically being well over half of a DCF's value. " +
    "TOLERANCE: TV $1,600–1,800M strong (e.g. using 100 / 0.06 = $1,667M without the growth step-up is acceptable if stated); " +
    "PV of TV $1,000–1,250M strong. Dividing by WACC alone (100 / 0.09 ≈ $1,111M as the TV) or adding growth to WACC is a material error.",
  difficulty: "Intermediate",
  source: `${FINANCE_SOURCES.rosenbaumPearl} (ch. 3, DCF); ${FINANCE_SOURCES.biws} (DCF questions).`,
};

const TECH_COMPS: ProblemQuestion = {
  id: "fin-tech-comps-valuation",
  family: "technical-walkthrough",
  frameworkKey: "finance-technical",
  title: "Valuing a company with comps",
  prompt:
    "How would you value a mid-sized, profitable private company? Tell me the main methods and how they compare. Then use the trading comps I'll show you to get to a value per share.",
  interviewerFacts: [
    "The target is a fictional private industrial-software company, Keel Systems, with EBITDA of $120M next twelve months, if asked.",
    "Net debt: $300M, if asked.",
    "If asked for shares: assume 45 million shares for a per-share figure.",
    "If asked: the peers are similar in size and growth; nothing unusual about any of them.",
    "If asked whether a sale would fetch more: answer only that it's a fair question and let them reason it out.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Trading comparables — industrial software",
      kind: "table",
      caption: "Enterprise value / next-twelve-months EBITDA. Fictional peers.",
      columns: ["Company", "EV / NTM EBITDA"],
      rows: [
        ["Peer A", "8.5×"],
        ["Peer B", "9.5×"],
        ["Peer C", "10.5×"],
        ["Peer D", "11.5×"],
      ],
      revealWhen: "when the candidate asks for comparable companies, peer multiples, or the numbers to value it",
      keyInsight:
        "Median and mean are both 10.0× (range 8.5–11.5×). 10.0 × $120M = $1,200M EV; less $300M net debt = $900M equity; ÷ 45M = $20 per share. " +
        "The 8.5–11.5× range gives EV $1,020–1,380M.",
    },
  ],
  strongAnswerNotes:
    "Methods: trading comparables, precedent transactions, DCF (and an LBO floor for a sponsor buyer); shown together as a football field. " +
    "Precedents usually come out highest because they include a control premium; DCF is most sensitive to assumptions. " +
    "Benchmark from comps: 10.0× median × $120M = $1,200M EV → − $300M net debt = $900M equity value → $20 per share; range ≈ $1,020–1,380M EV ($16–24/share). " +
    "A strong candidate notes a private company may deserve a liquidity / size discount, and checks that EV − net debt bridges to equity. " +
    "TOLERANCE: EV $1,080–1,320M and $18–22 per share strong; forgetting to subtract net debt ($1,200M called equity value, ≈ $26.7/share) is a material error.",
  difficulty: "Intermediate",
  source: `${FINANCE_SOURCES.rosenbaumPearl} (ch. 1–2, comparable companies and precedent transactions); ${FINANCE_SOURCES.biws} (valuation questions).`,
};

// ---------------------------------------------------------------------------
// Paper LBOs
// ---------------------------------------------------------------------------

const LBO_QUICK: ProblemQuestion = {
  id: "fin-lbo-quick-five-minute",
  family: "paper-lbo",
  frameworkKey: "finance-paper-lbo",
  title: "Five-minute paper LBO",
  prompt:
    "Let's do a quick paper LBO, no calculator. A sponsor buys a company called Alder Packaging. I'm putting the deal terms on your screen. Walk me through the returns out loud.",
  interviewerFacts: [
    "If asked: the $100M of total debt paydown over five years is already net of interest and taxes — it's all the free cash flow the business generates.",
    "If asked: no transaction fees, no dividends, no cash left on the balance sheet at exit.",
    "If asked: exit happens at the end of year 5.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Alder Packaging — deal terms",
      kind: "table",
      caption: "$ millions. Fictional company.",
      columns: ["Item", "Value"],
      rows: [
        ["LTM EBITDA", "$50M"],
        ["Entry multiple", "8.0×"],
        ["Debt financing", "50% of purchase price"],
        ["Year-5 EBITDA", "$75M"],
        ["Cumulative debt paydown, years 1–5", "$100M"],
        ["Exit multiple", "8.0×"],
        ["Holding period", "5 years"],
      ],
      revealWhen: "immediately after you pose the problem — the candidate needs the deal terms to start",
      keyInsight:
        "Purchase price $400M; debt $200M; equity $200M. Exit EV 8 × 75 = $600M; debt left 200 − 100 = $100M; exit equity $500M. MOIC 2.5×; IRR ≈ 20%.",
    },
  ],
  strongAnswerNotes:
    "Benchmark: entry EV 8 × $50M = $400M; debt $200M, sponsor equity $200M. Exit EV 8 × $75M = $600M; remaining debt $100M; exit equity $500M. " +
    "MOIC = 500 / 200 = 2.5×. IRR ≈ 20% (exact 20.1%): 2× in 5 years ≈ 15%, 3× ≈ 25%, so 2.5× ≈ 20%. " +
    "Drivers: EBITDA growth adds $200M of EV (all of it, since the multiple is flat) and paydown adds $100M; value creation is two-thirds growth, one-third deleveraging. " +
    "TOLERANCE: MOIC 2.4–2.6× and IRR 18–22% strong; IRR 16–24% with a stated rule of thumb acceptable; MOIC ≥ 3.0× (debt not subtracted) " +
    "or IRR computed as (MOIC − 1) / years = 30% is a material error.",
  difficulty: "Beginner",
  source: `${FINANCE_SOURCES.biws} (LBO questions: the simple paper LBO); ${FINANCE_SOURCES.wspPaperLbo}.`,
};

const LBO_STANDARD: ProblemQuestion = {
  id: "fin-lbo-harbor-foods",
  family: "paper-lbo",
  frameworkKey: "finance-paper-lbo",
  title: "Paper LBO: Harbor Foods",
  prompt:
    "Here's a paper LBO. A private equity firm is buying Harbor Foods, a specialty food maker. I'll put the deal terms and the EBITDA projections on your screen. Work out the sponsor's returns out loud, with pen and paper, and tell me whether you'd do the deal.",
  interviewerFacts: [
    "Tax rate: 25%, if asked.",
    "If asked about interest: charge 8% on the STARTING debt balance every year, for simplicity.",
    "If asked about D&A and capex: D&A is $10M a year and capex is $10M a year (they offset).",
    "If asked about working capital: no change in net working capital.",
    "If asked: all free cash flow pays down debt; no fees; exit at the end of year 5.",
    "If asked about the fund's target: the fund looks for roughly a 20% IRR.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Harbor Foods — deal terms",
      kind: "table",
      caption: "$ millions. Fictional company.",
      columns: ["Item", "Value"],
      rows: [
        ["LTM EBITDA", "$100M"],
        ["Entry multiple", "10.0×"],
        ["Debt", "6.0× EBITDA"],
        ["Interest rate on debt", "8%"],
        ["Exit multiple", "10.0×"],
        ["Holding period", "5 years"],
      ],
      revealWhen: "immediately after you pose the problem — the candidate needs the deal terms to start",
      keyInsight:
        "Entry EV $1,000M; debt $600M; equity $400M. Annual interest 8% × 600 = $48M on the starting balance.",
    },
    {
      id: "ex2",
      title: "Harbor Foods — EBITDA projection",
      kind: "bar",
      caption: "EBITDA, $ millions.",
      columns: ["Year", "EBITDA ($M)"],
      rows: [
        ["Year 1", 110],
        ["Year 2", 120],
        ["Year 3", 130],
        ["Year 4", 140],
        ["Year 5", 150],
      ],
      revealWhen: "when the candidate asks how EBITDA grows, for projections, or reaches the cash-flow part of the LBO",
      keyInsight:
        "FCF = (EBITDA − D&A 10 − interest 48) × 75% (capex = D&A): 39, 46.5, 54, 61.5, 69 → cumulative $270M paydown. Exit EBITDA $150M.",
    },
  ],
  strongAnswerNotes:
    "Benchmark: entry EV $1,000M; debt $600M; sponsor equity $400M. Free cash flow each year = (EBITDA − $10M D&A − $48M interest) × 0.75, since capex equals D&A: " +
    "$39M, $46.5M, $54M, $61.5M, $69M = $270M cumulative paydown. Debt at exit $330M. Exit EV 10 × $150M = $1,500M; exit equity $1,170M. " +
    "MOIC = 1,170 / 400 ≈ 2.9×; IRR ≈ 24% (exact 23.9%): 2.9× sits just under 3× ≈ 25% for 5 years. " +
    "Drivers: EBITDA growth adds $500M of EV, debt paydown $270M, multiple flat. Clears a 20% hurdle, so do the deal, with the risk that it relies on 50% EBITDA growth. " +
    "TOLERANCE: cumulative paydown $250–290M, exit equity $1,130–1,210M, MOIC 2.8–3.0× and IRR 22–26% strong; " +
    "MOIC 2.6–3.2× and IRR 20–28% acceptable (e.g. a sensible shortcut on FCF). Outside those bands — e.g. ignoring interest or taxes (MOIC ≥ 3.3×), " +
    "not subtracting debt (MOIC 3.75×), or IRR as MOIC ÷ years — is a material error.",
  difficulty: "Intermediate",
  source: `${FINANCE_SOURCES.wspPaperLbo} (step-by-step paper LBO); ${FINANCE_SOURCES.biws} (LBO section).`,
};

const LBO_ADVANCED: ProblemQuestion = {
  id: "fin-lbo-crestline-multiple-contraction",
  family: "paper-lbo",
  frameworkKey: "finance-paper-lbo",
  title: "Paper LBO: Crestline Software",
  prompt:
    "One more paper LBO, a harder one. A sponsor is looking at buying Crestline Software. The terms are going up on your screen. Tell me the returns and whether the deal works — and if it doesn't, what would have to change.",
  interviewerFacts: [
    "If asked: transaction fees of $40M are paid at close and funded with sponsor equity.",
    "If asked about free cash flow: assume free cash flow after interest, taxes and capex is 35% of each year's EBITDA, all used to repay debt.",
    "If asked: no change in working capital beyond what is already in that 35%, no dividends.",
    "If asked about the exit multiple: the sponsor's base case assumes the multiple contracts to 10.0× because software multiples have compressed.",
    "If asked about the fund's target: roughly a 20% IRR.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Crestline Software — deal terms",
      kind: "table",
      caption: "$ millions. Fictional company.",
      columns: ["Item", "Value"],
      rows: [
        ["LTM EBITDA", "$200M"],
        ["Entry multiple", "12.0×"],
        ["Debt", "5.0× EBITDA"],
        ["EBITDA growth", "5% per year"],
        ["Exit multiple (base case)", "10.0×"],
        ["Holding period", "4 years"],
      ],
      revealWhen: "immediately after you pose the problem — the candidate needs the deal terms to start",
      keyInsight:
        "Entry EV $2,400M; debt $1,000M; equity $1,400M before fees, $1,440M with fees. Year-4 EBITDA ≈ $243M. Exit at 10× ≈ $2,431M.",
    },
  ],
  strongAnswerNotes:
    "Benchmark: entry EV 12 × $200M = $2,400M; debt $1,000M; sponsor equity $1,400M + $40M fees = $1,440M. EBITDA grows 5%/yr: 210, 220.5, 231.5, 243.1. " +
    "FCF at 35%: 73.5 + 77.2 + 81.0 + 85.1 ≈ $317M paydown → debt at exit ≈ $683M. Exit EV 10 × 243.1 ≈ $2,431M; exit equity ≈ $1,748M. " +
    "MOIC ≈ 1.2× (1.21); IRR ≈ 5% (exact 5.0%) — far below a 20% hurdle. " +
    "Drivers: the 2-turn multiple contraction destroys ≈ $486M of value, wiping out most of the EBITDA growth and paydown. At a flat 12× exit: EV ≈ $2,917M, " +
    "MOIC ≈ 1.55×, IRR ≈ 12% — still short. What would change: a lower entry price, more leverage, faster growth or margin expansion. " +
    "TOLERANCE: equity in $1,400–1,440M (fees missed is a minor slip), paydown $290–340M, MOIC 1.15–1.30× and IRR 4–7% strong; " +
    "MOIC 1.1–1.35× and IRR 2.5–8% acceptable. Using a 12× exit in the base case (MOIC ≈ 1.55×), or an IRR above 10%, is a material error; " +
    "concluding the deal works at the base case is a judgment error.",
  difficulty: "Advanced",
  source: `${FINANCE_SOURCES.wspPaperLbo}; ${FINANCE_SOURCES.rosenbaumPearl} (ch. 4–5, LBO analysis and returns drivers).`,
};

// ---------------------------------------------------------------------------
// Stock pitches
// ---------------------------------------------------------------------------

const PITCH_YOUR_LONG: ProblemQuestion = {
  id: "fin-pitch-your-choice-long",
  family: "stock-pitch",
  frameworkKey: "finance-stock-pitch",
  title: "Pitch me a stock",
  prompt:
    "Pitch me a stock. Any public company you know well, long or short. Take a minute to collect your thoughts if you need it, then go.",
  interviewerFacts: [
    "If asked about the horizon: think 6 to 12 months.",
    "If asked about size: any market cap; it does not have to be a household name.",
    "If asked about format: no slides, just talk me through it like a pitch to a portfolio manager.",
    "You do not know more about the candidate's company than they tell you: never supply facts, numbers or a thesis about it. Probe what they say instead (where consensus is, how they know, what the catalyst's timing is, how they got the target).",
    "If the candidate has no stock ready: tell them to pick any company they follow, even a consumer brand they use; do not suggest one.",
  ],
  strongAnswerNotes:
    "A strong pitch (M&I, CFA Research Challenge): opens with long/short, current price, target and horizon; a 2–3 sentence business snapshot with key numbers; " +
    "2–3 thesis points framed against consensus; dated catalysts; a valuation that produces the target (a multiple on forward earnings/EBITDA or a DCF, with base/bull/bear); " +
    "2–3 thesis-specific risks with mitigants or a stop. Answers probes with evidence rather than repetition. " +
    "TOLERANCE (internal consistency only — the evaluator cannot verify live market data): the stated upside must match price and target within ±3 percentage points; " +
    "multiple × metric must reach the stated target within ±10%. Do not penalize facts about a real company the transcript does not contradict; " +
    "penalize internal contradictions and arithmetic that does not reach the target.",
  difficulty: "Intermediate",
  source: `${FINANCE_SOURCES.miStockPitch}; ${FINANCE_SOURCES.cfaResearchChallenge}.`,
};

const PITCH_YOUR_SHORT: ProblemQuestion = {
  id: "fin-pitch-your-choice-short",
  family: "stock-pitch",
  frameworkKey: "finance-stock-pitch",
  title: "Give me a short idea",
  prompt:
    "Give me a short idea: a public company whose stock you think goes down over the next year. Walk me through it like you would to a portfolio manager.",
  interviewerFacts: [
    "If asked about the horizon: 6 to 12 months.",
    "You do not know more about the candidate's company than they tell you: never supply facts, numbers or a thesis. Probe: why now, what is priced in, borrow cost or short squeeze risk, how high it could go.",
    "If the candidate asks whether a 'sell' or 'avoid' call is acceptable: you want an actual short, with a target.",
  ],
  strongAnswerNotes:
    "A strong short pitch: the call and a downside target with horizon up front; why the market is too optimistic (variant view); hard, dated catalysts (shorts depend on timing); " +
    "a valuation that produces the downside target; risks specific to shorting — squeeze, takeover, borrow cost, how high the stock could go — and where they would cover. " +
    "TOLERANCE (internal consistency only): stated downside must match price and target within ±3 percentage points; multiple × metric must reach the target within ±10%. " +
    "Do not penalize real-company facts the transcript does not contradict.",
  difficulty: "Advanced",
  source: `${FINANCE_SOURCES.miStockPitch} (short pitches: catalysts and loss limits); ${FINANCE_SOURCES.cfaResearchChallenge}.`,
};

const PITCH_TEAR_SHEET: ProblemQuestion = {
  id: "fin-pitch-cobalt-trail",
  family: "stock-pitch",
  frameworkKey: "finance-stock-pitch",
  title: "Buy or short: Cobalt Trail Outfitters",
  prompt:
    "Here's a different kind of pitch. I'm putting a one-page summary of Cobalt Trail Outfitters, a mid-cap outdoor-apparel company, on your screen. Ask me anything you need, and then pitch it to me — long or short, with a price target.",
  interviewerFacts: [
    "If asked what consensus assumes: analysts model direct-to-consumer (DTC) sales staying at 25% of revenue next year.",
    "If asked about management's plans or an investor day: at last month's investor day management targeted DTC at 35% of revenue next year; the stock barely moved.",
    "If asked about DTC economics: management says each 5 points of DTC mix adds about 1 point of operating margin.",
    "If asked about capital return: a $150M buyback is authorized and expected to be completed over the next year.",
    "If asked about the balance sheet: no net debt. Tax rate 25%. Revenue next year ≈ $2.0B.",
    "If asked about inventory: inventory is up 30% year over year while sales grew 5%; management says it is pre-buying for the DTC launch.",
    "If asked about upcoming events: Q3 earnings in about six weeks will be the first quarter with DTC mix disclosed.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Cobalt Trail Outfitters — summary",
      kind: "table",
      caption: "Fictional company. Next-year figures are consensus.",
      columns: ["Item", "Value"],
      rows: [
        ["Share price", "$48.00"],
        ["Shares outstanding", "100M"],
        ["Consensus EPS, next year", "$3.00"],
        ["P/E, next year", "16.0×"],
        ["Peer median P/E, next year", "18.0×"],
        ["Revenue growth, last year", "5%"],
        ["Inventory growth, last year", "30%"],
      ],
      revealWhen: "immediately after you pose the problem — the candidate needs the summary to start",
      keyInsight:
        "Trades at 16× vs. peers 18× on $3.00 consensus. Inventory growing 6× faster than sales is the bear flag. The investor-day DTC target is not in consensus.",
    },
  ],
  strongAnswerNotes:
    "Long case (benchmark): DTC 25% → 35% adds ≈ 2 points of operating margin on $2.0B = $40M pre-tax = $30M after tax = +$0.30 EPS → $3.30; " +
    "a $150M buyback at $48 retires ≈ 3.1M shares → EPS ≈ $3.40. At the peer 18× → target ≈ $61, ≈ 27–28% upside; catalyst: Q3 earnings in six weeks " +
    "(first DTC disclosure). Risks: inventory build (30% vs. 5% sales) could mean markdowns; DTC execution; consumer slowdown. Bear case ≈ $2.70 × 14× ≈ $38 (−21%). " +
    "A well-argued SHORT built on the inventory build (markdown risk, DTC stumble) with its own derived target is equally acceptable. " +
    "TOLERANCE: long target $55–68 with an EPS bridge in $3.25–3.50 and a justified multiple is strong; a target with correct arithmetic from different stated assumptions is acceptable; " +
    "upside stated must match price and target within ±3 points. A target with no derivation, or arithmetic that does not reach it, is a material error.",
  difficulty: "Intermediate",
  source: `${FINANCE_SOURCES.miStockPitch} (variant view, hard catalysts, base/upside/downside); ${FINANCE_SOURCES.cfaResearchChallenge} (financial analysis, valuation, risks).`,
};

// ---------------------------------------------------------------------------
// Market / deal discussions
// ---------------------------------------------------------------------------

const DEAL_ACCRETION: ProblemQuestion = {
  id: "fin-deal-accretion-dilution",
  family: "market-deal",
  frameworkKey: "finance-market-deal",
  title: "Stock or debt: Northgate buys Pillar",
  prompt:
    "Northgate Brands wants to buy a smaller competitor, Pillar Goods. The numbers are on your screen. Is the deal accretive or dilutive to Northgate's earnings per share — and should Northgate pay in stock or with new debt?",
  interviewerFacts: [
    "If asked about debt terms: new debt would cost 6% pre-tax; tax rate 25%.",
    "If asked: ignore synergies, fees and purchase-accounting adjustments for the first pass.",
    "If asked: Northgate's stock would be issued at its current $50 price.",
    "If asked about leverage: Northgate has no debt today and EBITDA of about $450M.",
    "If asked strategically: Pillar would give Northgate a foothold in the fast-growing natural-products aisle.",
  ],
  exhibits: [
    {
      id: "ex1",
      title: "Northgate and Pillar — key figures",
      kind: "table",
      caption: "$ millions except per share. Fictional companies.",
      columns: ["Item", "Northgate (acquirer)", "Pillar (target)"],
      rows: [
        ["Share price", "$50.00", "—"],
        ["Shares outstanding", "100M", "—"],
        ["Net income", "$250M", "$60M"],
        ["Purchase price (equity value)", "—", "$900M"],
      ],
      revealWhen: "immediately after you pose the problem — the candidate needs the figures to start",
      keyInsight:
        "Northgate EPS $2.50, P/E 20× (earnings yield 5%). Pillar bought at 15× (yield 6.7%). After-tax cost of debt 4.5%. Both financing options are accretive.",
    },
  ],
  strongAnswerNotes:
    "Benchmark: Northgate EPS = 250 / 100 = $2.50; P/E 20×. All-stock: 900 / 50 = 18M new shares; pro forma EPS = (250 + 60) / 118 = $2.63 → ≈ +5% accretive. " +
    "All-debt: after-tax interest = 900 × 6% × 0.75 = $40.5M; EPS = (310 − 40.5) / 100 = $2.70 → ≈ +8% accretive. " +
    "Shortcut: cost of stock (1/20 = 5%) and after-tax cost of debt (4.5%) are both below the target's earnings yield (60/900 ≈ 6.7%), so both accrete; debt more so. " +
    "Judgment: debt adds ≈ 2× leverage (900 / 450) — manageable; accretion is not value creation; strategic fit, integration and the 15× price matter. " +
    "TOLERANCE: stock EPS $2.60–2.65 (accretion 4–6%), debt EPS $2.68–2.72 (7–9%) strong; using pre-tax interest (EPS $2.56, +2.4%) is a material error.",
  difficulty: "Intermediate",
  source: `${FINANCE_SOURCES.rosenbaumPearl} (ch. 7, buy-side M&A and accretion/dilution); ${FINANCE_SOURCES.biws} (merger model questions).`,
};

const DEAL_RATES: ProblemQuestion = {
  id: "fin-market-rates-lbo",
  family: "market-deal",
  frameworkKey: "finance-market-deal",
  title: "Higher rates and the LBO market",
  prompt:
    "Over the last couple of years, borrowing costs for leveraged buyouts have gone up a lot. How does that change private equity deal activity and the prices sponsors can pay — and what would you tell a client who is thinking about selling their company to a sponsor right now?",
  interviewerFacts: [
    "If asked for numbers, for this discussion assume: all-in cost of leveraged loans rose from about 5% to about 9%.",
    "If asked about leverage: lenders typically want interest coverage (EBITDA ÷ interest) of at least about 2×.",
    "If asked about the client: a family-owned distributor with $80M of EBITDA whose owners anchor on a 12× valuation from three years ago.",
    "If asked about alternatives: strategic buyers and private credit lenders are both active.",
  ],
  strongAnswerNotes:
    "Mechanism: higher rates raise interest cost per turn of leverage, so lenders allow fewer turns; less debt means more equity per deal and lower returns at the same price, " +
    "so sponsors bid lower multiples; activity slows and holds lengthen; bid–ask gaps widen. " +
    "Benchmark numbers: at 6× leverage, interest = 6 × 5% = 30% of EBITDA (coverage ≈ 3.3×) before, vs. 6 × 9% = 54% (coverage ≈ 1.9×) after — " +
    "under a 2× coverage floor, max leverage falls to about 5.5× (1 ÷ (2 × 9%)), from 10× at 5%. " +
    "Client advice: a reset from 12× is likely; options — sell to a strategic with stock, seller financing or earn-outs, a minority stake, or wait for better conditions. " +
    "Counter-view: private credit availability, falling rates, dry powder. " +
    "TOLERANCE: interest-as-share-of-EBITDA figures within ±2 points and max-leverage ≈ 5–6× at 9% are strong; a computed figure off by more than 20% is a material error. " +
    "A purely qualitative answer can still hit every step except the numbers one.",
  difficulty: "Advanced",
  source: `${FINANCE_SOURCES.miInterviews} (market and PE interview questions); ${FINANCE_SOURCES.rosenbaumPearl} (ch. 4, LBO financing structure).`,
};

const DEAL_YOU_FOLLOWED: ProblemQuestion = {
  id: "fin-deal-walk-me-through",
  family: "market-deal",
  frameworkKey: "finance-market-deal",
  title: "Walk me through a deal",
  prompt:
    "Tell me about a deal you've followed recently — any M&A deal, buyout or IPO. What happened, and was it a good deal?",
  interviewerFacts: [
    "You do not know more about the candidate's deal than they tell you: never supply facts about it. Probe the price paid, the multiple, financing, rationale and whether it was a good deal.",
    "Only if the candidate says they don't have one ready: offer this hypothetical instead — a large packaged-food company is buying a fast-growing snack brand for $3.0B in cash, about 20× the brand's $150M EBITDA; the buyer trades at 12×; management expects $60M of annual cost synergies by year 3.",
    "Hypothetical follow-ups, only if asked and only for the hypothetical: the snack brand grows ~15% a year vs. the buyer's ~2%; the deal is funded with new debt.",
  ],
  strongAnswerNotes:
    "A strong answer: names the deal, the parties, price, multiple and financing; the strategic rationale (growth, capabilities, synergies) and financial rationale; " +
    "a calculation (premium, implied multiple, synergy-adjusted multiple); the other side (overpaying, integration, financing risk); and a clear verdict. " +
    "For the hypothetical: 3,000 / 150 = 20×; with full synergies 3,000 / 210 ≈ 14.3× — closer to, but still above, the buyer's 12×; good deal only if the synergies and growth are delivered. " +
    "TOLERANCE: for the hypothetical, synergy-adjusted multiple 14–14.5× strong; for a real deal, internal arithmetic only (implied multiple = price ÷ metric within ±10%), " +
    "and do not penalize real-deal facts the transcript does not contradict.",
  difficulty: "Intermediate",
  source: `${FINANCE_SOURCES.miInterviews} (“walk me through a deal”); ${FINANCE_SOURCES.vault}; ${FINANCE_SOURCES.rosenbaumPearl} (precedent transactions, synergies).`,
};

export const FINANCE_BANK: readonly ProblemQuestion[] = [
  TECH_DEPRECIATION,
  TECH_DEBT_PPE,
  TECH_EV_BRIDGE,
  TECH_DCF,
  TECH_COMPS,
  LBO_QUICK,
  LBO_STANDARD,
  LBO_ADVANCED,
  PITCH_YOUR_LONG,
  PITCH_YOUR_SHORT,
  PITCH_TEAR_SHEET,
  DEAL_ACCRETION,
  DEAL_RATES,
  DEAL_YOU_FOLLOWED,
];

export function getFinanceQuestion(id: string): ProblemQuestion | null {
  return FINANCE_BANK.find((question) => question.id === id) ?? null;
}
