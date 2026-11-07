/**
 * Data / product-analytics interview methods the report grades against.
 *
 * Four frameworks, one per question family a product-analytics data-science
 * loop asks (Meta's "analytical reasoning" covers metric definition and
 * experiment design; "analytical execution" covers readouts and diagnosis —
 * see ANALYTICS_SOURCES.metaLoop):
 *
 *   - `metric-definition`  define a success metric precisely, out loud, down to
 *                          the numerator, denominator, window and the query
 *   - `experiment-design`  design an A/B test before launch
 *   - `experiment-readout` read an A/B test's results and decide
 *   - `metric-diagnosis`   a metric moved — find out why (funnel diagnosis)
 *
 * SQL reasoning and stats intuition are not separate families: the candidate
 * talks through the computation inside `define_precisely` (metric
 * definition) and `hypothesize_and_test` (diagnosis), and the statistics live
 * inside `power_and_duration`, `read_primary_result` and the
 * `statistical_reasoning` rubric dimension. There is no code execution.
 *
 * Nudges are what a neutral analytics interviewer says when a step is skipped:
 * a short open question that names neither the step, the method nor the
 * answer (checked by scripts/verify-analytics-interview-bank.ts).
 */

import type { ProcessFramework } from "@/lib/problem-interview/types";

import { ANALYTICS_SOURCES as S } from "./sources";

export const METRIC_DEFINITION_FRAMEWORK: ProcessFramework = {
  key: "metric-definition",
  label: "Metric definition",
  source: `${S.aceTheDsInterview}; ${S.northStar}; ${S.kohavi} (ch. 7)`,
  steps: [
    {
      key: "clarify_goal",
      label: "Clarify the goal",
      description: "Pin down what the product is for and which decision the metric will drive.",
      evidenceCriteria:
        "Before proposing any metric the candidate asks about, or states as an explicit assumption, the product or business goal AND who will use the metric for what decision (e.g. launch go/no-go, exec dashboard, team OKR). Restating the prompt does not count.",
      nudge: "Before we pick anything — what is this product trying to do for the business?",
    },
    {
      key: "map_user_value",
      label: "Map the user actions that show value",
      description: "Walk the user journey and name the actions that mean a user got value.",
      evidenceCriteria:
        "The candidate walks through how a user experiences the product (a journey or funnel) and names at least two concrete user actions that signal real value, distinguishing them from vanity activity (opens, impressions, page views).",
      nudge: "What does a user actually do when this is working well for them?",
    },
    {
      key: "define_precisely",
      label: "Define it precisely",
      description: "State the exact computation: unit, numerator, denominator, window, filters, and how it is queried.",
      evidenceCriteria:
        "For the chosen primary metric the candidate states the unit of analysis, the numerator AND the denominator (or the exact count), the time window, and at least one inclusion/exclusion rule (test accounts, bots, background events, new vs. existing users) — talking through the query logic (which table/events, how to filter, group and dedupe). A metric name alone ('engagement', 'retention') is not a definition.",
      nudge: "If you had to write that number down for a dashboard tomorrow, how exactly would it be computed?",
    },
    {
      key: "guardrails_and_gaming",
      label: "Guardrails and gaming",
      description: "Name what could get worse or be gamed while the metric goes up.",
      evidenceCriteria:
        "The candidate names at least one counter or guardrail metric tied to a concrete way the primary metric could rise while the product or business gets worse (gaming, cannibalization, quality, cost, the other side of a marketplace).",
      nudge: "How could that number go up while things actually get worse?",
    },
    {
      key: "validate_and_commit",
      label: "Validate and commit",
      description: "Say how you would check the metric is a good one, then commit to it.",
      evidenceCriteria:
        "The candidate commits to one primary metric (with its guardrail set) AND says how they would validate it — e.g. its correlation with long-term retention or revenue, sensitivity enough to move in an experiment, a back-test on past launches. Listing metrics without choosing does not count.",
      nudge: "So which one would you put in front of the team, and why should they trust it?",
    },
  ],
};

export const EXPERIMENT_DESIGN_FRAMEWORK: ProcessFramework = {
  key: "experiment-design",
  label: "Experiment design",
  source: `${S.kohavi}; ${S.emmaDing}; ${S.interviewQueryDrop}`,
  steps: [
    {
      key: "state_hypothesis",
      label: "State the hypothesis",
      description: "Say what changes, for whom, and which way you expect what to move — and why.",
      evidenceCriteria:
        "The candidate states a testable prediction naming the change, the population it applies to, and the expected direction of a specific metric, with the user-behavior reason (e.g. 'removing the address step cuts friction, so cart-to-purchase conversion should rise').",
      nudge: "What do you expect this change to do, and why?",
    },
    {
      key: "choose_metrics",
      label: "Choose the metrics",
      description: "One primary decision metric plus guardrails.",
      evidenceCriteria:
        "The candidate names ONE primary (decision) metric with its definition AND at least one guardrail metric chosen for a stated risk of this change (e.g. revenue per user, refunds, latency, unsubscribes). Several 'primary' metrics with no ranking do not count.",
      nudge: "How will you know whether it worked — and what would make you hold off even if it did?",
    },
    {
      key: "randomization_unit",
      label: "Pick the randomization unit",
      description: "Decide who or what is randomized, and check for interference.",
      evidenceCriteria:
        "The candidate names the unit of randomization (user, session, device, cluster/market, time slice) and who is eligible (trigger/exposure), AND says why that unit fits — at minimum checking whether units can affect each other (network or marketplace effects) or see both variants.",
      nudge: "Who exactly gets the new version, and who doesn't?",
    },
    {
      key: "power_and_duration",
      label: "Size it and set the duration",
      description: "Sample size from baseline, minimum detectable effect and power; run long enough for weekly cycles and novelty.",
      evidenceCriteria:
        "The candidate reasons from a baseline rate and a minimum detectable effect to a sample size (any defensible approach, e.g. n ≈ 16·p(1−p)/δ² per arm for 80% power at α = 0.05) landing inside the question's tolerance band, converts it to a duration from traffic, AND runs at least one full week (weekly seasonality) or addresses novelty. Naming 'power' without numbers does not count.",
      nudge: "How many users do you need, and how long would it run?",
    },
    {
      key: "decision_rule",
      label: "Set the decision rule and pitfalls",
      description: "Decide in advance what result ships, and name the traps that would fool you.",
      evidenceCriteria:
        "Before seeing results, the candidate states what outcome leads to ship / don't ship / iterate (primary significant and practically meaningful, guardrails not harmed) AND names at least one validity pitfall relevant to this test (peeking / stopping early, multiple comparisons, sample ratio mismatch, novelty, interference).",
      nudge: "Suppose the results come back — what would make you ship it?",
    },
  ],
};

export const EXPERIMENT_READOUT_FRAMEWORK: ProcessFramework = {
  key: "experiment-readout",
  label: "Experiment readout",
  source: `${S.kohavi} (ch. 21, 23); ${S.fabijanSrm}; ${S.kohaviPuzzles}; ${S.asaPValue}`,
  steps: [
    {
      key: "check_validity",
      label: "Check the test is trustworthy",
      description: "Before reading any lift, confirm the split, exposure, duration and logging are sound.",
      evidenceCriteria:
        "BEFORE drawing a conclusion from the lift, the candidate checks at least one trust condition against the data: the sample-ratio (actual vs. designed split), whether it ran the planned duration / full weeks, exposure or logging problems, or whether the test was stopped early — AND reaches the right conclusion from it. Looking at an imbalanced split and calling it 'close enough' or 'just noise' when it is far beyond chance is NOT a check: that step is missed. Asking 'was it set up correctly?' without checking anything does not count.",
      nudge: "Before we talk about the lift — how much do you trust these numbers?",
    },
    {
      key: "read_primary_result",
      label: "Read the primary result correctly",
      description: "Effect size with its uncertainty, statistical vs. practical significance.",
      evidenceCriteria:
        "The candidate states the primary metric's effect size (absolute or relative) together with its uncertainty (confidence interval, standard error or p-value) interpreted CORRECTLY — e.g. not 'p = 0.03 means a 97% chance it works' — and judges whether the effect is practically meaningful, not only significant. Asserting 'it's significant' with no interval, standard error or p-value does not count, and neither does reading the lift at face value while the data on screen shows an unresolved trust problem (a sample ratio mismatch, a test stopped at the first significant peek).",
      nudge: "What does the main result tell you, and how sure are you of it?",
    },
    {
      key: "check_guardrails_segments",
      label: "Check guardrails, time and segments",
      description: "Look past the topline: guardrails, the effect over time, and pre-planned segments.",
      evidenceCriteria:
        "The candidate examines at least two of: guardrail metrics, the effect over time (novelty / primacy decay), or pre-specified segments — AND treats unplanned segment 'wins' with skepticism (multiple comparisons) rather than shipping on them.",
      nudge: "Is there anything beyond the headline number you'd want to look at?",
    },
    {
      key: "recommend_decision",
      label: "Recommend a decision",
      description: "Ship, don't ship, or rerun — with the reason and the next step.",
      evidenceCriteria:
        "The candidate commits to ship / don't ship / fix-and-rerun, gives the one or two facts the decision rests on, and names a concrete next step (e.g. debug the assignment and rerun, run two more weeks, ship with a holdout).",
      nudge: "So what would you tell the team to do?",
    },
  ],
};

export const METRIC_DIAGNOSIS_FRAMEWORK: ProcessFramework = {
  key: "metric-diagnosis",
  label: "Metric-change diagnosis",
  source: `${S.interviewQueryDrop}; ${S.aceTheDsInterview}; ${S.exponent}; ${S.simpson}`,
  steps: [
    {
      key: "clarify_change",
      label: "Clarify the change",
      description: "Pin down the metric's definition, the size and timing of the change, and the comparison.",
      evidenceCriteria:
        "Before hypothesizing causes the candidate asks about or states at least two of: how the metric is defined, the size of the change, the comparison period, and whether it was sudden or gradual.",
      nudge: "Before we go looking for causes, what exactly changed?",
    },
    {
      key: "check_data_integrity",
      label: "Rule out a data problem",
      description: "Check logging, pipelines and definition changes before trusting the move.",
      evidenceCriteria:
        "The candidate explicitly asks whether the change could be a measurement artifact — a logging or tracking change, pipeline delay, dashboard/definition change, bot filtering — and how they would check it.",
      nudge: "Is this drop definitely real?",
    },
    {
      key: "internal_external",
      label: "Consider internal and external causes",
      description: "Releases, experiments, marketing, outages vs. seasonality, competitors, holidays, news.",
      evidenceCriteria:
        "The candidate asks about or lists at least one internal cause (release, experiment, pricing, marketing change, outage) AND at least one external cause (seasonality, holiday, competitor, platform/OS change, news).",
      nudge: "What else was going on around that time?",
    },
    {
      key: "segment_and_locate",
      label: "Segment and locate it in the funnel",
      description: "Break the metric down by segment and funnel stage to find where the change lives.",
      evidenceCriteria:
        "The candidate asks to break the metric down by at least one dimension (platform, app version, geography, channel, new vs. returning, cohort) OR by funnel stage, and uses the breakdown to localize the change (names where it is concentrated). Guessing a cause without a breakdown does not count.",
      nudge: "Where is the change actually showing up?",
    },
    {
      key: "hypothesize_and_test",
      label: "Form and test a specific explanation",
      description: "Turn the localized change into a concrete explanation and say what data or query would confirm it.",
      evidenceCriteria:
        "The candidate states a specific causal explanation consistent with the breakdown AND says what data, comparison or query would confirm or rule it out (e.g. 'compare error rates on app version 5.2 vs 5.1 since the release date'), talking through the logic rather than just naming the cause.",
      nudge: "How would you confirm that?",
    },
    {
      key: "recommend_and_size",
      label: "Recommend and size the impact",
      description: "Say what to do now and how big the problem is.",
      evidenceCriteria:
        "The candidate recommends a concrete action (fix, rollback, stop a campaign, re-baseline the dashboard) AND quantifies the impact or the recovery in numbers (users, orders, revenue or percentage points).",
      nudge: "Where does that leave you?",
    },
  ],
};

export const ANALYTICS_FRAMEWORKS: ProcessFramework[] = [
  METRIC_DEFINITION_FRAMEWORK,
  EXPERIMENT_DESIGN_FRAMEWORK,
  EXPERIMENT_READOUT_FRAMEWORK,
  METRIC_DIAGNOSIS_FRAMEWORK,
];

export function getAnalyticsFramework(key: string): ProcessFramework | null {
  return ANALYTICS_FRAMEWORKS.find((framework) => framework.key === key) ?? null;
}
