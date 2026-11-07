/**
 * Public sources the finance interview (investment banking, private equity,
 * equity research) is modeled on.
 *
 * One list, referenced by the frameworks, the bank and the validity doc
 * (docs/interviews/finance-validity.md), so a citation is written once.
 * Retrieved 2026-11-06. Everything in the bank is paraphrased; every company
 * and figure in an exhibit is original (fictional), so no guide's worked
 * example is reproduced.
 */

export const FINANCE_SOURCES = {
  /** Paper LBO: TEV = EBITDA × multiple, S&U with equity as plug, FCF, exit, MOIC/IRR, rule of 72 / 115. */
  wspPaperLbo:
    "Wall Street Prep, “The Paper LBO: Practice Exercises to Ace the Private Equity Interview” " +
    "(wallstreetprep.com/knowledge/the-paper-lbo-practice-exercises-to-ace-the-private-equity-interview)",
  /** The $10-of-depreciation walk-through; state the tax rate first. */
  wspAccounting:
    "Wall Street Prep, investment banking accounting interview questions " +
    "(wallstreetprep.com, “How would a $10 increase in depreciation impact the three statements?”)",
  /** The 400 IB interview questions guide: accounting, EV/equity value, valuation, DCF, M&A, LBO walk-throughs. */
  biws:
    "Breaking Into Wall Street, “Investment Banking Interview Guide” / 400 IB interview questions " +
    "(breakingintowallstreet.com), accounting, enterprise value, valuation, DCF, merger model and LBO sections",
  /** Stock pitch: recommendation → background → 2–3 mispricing points → catalysts → base/up/down valuation → risks & mitigants. */
  miStockPitch:
    "Mergers & Inquisitions (Brian DeChesare), “How to Pitch a Stock in Interviews” " +
    "(mergersandinquisitions.com/bank-stock-pitch)",
  /** Fit + technicals format; deal / market discussion questions. */
  miInterviews:
    "Mergers & Inquisitions, investment banking and private equity interview guides " +
    "(mergersandinquisitions.com), “walk me through a deal”, market and M&A questions",
  /** Valuation methods: comps, precedents, DCF, LBO; EV bridge; football field. */
  rosenbaumPearl:
    "Rosenbaum & Pearl, “Investment Banking: Valuation, LBOs, M&A, and IPOs” (Wiley, 3rd ed., 2020), " +
    "chapters on comparable companies, precedent transactions, DCF and LBO analysis",
  /** Interview format: first round, Superday, fit + technicals. */
  vault:
    "Vault Career Guide to Investment Banking / Vault Guide to Finance Interviews (Vault.com), interview format and question types",
  /** Equity research pitch criteria: thesis vs peers, financial analysis, valuation, investment risks, Q&A. */
  cfaResearchChallenge:
    "CFA Institute Research Challenge, judge guidelines and local-challenge rules " +
    "(cfainstitute.org/societies/challenge; rc-judge-guidelines.pdf): valuation, financial analysis, investment risks, presentation and Q&A",
  /** CWRU's own synthesis (scratchpad research): finance format, frameworks, numeric-band grading need. */
  internalResearch:
    "Internal research memo “Structured, process-graded interview styles” (2026-11), §3.7 Finance",
} as const;
