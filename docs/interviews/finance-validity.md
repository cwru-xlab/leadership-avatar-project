# Finance interview: validity

How the `finance` preset (investment banking, private equity, equity research) compares with a real finance interview, and how well its report grades the process and the numbers. Content lives in `lib/finance-interview/`. The machinery (live prompt, markers, exhibits, report panels, derived `process_rigor`) is the problem-interview engine (`lib/problem-interview/`, branch `loop/problem-engine`, merged into this branch).

## Sources

Retrieved 2026-11-06. Code comments cite the same list (`lib/finance-interview/sources.ts`). All companies and figures in the bank are fictional and original; guide content is paraphrased.

| Source | What we took from it |
|---|---|
| Wall Street Prep, [The Paper LBO: practice exercises](https://www.wallstreetprep.com/knowledge/the-paper-lbo-practice-exercises-to-ace-the-private-equity-interview/) | Paper LBO order: purchase TEV = EBITDA × multiple, sources & uses with equity as the plug, FCF = NI + D&A − capex − ΔNWC, exit TEV − net debt, MOIC, IRR. Rule of 72 / 115. Round to easy numbers |
| Wall Street Prep, IB accounting questions ("$10 increase in depreciation") | State the tax rate first, then income statement → cash flow → balance sheet |
| Breaking Into Wall Street, IB interview guide / 400 questions | Accounting walk-throughs, EV vs. equity value, valuation methods, DCF, merger model, LBO question types |
| Mergers & Inquisitions, [How to pitch a stock](https://mergersandinquisitions.com/bank-stock-pitch) | Recommendation first; company background; 2–3 points the market misprices; hard catalysts in 6–12 months; base / upside / downside valuation; risks and mitigants. Interviewers probe the variant view, catalyst timing, valuation inputs and what would make you wrong |
| Mergers & Inquisitions, IB / PE interview guides | "Walk me through a deal", market questions, fit + technicals format |
| Rosenbaum & Pearl, *Investment Banking* (3rd ed., 2020) | Comps, precedents, DCF, LBO analysis and returns drivers, accretion / dilution |
| Vault career guides (IB / finance interviews) | Interview format: first round, Superday |
| CFA Institute Research Challenge, judge guidelines | Pitch criteria: thesis vs. peers, financial analysis, valuation, investment risks, Q&A handling |
| Internal research memo §3.7 Finance | Format, frameworks, need for numeric-band grading |

## Content

- **Frameworks** (`lib/finance-interview/frameworks.ts`), each step with evidence criteria and a neutral nudge phrased as a question:
  - `finance-technical` (5): state the assumptions, trace it in order, put numbers on each line, check it ties, explain the intuition.
  - `finance-paper-lbo` (6): confirm the inputs, entry price and funding, project cash flow and paydown, exit value and equity, MOIC and IRR, sanity-check and name the drivers.
  - `finance-stock-pitch` (6): lead with the call, company snapshot, thesis vs. the market, catalysts, valuation behind the target, risks and what would change your mind.
  - `finance-market-deal` (6): pin down the question, lay out the facts, strategic and financial rationale, run the numbers, the other side, land a view.
- **Bank** (`lib/finance-interview/questions.ts`, server-only, registered in `lib/problem-interview/banks.server.ts`) has 14 questions:
  - 5 technicals: $10 of depreciation; debt-funded equipment after one year; EV vs. equity value bridge (exhibit); walk me through a DCF + terminal value; valuation methods + comps (exhibit).
  - 3 paper LBOs, all with exhibits: five-minute LBO (Beginner, 2.5× / ≈20%); Harbor Foods with year-by-year FCF (Intermediate, ≈2.9× / ≈24%); Crestline with fees and multiple contraction (Advanced, ≈1.2× / ≈5%; the point is that the deal fails).
  - 3 stock pitches: your own long; your own short; buy-or-short a fictional tear sheet (Cobalt Trail, target ≈ $61 via an EPS bridge, or a reasoned short).
  - 3 market / deal: accretion / dilution stock vs. debt (exhibit); higher rates and the LBO market; walk me through a deal (with a hypothetical fallback).
  - Every question states a **TOLERANCE** band in `strongAnswerNotes` (e.g. Harbor: MOIC 2.8–3.0× and IRR 22–26% strong; 2.6–3.2× / 20–28% acceptable; named errors such as ignoring interest or IRR = MOIC ÷ years are outside). Candidate-choice pitches and deals are graded on internal consistency only, since the evaluator cannot verify live market data.
  - `scripts/verify-finance-interview-bank.ts` recomputes every figure (171 checks, all pass): each LBO's entry, paydown, exit equity, MOIC and IRR; that every benchmark sits inside its own strong band; that each named error lands outside the acceptable band; DCF TV and PV; EV bridge; comps; accretion; the Cobalt EPS bridge. It also checks nudge neutrality and that the registry's import graph never reaches the bank.
- **Grading:** two extra dimensions, `technical_accuracy` and `commercial_judgment`, on top of the shared four and `process_rigor` (derived in code from the steps). `FINANCE_EVALUATOR_ADDENDUM` reuses the consulting study's techniques: the two-question step test, "a nudge only rules out hit", evidence-first key order, an arithmetic audit of every intermediate figure before any score, tolerance bands, rounding vs. error, an IRR method must name an anchor, and a cap of 3 on `commercial_judgment` when the view had to be drawn out.

## Real interview vs simulation

| Real-interview element | Our implementation | Gap |
|---|---|---|
| Fit ("why banking / why us") then technicals, ~30 min (Vault, M&I) | ~4 min fit stage, then one problem, ~25 min total | One problem per session; a real first round asks several short technicals |
| Superday: 3–6 back-to-back interviews | Not simulated | Would need a station runner (several problems per session) |
| Technicals answered out loud in order | `finance-technical` framework; facts (tax rate) only when asked | — |
| Paper LBO, pen and paper, ~10–15 min (WSP, BIWS) | Deal terms on screen; secondary inputs only when asked; graded against a tolerance band | No scratchpad: the candidate's paper is not captured |
| Excel modeling test | Not simulated | Out of scope |
| Stock pitch with probing Q&A (M&I, CFA RC) | Own-choice and tear-sheet pitches; one nudge per skipped part | The evaluator cannot fact-check real companies |
| Market / deal awareness | Three discussion prompts | Interviewer has no live news |
| Interviewer pushback on a number | Engine asks to double-check slips; never corrects | — |

## Grading study

`scripts/verify-finance-interview-grading.ts` grades 9 golden transcripts with the **registered** `finance` type (`makeProblemInterviewTypeConfig`), the real `buildProblemEvaluatorBrief` (bank from `banks.server.ts`, nudges and exhibit reveals as server events), `gpt-4.1` with the app's strict schema and `validateEvaluationResult`, then `finalizeProblemOutcome` and the derived `process_rigor`, exactly as `evaluation-runner.ts` persists them. Expectations are asserted on the derived value.

Transcripts (`scripts/fixtures/finance-interview/`): Harbor Foods LBO in five variants — **strong**, **skipped** (jumps to "3x, 25%"), **mathwrong** (good process; omits interest so MOIC 3.4×, IRR as gain ÷ years = 48%), **sloppy** (final 2.9× / ≈24% inside the band, but year-2 and year-4 FCF miscomputed by ±1.5 and cancelling, IRR with no anchor), **nudged** (inputs and drivers drawn out by nudges) — plus $10 depreciation strong / skipped and Cobalt Trail pitch strong / nudged.

Final configuration, 2 runs (`--runs 2`). H = hit, P = prompted, M = missed, in framework order.

| Transcript | Expectation | process_rigor (derived) | raw model rigor | technical_accuracy | commercial_judgment | Steps | Pass |
|---|---|---|---|---|---|---|---|
| lbo-strong | all hit; rigor ≥ 4; tech ≥ 4; comm ≥ 4 | 5, 5 | 5, 5 | 5, 5 | 5, 5 | HHHHHH | 2/2 |
| lbo-skipped | inputs, cash flow, drivers missed; rigor ≤ 2; comm ≤ 3 | 1, 1 | 1, 2 | 3, 3 | 3, 3 | MHMHMM / MHMPMM | 2/2 |
| lbo-mathwrong | cash flow and returns missed; tech ≤ 2 | 1, 1 | 3, 4 | 1, 3 | 5, 5 | HHMMMH | 1/2 |
| lbo-sloppy | tech 2–3 | 5, 5 | 5, 5 | 5, 5 | 5, 5 | HHHHHH | 0/2 |
| lbo-nudged | inputs and drivers prompted; rigor 3; comm ≤ 3 | 3, 3 | 3, 3 | 5, 5 | 3, 3 | PHHHHP | 2/2 |
| dep-strong | all hit; rigor ≥ 4; tech ≥ 4 | 5, 5 | 5, 5 | 5, 5 | 5, 5 | HHHHH | 2/2 |
| dep-skipped | assumptions, numbers, tie-out missed; rigor ≤ 2; tech ≤ 2 | 1, 1 | 1, 1 | 1, 1 | 1, 2 | MMMMM | 2/2 |
| pitch-strong | all hit; rigor ≥ 4; tech, comm ≥ 4 | 5, 5 | 5, 5 | 5, 5 | 5, 5 | HHHHHH | 2/2 |
| pitch-nudged | call and risks prompted; rigor 3; comm ≤ 3 | 3, 3 | 3, 3 | 5, 5 | 3, 3 | PHHHHP | 2/2 |

**Final: 15/18 grades pass.** Derived `process_rigor` was identical across runs for every transcript. The model's own `process_rigor` disagreed with its step verdicts in 3/18 grades (all on mathwrong / skipped, all too high, e.g. raw 4 vs. derived 1); the code derivation fixes that, as in the PM study.

### Iteration log (same 9 transcripts)

| Round | Change | Pass |
|---|---|---|
| r0 (1 run) | First addendum (two-question test, evidence-first, tolerance, comm cap for "call / takeaway" nudges) | 7/9 — sloppy tech 5; nudged LBO comm 4 (view came after the drivers nudge, not covered by the cap) |
| r1 (2 runs) | Arithmetic audit before any score; cap covers the nudge for whichever step holds the view | 16/18 — only sloppy fails (tech 5) |
| r2 (2 runs) | "Rounding vs. error" rule; IRR method must name an anchor | 14/18 — sloppy 0/2; mathwrong 1/2 (note said "omitted interest" but status hit); nudged 1/2 (processSteps JSON malformed once) |
| r3 (2 runs, final) | Status must agree with any shortfall in the note; tech 4–5 requires zero uncorrected intermediate errors; per-year FCF in the step criteria | 15/18 |

r1 and r3 are within run-to-run noise of each other; the later rules are kept because they state the intended grading correctly.

### Residual gaps

1. **Sloppy-but-in-band math is not caught (0/6 across r1–r3).** gpt-4.1's notes literally say "year 2: 62 × 0.75 = 46.5, said 45", then call it "rounding" and give `technical_accuracy` 5 and the step `hit`. Prompt wording did not move it. A real interviewer would mark this down. Options: a code cap (see integrator TODOs) cannot detect it either, because the step comes back `hit`; a deterministic numeric checker over candidate-stated figures, or a stronger evaluator model, would.
2. **Wrong numbers still earn high commercial judgment.** lbo-mathwrong concludes "48% blows through the hurdle — definitely do it" and gets `commercial_judgment` 5 both runs: the view is consistent with the candidate's own (wrong) numbers. Defensible under the rubric as written, but arguably the view should be capped when the key figure it rests on is outside tolerance.
3. **`technical_accuracy` on mathwrong was 3 once** even though both math steps were `missed` — the score is written before the steps. A code cap (tech ≤ 2 when a math-bearing step is missed) would make this deterministic.
4. **A step marked `prompted` with no nudge** (lbo-skipped, 1 run). Harmless for the derived score (counted, not missed), but the report would say "after a prompt".
5. **Malformed `processSteps` once in r2** (1/18): the report would fall back to the model's raw `process_rigor`.

## Live probes

`scripts/verify-finance-interview-live.ts` runs `gpt-4.1` against the real `buildProblemInterviewSystemPrompt` (finance persona) + `buildProblemProgressBlock`, parsed with `parseProblemTurn`. Two batches × 2 runs; the second batch is after adding "say only that it is on their screen; never read its figures aloud" to every exhibit's reveal condition.

| Probe | Batch 1 (before reveal wording) | Batch 2 (final) |
|---|---|---|
| P1 Harbor: no numbers volunteered while the candidate sets up | 2/2 pass; nudged `confirm_inputs` immediately 2/2 | 2/2 pass; nudged immediately 1/2 |
| P2 projections exhibit on request, not read aloud | 1/2 — read all five EBITDA figures aloud once | **2/2** — marker present, nothing read aloud |
| P3 neutral nudge on a jump to "3x, 25%" | 1/2 — marker dropped once | 0/2 on the strict word check: "step by step" (idiom) and "your key assumptions" + a second question naming the entry price and funding |
| P4 only the fact asked (tax rate) | 2/2 | 2/2 |
| P5 own-choice pitch: no facts or thesis about the candidate's company | 2/2 (once listed "call, target, horizon" — a mild structure hint) | 2/2 |

Engine-level issues (same as the consulting and PM studies): premature nudging while the candidate asks for a moment (3/4), occasional dropped nudge markers (1/4), and a nudge that is two questions and leans toward the next step (P3). The content fix for reading exhibits aloud worked.

## Remaining gaps

1. Sloppy in-band arithmetic is not penalized (above). Needs a deterministic numeric check or a different evaluator model.
2. Engine live prompt: premature nudges; nudges that hint at structure; occasional dropped markers.
3. No scratchpad: paper-LBO working is only what the candidate says aloud.
4. One problem per session: a real first round or Superday asks several technicals; a station runner would cover that.
5. Candidate-choice pitches and deals cannot be fact-checked; graded on internal consistency only.
