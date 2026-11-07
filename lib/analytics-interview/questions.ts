/**
 * The data / product-analytics question bank. SERVER-ONLY CONTENT: this file
 * carries interviewer facts, exhibit key insights and strong-answer notes.
 * Import it only from `lib/problem-interview/banks.server.ts` and from
 * scripts — never from `lib/engine/registry.ts`, `lib/interview/types.ts`,
 * `./registration.ts` or anything a client component imports.
 *
 * Fourteen questions in four families (one framework each):
 *   metric-definition   3   define a metric precisely, incl. the query
 *   experiment-design   3   design an A/B test (power math with tolerances)
 *   experiment-readout  4   read results: SRM, novelty, OEC/multiple
 *                           comparisons, p-value meaning and peeking
 *   metric-diagnosis    4   a metric moved: logging artifact, funnel break,
 *                           mix shift (Simpson's), a "good" metric that is bad
 *
 * Companies are fictional. Every number quoted in `strongAnswerNotes` is
 * recomputed from the facts and exhibits by
 * scripts/verify-analytics-interview-bank.ts, and every question with math
 * states a TOLERANCE band so numeric answers are graded against a range, not
 * an exact match.
 */

import type { ProblemQuestion } from "@/lib/problem-interview/types";

import { ANALYTICS_SOURCES as S } from "./sources";

export const ANALYTICS_BANK: readonly ProblemQuestion[] = [
  // -------------------------------------------------------------------------
  // Metric definition
  // -------------------------------------------------------------------------
  {
    id: "da-metric-podcast-success",
    family: "metric-definition",
    frameworkKey: "metric-definition",
    title: "Podcasts in a music app",
    prompt:
      "Tunely is a music-streaming app. Three months ago it added podcasts. How would you measure whether podcasts are a success?",
    interviewerFacts: [
      "Goal (if asked): keep free-tier users coming back — retention — and grow listening time; ad revenue is secondary.",
      "Who uses the metric (if asked): it becomes the podcast team's quarterly goal and goes on the exec dashboard.",
      "Scale (if asked): 40 million monthly active users; podcasts are available to everyone.",
      "Events logged (if asked about data or how to compute): podcast_play_start, podcast_play_30s (30 seconds of continuous listening), episode_complete, follow_show, and app_open — each with user_id and timestamp.",
      "Current team metric (if asked what they track today): podcast play starts per day, about 6 million.",
      "Autoplay (if asked how plays start, or about autoplay): when a music playlist ends the app autoplays a podcast episode; about 40% of play starts come from autoplay.",
      "Music (if asked about cannibalization or music listening): podcast listeners' music hours fell about 10% after they started podcasts; total listening hours rose.",
    ],
    exhibits: [
      {
        id: "ex1",
        title: "Podcast listening, last 28 days",
        kind: "table",
        caption: "Distinct users, out of 40.0M monthly active users",
        columns: ["Measure", "Users"],
        rows: [
          ["Started at least one podcast", "8,000,000"],
          ["Listened 30+ seconds at least once", "5,200,000"],
          ["Completed at least one episode", "2,600,000"],
          ["Listened 30+ seconds on 3 or more days", "1,560,000"],
        ],
        revealWhen:
          "when the candidate asks how many people use podcasts today, or asks for current usage or listening data",
        keyInsight:
          "Only 65% of users who start a podcast listen for 30 seconds (autoplay inflates starts), and habitual listeners (3+ days) are 1.56M = 3.9% of MAU — the play-start count overstates real adoption.",
      },
      {
        id: "ex2",
        title: "Still active the next month, by podcast listening",
        kind: "table",
        caption: "Users active in the last 28 days who were active again in the following 28 days",
        columns: ["Group", "Users", "Retained next month"],
        rows: [
          ["Habitual listeners (30+ s on 3+ days)", "1,560,000", "88%"],
          ["Other listeners (30+ s, 1–2 days)", "3,640,000", "79%"],
          ["No podcast listening", "34,800,000", "71%"],
        ],
        revealWhen:
          "when the candidate asks how podcast listening relates to retention, or how they would check the metric matters for the business",
        keyInsight:
          "Habitual listeners retain 17 points better than non-listeners, but this is correlational: heavy users self-select into podcasts, so the gap overstates podcasts' causal effect — validate with a holdout or a matched comparison.",
      },
    ],
    strongAnswerNotes:
      "Clarifies the goal (retention of free users) and who uses the metric. Walks the journey: discover → start → listen past 30 s → complete → follow/return. Rejects play starts (autoplay, ~40% of starts) as vanity. Primary: share of MAU who are habitual podcast listeners (30+ s listening on 3+ distinct days in 28 days), computed as distinct non-test user_ids with podcast_play_30s on ≥3 distinct dates / distinct MAU, excluding autoplay starts that never reach 30 s. From ex1: 5.2M / 8.0M = 65% of starters listen 30 s; habitual = 1.56M / 40M = 3.9% of MAU (30% of 30-second listeners). Guardrails: music listening hours (cannibalization), premium conversion, ad revenue per user. Validation: the ex2 retention gap (88% vs 71%) is correlational — confirm with a podcast holdout or a matched-cohort comparison and check the metric moves in experiments. " +
      "TOLERANCE: 30-second pass-through strong 60–70%, acceptable 55–75%; habitual share of MAU strong 3.5–4.5%, acceptable 3.0–5.0%. Any defensible primary metric (e.g. weekly podcast listening minutes per MAU) can score well if precisely defined and validated.",
    difficulty: "Beginner",
    source: `${S.aceTheDsInterview} (product-sense metric questions); ${S.northStar}; ${S.igotanoffer}`,
  },
  {
    id: "da-metric-marketplace-health",
    family: "metric-definition",
    frameworkKey: "metric-definition",
    title: "Marketplace health for a services app",
    prompt:
      "TaskNest is a marketplace that connects people with local handypeople. The CEO wants one number for 'marketplace health'. What would you propose?",
    interviewerFacts: [
      "How it works (if asked): a customer posts a job request, taskers send quotes, the customer books one, the job is completed, both sides rate each other.",
      "Revenue (if asked): TaskNest keeps 15% of the value of each completed job; the average completed job is $120.",
      "What the CEO looks at today (if asked): the number of job requests posted.",
      "Abandonment (if asked what happens when nobody quotes): a request with no quote within 24 hours is almost always abandoned.",
      "Footprint (if asked): four cities — Austin, Denver, Phoenix and Tampa.",
      "Supply (if asked about taskers): taskers are independent; tasker sign-ups in Phoenix have been flat while demand grew.",
      "Data (if asked how to compute): tables requests(request_id, customer_id, city, created_at), quotes(request_id, tasker_id, quoted_at), bookings(request_id, tasker_id, booked_at, completed_at, price).",
    ],
    exhibits: [
      {
        id: "ex1",
        title: "Job funnel by city, last 30 days",
        kind: "table",
        caption: "Counts of job requests",
        columns: ["City", "Requests", "Quoted within 24h", "Booked", "Completed"],
        rows: [
          ["Austin", "12,000", "10,200", "7,140", "6,780"],
          ["Denver", "8,000", "6,640", "4,650", "4,420"],
          ["Phoenix", "10,000", "5,500", "3,850", "3,660"],
          ["Tampa", "6,000", "5,040", "3,530", "3,350"],
        ],
        revealWhen:
          "when the candidate asks for data on how requests turn into completed jobs, or asks how the cities compare",
        keyInsight:
          "Overall 18,210 / 36,000 = 50.6% of requests are completed, but Phoenix quotes only 55% of requests within 24h vs ~84% elsewhere; booking (≈70%) and completion (≈95%) rates are the same in every city. Requests — the CEO's metric — hide a supply shortage in Phoenix.",
      },
    ],
    strongAnswerNotes:
      "Clarifies the goal (completed jobs / revenue, satisfied repeat customers and taskers) and that the number must reflect BOTH sides. Maps the journey request → quote → book → complete → rate. Primary: fulfillment rate = completed jobs / job requests in a period (or completed jobs per week with fulfillment rate as its health check), computed from requests left-joined to bookings with completed_at not null, by city and week, deduping re-posted requests. Guardrails: time to first quote, tasker earnings or utilization (supply health), customer rating / repeat rate, cancellations. From ex1: overall 50.6% fulfilled; Phoenix's 24h quote rate is 55% vs 83–85% elsewhere and fulfillment 36.6% vs ~55–56%; booking ≈70% and completion ≈95% are flat, so the gap is supply at the quote step. Sizing: Phoenix at 85% quote rate → 10,000 × 0.85 × 0.70 × 0.95 ≈ 5,650 completed, ≈2,000 more jobs/month, ≈$36k/month more TaskNest revenue (2,000 × $120 × 15%). Validates the metric against repeat bookings / revenue and commits to it. " +
      "TOLERANCE: overall fulfillment strong 49–52%, acceptable 45–55%; Phoenix gap strong 1,800–2,200 jobs/month, acceptable 1,500–2,500; revenue at stake strong $30k–$40k/month, acceptable $25k–$45k.",
    difficulty: "Intermediate",
    source: `${S.aceTheDsInterview} (marketplace metrics); ${S.exponent}; ${S.northStar}`,
  },
  {
    id: "da-metric-wau-definition",
    family: "metric-definition",
    frameworkKey: "metric-definition",
    title: "What counts as a weekly active user",
    prompt:
      "Calmly is a meditation app. Its exec dashboard shows weekly active users, and the board has asked whether that's the right number. How would you define weekly active users, and talk me through how you'd compute it.",
    interviewerFacts: [
      "Tables (if asked about the data): events(user_id, event_name, event_ts, platform, app_version) and users(user_id, created_at, is_test_account).",
      "Current definition (if asked): distinct user_ids with any event in the trailing 7 days.",
      "Event names (if asked): app_open, background_refresh (the phone's OS refreshes the app without the user opening it), push_received, session_start, meditation_start, meditation_complete.",
      "Test accounts (if asked): about 2,000 internal test accounts are flagged in users.is_test_account.",
      "Business goal (if asked): paid subscriptions; users who complete meditations convert and renew far more often.",
      "Time zones (if asked): event_ts is UTC; users are spread across US time zones.",
    ],
    exhibits: [
      {
        id: "ex1",
        title: "Distinct users by event type, last 7 days",
        kind: "table",
        caption: "Distinct user_ids; test accounts excluded",
        columns: ["Event", "Distinct users"],
        rows: [
          ["Any event (current WAU)", "1,200,000"],
          ["Only background_refresh (no other event)", "300,000"],
          ["Only push_received (no other event)", "60,000"],
          ["session_start", "840,000"],
          ["meditation_start", "780,000"],
          ["meditation_complete", "610,000"],
        ],
        revealWhen:
          "when the candidate asks which events drive the current number, or asks for a breakdown of the active users by event",
        keyInsight:
          "360,000 of the reported 1.2M (30%) never opened the app — they only had a background refresh or a push delivered. Users who actually meditated: 780,000, 65% of the reported WAU.",
      },
    ],
    strongAnswerNotes:
      "Clarifies the goal (subscriptions; the board wants a number that tracks real value) and who reads it. Distinguishes passive events (background_refresh, push_received) from value actions (meditation_start / complete). Precise definition: WAU = count of distinct user_id, excluding is_test_account, with at least one meditation_start (or session_start, if 'active' should mean opened) in the trailing 7 full days — SELECT COUNT(DISTINCT e.user_id) FROM events e JOIN users u USING (user_id) WHERE NOT u.is_test_account AND e.event_name = 'meditation_start' AND e.event_ts >= <7 days ago>, with day boundaries fixed in one time zone. From ex1: 300,000 + 60,000 = 360,000 (30%) of the current 1.2M are passive-only; meditating WAU ≈ 780,000 (session-based 840,000). Guardrails/gaming: meditation_start can be gamed by auto-starting sessions — pair it with completion rate or minutes meditated. Validates by showing the new WAU tracks conversion and renewal better than the old one, and commits to it. " +
      "TOLERANCE: passive share strong 28–32% (≈360k), acceptable 25–35%; redefined WAU strong 760k–860k (meditation- or session-based), acceptable 700k–900k.",
    difficulty: "Intermediate",
    source: `${S.aceTheDsInterview} (SQL and metric-definition chapters); ${S.metaLoop}`,
  },

  // -------------------------------------------------------------------------
  // Experiment design
  // -------------------------------------------------------------------------
  {
    id: "da-ab-one-page-checkout",
    family: "experiment-design",
    frameworkKey: "experiment-design",
    title: "One-page checkout test",
    prompt:
      "ShopCart, an e-commerce app, built a one-page checkout to replace its current three-page checkout. How would you design the experiment to decide whether to launch it?",
    interviewerFacts: [
      "Traffic (if asked): about 50,000 users reach the cart page per day.",
      "Baseline (if asked): 20% of users who reach the cart complete a purchase.",
      "Smallest effect worth shipping (if asked): a 5% relative lift, i.e. 1 percentage point (20% → 21%).",
      "Standards (if asked about power or significance): 80% power, 5% significance, two-sided.",
      "Order value (if asked): the average order is $60.",
      "Seasonality (if asked): traffic and conversion are higher on weekends.",
      "Design detail (if asked what changed besides pages): the new checkout hides the promo-code field and gift-wrap option behind a link.",
      "Logins (if asked): most shoppers are logged in and use both the website and the app.",
    ],
    strongAnswerNotes:
      "Hypothesis: fewer pages cut friction, so purchase conversion of cart visitors rises (direction and population stated). Primary: purchase conversion among users who reach the cart (or revenue per cart visitor); guardrails: average order value / revenue per user (promo field hidden), payment errors, page latency, promo usage. Unit: logged-in user (not session or device — users switch between web and app), triggered at first cart visit. Power: n ≈ 16·p(1−p)/δ² = 16 × 0.2 × 0.8 / 0.01² = 25,600 per arm, ~51,000 total ≈ 1–2 days of traffic — but run at least one full week, ideally two, for weekly seasonality and novelty. Decision rule set in advance: ship if conversion lift is significant and ≥ ~1 pp and revenue per user is not significantly worse; pitfalls: peeking/early stopping, SRM check, novelty. " +
      "TOLERANCE: per-arm sample size strong 22,000–30,000 (any standard formula), acceptable 15,000–40,000; duration at least 7 days (strong 14 days); a duration under one week is a miss regardless of sample size.",
    difficulty: "Intermediate",
    source: `${S.kohavi} (ch. 17 power rule of thumb); ${S.emmaDing}; ${S.interviewQueryDrop}`,
  },
  {
    id: "da-ab-surge-pricing",
    family: "experiment-design",
    frameworkKey: "experiment-design",
    title: "Testing a pricing algorithm in a two-sided market",
    prompt:
      "RideLoop, a ride-hailing app, wants to test a new pricing algorithm that lowers surge prices for riders. How would you design the experiment?",
    interviewerFacts: [
      "Goal (if asked): grow completed rides without hurting drivers' earnings per hour.",
      "Footprint (if asked): 40 cities of very different sizes.",
      "Shared supply (if asked how riders and drivers interact): drivers serve every rider in their city — a cheaper ride booked by one rider uses a driver another rider could have had.",
      "Baseline (if asked): about 2 million ride requests a week across all cities; 80% of requests end in a completed ride.",
      "Patterns (if asked): demand follows strong daily and weekly cycles.",
      "Engineering (if asked what is possible): the algorithm can be switched per city and per time window — every 30 or 60 minutes.",
      "Smallest effect worth shipping (if asked): 2% more completed rides per request.",
    ],
    strongAnswerNotes:
      "Hypothesis: lower surge prices raise rider conversion (requests → completed rides) but may lengthen wait times and lower driver earnings. Primary: completed rides per request (or per hour) at the city-window level; guardrails: driver earnings per hour, rider wait time / ETA, cancellations, supply hours. Unit: NOT the rider — riders share drivers, so a user-level split biases the result (treatment riders take drivers from control: interference). Use a switchback (city × 30–60-minute windows, randomized) or city-level clusters; switchback gives far more units. Power: the effective sample is the number of windows, not riders; variance is higher, so plan with cluster-level variance; e.g. 40 cities × 24 hourly windows × 14 days ≈ 13,000 city-hours. Duration: at least two full weeks for daily/weekly cycles; drop a buffer after each switch for carryover. Decision rule: ship if rides per request rise ≥2% with driver earnings per hour not significantly worse; pitfalls: carryover between windows, interference, peeking, SRM by window. " +
      "TOLERANCE: no exact number is expected; credit any design whose unit removes rider-to-rider interference (switchback or geo clusters) with a duration of at least one full week (strong: two). A user-level randomization with no mention of interference cannot reach a strong statistical score.",
    difficulty: "Advanced",
    source: `${S.doordash}; ${S.kohavi} (ch. 22 interference); ${S.emmaDing} (network effects)`,
  },
  {
    id: "da-ab-morning-push",
    family: "experiment-design",
    frameworkKey: "experiment-design",
    title: "Daily morning push notification",
    prompt:
      "Daily Brief is a news app. The team wants to send a 7 a.m. push notification with the top three stories to new users. How would you test it?",
    interviewerFacts: [
      "Traffic (if asked): about 200,000 new users install each week.",
      "Baseline (if asked): 40% of new users are still active on day 7.",
      "Smallest effect worth shipping (if asked): 2 percentage points of day-7 retention (40% → 42%).",
      "Standards (if asked about power or significance): 80% power, 5% significance, two-sided.",
      "Opt-outs (if asked): today about 5% of users turn off notifications in their first month.",
      "Existing alerts (if asked): users already get breaking-news alerts.",
      "Revenue (if asked): ads, earned per daily active user.",
    ],
    strongAnswerNotes:
      "Hypothesis: a daily habit cue increases day-7 retention of new users. Primary: day-7 retention of new users; guardrails: notification opt-out rate, uninstalls, app-store rating, breaking-alert open rate. Unit: new user at install, randomized 50/50. Power: n ≈ 16 × 0.4 × 0.6 / 0.02² = 9,600 per arm (~19,200 total, about a day of installs), but enrollment plus the 7-day observation window means at least two weeks; watch novelty (pushes can lift early and then annoy) — look at retention beyond day 7 / a longer holdout. Decision rule: ship if day-7 retention lift is significant and ≥ ~2 pp with no harm to opt-outs/uninstalls; pitfalls: peeking before every user has had 7 days, SRM, novelty. " +
      "TOLERANCE: per-arm sample size strong 8,000–12,000, acceptable 6,000–15,000; total duration at least 14 days (one week of enrollment plus the 7-day window); fewer than 1,000 per arm, or stopping as soon as p < 0.05, is a statistical error.",
    difficulty: "Beginner",
    source: `${S.kohavi} (ch. 17, 23 novelty); ${S.evanMiller}; ${S.emmaDing}`,
  },

  // -------------------------------------------------------------------------
  // Experiment readout
  // -------------------------------------------------------------------------
  {
    id: "da-readout-onboarding-srm",
    family: "experiment-readout",
    frameworkKey: "experiment-readout",
    title: "Onboarding test with a lopsided split",
    prompt:
      "FitTrack, a fitness app, ran a two-week A/B test of a redesigned onboarding flow with a planned 50/50 split. The team says onboarding completion went up three points and wants to ship. What would you tell them?",
    interviewerFacts: [
      "Duration (if asked): two full weeks, as planned; it was not stopped early.",
      "Split (if asked): planned 50/50, randomized by new user at install.",
      "Primary metric (if asked): onboarding completion — share of assigned users who finish onboarding.",
      "Crash (ONLY if asked about bugs, crashes, Android, or why users are missing): the new flow crashed on older Android versions before the analytics SDK started, so those users were never logged.",
      "Week-1 retention (if asked): the team does not consider it a ship criterion but it is in the results table.",
    ],
    exhibits: [
      {
        id: "ex1",
        title: "Onboarding test — results after 14 days",
        kind: "table",
        caption: "Planned split 50/50",
        columns: ["Variant", "Users assigned", "Completed onboarding", "Completion rate", "Week-1 retention"],
        rows: [
          ["Control", "50,000", "30,000", "60.0%", "35.0%"],
          ["Treatment", "48,600", "30,618", "63.0%", "36.4%"],
        ],
        revealWhen:
          "as soon as the candidate asks to see the results or the numbers",
        keyInsight:
          "Sample ratio mismatch: 48,600 vs 50,000 on a 50/50 design (49.3% vs 50%) — 700 users off an expected 49,300, about 4.5 standard deviations (χ² ≈ 19.9, p < 0.0001). The +3 pp lift cannot be trusted until the missing treatment users are explained.",
      },
      {
        id: "ex2",
        title: "Users assigned, by platform",
        kind: "table",
        columns: ["Platform", "Control", "Treatment"],
        rows: [
          ["iOS", "24,000", "24,050"],
          ["Android", "21,000", "19,500"],
          ["Web", "5,000", "5,050"],
        ],
        revealWhen:
          "when the candidate asks where the missing or uneven users are, or asks for the split by platform or device",
        keyInsight:
          "The shortfall is all Android: 1,500 fewer treatment users (7%). Users who crashed out of the new flow were never logged, so the surviving treatment group is biased toward users who succeed — the lift is likely an artifact.",
      },
    ],
    strongAnswerNotes:
      "Checks trust FIRST: the split is 48,600 vs 50,000 on a 50/50 design. Expected 49,300 each; the 700-user deviation vs a binomial SD of √(98,600 × 0.25) ≈ 157 is ≈4.5 SD (χ² ≈ 19.9, p ≈ 0.00001) — a sample ratio mismatch. Locates it by platform (ex2: Android treatment −1,500) and explains why it biases the result (missing users are the ones who failed). Reads the primary only conditionally: +3.0 pp (60.0% → 63.0%) is not interpretable under SRM. Guardrail/secondary: week-1 retention +1.4 pp is equally suspect. Decision: do not ship on these numbers; fix the Android crash/logging, rerun (or analyze iOS + web only as a directional read), add an automated SRM check. " +
      "TOLERANCE: expected per arm 49,300; deviation 700 (≈1.4% of the treatment arm); any correct test is fine — χ² strong 18–22, or z / SD distance strong 4–5. Calling the imbalance 'small' or 'normal noise', or reading +3 pp as a trustworthy win, is a statistical error.",
    difficulty: "Advanced",
    source: `${S.kohavi} (ch. 21 SRM); ${S.fabijanSrm}; ${S.metaLoop}`,
  },
  {
    id: "da-readout-feed-novelty",
    family: "experiment-readout",
    frameworkKey: "experiment-readout",
    title: "Feed ranking test that fades",
    prompt:
      "Newsfeedly tested a new ranking for its home feed for four weeks. The team reports plus 3.8% sessions per user over the test and wants to ship. What do you make of it?",
    interviewerFacts: [
      "Setup (if asked): users randomized 50/50, about 400,000 per arm; the split matched the design.",
      "Duration (if asked): four full weeks, as planned.",
      "Primary metric (if asked): sessions per user per week.",
      "Pre-registered segments (if asked): new vs. existing users.",
      "New users (if asked what 'new' means): users who installed during the test, so they never saw the old feed.",
    ],
    exhibits: [
      {
        id: "ex1",
        title: "Sessions per user per week, by test week",
        kind: "table",
        caption: "Lift = treatment vs. control; 95% confidence intervals",
        columns: ["Week", "Control", "Treatment", "Lift", "95% CI of lift"],
        rows: [
          ["Week 1", "10.00", "10.90", "+9.0%", "+7.6% to +10.4%"],
          ["Week 2", "10.10", "10.50", "+4.0%", "+2.6% to +5.4%"],
          ["Week 3", "9.90", "10.05", "+1.5%", "+0.1% to +2.9%"],
          ["Week 4", "10.00", "10.05", "+0.5%", "−0.9% to +1.9%"],
        ],
        revealWhen:
          "when the candidate asks how the effect changed over time, or for the results by week",
        keyInsight:
          "The lift decays from +9% to +0.5% (CI includes zero) — a novelty effect. The pooled +3.8% (40.00 vs 41.50 total sessions) is driven by week 1 and is not the lasting effect.",
      },
      {
        id: "ex2",
        title: "Guardrails and pre-registered segment, four weeks pooled",
        kind: "table",
        columns: ["Metric", "Control", "Treatment", "Lift", "95% CI of lift"],
        rows: [
          ["Time spent per user (min/week)", "120.0", "121.2", "+1.0%", "−0.6% to +2.6%"],
          ["'Show less' taps per 1,000 posts", "4.0", "4.6", "+15.0%", "+8% to +22%"],
          ["Week-4 sessions, new users only", "6.0", "6.3", "+5.0%", "+0.8% to +9.2%"],
        ],
        revealWhen:
          "when the candidate asks about guardrail metrics, user satisfaction or negative feedback, or the new-vs-existing breakdown",
        keyInsight:
          "Negative feedback is up 15% (a guardrail breach), time spent is flat, and new users — who have no old habit to be novel against — show a smaller but sustained +5% in week 4.",
      },
    ],
    strongAnswerNotes:
      "Checks trust (split matched, ran the full four weeks). Reads the primary correctly: the pooled +3.8% (41.50 / 40.00) hides a decay from +9.0% to +0.5% with a week-4 CI of −0.9% to +1.9% — novelty; the lasting effect for existing users is roughly zero to +1.5%. Looks past the topline: 'show less' taps +15% (CI +8% to +22%) is a guardrail breach; time spent flat; the pre-registered new-user segment shows +5% in week 4 (CI +0.8% to +9.2%), consistent with a small real effect once novelty is removed. Decision: do not ship as-is on the +3.8%; iterate on what drives 'show less', or consider a new-user launch with a long-term holdout; report the steady-state effect, not the pooled one. " +
      "TOLERANCE: lasting effect for existing users strong 'about 0 to +1.5%' (weeks 3–4), acceptable any statement that the lift decays toward zero; treating +3.8% or +9% as the lasting effect is outside the band.",
    difficulty: "Intermediate",
    source: `${S.kohavi} (ch. 23 novelty and primacy); ${S.kohaviPuzzles}; ${S.emmaDing}`,
  },
  {
    id: "da-readout-free-shipping",
    family: "experiment-readout",
    frameworkKey: "experiment-readout",
    title: "Free-shipping threshold test",
    prompt:
      "BasketBay, an online grocer, tested lowering its free-shipping threshold from $35 to $25 for two weeks. Orders per user went up significantly. Should they roll it out?",
    interviewerFacts: [
      "Setup (if asked): 100,000 users per arm, randomized by user; the split matched the design; ran two full weeks as planned.",
      "Margin (if asked about profit or margin): gross margin on groceries is 30% of order value, before shipping; BasketBay pays shipping on free-shipping orders.",
      "Primary metric (if asked what was pre-registered): the team registered orders per user as primary.",
      "Segments (if asked): the eight segments in the segment table were NOT pre-registered; an analyst cut them after the test.",
      "Other guardrails (if asked about delivery, complaints or satisfaction): delivery times and customer complaints did not change.",
    ],
    exhibits: [
      {
        id: "ex1",
        title: "Topline after two weeks",
        kind: "table",
        caption: "Per user over two weeks; 100,000 users per arm; 95% CIs",
        columns: ["Metric", "Control", "Treatment", "Lift", "95% CI of lift"],
        rows: [
          ["Orders per user", "0.500", "0.520", "+4.0%", "+2.1% to +5.9%"],
          ["Average order value", "$48.00", "$45.12", "−6.0%", "−7.4% to −4.6%"],
          ["Revenue per user", "$24.00", "$23.46", "−2.25%", "−4.6% to +0.1%"],
          ["Shipping cost per order (paid by BasketBay)", "$3.10", "$3.60", "+16.1%", "+13.0% to +19.2%"],
        ],
        revealWhen:
          "as soon as the candidate asks to see the results or the numbers",
        keyInsight:
          "More, smaller orders: orders +4% but order value −6%, so revenue per user is −2.25% (CI just includes zero) and BasketBay pays more shipping per order. Contribution per user falls about 8–9%.",
      },
      {
        id: "ex2",
        title: "Revenue per user lift by segment (cut after the test)",
        kind: "table",
        columns: ["Segment", "Lift", "p-value"],
        rows: [
          ["New users", "+1.2%", "0.48"],
          ["Returning users", "−2.8%", "0.06"],
          ["iOS", "−2.0%", "0.21"],
          ["Android", "−2.6%", "0.14"],
          ["Web", "−2.1%", "0.30"],
          ["Urban", "−3.0%", "0.07"],
          ["Suburban", "−2.4%", "0.18"],
          ["Rural", "+6.0%", "0.04"],
        ],
        revealWhen:
          "when the candidate asks for a breakdown by segment or user type",
        keyInsight:
          "One 'significant' segment out of eight at p = 0.04 is what chance alone produces (8 × 0.05 = 0.4 expected false positives); with a Bonferroni threshold of 0.05 / 8 ≈ 0.006 nothing is significant. The rural win is not evidence.",
      },
    ],
    strongAnswerNotes:
      "Checks trust (split matched, full duration). Reads the result in terms of the right decision metric: orders per user (+4%) is the wrong OEC for a threshold change — revenue and contribution per user are what matter. Revenue per user −2.25% (CI −4.6% to +0.1%). Contribution per user = 30% × revenue − orders × shipping: control 0.30 × $24.00 − 0.500 × $3.10 = $5.65; treatment 0.30 × $23.46 − 0.520 × $3.60 ≈ $5.17; ≈ −8.6%. Segments: the rural +6% (p = 0.04) is one of eight post-hoc cuts — expected by chance; at most a hypothesis for a new pre-registered test. Decision: do not roll out; consider testing a $30 threshold or a minimum basket with contribution per user as the primary metric. " +
      "TOLERANCE: contribution per user strong −7% to −10% (≈ $5.65 → $5.17), acceptable −5% to −12%, or any correct statement that profit per user falls; recommending rollout on orders per user, or on the rural segment, is a judgment error.",
    difficulty: "Intermediate",
    source: `${S.kohavi} (ch. 7 OEC, ch. 17 multiple testing); ${S.aceTheDsInterview}; ${S.igotanoffer}`,
  },
  {
    id: "da-readout-pvalue-peeking",
    family: "experiment-readout",
    frameworkKey: "experiment-readout",
    title: "\"97% chance it works\"",
    prompt:
      "Your PM ran a test of a new onboarding checklist and tells you: 'p equals 0.03, so there's a 97% chance the checklist works — let's ship it.' What would you tell them?",
    interviewerFacts: [
      "Activation (if asked): a user is activated if they complete a first project within 3 days of signing up.",
      "Planned duration (if asked): the test was planned to run 21 days.",
      "Stopping (ONLY if asked how long it ran, when or why it stopped, or whether anyone checked it early): the PM checked the dashboard every day and stopped the test on day 9, the first day p dropped below 0.05.",
      "Split (if asked): 50/50 by new user; the counts matched the design.",
      "Cost (if asked): the checklist is cheap to build and maintain.",
      "History (if asked): past onboarding changes that looked like +1 point often faded on rerun.",
    ],
    exhibits: [
      {
        id: "ex1",
        title: "Onboarding checklist test — as of day 9",
        kind: "table",
        columns: ["Variant", "Users", "Activated", "Activation rate"],
        rows: [
          ["Control", "10,000", "1,200", "12.0%"],
          ["Treatment", "10,000", "1,300", "13.0%"],
        ],
        revealWhen: "as soon as the candidate asks to see the results or the numbers",
        keyInsight:
          "Difference +1.0 pp; standard error ≈ √(0.12·0.88/10,000 + 0.13·0.87/10,000) ≈ 0.47 pp; z ≈ 2.14, p ≈ 0.03; 95% CI ≈ +0.1 to +1.9 pp — barely excludes zero.",
      },
    ],
    strongAnswerNotes:
      "Corrects the interpretation: p = 0.03 is the probability of seeing a difference at least this large IF the checklist had no effect — not the probability that it works (ASA 2016). Checks trust: asks how long it ran — stopped on day 9 of 21 at the first p < 0.05 after daily peeking, which inflates the false-positive rate well above 5%, so the nominal p is not valid. Reads the effect: +1.0 pp (12.0% → 13.0%), SE ≈ 0.47 pp, 95% CI ≈ +0.1 to +1.9 pp — the true effect could be negligible; past +1 pp effects faded. Decision: don't ship on this read; restart and run the planned 21 days (or use a sequential test designed for peeking), then decide; because it is cheap, a ship with a holdout is acceptable only if framed as uncertain. " +
      "TOLERANCE: SE strong 0.44–0.50 pp, acceptable 0.40–0.55 pp; 95% CI strong ≈ +0.1 to +1.9 pp (each end ±0.15 pp), acceptable any CI of half-width 0.8–1.1 pp around +1.0 pp. Endorsing '97% chance it works', or not questioning a test stopped at the first significant day, is a statistical error.",
    difficulty: "Beginner",
    source: `${S.asaPValue}; ${S.evanMiller}; ${S.airbnb}; ${S.metaLoop}`,
  },

  // -------------------------------------------------------------------------
  // Metric diagnosis
  // -------------------------------------------------------------------------
  {
    id: "da-diag-dau-drop",
    family: "metric-diagnosis",
    frameworkKey: "metric-diagnosis",
    title: "Daily active users down 8%",
    prompt:
      "Snapsy, a photo-sharing app, saw daily active users drop 8% this week compared with last week. How would you figure out what happened?",
    interviewerFacts: [
      "Definition (if asked): DAU = distinct users with a foreground app session that day, counted from a client-side session event.",
      "Size and timing (if asked): last week averaged 10.0 million DAU, this week 9.2 million. The drop started Tuesday and has stayed flat since — a step, not a slide.",
      "Releases (if asked about releases, launches or changes): Android app version 5.2 shipped Monday evening and reached all Android users by Tuesday; nothing shipped on iOS or web.",
      "External (if asked): no holidays, no outages reported, no known competitor launch, no marketing changes.",
      "Server side (if asked about other data sources or server metrics): server-side activity — users making API calls, photos uploaded — is down only about 1–2%.",
    ],
    exhibits: [
      {
        id: "ex1",
        title: "Average DAU by platform",
        kind: "table",
        caption: "Millions of users",
        columns: ["Platform", "Last week", "This week", "Change"],
        rows: [
          ["iOS", "5.00", "4.94", "−1.2%"],
          ["Android", "4.50", "3.77", "−16.2%"],
          ["Web", "0.50", "0.49", "−2.0%"],
        ],
        revealWhen: "when the candidate asks to break DAU down by platform or device",
        keyInsight:
          "Almost the whole 0.8M drop is Android (−0.73M, −16%); iOS and web moved about 1–2%.",
      },
      {
        id: "ex2",
        title: "Android users: active on the server vs. counted in DAU",
        kind: "table",
        caption: "Millions of users, daily average",
        columns: ["Android version", "Active server-side", "Counted in DAU"],
        rows: [
          ["All versions, last week", "4.80", "4.50"],
          ["5.2, this week", "3.55", "2.66"],
          ["5.1 and older, this week", "1.20", "1.11"],
        ],
        revealWhen:
          "when the candidate asks for Android by app version, or compares DAU with server-side activity",
        keyInsight:
          "Server-side Android activity is flat (4.80 → 4.75M), but only 75% of active 5.2 users are counted in DAU vs ≈94% before — version 5.2 stopped firing the session event (a logging bug). About 0.67M of the 0.8M drop is measurement; the real change is about −1%.",
      },
    ],
    strongAnswerNotes:
      "Clarifies definition (client session event), size (10.0M → 9.2M), step change on Tuesday. Asks whether it is real before guessing — logging/pipeline/definition — and notices server activity is down only 1–2%. Internal: Android 5.2 shipped Monday; external: none. Segments by platform (ex1: Android −16%), then by app version and server vs. client (ex2). Specific explanation: 5.2 drops the session event on some sessions; confirm by comparing session-event-per-active-user rates by version, or a query of API-active users with no session event, since the release. Recommends: fix the logging in a 5.3 hotfix, annotate/backfill the dashboard from server data, and check crash rates to rule out a real 5.2 problem. Sizing: if 5.2 were counted at the old 93.75% rate, 3.55 × 0.9375 ≈ 3.33M vs 2.66M → ≈0.67M of the 0.8M drop is artifact; the real change is ≈ −1% (normal noise). " +
      "TOLERANCE: artifact strong 0.60–0.75M (75–90% of the drop), acceptable 0.50–0.80M; real underlying change strong −0.5% to −2%. Blaming a competitor or rolling back 5.2 'because users hate it' without the breakdown is a missed diagnosis.",
    difficulty: "Intermediate",
    source: `${S.interviewQueryDrop}; ${S.aceTheDsInterview}; ${S.metaLoop}`,
  },
  {
    id: "da-diag-checkout-funnel",
    family: "metric-diagnosis",
    frameworkKey: "metric-diagnosis",
    title: "Food-delivery orders down 10%",
    prompt:
      "Dashly, a food-delivery app, saw completed orders fall 10% last week compared with the week before. Walk me through how you'd diagnose it.",
    interviewerFacts: [
      "Definition (if asked): an order counts when it is placed and paid.",
      "Size (if asked): 450,000 orders last week vs 500,000 the week before; the drop began on Wednesday.",
      "Data quality (if asked): the pipeline is healthy and restaurant-side order counts match ours.",
      "Changes (if asked about releases or internal changes): a new credit-card payment provider went live on Wednesday; Apple Pay and PayPal were unchanged. No pricing or promotion changes.",
      "External (if asked): weather was normal, no holidays, no competitor promotions that we know of.",
      "Economics (if asked): average order value $32; Dashly keeps 20% of order value.",
    ],
    exhibits: [
      {
        id: "ex1",
        title: "Order funnel, week over week",
        kind: "table",
        columns: ["Stage", "Week before", "Last week"],
        rows: [
          ["App sessions", "5,000,000", "4,950,000"],
          ["Viewed a restaurant menu", "2,500,000", "2,475,000"],
          ["Added to cart", "1,000,000", "990,000"],
          ["Started checkout", "700,000", "693,000"],
          ["Order placed", "500,000", "450,000"],
        ],
        revealWhen: "when the candidate asks for the funnel or for conversion by step",
        keyInsight:
          "Every step converts at the same rate (50%, 40%, 70%) except the last: checkout → order fell from 71.4% to 64.9%. Sessions −1% explains only ≈5,000 orders; the rest is at payment.",
      },
      {
        id: "ex2",
        title: "Checkout completion by payment method",
        kind: "table",
        columns: ["Method", "Checkouts (week before)", "Orders (week before)", "Checkouts (last week)", "Orders (last week)"],
        rows: [
          ["Credit card", "420,000", "294,000", "415,800", "246,060"],
          ["Apple Pay", "210,000", "157,500", "207,900", "155,925"],
          ["PayPal", "70,000", "48,500", "69,300", "48,015"],
        ],
        revealWhen:
          "when the candidate asks to split checkout or payment by payment method",
        keyInsight:
          "Credit-card completion fell from 70.0% to 59.2% while Apple Pay (75%) and PayPal (69.3%) held — the new card provider. At the old 70% card rate there would have been 291,060 card orders: ≈45,000 lost.",
      },
    ],
    strongAnswerNotes:
      "Clarifies definition, size (−50,000, −10%), timing (from Wednesday, sudden). Checks data integrity (pipeline healthy, restaurant counts match). Internal vs external: the Wednesday card-provider switch vs weather/holidays/competitors. Funnel (ex1): top steps convert identically; checkout → order fell 71.4% → 64.9%. Payment method (ex2): card completion 70.0% → 59.2%, others flat. Confirms with payment-provider decline/error codes by provider since Wednesday. Recommends: fail back to the old provider (or fix declines) today; size: ≈45,000 lost orders/week ≈ $1.44M GMV, ≈ $288k/week of Dashly revenue; the remaining ≈5,000 is the 1% dip in sessions. " +
      "TOLERANCE: lost card orders strong 40,000–50,000/week, acceptable 35,000–50,000; Dashly revenue strong $260k–$320k/week, acceptable $200k–$350k (GMV ≈ $1.3M–$1.6M).",
    difficulty: "Intermediate",
    source: `${S.interviewQueryDrop}; ${S.exponent}; ${S.aceTheDsInterview}`,
  },
  {
    id: "da-diag-signup-mix-shift",
    family: "metric-diagnosis",
    frameworkKey: "metric-diagnosis",
    title: "Signup conversion fell from 12% to 9%",
    prompt:
      "LearnLoop, an online-course marketplace, saw its visitor-to-signup conversion fall from 12% to 9% this month. The VP of Growth thinks the new landing page is broken. What do you do?",
    interviewerFacts: [
      "Definition (if asked): signups divided by unique landing-page visitors, monthly.",
      "Landing page (if asked): a new landing page went live for all traffic on the 1st of this month.",
      "Marketing (if asked about marketing or traffic sources): a large paid-social video-ad campaign started this month.",
      "Data checks (if asked): visitor and signup logging and bot filtering are unchanged.",
      "Value (if asked): paid-social signups historically become paying customers at one-third the rate of organic signups.",
    ],
    exhibits: [
      {
        id: "ex1",
        title: "Visitors and signups by channel",
        kind: "table",
        columns: ["Channel", "Visitors (last month)", "Signups (last month)", "Visitors (this month)", "Signups (this month)"],
        rows: [
          ["Organic search", "300,000", "45,000", "300,000", "45,600"],
          ["Direct & referral", "150,000", "13,500", "150,000", "13,800"],
          ["Paid social", "50,000", "1,500", "350,000", "12,600"],
        ],
        revealWhen:
          "when the candidate asks to break conversion or traffic down by channel or source",
        keyInsight:
          "Every channel's conversion held or rose (organic 15% → 15.2%, direct 9% → 9.2%, paid 3% → 3.6%); the blended rate fell because paid social grew from 10% to 44% of visitors — a mix shift (Simpson's paradox). Total signups rose 20% (60,000 → 72,000).",
      },
    ],
    strongAnswerNotes:
      "Clarifies the definition and size (60,000 / 500,000 = 12% → 72,000 / 800,000 = 9%). Checks data integrity (unchanged). Internal vs external: the landing page AND the paid campaign both changed this month. Segments by channel: within-channel conversion is flat or up; the paid-social share of visitors jumped 10% → 43.75%. Explanation: mix shift, not a broken page; confirms by holding the mix fixed — this month's channel rates at last month's mix = 0.6 × 15.2% + 0.3 × 9.2% + 0.1 × 3.6% ≈ 12.2% — or by an A/B holdout of the old page. Recommends: keep the page, report conversion by channel (or mix-adjusted), and judge the campaign on cost per paying customer since paid signups pay at one-third the rate; total signups +12,000. " +
      "TOLERANCE: mix-adjusted conversion strong 12.0–12.5%, acceptable 11.5–13.0%; paid share of visitors ≈ 44% (acceptable 40–47%). Rolling back the landing page without the channel split is a missed diagnosis.",
    difficulty: "Advanced",
    source: `${S.simpson}; ${S.interviewQueryDrop}; ${S.aceTheDsInterview}`,
  },
  {
    id: "da-diag-session-length-up",
    family: "metric-diagnosis",
    frameworkKey: "metric-diagnosis",
    title: "Session length up 15% — good news?",
    prompt:
      "On ShopFinder, a shopping app, average time per session rose 15% this month. The product team is celebrating. Should they be?",
    interviewerFacts: [
      "Definition (if asked): a session is foreground time from app open until 30 minutes of inactivity; average minutes per session.",
      "Size and timing (if asked): 6.0 minutes last month, 6.9 minutes this month; the jump began in the first week of the month.",
      "Logging (if asked): session logging is unchanged; the number of sessions is flat.",
      "Changes (if asked about releases or changes): a new search-ranking model rolled out to everyone at the start of the month.",
      "External (if asked): no holidays or sales events in either month.",
      "Purchases (if asked about orders, conversion or revenue): see the search exhibit — orders are tracked per 100 sessions.",
      "Economics (if asked): about 2 million sessions a month; average order $50.",
    ],
    exhibits: [
      {
        id: "ex1",
        title: "Session length by whether the session used search",
        kind: "table",
        caption: "Each type is half of all sessions in both months",
        columns: ["Session type", "Last month (min)", "This month (min)"],
        rows: [
          ["Used search", "8.0", "9.8"],
          ["Did not use search", "4.0", "4.0"],
        ],
        revealWhen:
          "when the candidate asks to break session length down by segment, behavior or feature used",
        keyInsight:
          "The whole increase comes from sessions that used search (8.0 → 9.8 min); non-search sessions are unchanged.",
      },
      {
        id: "ex2",
        title: "Search behavior and orders",
        kind: "table",
        columns: ["Metric", "Last month", "This month"],
        rows: [
          ["Searches per search session", "2.0", "3.0"],
          ["Searches followed by a product click within 60 s", "60%", "45%"],
          ["Orders per 100 sessions", "4.0", "3.6"],
        ],
        revealWhen:
          "when the candidate asks about search quality, search success, or about orders, conversion or revenue",
        keyInsight:
          "Users search more and succeed less (60% → 45%) and orders per session fell 10% — the longer sessions are friction from a worse ranking model, not engagement.",
      },
    ],
    strongAnswerNotes:
      "Clarifies definition and size (6.0 → 6.9 min, from the first week). Checks it is real (logging unchanged, sessions flat). Internal: new search-ranking model; external: none. Segments: all of the increase is in search sessions (ex1: 8.0 → 9.8; non-search flat at 4.0; (9.8 + 4.0) / 2 = 6.9). Explanation: the ranking model made search worse — more searches per session (2 → 3), lower success (60% → 45%), orders per 100 sessions 4.0 → 3.6 (−10%). Confirms by comparing the old and new model in a holdout/A-B, or query-level success by model version. Recommends rolling back or fixing the model and replacing time-per-session with a success metric (orders or successful searches per session); size: 0.4 fewer orders per 100 sessions × 2M sessions ≈ 8,000 orders/month ≈ $400k/month of sales. " +
      "TOLERANCE: orders per session change strong −9% to −11%, acceptable −8% to −12%; lost orders strong 7,000–9,000/month, acceptable 6,000–10,000 (≈ $350k–$450k sales). Agreeing that the team should celebrate is a judgment error.",
    difficulty: "Advanced",
    source: `${S.aceTheDsInterview} (metric tradeoffs); ${S.kohavi} (ch. 7: metrics that mislead); ${S.exponent}`,
  },
];

export function getAnalyticsQuestion(id: string): ProblemQuestion | null {
  return ANALYTICS_BANK.find((question) => question.id === id) ?? null;
}
