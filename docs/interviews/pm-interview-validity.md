# Product-management interview: validity evidence

The `product-management` preset simulates a FAANG-style PM interview: a short
fit question, one deliberately abstract product problem, then the candidate's
questions. The report grades the process step by step (Hit / Prompted / Missed)
and holistically. This page records where the design comes from, how each part
of a real interview maps to our implementation, what the grading study found,
and what is still missing.

Content: `lib/pm-interview/` (frameworks, question bank, persona, rubric
extras, evaluator addendum). Contract: `lib/problem-interview/types.ts`.

## Sources

Books (paraphrased, not copied):

- Gayle Laakmann McDowell & Jackie Bavaro, *Cracking the PM Interview*
  (CareerCup, 2013). Question types (design, improvement, metrics, estimation,
  strategy); structure is a means, not an end; estimation as segment → assume
  → compute → sanity-check.
- Jackie Bavaro & Gayle Laakmann McDowell, *Cracking the PM Career*
  (CareerCup, 2021). Product sense as user empathy plus prioritization;
  strategy as goal → market → advantage → options.
- Lewis C. Lin, *Decode and Conquer* (Impact Interview; 4th ed. 2017, 5th ed.
  later). Origin of the CIRCLES method (Comprehend the situation, Identify the
  customer, Report the customer's needs, Cut through prioritization, List
  solutions, Evaluate tradeoffs, Summarize the recommendation) and the AARM
  metrics funnel (acquisition, activation, retention, monetization).

Public web sources:

- Product School, "A guide to the CIRCLES framework":
  https://productschool.com/blog/skills/circles-framework-guide
- Lewis C. Lin, "What is the AARM method":
  https://lewis-lin-website.pages.dev/posts/what-is-the-aarm-method
- Exponent, "How to answer root cause questions" and the execution intro:
  https://www.tryexponent.com/courses/analytical/how-to-answer-root-cause-questions,
  https://www.tryexponent.com/courses/pm/execution/execution-intro
- Exponent, Meta RPM interview guide (product sense vs analytical thinking):
  https://www.tryexponent.com/guides/meta-rotational-product-manager-interview
- Prepfully, Meta PM analytical-thinking guide:
  https://prepfully.com/interview-guides/meta-pm-analytical-thinking
- Interview Query, Meta product manager guide:
  https://www.interviewquery.com/guides/meta-product-manager
- Amplitude, *The North Star Playbook* (2019) and Lenny Rachitsky, "Choosing
  your North Star metric" (Lenny's Newsletter, 2021): one north-star metric
  plus supporting inputs and a counter-metric.
- NYC Taxi & Limousine Commission public trip data (benchmark for the NYC
  ride-hail estimate); YouTube's 2017 announcement of 1 billion hours watched
  per day (benchmark for the YouTube estimate).
- Candidate reports on Glassdoor for Google and Meta PM loops (question
  styles only; anonymous and unverified).

Caveat: Google, Meta and Amazon do not publish their PM rubrics. Everything
about "how interviewers grade" comes from prep vendors, books by former PMs
and candidate reports. They agree on the points we rely on.

## Real interview → our implementation → gap

| Real interview element | Our implementation | Gap |
|---|---|---|
| ~45 min round: brief intro/fit, one main question, candidate questions | ~30 min: fit ~4, problem ~22, close ~4 (`PM_STAGE_MINUTES`) | Shorter than a real round; one question only |
| Deliberately vague prompt ("Design an alarm clock for the deaf") | Prompts are one line, ≤30 words, checked by `verify-pm-interview-bank.ts` | None |
| Interviewer answers clarifying questions, otherwise says "your call" | `interviewerFacts` given only when asked; live prompt says "state an assumption" otherwise. Probe 3 checks no unasked leak | The live engine prompt is the engine worker's; ours is interim |
| Data handed over when asked (metric drops) | Exhibits with `revealWhen`; marker `<interview-turn kind="exhibit">`; probe 3 checks reveal only on a breakdown request and no read-out | On-screen rendering is the engine's |
| Neutral probes when a step is skipped ("Who do you picture using this?") | One nudge per step, never naming the step; marker `kind="nudge"`; probe 2 checks | Interviewer may nudge a different skipped step than the one a human would pick first |
| No coaching or praise mid-interview | Persona + live prompt rule; probe 4 checks | None seen in probes |
| Product sense (Meta) / product design (Google) graded on user empathy, insight, creativity | `product_sense` dimension; addendum calls out generic personas and features-as-needs | — |
| Analytical thinking / execution: metrics, root cause, tradeoffs | `analytical_judgment` dimension; metric-drop rule "no segmentation → diagnosis missed, AJ ≤ 2" | — |
| Holistic hire/no-hire, structure necessary not sufficient | Step results + `process_rigor` + two judgment dimensions; addendum: generic content under correct headings is not a hit | No overall hire/no-hire signal (deliberate: practice tool) |
| Interviewer notes which steps needed prompting | `processSteps` statuses hit / prompted / missed / not_applicable | Evaluator infers prompting from the transcript; the engine also records nudge markers, which should win when they disagree |
| Families: design, improvement, metrics, estimation, strategy | 7 / 4 / 4 / 3 / 3 questions, four frameworks | No technical / system-design PM questions, no behavioral leadership round |

## Bank

| Family | Framework | Questions |
|---|---|---|
| product-design | `circle` | alarm clock for the deaf, product for loneliness, refrigerator for a city, elevators for a 100-story building, a wallet, a better way to wait, kitchen product for a first-time cook |
| product-improvement | `circle` | a product you use often, Google Maps, Spotify, LinkedIn for college students |
| metrics-execution | `metrics-execution` | food-delivery orders −12% (exhibit: orders by platform), Stories viewers −6% (exhibit: viewers by region), success of Google Maps, "save for later" A/B readout |
| estimation | `estimation` | Gmail new storage per day, NYC ride-hail trips on a Friday, YouTube hours per day |
| strategy | `strategy` | Netflix and live sports, Spotify concert ticketing, Airbnb year-long rentals |

Difficulty is mixed (Beginner / Intermediate / Advanced in every family except
estimation and strategy, which span all three across the family). Exhibit
arithmetic is recomputed by `scripts/verify-pm-interview-bank.ts` (rows sum to
totals; stated changes match within 0.05 points).

## Validity study

`scripts/verify-pm-interview-grading.ts` grades seven golden transcripts
(`scripts/fixtures/pm-interview/`) through the app's real `runEvaluation`
(gpt-4.1, the strict schema from `buildRubricJsonSchema`, the interim type
record), three runs each, no camera or mic metrics.

| Fixture | Question | Expectation |
|---|---|---|
| (a) strong | alarm clock for the deaf | all 7 CIRCLES steps hit; process ≥ 4 |
| (b) jumps to features | improve Spotify | identify_customer, report_needs, prioritize_needs missed; process ≤ 2 |
| (c) generic persona, no tradeoffs/summary | loneliness | customer, tradeoffs, summary not hit; process ≤ 2; product sense and analytical judgment ≤ 3 |
| (d) needs nudges | improve Google Maps | identify_customer and prioritize_needs prompted; others hit; process 2–3 |
| (e) metric drop, never segments | food-delivery drop | diagnose_root_cause missed; analytical judgment ≤ 2; process ≤ 3 |
| (f) metric drop, strong | food-delivery drop | clarify, journey, diagnose, summarize hit; process ≥ 4 |
| (g) estimation, no sanity check | Gmail storage | sanity_check missed; process ≤ 3 (known gap, see below) |

### Results (final run, 3 runs per fixture)

Scores are `model process_rigor (process_rigor derived from the steps) / product_sense / analytical_judgment`, one cell per run. Step results are per run.

| Fixture | Run 1 | Run 2 | Run 3 | Step verdicts | Expectations |
|---|---|---|---|---|---|
| (a) strong | 5 (5) / 5 / 5 | 5 (5) / 5 / 5 | 5 (5) / 5 / 5 | all 7 hit, 3/3 runs | pass |
| (b) jumps to features | 1 (1) / 2 / 1 | 1 (1) / 2 / 1 | 1 (1) / 2 / 1 | 6 missed (only list_solutions hit), 3/3 | pass |
| (c) generic persona | 3 (1) / 3 / 3 | 3 (1) / 3 / 3 | 3 (1) / 3 / 3 | identify_customer, evaluate_tradeoffs, summarize missed 3/3; prioritize hit or prompted | pass (derived); model score 3 |
| (d) needs nudges | 4 (3) / 5 / 5 | 4 (3) / 5 / 5 | 4 (3) / 5 / 5 | identify_customer + prioritize_needs prompted, rest hit, 3/3 | pass (derived); model score 4 |
| (e) drop, no segmenting | 2 (3) / 2 / 2 | 2 (3) / 2 / 2 | 2 (3) / 2 / 2 | diagnose_root_cause missed 3/3, rest hit | pass |
| (f) drop, strong | 5 (5) / 5 / 5 | 5 (5) / 5 / 5 | 5 (5) / 5 / 5 | all 6 hit, 3/3 | pass |
| (g) estimation, no sanity check | 5 (5) / 5 / 5 | 5 (3) / 5 / 5 | 5 (3) / 5 / 5 | sanity_check missed 2/3, hit 1/3 | known gap |

`npx tsx scripts/verify-pm-interview-grading.ts --runs=3` → ALL PASS, 2 known-gap misses (both from (g) run 1). The previous full 3-run study (before the last nudge-wording edit) gave the same verdicts for (a)–(f), and (g) sanity_check missed in 2 of 3 runs.

Step verdicts were the stable part of the grading. In every default-order run
of the study (four 1–3-run passes while iterating, then the final pass), (a),
(b), (d) and (f) produced the same step statuses; (c) always marked customer,
tradeoffs and summary as not hit; (e) always marked the diagnosis missed.
Judgment dimensions separate the fixtures as intended: product_sense and
analytical_judgment are 5/5 for (a), (d), (f) and 1–3 for (b), (c), (e).

### Finding 1: the model's process_rigor score does not follow its own steps

In every run, gpt-4.1's `process_rigor_score` disagreed with the band its own
`processSteps` imply for (c), (d) and (e): (c) scored 3 with three or four
missed steps (band 1), (d) scored 4 or 5 with two prompted steps (band 3), (e)
scored 2 with one missed step (band 3). Adding "decide the steps first, then
read the score off the bands" to the addendum did not fix it. The likely cause
is that the strict schema emits the `*_score` properties before `outcome`, so
the model commits to a score before writing the step verdicts.

An experiment with the schema reordered so `outcome` comes first
(`--outcome-first`, same model and prompt) made the score agree with the band
for (d) in 3 of 3 runs and for (e) in every run that parsed, but (c) still
scored 2 against a band of 1, (g) was credited with a sanity check in 3 of 3
runs, and `processSteps` came back as an unparseable string twice in 42
gradings (never in the default order). It is not a reliable fix on its own.

**Recommendation (engine):** derive `process_rigor` in code from the parsed
`processSteps` using `PROCESS_RIGOR_SCORING_GUIDE`'s bands, and use the
model's number only when `processSteps` fails to parse. The study's assertions
use that derived value. This needs a small helper beside the guide in
`lib/problem-interview/types.ts` (one statement of the rule, in code), which
is the engine owner's call.

### Finding 2: sensitivity is credited as a sanity check (known gap)

For (g), the candidate never compares the estimate with anything independent;
they only say which assumption matters most and how the answer moves if it
changes. Real interviewers treat that as sensitivity, not a sanity check. The
evaluator still credited it as a sanity check in 2 of the last 6 default-order
runs (and 1 of 3 in the final study),
quoting exactly that line, even after the step criteria, the step label and the
addendum all said it does not count. (g) is marked `knownGap` so the script
reports it without failing.

### Finding 3: the live interviewer needed firmer marker rules

The first live-prompt probe found the interviewer (a) nudged without the
`nudge` marker and (b) read the exhibit out loud ("almost all of the drop is on
Android"), which does the candidate's analysis for them. Making the marker the
mandatory first token of a nudge reply, and limiting the spoken exhibit line to
its title, fixed both. `scripts/verify-pm-interview-live-prompt.ts` passed 3 of
3 runs after the change.

## Remaining gaps

1. `process_rigor` must be derived from steps in code (finding 1).
2. Sanity-check vs sensitivity on estimation (finding 2).
3. `processSteps` travels as a JSON-encoded string inside a strict schema.
   It parsed in every default-order grading but failed once in the
   outcome-first experiment. A structured array property would be safer; that
   is a contract change (`OutcomeFieldKind` is scalar-only).
4. Question selection per session, stage timing, the exhibit display, and the
   Process Steps report panel belong to the engine. Until it lands, the preset
   runs the behavioral interview prompt (see the hand-off notes in the PR).
5. Fixtures are synthetic and written by us. Real student transcripts graded
   by a human PM interviewer would be the stronger test.
6. Only gpt-4.1 was tested, with no camera or mic metrics.
