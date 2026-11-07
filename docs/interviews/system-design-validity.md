# System design interview: validity evidence

Preset slug: `system-design`. It is a problem interview built on `lib/problem-interview/`. Content lives in `lib/system-design-interview/`.

## What it is

A **verbal** system design interview that runs about 35 minutes:

- a fit question (about 3 minutes);
- one problem, worked out loud (about 28 minutes);
- the candidate's questions (about 4 minutes).

There is no whiteboard. The research report ranked a canvas as the most expensive new capability and deferred it. Without one:

- the candidate describes components and walks requests through them in words;
- the numbers arrive as on-screen exhibits: usage forecasts, traffic and budget sheets, SLOs, and dashboards.

Real loops run 45–60 minutes at a whiteboard (Xu, Vol. 1, ch. 3). This simulation is shorter and has no diagram, so it practices the conversation, not the drawing.

## Sources

The full citations are in `lib/system-design-interview/sources.ts`. All bank content is paraphrased. Product names, numbers and exhibits are original.

| Source | Used for |
|---|---|
| Alex Xu, *System Design Interview*, Vol. 1 (2020) | The 4-step process: scope → high-level design → deep dive → wrap-up. Ch. 2 back-of-envelope method ("the process matters more than the result"). Ch. 4 rate limiter, ch. 8 URL shortener, ch. 10 notifications, ch. 11 news feed, ch. 12 chat. |
| Xu & Lam, Vol. 2 (2022) | Ch. 10 leaderboard; ch. 7 reservations and contention |
| Kleppmann, *Designing Data-Intensive Applications* | What "scaling and reliability tradeoffs" means: replication (ch. 5), partitioning (ch. 6), transactions (ch. 7), consistency (ch. 9) |
| donnemartin/system-design-primer | Use cases and constraints → high-level → core components → scale. Estimation tables. Jeff Dean's latency numbers. |
| Hello Interview delivery framework | Requirements (functional and non-functional) → core entities → API → high-level → deep dives. Estimate when it changes a decision. Ticketmaster breakdown. |
| Meta Careers SWE prep | Split between "system design" and "product architecture" rounds, which became our feature-design family |
| Google Careers "How we hire" | Think aloud, clarify ambiguity, state tradeoffs |
| Google SRE book, ch. 12, 14, 15, 22; SRE Workbook | Incident family: triage and mitigate before root cause, examine, diagnose, test; postmortems; cascading failures and SLO error budgets |
| Brendan Gregg, USE method | Incident signal gathering |

## Frameworks (steps the report grades)

| Framework | Steps |
|---|---|
| `system-design` (7) | clarify_requirements → estimate_scale → api_data_model → high_level_design → deep_dive → scaling_tradeoffs → wrap_up |
| `feature-design` (6) | clarify_scope → api_design → data_model → client_server_flow → edge_cases → tradeoffs_wrap_up |
| `incident-debug` (6) | assess_impact → mitigate_first → gather_signals → form_hypotheses → root_cause → prevent_recurrence |

Every step has evidence criteria written for the evaluator and a neutral spoken nudge. Each nudge:

- is at least 12 characters long, which the engine's verbatim marker fallback needs;
- never names a step, the method or an answer term.

The bank script checks a list of banned words (requirement, estimate, tradeoff, bottleneck, API, cache, shard, mitigate, root cause and others).

## Bank (12 questions)

Difficulty maps to candidate level:
- **Beginner**: intern or new grad
- **Intermediate**: new grad to early career
- **Advanced**: mid-level (L4/E4–L5/E5)

| id | Family | Level | Key math (reference) | Tolerance |
|---|---|---|---|---|
| sd-url-shortener | system-design | Beginner | ≈460 writes/s; ≈11,600 reads/s; 35k peak; 73B links; 36.5 TB; 7 base-62 chars | strong ±50%, acceptable 3× |
| sd-game-leaderboard | system-design | Beginner | ≈580 updates/s (2,900 peak); 230 reads/s; 2.5 GB, fits in memory | same |
| sd-api-rate-limiter | system-design | Intermediate | counters 50 MB vs sliding log 800 MB (16×); 2.5 req/min per gateway if split | same |
| sd-notification-service | system-design | Intermediate | ≈185/s average; 3,300/s push campaign; SMS 83 min > 1 h at 100/s; 1.44 TB log | same, and the SMS conclusion must be right |
| sd-news-feed | system-design | Advanced | 1,160 posts/s; 23k reads/s; 350k fan-out inserts/s; 800 GB feed cache | same |
| sd-ticket-booking | system-design | Advanced | 3,300 arrivals/s; 67k req/s; ≤12,500 orders | same |
| fd-threaded-comments | feature-design | Beginner | (optional) 350 writes/s; 5,800 reads/s | estimation optional; null if absent |
| fd-event-waitlist | feature-design | Beginner | (optional) 33 RSVPs/s; the problem is the last-seat race | same |
| fd-read-receipts | feature-design | Intermediate | 83k per-message receipts/s vs 6,900 watermark updates/s (12×) | strong ±50%, acceptable 3× |
| inc-disk-full | incident | Beginner | overall errors ≈9.7%; disk filled 78 GB at ≈8.7 GB/h | same |
| inc-checkout-latency | incident | Intermediate | N+1: 40 extra queries = 4 × 10 items; error budget 43.2 min < 45 min burned | same |
| inc-cache-stampede | incident | Advanced | DB load 2,000 → 20,000/s = 2.5× the 8,000/s capacity; retries amplify it | same |

The system-design family covers all three levels. Selection honors the customization difficulty through `selectProblemQuestion`.

`scripts/verify-system-design-bank.ts` checks the bank without calling an API. It:

- recomputes every quoted figure from the exhibit cells, so editing a cell without updating the notes fails;
- checks the structure, nudge wording and registration.

It reports **ALL PASS** across 12 questions.

## Rubric

The engine provides:
- the shared dimensions `content`, `behavioral`, `vocal` and `visual`;
- `process_rigor`, which the engine derives from the steps.

The type adds:
- `technical_depth`;
- `tradeoff_reasoning`;
- `quantitative`, which deliberately reuses the consulting key and label so that one competency covers estimation.

Hard caps tie each "capped" score to a named decision step:

| Condition | Cap |
|---|---|
| estimate_scale missed | quantitative ≤ 2 |
| No math at all | quantitative = 1 |
| scaling_tradeoffs or tradeoffs_wrap_up missed | tradeoff ≤ 2 |
| scaling_tradeoffs or tradeoffs_wrap_up prompted | tradeoff ≤ 4 |
| deep_dive missed | depth ≤ 3 |
| root_cause prompted | depth ≤ 4 |
| root_cause missed | depth ≤ 2 |

## Grading validity study

`scripts/verify-system-design-grading.ts` uses the real registered type. Each grade goes through:

1. the real evaluator prompt;
2. gpt-4.1 with the strict schema;
3. the engine's `buildProblemEvaluatorBrief`, with nudges and exhibit reveals as server events;
4. `validateEvaluationResult`;
5. `finalizeProblemOutcome`;
6. process_rigor **derived** by `deriveProcessRigorScore`, as the runner stores it.

Assertions are made on the derived value.

### Golden transcripts

There are seven. All are the URL shortener except the last.

| id | What it tests | Expectation |
|---|---|---|
| url-strong | every step unprompted; math in the strong band | all hit; rigor 5; quant, tradeoff and depth ≥ 4 |
| url-boxes | jumps to "LB, Redis, Cassandra, Kubernetes" with no requirements and no sizing | rigor ≤ 2; quant, tradeoff and depth ≤ 2; clarify, estimate, scaling and wrap missed |
| url-no-math | strong design, never sizes it even with the exhibit on screen | estimate missed; rigor ≤ 3; quant ≤ 2 |
| url-handwave | sizes it, then "add caching and sharding, it'll scale"; deep-dive and scaling nudges get thin replies | deep_dive and scaling **missed** (not prompted); rigor ≤ 2; tradeoff ≤ 2 |
| url-nudged | needs nudges for requirements, sizing and wrap-up, then does each fully | those 3 prompted, others hit; rigor = 2 |
| url-slip | reports 4,600 writes/s (10× high) and builds on it | estimate missed; quant ≤ 2; rigor ≤ 3 |
| incident-checkout | strong, but mitigation needed a nudge | mitigate prompted, others hit; rigor = 4; quant ≥ 4 |

### Results (gpt-4.1, 2 runs each, 2026-11-07)

**Final configuration, with the outcome generated before the scores: 14/14 pass.** Measured with the study's `--outcome-first` flag; that flag is gone, because `buildRubricJsonSchema` now emits this order for every problem interview and the script logs the engine's own order instead.

| Golden | Run 1: rigor / quant / trade / depth, steps | Run 2 |
|---|---|---|
| url-strong | 5 / 5 / 5 / 5 HHHHHHH | 5 / 5 / 5 / 5 HHHHHHH |
| url-boxes | 1 / 1 / 1 / 1 MMMMMMM | 1 / 1 / 1 / 1 MMMMMMM |
| url-no-math | 3 / 2 / 5 / 5 HMHHHHH | 3 / 2 / 5 / 5 HMHHHHH |
| url-handwave | 1 / 5 / 2 / 3 HHHHMMM | 1 / 5 / 2 / 3 HHHHMMM |
| url-nudged | 2 / 5 / 5 / 5 PPHHHHP | 2 / 5 / 5 / 5 PPHHHHP |
| url-slip | 3 / 2 / 5 / 5 HMHHHHH | 3 / 2 / 5 / 5 HMHHHHH |
| incident-checkout | 4 / 5 / 4 / 5 HPHHHH | 4 / 5 / 4 / 5 HPHHHH |

- The model's own process_rigor disagreed with the value derived from its steps in **6/14** grades. Deriving the score is necessary.
- Non-verbatim evidence quotes: 0.

**Stock schema order (scores generated before the outcome): 11/14 pass.** No longer reachable from the script — it is the pre-change engine order, kept here as the recorded comparison.

| Golden | Run 1 | Run 2 |
|---|---|---|
| url-handwave | FAIL: deep_dive and scaling marked **prompted** after thin replies (rigor 3) | PASS (HHHHMMM, rigor 1) |
| url-slip | FAIL: **estimate hit, quant 5**; the 10× slip was excused | FAIL: same |
| Others | PASS | PASS |

- The model's own rigor disagreed with the derived value in 5/14 grades.

### What the study changed

The type-specific fixes are in `lib/system-design-interview/evaluator.ts`; fixes 2 and 3 turned out to be generic to every problem interview and now live in the shared addendum in `lib/problem-interview/prompts.ts` (`PROBLEM INTERVIEW — ADDITIONAL RULES`), stated once, with the SD addendum keeping only what is system-design specific.

1. **Arithmetic first, compared against the bands.** The model recomputed 40M ÷ 86,400 ≈ 463 correctly, then still called 4,600 "within 3×". It now writes `band 150–1,400/s, candidate 4,600/s → OUTSIDE` for each key figure. It is told that 10× is always outside the band and is never excused as a "rounding slip". System-design specific (it names `estimate_scale` and the reference bands); stays in `evaluator.ts`.
2. **A mechanical status rule.** Each note starts with `Meets all criteria: yes|no`, judged on the candidate's words alone. "No" means missed, even after a nudge. The model had been reading "prompted" as "said something after a nudge" while its own note said "partial". **Now shared** — every problem interview gets it.
3. **No double quotes inside processSteps strings.** Before this rule, 3/14 outcome-first grades returned invalid JSON in `processSteps` because quotes were nested inside the JSON-encoded string, and the report would have lost every step. **Now shared** — the `OUTCOME` section of the shared addendum states it.
4. **Hard caps tied to named steps** (see the rubric table above). Without them, url-no-math scored quant 4–5 with no math at all. System-design specific; stays in `evaluator.ts`.
5. **Generate the outcome before the scores (engine change).** This made the remaining difference: in stock order, url-slip failed 2/2 even with fixes 1–4. With strict `json_schema`, keys are generated in schema order, and the stock order emits all `*_score` fields before `outcome.processSteps`. The model commits to scores, then rationalizes the steps to match them. **Landed in the engine** for every problem interview — see Integrator TODO 1.

The `Meets all criteria:` prefix is a grading mechanism, not coaching: the report strips it at render time in `stripStepNoteGradingPrefix`, called from `buildProcessStepViews` (the one join every render path uses). The stored outcome keeps the raw note.

## Live-prompt probe

`scripts/verify-system-design-live.ts` uses the real `buildProblemInterviewSystemPrompt` and `buildProblemProgressBlock` with gpt-4.1. It parses each reply with `parseProblemTurn` and applies the engine's `inferUnmarkedActions` fallback, as the chat route does.

**Final result: 10/10 probe runs pass (5 probes × 2).**

| Probe | Result |
|---|---|
| P1 candidate asks for time | "Take your time." with no numbers, exhibit or hint (2/2) |
| P2 asks about traffic | `ex1` marker without reading the numbers (2/2) |
| P3 jumps to components | verbatim clarify nudge (2/2): 1 with an explicit marker, 1 repaired by the verbatim fallback |
| P4 incident: asks start time | only "14:05" (2/2) |
| P5 asks for a latency dashboard | `ex1` marker without interpreting it (2/2) |

**Earlier failures and their fixes.** The fixes are content-only, in the persona and the exhibit titles.

- **A false exhibit reveal.** "Let me know if you have questions about … expected usage" matched the exhibit **title** "Expected usage", and the fallback revealed it. All exhibit titles are now distinctive, for example "Usage forecast, year one".
- **Hints.** In P1 the interviewer offered "clarify the key requirements". The persona now says to reply only "Take your time."
- **Paraphrased nudges with no marker.** In P3, run 2, the interviewer asked "why hash-based links?" instead of nudging. The persona now asks for the exact nudge wording, before any "why that?".

**Known residual.** One P2 reply added "use these to size load and storage". That is a mild hint; the probe does not flag it.

## Integrator TODOs

1. ~~**Engine: generate the outcome before the scores in the rubric JSON schema** for problem interviews (`buildRubricJsonSchema`).~~ **Done** (`loop/case-pm-integration`, this commit): `buildRubricJsonSchema` emits `outcome` as the first property and the first `required` entry for every problem interview — consulting, product-management, data-analytics, finance and system-design. Every other type keeps `outcome` last, byte-identical. `scripts/verify-rubric-schema-order.ts` proves both against `scripts/fixtures/rubric-schema-order.json` (per-type property order, `required` order and a SHA-256 of the pre-change bytes); for a problem interview it moves `outcome` back to last and requires the digest to match, so the change is provably a pure reorder. The evidence is the stock vs outcome-first comparison above (11/14 vs 14/14). Still unmeasured for case, PM, finance and analytics — the grading-study workers own that.
2. **Engine (optional):** make `processSteps` a structured array in the schema instead of a JSON string inside JSON, so nested quotes cannot corrupt it. Open. The prompt-level no-double-quotes rule (study fix 3) is now in the shared addendum, and `lib/problem-interview/outcome.ts`'s tolerant parse still reads fields by name when a quote slips through, so this is a hardening, not a fix.
3. **Engine (optional):** an exhibit-title match in `inferUnmarkedActions` could also require a "screen" phrase.
4. **Engine (optional):** the factory has no `postProcessScores` hook. The extra-dimension caps above are prompt-only. A deterministic cap, such as quant ≤ 2 when the step tagged as estimation is missed, would need one.
5. ~~**Mastery:** map `technical_depth` and `tradeoff_reasoning` (and the existing `quantitative` and `process_rigor`) in `lib/mastery/competencies.ts`.~~ **Done** in merge b168d09: both are grouped under `credibility_of_the_case`.
6. ~~**Picker:** `loop/interview-picker` already has the `system-design` icon (`Network`) and tagline. The `PresetCard` icon on this branch can be dropped if the picker replaces it.~~ **Done** in merge b168d09: `components/interview/interviewPicker.ts` carries the `Network` icon and tagline, and `PresetCard.tsx` stayed deleted.
7. **Whiteboard:** deferred. When it exists, the `high_level_design` criteria should accept a diagram plus narration.
