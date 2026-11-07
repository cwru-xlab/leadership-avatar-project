/**
 * Process frameworks for the finance interview (investment banking, private
 * equity, equity research).
 *
 * Each framework is the order a real finance interviewer listens for, written
 * so the evaluator can mark every step hit / prompted / missed
 * (`lib/problem-interview/types.ts`). Steps are a synthesis of:
 *
 * - Technical walk-throughs (BIWS 400 questions, Wall Street Prep, Rosenbaum &
 *   Pearl): state the assumption the answer depends on (usually the tax
 *   rate), trace the effect in the order the statements / valuation link,
 *   put a number on every line, show that it ties out (the balance sheet
 *   balances, EV bridges to equity value), and say why it matters.
 * - Paper LBO (Wall Street Prep, BIWS): confirm the inputs, entry price and
 *   sources & uses with equity as the plug, project cash flow and debt
 *   paydown, exit value less net debt, MOIC and IRR by mental math (rule of
 *   72 / MOIC-to-IRR rules of thumb), then sanity-check and name the drivers.
 * - Stock pitch (Mergers & Inquisitions, CFA Institute Research Challenge):
 *   recommendation and target up front, a company snapshot, 2–3 points the
 *   market is mispricing, dated catalysts, a valuation that produces the
 *   target, risks with mitigants and what would change your mind.
 * - Market / deal discussion (M&I, Vault, Rosenbaum & Pearl M&A chapters):
 *   pin down the question, lay out the relevant facts, the strategic and
 *   financial rationale, the numbers (premium, multiple, accretion /
 *   dilution), the other side, and a clear view.
 *
 * Nudges are what a real finance interviewer says when a candidate skips
 * something: a short neutral question. They never name the step, the method,
 * or the answer ("What's your tax rate assumption?" would hand over the
 * answer to the assumptions step, so the nudge is "What are you taking as
 * given there?").
 */

import type { ProcessFramework } from "@/lib/problem-interview/types";

import { FINANCE_SOURCES } from "./sources";

/** Accounting and valuation technicals walked through out loud. */
export const FINANCE_TECHNICAL_FRAMEWORK: ProcessFramework = {
  key: "finance-technical",
  label: "Technical walk-through",
  source: [FINANCE_SOURCES.biws, FINANCE_SOURCES.wspAccounting, FINANCE_SOURCES.rosenbaumPearl].join("; "),
  steps: [
    {
      key: "state_assumptions",
      label: "State the assumptions",
      description:
        "Say up front what the answer depends on — the tax rate, what is held constant, cash vs. non-cash — before tracing anything.",
      evidenceCriteria:
        "Before or at the start of the walk-through, the candidate states or asks for the assumption(s) the answer depends on " +
        "(e.g. 'assuming a 25% tax rate', 'assume the debt is not repaid in year one', 'diluted shares'), or asks the interviewer for them. " +
        "An assumption mentioned only after the final number, or never, is NOT a hit.",
      nudge: "What are you taking as given there?",
    },
    {
      key: "trace_in_order",
      label: "Trace it in order",
      description:
        "Walk the effect through in the order the pieces link: income statement → cash flow statement → balance sheet, or cash flow → discounting → enterprise value → equity value.",
      evidenceCriteria:
        "The candidate walks through the pieces in a logical linked order and names each one as they go (e.g. 'starting on the income statement… " +
        "then on the cash flow statement… then the balance sheet'; or 'project free cash flow, discount at WACC, add terminal value, get EV, bridge to equity'). " +
        "Jumping straight to an end number, or listing effects in a random order with no links, is NOT a hit.",
      nudge: "Can you take me through that one piece at a time?",
    },
    {
      key: "quantify_lines",
      label: "Put numbers on each line",
      description:
        "Give the actual amount on every line the change touches, not just the direction.",
      evidenceCriteria:
        "The candidate gives a correct number (within the tolerance in reference_notes) for each line the answer depends on — " +
        "e.g. 'net income down $7.50, cash up $2.50, PP&E down $10'. Directions only ('net income goes down') are NOT a hit. " +
        "Re-check the arithmetic: a key number off beyond the stated tolerance and left uncorrected makes this step MISSED.",
      nudge: "What are the actual amounts?",
    },
    {
      key: "tie_out",
      label: "Check that it ties",
      description:
        "Show the answer is internally consistent: the balance sheet balances, the bridge adds up, the result passes a sense check.",
      evidenceCriteria:
        "The candidate explicitly checks consistency — e.g. 'assets down $7.50, equity down $7.50, so it balances', or re-adds the EV bridge, " +
        "or compares a computed value against an independent anchor (a multiple, a share of total value). " +
        "Saying 'and it balances' with numbers that do not in fact balance is NOT a hit.",
      nudge: "How do you know that's right?",
    },
    {
      key: "explain_why",
      label: "Explain the intuition",
      description:
        "Say why the result comes out the way it does and when it matters in practice.",
      evidenceCriteria:
        "The candidate gives the economic reason behind the result (e.g. 'cash goes up because depreciation is non-cash but tax-deductible'; " +
        "'EV doesn't change because raising debt adds cash and debt equally') or a practical implication (when you'd use this, what it changes in a deal). " +
        "Restating the result is NOT a hit.",
      nudge: "Why does it come out that way?",
    },
  ],
};

/** The private-equity paper LBO, done by mental math. */
export const FINANCE_PAPER_LBO_FRAMEWORK: ProcessFramework = {
  key: "finance-paper-lbo",
  label: "Paper LBO",
  source: [FINANCE_SOURCES.wspPaperLbo, FINANCE_SOURCES.biws, FINANCE_SOURCES.rosenbaumPearl].join("; "),
  steps: [
    {
      key: "confirm_inputs",
      label: "Confirm the inputs",
      description:
        "Play back the deal terms and ask for whatever is missing (tax rate, interest basis, capex, working capital, hold period) before computing.",
      evidenceCriteria:
        "Before the first calculation, the candidate restates the key terms (entry multiple, leverage, hold period, exit assumption) AND asks about " +
        "at least one input that is not on screen (e.g. tax rate, whether interest is on the starting balance, capex vs. D&A, working capital, fees). " +
        "Starting the math straight away with no check is NOT a hit.",
      nudge: "Before you start, is there anything you'd want to know?",
    },
    {
      key: "entry_sources_uses",
      label: "Entry price and funding",
      description:
        "Purchase price = EBITDA × entry multiple; split it into debt and sponsor equity, with equity as the plug.",
      evidenceCriteria:
        "The candidate computes the purchase enterprise value from EBITDA × multiple, the debt from the leverage multiple (or %), and the sponsor equity " +
        "as the remainder (plus fees where the case has them), all within tolerance. Re-check the arithmetic: a wrong equity cheque that is not corrected is MISSED.",
      nudge: "How's the deal paid for?",
    },
    {
      key: "project_cash_flow",
      label: "Project cash flow and paydown",
      description:
        "Project EBITDA to exit and the free cash flow (after interest, taxes, capex, working capital) that pays down debt.",
      evidenceCriteria:
        "The candidate projects EBITDA through the hold and derives free cash flow by subtracting interest, taxes and capex (and working capital when given), " +
        "then sums it into the debt paydown — with EACH year's figure computed correctly and the cumulative figure inside the tolerance band. Assuming a paydown figure with no derivation, " +
        "or leaving out interest or taxes when the case has them, is NOT a hit.",
      nudge: "How much of the debt is still there when you sell?",
    },
    {
      key: "exit_equity",
      label: "Exit value and equity",
      description:
        "Exit enterprise value from exit-year EBITDA × exit multiple, less remaining net debt, gives the sponsor's equity at exit.",
      evidenceCriteria:
        "The candidate computes exit EV = exit EBITDA × exit multiple and subtracts the remaining debt (net of any cash) to get exit equity, within tolerance. " +
        "Forgetting to subtract the debt, or subtracting the starting debt when paydown was given, is MISSED.",
      nudge: "What does the sponsor walk away with?",
    },
    {
      key: "returns_math",
      label: "Returns: MOIC and IRR",
      description:
        "MOIC = exit equity ÷ equity invested; IRR from the MOIC and hold period by a stated rule of thumb.",
      evidenceCriteria:
        "The candidate states MOIC and an IRR inside the tolerance band in reference_notes and shows HOW they got the IRR (e.g. '2x in 5 years is about 15%, " +
        "3x is about 25%, so ~24%', or the rule of 72 / 115). An IRR outside the band, or computed as MOIC ÷ years, is MISSED. " +
        "A number with no method at all is NOT a hit.",
      nudge: "What does that work out to as an annual return?",
    },
    {
      key: "drivers_sanity",
      label: "Sanity-check and name the drivers",
      description:
        "Check the result against a reference point and say what drove the return (EBITDA growth, debt paydown, multiple change) and whether the deal works.",
      evidenceCriteria:
        "The candidate does at least one of: compares the return against a hurdle or a typical PE target (e.g. 20–25%), splits the value created into " +
        "EBITDA growth / debt paydown / multiple change, or says how a change (exit multiple, leverage) would move the answer — AND gives a view on " +
        "whether the deal works. Simply restating the IRR is NOT a hit.",
      nudge: "What's doing most of the work in that return?",
    },
  ],
};

/** Equity-research / asset-management stock pitch. */
export const FINANCE_STOCK_PITCH_FRAMEWORK: ProcessFramework = {
  key: "finance-stock-pitch",
  label: "Stock pitch",
  source: [FINANCE_SOURCES.miStockPitch, FINANCE_SOURCES.cfaResearchChallenge].join("; "),
  steps: [
    {
      key: "call_and_target",
      label: "Lead with the call",
      description:
        "Open with long or short, the price target, the time horizon and the implied upside or downside.",
      evidenceCriteria:
        "In the first part of the pitch, UNPROMPTED, the candidate states long or short AND a price target (or expected return) AND a horizon, " +
        "e.g. 'I'm long X at $48 with a $61 target over 12 months, about 27% upside'. Check the upside arithmetic. " +
        "A call that only appears at the end, or only after the interviewer asks what they would do, is NOT a hit.",
      nudge: "So what would you actually do with the stock?",
    },
    {
      key: "business_snapshot",
      label: "Company snapshot",
      description:
        "In a few sentences: what the company does, how it makes money, and the numbers that matter (size, growth, margins, current multiple).",
      evidenceCriteria:
        "The candidate explains the business model and gives at least two relevant figures (revenue or growth, margin, market cap or valuation multiple). " +
        "A name and a sector alone is NOT a hit.",
      nudge: "How does the company actually make its money?",
    },
    {
      key: "variant_thesis",
      label: "Thesis vs. the market",
      description:
        "Two or three specific reasons the market is mispricing the stock, and why the consensus view is wrong.",
      evidenceCriteria:
        "The candidate gives 2–3 distinct thesis points AND says what the market or consensus believes and why they disagree " +
        "(a variant perception), tied to earnings or value where possible. 'It's a great company with strong growth' is NOT a thesis; " +
        "points with no contrast to what is priced in are NOT a hit.",
      nudge: "Why hasn't the market already figured that out?",
    },
    {
      key: "catalysts",
      label: "Catalysts",
      description:
        "Specific, dated events in the horizon that would make the market recognize the mispricing.",
      evidenceCriteria:
        "The candidate names at least one concrete event with rough timing (an earnings report, product launch, contract, regulatory decision, " +
        "investor day) and says how it closes the gap. 'Over time people will notice' is NOT a catalyst.",
      nudge: "What gets the stock there, and when?",
    },
    {
      key: "valuation",
      label: "Valuation behind the target",
      description:
        "A method that produces the target — a multiple on forward earnings or EBITDA, or a DCF — with the key inputs, and ideally a base / bull / bear range.",
      evidenceCriteria:
        "The candidate shows how the target is derived (e.g. '18× my $3.40 EPS = $61') with inputs stated and the arithmetic right within tolerance, " +
        "and justifies the multiple or assumptions (peers, history, growth). A target with no derivation, or arithmetic that does not reach the stated target, is MISSED.",
      nudge: "How do you get to that number?",
    },
    {
      key: "risks_mitigants",
      label: "Risks and what would change your mind",
      description:
        "The two or three company-specific ways the thesis could be wrong, how you'd limit the damage, and what would make you exit.",
      evidenceCriteria:
        "The candidate names at least two specific risks to THIS thesis (not generic 'the market could fall') AND either a mitigant, a downside case / " +
        "price, or what evidence would make them change their mind. Brushing off the interviewer's challenge without engaging is NOT a hit.",
      nudge: "What would make you wrong?",
    },
  ],
};

/** Market and deal discussions (M&A rationale, accretion / dilution, macro impact on deals). */
export const FINANCE_MARKET_DEAL_FRAMEWORK: ProcessFramework = {
  key: "finance-market-deal",
  label: "Market & deal discussion",
  source: [FINANCE_SOURCES.miInterviews, FINANCE_SOURCES.rosenbaumPearl, FINANCE_SOURCES.vault, FINANCE_SOURCES.biws].join("; "),
  steps: [
    {
      key: "frame_question",
      label: "Pin down the question",
      description:
        "Restate what's being asked and from whose side (buyer, seller, lender, investor) before answering.",
      evidenceCriteria:
        "Before the analysis, the candidate restates the question in their own words and either asks or states whose perspective they are taking " +
        "or what decision is being made. Launching straight into an opinion is NOT a hit.",
      nudge: "Whose side of this are you looking at it from?",
    },
    {
      key: "lay_out_facts",
      label: "Lay out the facts",
      description:
        "State the relevant facts — size, price, multiple, structure, financing, or the market data — that the view will rest on.",
      evidenceCriteria:
        "The candidate states (or asks for and then uses) at least three relevant facts: e.g. price paid, multiple, how it is financed, " +
        "the companies' sizes, or the relevant market data. Vague references ('it was a big deal') are NOT a hit.",
      nudge: "What do we actually know about it?",
    },
    {
      key: "rationale",
      label: "Strategic and financial rationale",
      description:
        "Why it makes sense (or doesn't): strategy, synergies, cost of financing, competitive position, cycle.",
      evidenceCriteria:
        "The candidate explains at least one strategic AND one financial reason the deal or market move does or does not make sense " +
        "(e.g. revenue synergies plus cheaper stock currency; higher rates plus lower debt capacity). One generic reason is NOT a hit.",
      nudge: "Why would anyone do this?",
    },
    {
      key: "run_numbers",
      label: "Run the numbers",
      description:
        "Put figures on it: premium, implied multiple, synergy-adjusted multiple, accretion / dilution, interest burden.",
      evidenceCriteria:
        "The candidate does at least one relevant calculation (implied multiple, synergy-adjusted multiple, EPS accretion / dilution, interest as a " +
        "share of EBITDA) with the arithmetic right within the tolerance in reference_notes. Re-check it: a wrong key figure left uncorrected is MISSED.",
      nudge: "Can you put some numbers around that?",
    },
    {
      key: "counter_view",
      label: "The other side",
      description:
        "The strongest argument against your view: risks, integration, overpaying, what the other party sees.",
      evidenceCriteria:
        "The candidate gives at least one specific counter-argument or risk to their own view and engages with it. A one-word 'risks exist' is NOT a hit.",
      nudge: "How would someone push back on that?",
    },
    {
      key: "takeaway",
      label: "Land a view",
      description:
        "Close with a clear position — good or bad deal, what you'd advise, what you'd watch — not a recap.",
      evidenceCriteria:
        "UNPROMPTED, the candidate ends with a clear position (e.g. 'net, I think they overpaid unless they hit the cost synergies') and a reason. " +
        "A hedge with no position, or a view given only after the interviewer asks for one, is NOT a hit.",
      nudge: "So where do you come out?",
    },
  ],
};

export const FINANCE_FRAMEWORKS: ProcessFramework[] = [
  FINANCE_TECHNICAL_FRAMEWORK,
  FINANCE_PAPER_LBO_FRAMEWORK,
  FINANCE_STOCK_PITCH_FRAMEWORK,
  FINANCE_MARKET_DEAL_FRAMEWORK,
];

export function getFinanceFramework(key: string): ProcessFramework | null {
  return FINANCE_FRAMEWORKS.find((framework) => framework.key === key) ?? null;
}
