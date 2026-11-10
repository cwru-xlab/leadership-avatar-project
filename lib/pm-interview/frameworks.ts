/**
 * Product-management interview methods the report grades against.
 *
 * Four frameworks, one per question family a FAANG-style PM loop asks:
 *
 *   - `circle`            product design AND product improvement
 *   - `metrics-execution` success metrics and metric-drop diagnosis
 *   - `estimation`        market sizing / guesstimates
 *   - `strategy`          market entry, build/buy/partner, competitive moves
 *
 * Sources (paraphrased, never copied; see docs/interviews/pm-interview-validity.md):
 *   - Lewis C. Lin, "Decode and Conquer: Answers to Product Management
 *     Interviews" (Impact Interview, 4th ed. 2017 / 5th ed.). Origin of the
 *     CIRCLES method (Comprehend, Identify, Report, Cut, List, Evaluate,
 *     Summarize) and the AARM metrics funnel (acquisition, activation,
 *     retention, monetization). Public summaries:
 *     https://productschool.com/blog/skills/circles-framework-guide and
 *     https://lewis-lin-website.pages.dev/posts/what-is-the-aarm-method
 *   - Gayle Laakmann McDowell & Jackie Bavaro, "Cracking the PM Interview"
 *     (CareerCup, 2013) — product-design, metrics, estimation and strategy
 *     question types; "the structure is a means, not an end"; estimation as
 *     "segment, assume, compute, sanity-check".
 *   - Jackie Bavaro & Gayle Laakmann McDowell, "Cracking the PM Career"
 *     (CareerCup, 2021) — product sense as user empathy plus prioritization;
 *     strategy as goal → market → advantage → options.
 *   - Exponent PM course, "How to answer root cause questions" and the
 *     execution intro (https://www.tryexponent.com/courses/analytical/how-to-answer-root-cause-questions,
 *     https://www.tryexponent.com/courses/pm/execution/execution-intro) —
 *     metric-drop diagnosis: validate the data, internal vs external causes,
 *     segment, hypothesize, prioritize.
 *   - Amplitude, "The North Star Playbook" (public, 2019) and Lenny's
 *     Newsletter, "Choosing your North Star metric" (Lenny Rachitsky, 2021):
 *     one north-star metric plus supporting inputs and a counter-metric.
 *
 * The nudges are written to be what a neutral FAANG interviewer actually says
 * when a step is skipped: a short open question that does not name the step,
 * the framework, or the answer. They are never coaching.
 *
 * The user's brief calls the design method "CIRCLE"; Lin's acronym is
 * CIRCLES (the trailing S is "Summarize"). Same seven steps; the key stays
 * `circle` as specified.
 */

import type { ProcessFramework } from "@/lib/problem-interview/types";

/** CIRCLES — product design and product improvement questions. */
export const CIRCLE_FRAMEWORK: ProcessFramework = {
  key: "circle",
  label: "CIRCLES method",
  source:
    "Lewis C. Lin, Decode and Conquer (CIRCLES method); McDowell & Bavaro, Cracking the PM Interview",
  steps: [
    {
      key: "comprehend_situation",
      label: "Comprehend the situation",
      description:
        "Pin down the goal, constraints and context before designing anything.",
      evidenceCriteria:
        "Before proposing any solution the candidate asks at least one clarifying question or states explicit assumptions about the goal (why build this, for whom in the business), the scope (platform, market, timeline) or constraints. Restating the prompt alone does not count.",
      nudge: "Before we go further — what are we actually trying to achieve here?",
    },
    {
      key: "identify_customer",
      label: "Identify the customer",
      description:
        "Name the specific user segments and choose one to focus on, with a reason.",
      evidenceCriteria:
        "The candidate names two or more concrete user segments (by behavior, context or need, not just demographics) AND picks one to focus on with a stated reason (size, pain, strategic fit). A single generic persona ('busy professionals', 'everyone') without a choice does not count as hit.",
      nudge: "Who do you picture using this?",
      genericAnswerTerms: [
        "everyone",
        "everybody",
        "anyone",
        "anybody",
        "all users",
        "all customers",
        "all people",
        "the general public",
      ],
    },
    {
      key: "report_needs",
      label: "Report the customer's needs",
      description:
        "Articulate what the chosen user is trying to get done and where it hurts today.",
      evidenceCriteria:
        "For the chosen segment the candidate states specific needs, jobs-to-be-done or pain points (ideally walking through a moment in the user's day or journey) BEFORE listing features. Features phrased as needs ('they need a vibrating pillow') do not count.",
      nudge: "What's hard for them today?",
    },
    {
      key: "prioritize_needs",
      label: "Cut through prioritization",
      description:
        "Pick the need(s) worth solving first, using explicit criteria.",
      evidenceCriteria:
        "The candidate explicitly ranks or selects among the needs using stated criteria (e.g. frequency × severity, reach, alignment with the goal) and says which one(s) they will design for. Saying 'all of these matter' or silently picking one does not count.",
      nudge: "If you could only tackle one of those, which would it be?",
    },
    {
      key: "list_solutions",
      label: "List solutions",
      description:
        "Generate several distinct ideas for the chosen need, including at least one bold one.",
      evidenceCriteria:
        "The candidate proposes at least three meaningfully different solutions that address the prioritized need (not three variants of one idea), with enough description to picture each.",
      nudge: "What else could you build for that?",
    },
    {
      key: "evaluate_tradeoffs",
      label: "Evaluate tradeoffs",
      description:
        "Compare the ideas on impact, effort, risk and fit before choosing.",
      evidenceCriteria:
        "The candidate compares the solutions against named criteria (user impact, cost/effort, feasibility, risk, business fit) and states at least one real downside of the option they favor.",
      nudge: "How would you choose between those?",
    },
    {
      key: "summarize_recommendation",
      label: "Summarize the recommendation",
      description:
        "Close with what to build, for whom, why, and how success would be measured.",
      evidenceCriteria:
        "The candidate ends with an explicit recommendation that ties back to the chosen user and need, and names how they would know it worked (a success metric or test). A trailing 'so, yeah, that's it' does not count.",
      nudge: "So where do you land?",
    },
  ],
};

/** Metrics and execution — success metrics and metric-drop root cause. */
export const METRICS_EXECUTION_FRAMEWORK: ProcessFramework = {
  key: "metrics-execution",
  label: "Metrics & execution",
  source:
    "Lewis C. Lin, Decode and Conquer (AARM metrics); Exponent root-cause guide; Amplitude North Star Playbook; Lenny's Newsletter",
  steps: [
    {
      key: "clarify_product_goal",
      label: "Clarify the product and goal",
      description:
        "Establish what the product does, who it serves and what the business wants from it.",
      evidenceCriteria:
        "The candidate states or asks what the product/feature is for (its mission or user value) and the business goal before choosing metrics or causes. Asking only 'what is the metric' does not count.",
      nudge: "What is this product meant to do for people?",
    },
    {
      key: "map_user_journey",
      label: "Map the user journey",
      description:
        "Lay out the funnel or key user actions the metrics will measure.",
      evidenceCriteria:
        "The candidate walks through the user's path (e.g. discover → sign up → first value → repeat → pay, or an AARM-style funnel) and uses it to locate where metrics live or where a drop could originate.",
      nudge: "How does someone actually use it, start to finish?",
    },
    {
      key: "define_success_metrics",
      label: "Define success metrics",
      description:
        "Choose one north-star metric plus supporting and counter metrics.",
      evidenceCriteria:
        "The candidate names one primary/north-star metric tied to user value with a reason, at least one supporting metric, AND at least one counter/guardrail metric that would catch harm. For a metric-drop question this is satisfied by stating which metric matters most and why the drop matters.",
      nudge: "How would you know this is going well?",
    },
    {
      key: "diagnose_root_cause",
      label: "Diagnose the cause",
      description:
        "For a change in a metric: validate the data, check internal vs external causes, segment, then hypothesize and prioritize.",
      evidenceCriteria:
        "For a metric-drop question, the candidate (a) checks the data is real (tracking, definition, seasonality, timing), (b) separates internal causes (releases, bugs, experiments, marketing) from external (competitors, news, holidays, platform changes), (c) SEGMENTS the metric (platform, geography, user cohort, funnel stage) to localize the drop, and (d) ranks hypotheses by likelihood and names how to confirm the top one. Skipping segmentation means this step is NOT hit even if a plausible cause is guessed. For a pure success-metrics question with no change to diagnose, mark not_applicable.",
      nudge: "Where exactly is the drop coming from?",
    },
    {
      key: "weigh_tradeoffs",
      label: "Weigh tradeoffs",
      description:
        "Name what the chosen metric or fix could hurt and how to guard against it.",
      evidenceCriteria:
        "The candidate names a concrete tension (e.g. engagement vs. wellbeing, short-term revenue vs. retention, one side of a marketplace vs. the other) and how they would watch or resolve it.",
      nudge: "What could go wrong if you pushed that number hard?",
    },
    {
      key: "summarize_decision",
      label: "Summarize and decide",
      description:
        "Close with a clear decision or next step, not just a list of possibilities.",
      evidenceCriteria:
        "The candidate ends with a crisp summary: the metric set they'd use, or the most likely cause plus the next action (fix, rollback, experiment, investigate further) and what would change their mind.",
      nudge: "What would you do first on Monday?",
    },
  ],
};

/** Estimation — market sizing and guesstimates. */
export const ESTIMATION_FRAMEWORK: ProcessFramework = {
  key: "estimation",
  label: "Estimation",
  source:
    "McDowell & Bavaro, Cracking the PM Interview (estimation questions); Lewis C. Lin, Decode and Conquer",
  steps: [
    {
      key: "clarify_scope",
      label: "Clarify the question",
      description:
        "Agree on exactly what is being estimated: unit, geography, time window.",
      evidenceCriteria:
        "Before computing, the candidate pins down the unit (count, dollars, bytes), geography and time frame, by asking or by stating assumptions out loud.",
      nudge: "What exactly are we counting here?",
    },
    {
      key: "structure_approach",
      label: "Structure the estimate",
      description:
        "Choose a top-down or bottom-up decomposition and segment the population.",
      evidenceCriteria:
        "The candidate lays out the equation or tree BEFORE plugging numbers (e.g. population × share × frequency × price) and segments where segments behave differently (age, region, user type).",
      nudge: "How are you going to break that down?",
    },
    {
      key: "state_assumptions",
      label: "State assumptions",
      description: "Give each number a source or rationale, out loud.",
      evidenceCriteria:
        "Each key input is stated with a short rationale (a known anchor, personal observation or reasoning), not just asserted. Round numbers are fine.",
      nudge: "Where does that number come from?",
    },
    {
      key: "calculate_aloud",
      label: "Calculate aloud",
      description: "Do the arithmetic visibly and correctly.",
      evidenceCriteria:
        "The candidate multiplies through out loud with intermediate results and gets the arithmetic right (order of magnitude correct). Unexplained jumps to a final number do not count.",
      nudge: "Can you walk me through the math?",
    },
    {
      key: "sanity_check",
      label: "Sanity-check against an anchor",
      description:
        "Compare the result with something independent: a known figure, a second method, or a per-user gut check.",
      evidenceCriteria:
        "The candidate checks the answer against an independent anchor (a known company figure, a top-down vs bottom-up cross-check, per-capita or per-user reasonableness against something they know) and adjusts or defends it. Naming the most sensitive assumption, or saying how the answer moves if an input changes, is sensitivity analysis — it belongs to 'Land the answer' and does NOT count as a sanity check.",
      nudge: "Does that number feel right to you?",
    },
    {
      key: "state_answer",
      label: "Land the answer",
      description:
        "Give one clear number with a range and say which assumption matters most.",
      evidenceCriteria:
        "The candidate states a final figure (or tight range) and names the most sensitive assumption or what they'd refine with more time.",
      nudge: "So what's your number?",
    },
  ],
};

/** Product strategy — entry, competition, build/buy/partner. */
export const STRATEGY_FRAMEWORK: ProcessFramework = {
  key: "strategy",
  label: "Product strategy",
  source:
    "Bavaro & McDowell, Cracking the PM Career (product strategy); McDowell & Bavaro, Cracking the PM Interview",
  steps: [
    {
      key: "clarify_goal",
      label: "Clarify the goal",
      description:
        "Establish what winning means for the company here and over what horizon.",
      evidenceCriteria:
        "The candidate asks or states the company's objective for this move (growth, defense, revenue, mission) and the time horizon or constraints before evaluating it.",
      nudge: "What would success look like for the company here?",
    },
    {
      key: "assess_market_customer",
      label: "Assess the market and customer",
      description:
        "Size and segment the market and identify the customer's unmet need.",
      evidenceCriteria:
        "The candidate describes the target customers or segments, their unmet need, and some sense of market size or growth.",
      nudge: "Who's the customer in this market, and what do they lack today?",
    },
    {
      key: "assess_company_competition",
      label: "Assess strengths and competition",
      description:
        "Compare the company's assets and right to win against competitors.",
      evidenceCriteria:
        "The candidate names specific company assets (users, data, distribution, brand, tech) AND the main competitors or substitutes, and reasons about where the company has or lacks an advantage.",
      nudge: "Why would this company win here rather than someone else?",
    },
    {
      key: "generate_options",
      label: "Generate options",
      description:
        "Lay out distinct strategic paths, including doing nothing.",
      evidenceCriteria:
        "The candidate lays out at least two genuinely different options (e.g. build / buy / partner / don't enter; or different segments to enter first).",
      nudge: "What are the different ways the company could go about this?",
    },
    {
      key: "weigh_risks",
      label: "Weigh tradeoffs and risks",
      description:
        "Compare the options on upside, cost, risk and reversibility.",
      evidenceCriteria:
        "The candidate compares options on named criteria and identifies the key risk of the preferred path (cannibalization, regulation, execution, brand) with a mitigation.",
      nudge: "What worries you most about that path?",
    },
    {
      key: "recommend",
      label: "Recommend",
      description:
        "Commit to a recommendation with first steps and how to measure it.",
      evidenceCriteria:
        "The candidate ends with a clear go/no-go or chosen option, the first concrete steps, and how success would be measured.",
      nudge: "So what should the company do?",
    },
  ],
};

export const PM_FRAMEWORKS: Record<string, ProcessFramework> = {
  [CIRCLE_FRAMEWORK.key]: CIRCLE_FRAMEWORK,
  [METRICS_EXECUTION_FRAMEWORK.key]: METRICS_EXECUTION_FRAMEWORK,
  [ESTIMATION_FRAMEWORK.key]: ESTIMATION_FRAMEWORK,
  [STRATEGY_FRAMEWORK.key]: STRATEGY_FRAMEWORK,
};

export function getPmFramework(key: string): ProcessFramework | null {
  return PM_FRAMEWORKS[key] ?? null;
}
