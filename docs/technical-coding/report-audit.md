# Technical-coding report audit (2026-11-15, dev @ 9b481e9)

Read-only code and dev-DB audit of what a student sees after a technical coding interview.
Screenshots: `../leadership-avatar-wt/screenshots-2026-11-14/coding-report/audit/`.

## Answers

| Question | Answer | Evidence |
|---|---|---|
| Is the report specific to coding? | **Mostly no** | `TECHNICAL_CODING_CHROME` has no extras/tabs (`components/practice/ReportChrome.tsx:197-205`). The student sees the generic interview report: Visual/Vocal/Content/Behavioral cards, "practice next time", Overview/Statistics/Delivery/Content tabs, and a delivery-only Moments chart. The three coding scores (`coding_correctness`, `coding_quality`, `technical_communication`) are stored but never rendered. "By rubric item" looks up `scores[item]`, but the model writes free-text labels, so no figure ever shows. There is no "Practice again" button (it is only wired when `showsCustomizationStrip`, `PracticeReportPage.tsx:205,324`). |
| Does it show the correct result? | **No** | No reference solution, student code, test outcomes or diff. Server execution is fail-closed (`sandbox.ts:23-31` returns "unavailable"), and `coding_correctness` is forced to null (`evaluation-runner.ts:801-803`). Visible tests run only in the browser and are never saved. |
| Does it grade verbal step-by-step process? | **Partly, implicitly** | The live interviewer prompt is process-driven (`lib/technical-interview/prompts.ts:81-119`), but grading folds the process into one 1–5 `technical_communication` score (`prompts.ts:126`) that is never shown. There is no step checklist (`outcome.fields: []`). Hints are invisible to the evaluator and the report. |

## Critical bug

`buildUserMessage` (`lib/engine/evaluation.ts:182-260`) has no technical-coding branch, so the evaluator never receives:
- the final source code (it is placed in context at `evaluation-runner.ts:375-384` but never serialized);
- the problem statement or complexity target;
- the language;
- the hints.

`coding_quality` is therefore graded without seeing code. The prompt says to "use only the supplied final execution outcome", but none is supplied, and the model invents one. Dev report `0974066b` says "Solution was accepted by the system, passing visible and hidden tests." No tests ran.

## Other findings

- **Timestamps:** every transcript turn is stamped `Date.now()` at finish (`session.ts:1436`), so all evaluator timecodes are identical.
- **Code snapshots:** checkpoints are a single overwritten snapshot (`TechnicalCodingSession.tsx:366`, `evidence.ts:106-113`), so there is no code timeline.
- **Live interviewer:** it never sees the candidate's code, yet its prompt says to "name the specific line" (`prompts.ts:96` vs `lib/engine/prompts.ts:335-349`).
- **Transcript cap:** `slice(-48)` drops the opening clarification and approach turns in long sessions (`evidence.ts:121`).
- **Mastery:** `coding_quality` and `technical_communication` map to Structure & clarity; `coding_correctness`, which is always null, maps to Credibility (`lib/mastery/competencies.ts:173,249`).
- **Corpus** (`assignments.server.ts`): 25 problems, each with 2 public and 2–3 hidden cases, a Python-only `referenceSolution` written as terse one-letter code, and a 3-tier hint ladder. Constraints and examples are placeholders. The `median-of-two-sorted` reference is `sorted(a+b)`, which violates its own O(log min(n,m)) target, so showing references as they are would teach a wrong answer.
- **Leakage:** private fields are server-only for in-session integrity (`types.ts:141-163`, enforced by `verify-technical-assignment-corpus.ts`). Nothing forbids showing material after the report is READY; that is a product decision. `resolveTechnicalAssignment` already rebuilds the private record for old reports, so this needs no schema change. Don't add hashed fields or `TECHNICAL_CODING_INPUT_KEYS`.
- **Dev DB:** 3 READY and 14 IN_PROGRESS technical-coding reports; `919e6c51` is gone.
  - `884d22b3` (JavaScript) is penalized for "not implementing in Python", because the evaluator never knew the language. Its code crashes on an empty list and the report never says so.
  - `0974066b` shows four "not scored" cards while its stored coding scores (4 and 4) are invisible.
- **e2e:** `technical-report-surfaces.spec.ts` needs a camera-on READY report on Alice, and none exists.

## Gaps (ordered for build scope)

| # | Gap | Severity | Size | Schema |
|---|---|---|---|---|
| G1 | Technical-coding block in `buildUserMessage` (problem, target complexity, language, final code, visible fixtures, hints, an explicit "execution NOT RUN" line), a revised evaluator prompt, and a guard against test-pass claims | High | M | none |
| G2 | Render the coding scores (correctness shows "Not run"); key `rubric_notes` by dimension | High | S–M | none |
| G3 | "Your solution" tab: problem, complexity target, final code (read-only), visible tests, optional browser re-run | High | M | owner-only API field |
| G4 | Server timestamp per visible turn | High | S | JSON shape |
| G5 | Coding process-steps checklist (clarify, edge cases, approach, complexity, code, test/trace, walkthrough); a step reached only after a hint counts as Prompted | Med–High | M–L | outcome JSON; rubric fixture re-take |
| G6 | Hints used (n/3) with tier and text after READY | Med | S | none |
| G7 | "How a strong candidate approaches it", from the hint ladder; showing code needs a decision | Med | M/L | none |
| G8 | Corpus quality: real constraints and examples, fix the median reference, verify references against tests | Med | M | none |
| G9 | Live interviewer sees the latest code (private per-turn block) | Med | S–M | none |
| G10 | Capture visible-test runs as self-reported evidence | Med | M | JSON shape |
| G11 | Timestamped checkpoints for a code timeline | Low–Med | M | JSON shape |
| G12 | "Practice again" on coding reports | Low–Med | S | none |
| G13 | Keep the first N and last M turns instead of `slice(-48)` | Low–Med | S | none |
| G14 | Coding scores first; delivery lower | Low | S | none |
| G15 | Prove-it prefill for coding | Low | S | none |
| G16 | e2e fixture dependency | Low | S | none |

**Suggested scopes:**
- **Minimal honest fix:** G1 + G2 + G4 + G12.
- **"Learn from it":** add G3, G6 and G7.
- **Process grading:** add G5, G9 and G10.
