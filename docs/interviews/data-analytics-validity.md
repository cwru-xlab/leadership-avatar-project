# Data / product-analytics interview: validity evidence

Preset slug: `data-analytics`. Content lives in `lib/analytics-interview/`. The type is built by the
problem-interview factory `makeProblemInterviewTypeConfig`; see `lib/engine/registry.ts`. The question
bank is server-only and is registered in `lib/problem-interview/banks.server.ts`.

Study dates: 2026-11-06 to 2026-11-07. Evaluator model: `gpt-4.1` (`INTERVIEW_EVAL_MODEL` default).
Live model: `gpt-4.1`.

## 1. What the interview is

A product-analytics data-science interview runs about 30 minutes. It has three parts:

1. A short fit question.
2. One analytics problem, reasoned out loud with on-screen data tables. There is no code execution.
3. The candidate's own questions.

It is modeled on Meta's Product Analytics loop. That loop has an *analytical reasoning* round, which
covers metrics, tradeoffs and experiment design with no single right answer. It also has an *analytical
execution* round, which covers statistics, hypothesis testing and statistical intuition over formulas.
The loop is described by Exponent, DataLemur and Prepfully. The same pattern appears in Ace the Data
Science Interview and in Interview Query's metric-drop and A/B guides.

| Family | Framework | Steps | Questions |
|---|---|---|---|
| Metric definition | `metric-definition` | clarify_goal → map_user_value → define_precisely (numerator/denominator/window/filters, query out loud) → guardrails_and_gaming → validate_and_commit | 3 |
| A/B test design | `experiment-design` | state_hypothesis → choose_metrics → randomization_unit → power_and_duration → decision_rule | 3 |
| A/B test readout | `experiment-readout` | check_validity (SRM, duration, peeking) → read_primary_result (effect ± uncertainty, practical significance) → check_guardrails_segments (novelty, post-hoc segments) → recommend_decision | 4 |
| Metric-change diagnosis | `metric-diagnosis` | clarify_change → check_data_integrity → internal_external → segment_and_locate → hypothesize_and_test → recommend_and_size | 4 |

SQL reasoning is graded inside `define_precisely` and `hypothesize_and_test`. Stats intuition is
graded inside `power_and_duration` and `read_primary_result`, and in the `statistical_reasoning`
dimension.

Rubric extras, added on top of the shared four dimensions and the factory's `process_rigor`:
- `statistical_reasoning`: arithmetic, power, uncertainty and trust checks, graded against each
  question's TOLERANCE band.
- `business_judgment`: right metric, guardrails, and a clear, sized decision. It is capped at 3 when
  the decision had to be asked for.

## 2. Bank (14 questions)

All companies are fictional. Every question states a `TOLERANCE:` band in `strongAnswerNotes`.
`scripts/verify-analytics-interview-bank.ts` recomputes every quoted figure from the exhibit cells and
the facts. The run had 305 checks, all passing.

| id | Family | Difficulty | What it tests | Key numbers (checked) |
|---|---|---|---|---|
| da-metric-podcast-success | metric | Beginner | vanity vs. value metric; correlation ≠ causation | 65% 30-s pass-through; habitual = 3.9% of MAU |
| da-metric-marketplace-health | metric | Intermediate | two-sided health metric; supply gap | fulfillment 50.6%; Phoenix quote 55%; ≈2,000 jobs ≈ $36k/mo |
| da-metric-wau-definition | metric | Intermediate | precise WAU + SQL out loud | 360k (30%) passive-only of 1.2M |
| da-ab-one-page-checkout | design | Intermediate | power, unit, guardrails | n = 16·0.2·0.8/0.01² = 25,600/arm; ≥1 week |
| da-ab-surge-pricing | design | Advanced | marketplace interference → switchback | ≈13,000 city-hours |
| da-ab-morning-push | design | Beginner | power, novelty, D7 window | 9,600/arm; ≥14 days |
| da-readout-onboarding-srm | readout | Advanced | sample ratio mismatch | 48,600 vs 50,000; χ² ≈ 19.9; ≈4.5 SD; Android −1,500 |
| da-readout-feed-novelty | readout | Intermediate | novelty decay, guardrail breach | +9% → +0.5%; pooled +3.75%; "show less" +15% |
| da-readout-free-shipping | readout | Intermediate | wrong OEC, multiple comparisons | contribution $5.65 → $5.17 (−8.6%); 1 of 8 segments p<.05 |
| da-readout-pvalue-peeking | readout | Beginner | p-value meaning, peeking | SE ≈ 0.47 pp; z ≈ 2.14; CI ≈ +0.1 to +1.9 pp |
| da-diag-dau-drop | diagnosis | Intermediate | logging artifact | ≈0.67M of the 0.8M drop is measurement |
| da-diag-checkout-funnel | diagnosis | Intermediate | funnel break at payment | card 70.0% → 59.2%; 45,000 orders ≈ $288k/wk |
| da-diag-signup-mix-shift | diagnosis | Advanced | Simpson's paradox / mix shift | mix-adjusted ≈12.2%; paid share 10% → 44% |
| da-diag-session-length-up | diagnosis | Advanced | a "good" metric that is bad | orders/session −10%; ≈8,000 orders ≈ $400k/mo |

The bank script also checks the following:
- Every nudge is a neutral question that names no step, label, method or giveaway word, such as
  "segment", "guardrail" or "power".
- Prompts do not pre-reveal exhibit data.
- `registration.ts`, `live.ts`, `evaluator.ts`, `frameworks.ts`, the engine registry and
  `lib/interview/types.ts` never import the bank.

## 3. Grading validity study

`scripts/verify-analytics-interview-grading.ts` grades six golden transcripts with the registered
evaluator, exactly as production does:
- the same system prompt and strict JSON schema;
- the real `buildProblemEvaluatorBrief`, with nudges and exhibit reveals passed as server events;
- `validateEvaluationResult`, followed by the real `finalizeProblemOutcome` and
  `deriveProcessRigorScore`.

The assertions use the **derived** `process_rigor`, which is the value the report stores.

| Golden | Variant | Expectation |
|---|---|---|
| checkout-strong | strong design | all steps hit; rigor 5; stat ≥ 4; biz ≥ 4 |
| dau-skips-steps | jumps to "the release broke it, roll back" | data-integrity, segment and hypothesis steps missed; rigor ≤ 2; stat ≤ 2; biz ≤ 2 |
| push-stats-wrong | good structure, 500/arm "because CLT", stop at first p < .05, "95% chance it works" | power and decision steps missed; hypothesis and metrics hit; rigor ≤ 2; stat ≤ 2 |
| marketplace-nudged | guardrails and commit only after nudges | those two steps prompted; others hit; rigor = 3; biz ≤ 3 (cap) |
| srm-misread | reads +3 pp, calls 48,600 vs 50,000 "noise" even after the trust nudge, ships | check_validity and read_primary **missed** (not prompted); rigor ≤ 2; stat ≤ 2; biz ≤ 2 |
| srm-strong | catches the SRM, locates Android, rerun | all steps hit; rigor 5; stat ≥ 4; biz ≥ 4 |

### Final results (final prompt, 2 runs × 6 transcripts, gpt-4.1)

| Golden | rigor (derived) | statistical | business | step patterns | pass |
|---|---|---|---|---|---|
| checkout-strong | 5–5 | 5–5 | 5–5 | HHHHH | 2/2 |
| dau-skips-steps | 1–1 | 1–1 | 2–2 | MMMMMM | 2/2 |
| push-stats-wrong | 2–2 | 1–1 | 2–2 | HHHMM | 2/2 |
| marketplace-nudged | 3–3 | 5–5 | 3–3 | HHHPP | 2/2 |
| srm-misread | 1–1 | 1–1 | 2–2 | MMMM | 2/2 |
| srm-strong | 5–5 | 5–5 | 5–5 | HHHH | 2/2 |

The final run passed 12 of 12. The model's raw `process_rigor` differed from the derived value in
2 of 12 grades (push-stats-wrong: raw 1 vs. derived 2), which is why the engine derives it in code.
One evidence quote out of all grades was not verbatim (srm-strong, check_validity, run 2).

Combined with the extra confirmation runs on the two hardest goldens (§4), the final prompt passed
**17 of 18** grades. The one failure was srm-misread, run 3 of the confirmation batch: the model
marked `check_validity` as `prompted`, even though its own note said the candidate had wrongly
dismissed the imbalance. That step's status is the only thing that run got wrong. The derived rigor
(1), statistical score (1) and business score (2) were still correct.

### What the study changed (iteration log)

| Round | Result | Change |
|---|---|---|
| 1 (1 run) | 4/6. marketplace-nudged biz = 4 (cap not applied); srm-misread check_validity = prompted after a dismissive reply to the nudge | Named each framework's decision step in the business-judgment cap, and made the cap fire on a server-recorded nudge of that step. Changed `check_validity` criteria to require the *right conclusion* ("close enough" / "noise" = missed). |
| 2 (2 runs, 2 goldens) | marketplace 2/2; srm-misread 0/2: read_primary_result = hit for "definitely significant" with no interval | Changed `read_primary_result` criteria: "it's significant" without SE/CI/p does not count, and neither does reading a lift at face value under an unresolved SRM or peeking. |
| 3 (2 runs, all 6) | 11/12. srm-misread check_validity = prompted once | Added an explicit Q1 example to the addendum: calling a beyond-chance imbalance "noise" is not a trust check, and is missed even after a nudge. |
| 4 (3 runs, 2 goldens) | 5/6. Same residual, once | none |
| 5 (2 runs, all 6), final | 12/12 | none |

The techniques carried over from the consulting study (`docs/interviews/case-interview-validity.md`)
all held here:
- evidence-first key order, so the verdict follows the note;
- the two-question step test;
- re-checking the arithmetic;
- tolerance bands;
- the cap on the decision score when the decision was asked for.

The PM study's lesson also applied: the model's raw `process_rigor` ignores its own steps, so
assertions use the derived value.

### Residual risk

A nudged step that gets a *wrong* answer is sometimes labelled `prompted` instead of `missed`, about
2 of 7 srm-misread grades across rounds 3–5 (1 of 5 with the final prompt). The derived rigor barely moves (one missed step becomes
a prompted one), and the statistical and business scores stay correct. An engine-side rule could
close this, but it would need the note-vs-status consistency to be machine-checkable, which it isn't
today.

## 4. Live-interviewer probes

`scripts/verify-analytics-interview-live.ts` plays scripted candidate turns against the real live
prompt. That prompt is the engine's `buildProblemInterviewSystemPrompt` with the analytics persona,
plus `buildProblemProgressBlock`, parsed with `parseProblemTurn`.

| Probe | Check |
|---|---|
| P1 ×2 | no volunteered numbers (DAU drop, SRM readout) |
| P2 ×2 | exhibit marker when the breakdown is asked for; exhibit numbers not read aloud (DAU by platform, checkout funnel) |
| P3 | jump to a cause gets a nudge marker, with no banned words ("segment", "logging", "steps", …) and no giveaway numbers |
| P4 | only the fact asked for (baseline 20%, not traffic/MDE/promo) |
| P5 | a wrong sample size (500/arm) is not corrected and 9,600 is not revealed |

- **Round 1 (2 runs):** 11 of 14 passed. Twice the model said "I'm putting the breakdown by platform
  on your screen" with **no exhibit marker**, so in production no table would appear. Once it asked
  the right nudge question **with no nudge marker**. This is the same marker-dropping the PM study saw.
- **Fix:** the analytics persona now says the table only appears when the marker is there, and that
  every reply ends with its markers, including the nudge marker.
- **Round 2 (2 runs):** 14 of 14 passed.

Observed in P5: the interviewer asked the candidate to "double-check that sample size, given the
baseline, the minimum effect worth shipping and standard thresholds". This is within the engine's
"ask them to double-check" rule, but it is on the edge of a hint. See the integrator notes.

## 5. Sources

- Kohavi, Tang & Xu, *Trustworthy Online Controlled Experiments* (Cambridge UP, 2020). Used for OEC
  and guardrails (ch. 7), statistics and the n ≈ 16σ²/δ² rule (ch. 17), sample ratio mismatch
  (ch. 21, pp. 219–225, confirmed on the Cambridge listing), interference (ch. 22) and novelty
  (ch. 23).
- Kohavi et al., "Five Puzzling Outcomes Explained", KDD 2012.
- Fabijan et al., "Diagnosing Sample Ratio Mismatch in Online Controlled Experiments", KDD 2019.
- Singh & Huo, *Ace the Data Science Interview* (2021); datalemur.com.
- Meta Product Analytics loop, as described by:
  - [Exponent](https://www.tryexponent.com/guides/meta-data-scientist-interview)
  - [DataLemur](https://datalemur.com/blog/meta-data-scientist-interview-guide)
  - [Prepfully](https://prepfully.com/interview-guides/meta-ds-analytical-execution)
  - [Interview Query](https://www.interviewquery.com/interview-guides/Facebook-Data-Scientist)
- Interview Query:
  - [metric-drop framework](https://www.interviewquery.com/p/metrics-drop-data-science-interview)
  - [A/B 6-step guide](https://www.interviewquery.com/p/how-to-answer-ab-testing-interview-questions)
- Emma Ding (Data Interview Pro), A/B testing interview guides (Towards Data Science, 2020–21).
  These were not re-located online during this study and are cited from prior knowledge.
- Exponent, Data Science course; IGotAnOffer, data-science interview guides.
- Evan Miller, "How Not To Run an A/B Test" (2010), on peeking. Airbnb, "Experiments at Airbnb" (2014).
- DoorDash Engineering, "Switchback Tests and Randomized Experimentation Under Network Effects" (2018).
- Wasserstein & Lazar, ASA Statement on p-Values (2016).
- Bickel, Hammel & O'Connell (1975), on Simpson's paradox.
- Amplitude, North Star Playbook; Lenny Rachitsky, "Choosing your North Star metric".

The step lists are industry conventions documented in practitioner guides. There is no academic
validation of the steps themselves, so validity rests on alignment with how these interviewers say
they grade, plus the golden-transcript study above.

## 6. How to re-run

```
npx tsx scripts/verify-analytics-interview-bank.ts
npx tsx --env-file=.env.local scripts/verify-analytics-interview-grading.ts --runs 2
npx tsx --env-file=.env.local scripts/verify-analytics-interview-live.ts --runs 2
```
