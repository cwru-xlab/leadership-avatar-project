# Data / product-analytics interview: validity evidence

Preset slug: `data-analytics`. Content lives in `lib/analytics-interview/`. The type is built by the
problem-interview factory `makeProblemInterviewTypeConfig`; see `lib/engine/registry.ts`. The question
bank is server-only and is registered in `lib/problem-interview/banks.server.ts`.

Study dates: 2026-11-06 to 2026-11-07. Evaluator model: `gpt-4.1` (`INTERVIEW_EVAL_MODEL` default).
Live model: `gpt-4.1`.

The grading study was re-measured on **2026-11-07 at commit `dbd25ce`** (engine outcome-first schema
order + the shared `Meets all criteria` and no-nested-quotes rules). Earlier numbers are kept and
labelled as the previous configuration; see §3.

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

### Results — PREVIOUS configuration (2026-11-06: score-first schema, no shared note-prefix rule)

Kept for comparison with the 2026-11-07 re-measurement below. Do not read these as current.

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

### Results — CURRENT configuration (2026-11-07, commit `dbd25ce`)

Configuration being measured, versus the previous block above:
1. **Engine outcome-first** — `buildRubricJsonSchema` now emits the `outcome` object BEFORE the
   `*_score` properties for all five problem interviews. OpenAI strict `json_schema` generates keys in
   schema order, so the model decides the step verdicts first and scores from them.
2. **Two shared grading rules**, previously only in the system-design evaluator, now live in the
   shared problem addendum (`lib/problem-interview/prompts.ts`) and so reached analytics for the first
   time: (a) every step `note` must START with `Meets all criteria: yes.` / `no.`, judged on the
   candidate's own words alone, and the status must agree with the note; (b) never use the
   double-quote character inside `evidenceQuote` or `note`.

Same command as the previous block (`--runs 2`, 6 transcripts, `gpt-4.1`), so the comparison is
apples-to-apples. The `Meets all criteria:` prefix is stripped at render time by
`stripStepNoteGradingPrefix`; the figures below read the STORED raw notes.

| Golden | rigor (derived) | raw model rigor | statistical | business | step patterns | pass | previous |
|---|---|---|---|---|---|---|---|
| checkout-strong | 5–5 | 5, 5 | 5–5 | 5–5 | HHHHH | 2/2 | 2/2 |
| dau-skips-steps | 1–1 | 1, 1 | 1–2 | 2–2 | MMMMMM | 2/2 | 2/2 |
| push-stats-wrong | 2–2 | 2, 2 | 1–1 | 2–2 | HHHMM | 2/2 | 2/2 |
| marketplace-nudged | 3–3 | 4, 3 | 5–5 | 3–3 | HHHPP | 2/2 | 2/2 |
| srm-misread | 1–1 | 1, 1 | 1–1 | 2–2 | MMMM | 2/2 | 2/2 |
| srm-strong | 5–5 | 5, 5 | 5–5 | 5–5 | HHHH | 2/2 | 2/2 |

**Current: 12/12 pass, versus 12/12 previously.** On the headline pass count outcome-first is
**neutral** for analytics — the study was already saturated at 12/12, so there was no headroom. Two
secondary measures did move, both in the right direction:

- **The `srm-misread` residual did not recur.** `check_validity` came back `missed` in both runs
  (previous configuration: it drifted to `prompted` in 1 of 5 final-prompt grades, and about 2 of 7
  across rounds 3–5). Both notes are explicit about why, e.g. run 2: *"Meets all criteria: no. You
  were directly asked about trust in the numbers at [2:40] (after the nudge), and you acknowledged
  the sample size gap but described it as 'just noise' — a material statistical …"*. Two runs cannot
  prove a 1-in-5 residual is gone; it is recorded as **not observed in 2 of 2**, not as fixed.
- **Raw-vs-derived `process_rigor` disagreement fell to 1 of 12** (previous configuration: 2 of 12).
  The single disagreement was `marketplace-nudged` run 1, raw 4 vs. derived 3. Deriving the value in
  code is still load-bearing.

Measured on the raw grading output, across all 12 grades / 58 step objects:

| Measure | Result |
|---|---|
| Step notes starting with `Meets all criteria: yes.`/`no.` | **58 / 58** |
| `processSteps` that failed to parse (report loses every step) | **0 / 12** |
| `processSteps` needing the tolerant repair in `finalizeProblemOutcome` | 1 / 12 (`dau-skips-steps` run 1, `da-diag-dau-drop`; repaired to all 6 steps, graded correctly) |
| Step strings containing a double-quote character | **0 / 58** |
| Non-verbatim evidence quotes | 1 (`srm-strong`, `check_guardrails_segments`, run 1) |

The prefix is therefore reaching analytics as intended, and the no-nested-quotes rule is holding: no
grade was lost to malformed JSON. Candidate quotes inside notes now use single quotes
(`'close enough'`, `'just noise'`), which is exactly what the rule asks for.

### What the study changed (iteration log)

| Round | Result | Change |
|---|---|---|
| 1 (1 run) | 4/6. marketplace-nudged biz = 4 (cap not applied); srm-misread check_validity = prompted after a dismissive reply to the nudge | Named each framework's decision step in the business-judgment cap, and made the cap fire on a server-recorded nudge of that step. Changed `check_validity` criteria to require the *right conclusion* ("close enough" / "noise" = missed). |
| 2 (2 runs, 2 goldens) | marketplace 2/2; srm-misread 0/2: read_primary_result = hit for "definitely significant" with no interval | Changed `read_primary_result` criteria: "it's significant" without SE/CI/p does not count, and neither does reading a lift at face value under an unresolved SRM or peeking. |
| 3 (2 runs, all 6) | 11/12. srm-misread check_validity = prompted once | Added an explicit Q1 example to the addendum: calling a beyond-chance imbalance "noise" is not a trust check, and is missed even after a nudge. |
| 4 (3 runs, 2 goldens) | 5/6. Same residual, once | none |
| 5 (2 runs, all 6), final before `dbd25ce` | 12/12 | none |
| 6 (2 runs, all 6), 2026-11-07, `dbd25ce` | 12/12 | No analytics-content change. Engine outcome-first schema order; the `Meets all criteria` prefix and no-nested-quotes rules moved into the SHARED addendum. Pass count unchanged (already saturated); the `srm-misread` `check_validity` residual did not recur, and raw-vs-derived rigor disagreement fell 2/12 → 1/12 |

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

(Previous configuration, 2026-11-06.) A nudged step that gets a *wrong* answer is sometimes labelled `prompted` instead of `missed`, about
2 of 7 srm-misread grades across rounds 3–5 (1 of 5 with the final prompt). The derived rigor barely moves (one missed step becomes
a prompted one), and the statistical and business scores stay correct. An engine-side rule could
close this, but it would need the note-vs-status consistency to be machine-checkable, which it isn't
today.

**2026-11-07 update.** The shared `Meets all criteria:` rule makes note-vs-status consistency an
explicit instruction, and the residual did **not** recur in 2 of 2 `srm-misread` runs. That is not
enough evidence to call a ~1-in-5 flake fixed, so it stays on the list as a residual to keep
watching; re-measure it on the next round rather than assuming it is closed.

**New residual (2026-11-07), shared-file origin, not analytics-specific.** The shared addendum offers
the model only `yes` / `no` for the note prefix, but the step vocabulary has four statuses. On the
finance study one note came back `Meets all criteria: prompted.` (see
`docs/interviews/finance-validity.md`). `stripStepNoteGradingPrefix` only strips `yes`/`no`, so such a
note would render the grading prefix to the student. Zero of 58 analytics step notes hit this, but the
prompt is shared, so analytics is exposed to the same wording. The fix belongs in
`lib/problem-interview/prompts.ts` and is serialized across all five types by the orchestrator; the
proposed wording is recorded in the finance doc.


### Confirmation run, 2026-11-07, commit `f4359f6` — held at 2/2, no regression

`f4359f6` reworded the shared addendum's step-1 timing rule, named the only two permitted note
openings, and distinguished the double-quote DELIMITER (required) from a double quote inside a value
(forbidden). Re-measured on `marketplace-nudged` only — the golden the reworded rules bite on
(`--only marketplace-nudged --runs 2`, 2 grades):

| Golden | Run | Steps | rigor (raw) | stat | biz | Result | Pre-fix |
|---|---|---|---|---|---|---|---|
| `marketplace-nudged` | 1 | `HHHPP` | 3 (raw 3) | 5 | 3 | PASS | 2/2 |
| `marketplace-nudged` | 2 | `HHHPP` | 3 (raw 4) | 5 | 3 | PASS | — |

**No regression: 2/2, `HHHPP` in both runs**, with `guardrails_and_gaming` and
`validate_and_commit` correctly `prompted` against the nudges at 5:00 and 5:50.

**Counters over the 2 grades (10 step slots):**

| Counter | This run |
|---|---|
| `Meets all criteria:` prefix with a `yes.`/`no.` verdict | 8/10 (**0** say `no.`) |
| Prefix verdict other than `yes.`/`no.` | **2/10** — run 1 `guardrails_and_gaming=prompted`, `validate_and_commit=prompted` |
| Notes saying `no` while the status is not `missed` | 0/10 |
| Steps carrying a double-quote character | 0/10 |
| `processSteps` needing the deterministic repair | 0/2 |
| `processSteps` unrecoverable | 0/2 |
| Raw `process_rigor` != derived-from-steps | 1/2 (run 2, raw 4 vs derived 3 — contained by deriving in code) |

**The new-residual note above is now MEASURED on analytics, and it is NOT closed.** The previous entry
recorded zero of 58 analytics notes hitting the invented `Meets all criteria: prompted.` prefix and
noted analytics was merely *exposed* to the shared wording. On this run it fired: **2 of 10** step
notes opened `Meets all criteria: prompted.` — both of run 1's `prompted` steps, i.e. exactly the
steps the status rule governs. `stripStepNoteGradingPrefix` strips only `yes`/`no`, so both would have
rendered the grading prefix to the student.

So `f4359f6`'s attempt to close this by naming the only two permitted openings did not work on
analytics. The small denominator cuts both ways: 2 grades is not a rate, but the two notes are a
positive observation of the defect, which is stronger evidence than the previous zero-of-58 absence.
Keep it on the list as an open residual and re-measure on the next full round.

Run 2's notes are the shape the reworded rule intended — `Meets all criteria: yes.` on a `prompted`
step, with the timing explained in prose (*"After the nudge, you named several relevant guardrail
metrics…"*). The model is therefore inconsistent run to run rather than uniformly wrong. Analytics
step criteria do not spell out an ordering ("unprompted", "before any analysis"), which is why
analytics avoided the status regression that hit finance and case; see
`docs/interviews/finance-validity.md` and `docs/interviews/case-interview-validity.md`. No shared
file was edited in this run.


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
- **Round 3 (2 runs), 2026-11-07, commit `dbd25ce`:** **14 of 14 passed**, matching round 2. The live
  persona is unchanged by `dbd25ce` (the commit touches the evaluator schema order and the shared
  evaluator addendum, not the live prompt), so this is a no-regression confirmation rather than a new
  result. Both P2 probes carried the `ex1` exhibit marker and read no exhibit values aloud; both P3
  runs emitted the `clarify_change` nudge marker with the same neutral wording ("Before we go looking
  for causes, what exactly changed?") and no banned words; P4 gave the 20% baseline and nothing else;
  P5 did not correct the wrong 500/arm figure and never revealed 9,600. No markers were dropped in
  either run.

Observed in P5: the interviewer asked the candidate to "double-check that sample size, given the
baseline, the minimum effect worth shipping and standard thresholds". This is within the engine's
"ask them to double-check" rule, but it is on the edge of a hint. See the integrator notes.

**2026-11-07:** the same edge persists and got slightly sharper. Run 2's P5 reply was "Could you
double-check how you calculated the sample size needed to detect a 2 percentage point lift with 80%
power and 5% significance? Walk me through your math." That names the power and significance
thresholds back to the candidate. It passes the probe's leak check (it reveals neither 9,600 nor
"too small"), but it hands over two of the three inputs to the formula the candidate is being graded
on. Recorded as a residual on the live prompt, not loosened in the probe.


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
