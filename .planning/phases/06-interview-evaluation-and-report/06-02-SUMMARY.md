---
phase: 06-interview-evaluation-and-report
plan: 02
subsystem: interview-evaluation
tags: [openai, json-schema, validation, evaluator]
dependency_graph:
  requires: []
  provides:
    - "lib/interview/evaluation.ts: runInterviewEvaluation, validateEvaluationResult, EVALUATION_JSON_SCHEMA, hasAnyScore"
  affects:
    - "06-04 (finish endpoint) calls runInterviewEvaluation directly"
tech_stack:
  added: []
  patterns:
    - "JSON-schema structured output (response_format: json_schema, strict: true) instead of regex scraping"
    - "Code-enforced null on visual/vocal scores, independent of model output or prompt text"
    - "Discriminated ok union return, never throws, for background-job-safe failure reporting"
key_files:
  created:
    - lib/interview/evaluation.ts
  modified: []
decisions:
  - "Visual/Vocal scores hardcoded to null in the return object of validateEvaluationResult, never read from raw.visual_score / raw.vocal_score."
  - "coerceScore does not parse strings at all (no parseInt/parseFloat/Number()) — a string score signals the model ignored the schema and is untrusted, not a formatting nuance."
  - "Retry budget (50s total, 1 retry, 25s/attempt) mirrors app/api/interaction/finish/route.ts precedent, using OpenAI client maxRetries:0 with our own single retry so failures are attributable and logged."
metrics:
  duration_minutes: 20
  completed: 2026-09-20
---

# Phase 6 Plan 2: Interview Evaluation Module Summary

Built `lib/interview/evaluation.ts`: a JSON-schema-constrained call to `INTERVIEW_EVALUATOR_PROMPT` (imported verbatim, unmodified) plus a validation layer that hardcodes Visual/Vocal scores to null in code and coerces malformed Content/Behavioral scores to null, with one automatic retry before a readable failure reason.

## What Was Built

### Task 1 — Result contract and validator

Exported:
- `EVALUATION_JSON_SCHEMA` — matches the exact shape `INTERVIEW_EVALUATOR_PROMPT` specifies: `{visual_score, vocal_score, content_score, behavioral_score, report_markdown}`, `strict: true`, `additionalProperties: false`. Kept `minimum`/`maximum` on the integer fields since OpenAI accepted the schema as written.
- `RawEvaluation` (all fields `unknown` — nothing is trusted before validation) and `ValidatedEvaluation` (`visualScore`/`vocalScore` typed as literal `null`).
- `coerceScore(value: unknown): number | null` — returns the value only if `typeof value === "number"`, `Number.isInteger(value)`, and `1 <= value <= 5`. No string parsing anywhere (confirmed: `grep -c "parseInt\|parseFloat\|Number(" lib/interview/evaluation.ts` → `0`).
- `validateEvaluationResult(raw: unknown): ValidatedEvaluation` — hardcodes `visualScore: null` and `vocalScore: null` in the return object (never reads `raw.visual_score` / `raw.vocal_score` into output — those keys only appear in the schema, the `RawEvaluation` interface, and comments/JSON template strings). Throws `"Evaluator returned an empty report body"` if `report_markdown` is missing or blank after trim.
- `hasAnyScore(e): boolean` — true if either Content or Behavioral is non-null.

**coerceScore walkthrough (per plan's required verification):**
| Input | Output | Reason |
|---|---|---|
| `4` | `4` | number, integer, in range |
| `"4"` | `null` | not `typeof number` — strings never parsed |
| `4.5` | `null` | fails `Number.isInteger` |
| `0` | `null` | fails range guard (`< 1`) |
| `6` | `null` | fails range guard (`> 5`) |
| `NaN` | `null` | fails `Number.isInteger(NaN)` (false) |
| `null` / `undefined` | `null` | fails `typeof value !== "number"` |

**Plan's example assertion**, walked through against the written code:
`validateEvaluationResult({visual_score:4, vocal_score:3, content_score:"4", behavioral_score:4, report_markdown:"x"})`
- `visualScore` → hardcoded `null` (input `4` discarded)
- `vocalScore` → hardcoded `null` (input `3` discarded)
- `contentScore` → `coerceScore("4")` → `null` (string, not number)
- `behavioralScore` → `coerceScore(4)` → `4` (valid)
- `reportMarkdown` → `"x"` (non-empty after trim)

Result: `{visualScore:null, vocalScore:null, contentScore:null, behavioralScore:4, reportMarkdown:"x"}` — matches the plan's expected outcome exactly.

### Task 2 — runInterviewEvaluation

- `model = process.env.INTERVIEW_EVAL_MODEL || "gpt-4.1"`.
- Budget mirrors `app/api/interaction/finish/route.ts`: `BUDGET_MS = 50_000`, `RETRIES = 1`, `PER_ATTEMPT_TIMEOUT = 25_000`. OpenAI client constructed with `maxRetries: 0`; the function performs its own single retry with a 1s delay so each failure is logged and attributable.
- `INTERVIEW_EVALUATOR_PROMPT` sent verbatim as the system message (imported from `./prompts`, file untouched — `git diff HEAD -- lib/interview/prompts.ts` is empty).
- User message includes `full_transcript`, `resume_text` (or the literal fallback string when empty), `role_context` as JSON, and explicit `visual_metrics: null` / `vocal_metrics: null` lines (not omitted — the prompt's CRITICAL RULE keys off them being present-but-null).
- Call uses `response_format: { type: "json_schema", json_schema: EVALUATION_JSON_SCHEMA }` — no regex scraping (`grep -c "SCORE:" lib/interview/evaluation.ts` → `0`).
- Response content parsed with `JSON.parse`, then run through `validateEvaluationResult`. Any throw (network, timeout, parse, empty body) is caught per attempt.
- Returns a discriminated union: `{ok: true, result, model}` or `{ok: false, reason, model}`. `reason` is truncated to 500 chars via `truncateReason`. The function never throws.
- Success log: `console.info("Interview evaluation completed", {model, contentScore, behavioralScore, markdownLength})` — never logs transcript or resume text.

## Verification Performed

- `npx tsc --noEmit` — no errors attributable to `lib/interview/evaluation.ts` (repo-wide run; only this file's errors are in scope, and there were none).
- `grep -c "SCORE:" lib/interview/evaluation.ts` → `0`.
- `grep -n "INTERVIEW_EVAL_MODEL\|gpt-4.1\|response_format\|INTERVIEW_EVALUATOR_PROMPT" lib/interview/evaluation.ts` → all four present.
- `grep -c "@prisma/client\|s3-client\|next/server" lib/interview/evaluation.ts` → `1`, but the single hit is the doc-comment line `"no Prisma, no S3, no \`next/server\`"` (matched by the `next/server` literal appearing inside prose), not an import. Confirmed via `grep -n` — no `import` statement matches.
- `git diff --stat package.json package-lock.json` — shows 06-01's `remark-gfm` install only, not attributable to this plan.
- `git diff HEAD -- lib/interview/prompts.ts` and `git log --oneline 8cfdc92..HEAD -- lib/interview/prompts.ts` — both empty. Prompt file untouched.
- `coerceScore` and `validateEvaluationResult` walked through by inspection against all required cases (table above) — no runner used, per constraint (no `tsx`/`ts-node` added or invoked).

## Deviations from Plan

### Auto-fixed / noted issues

**1. [Out of scope, deferred] ESLint config broken repo-wide**
- **Found during:** Task 2 verification (`npx eslint --fix lib/interview/evaluation.ts`).
- **Issue:** `ESLint configuration in » plugin:@next/next/recommended is invalid: Unexpected top-level property "name"`.
- **Confirmed not caused by this plan:** reproduced the identical error running `npx eslint --fix lib/interview/prompts.ts` (an untouched file), so the eslint/plugin version mismatch is environment-wide, most likely from 06-01's concurrent `npm install` in the same wave.
- **Action:** Logged to `.planning/phases/06-interview-evaluation-and-report/deferred-items.md`. Not fixed — out of scope per the scope-boundary rule (pre-existing/concurrent, not caused by this task's file). `npx tsc --noEmit` (the plan's authoritative check) is clean for this file.

**2. [Process note, not a code deviation] Concurrent-agent git index race**
- **Found during:** Committing Task 1/2.
- **Issue:** This plan runs in the same wave as 06-01, sharing one working-tree git index. Between `git add lib/interview/evaluation.ts` and the intended `git commit`, 06-01's concurrent commit (`c198b17 feat(06-01): add InterviewReport model and migration SQL`) ran and picked up the already-staged `lib/interview/evaluation.ts` from the shared index, along with its own `package.json`/`package-lock.json`/`prisma/schema.prisma`/migration changes.
- **Verification:** `git show HEAD:lib/interview/evaluation.ts` is byte-identical to the file on disk (confirmed via diff) — no content was lost or altered by the race, only the commit boundary shifted.
- **Resolution:** Did not rewrite `c198b17` (would be a destructive history edit affecting a concurrently-running plan's commit). `lib/interview/evaluation.ts` is correctly and completely committed as part of `c198b17`; there is no separate per-task commit hash for this plan's file changes because of this shared-index race, which is outside this plan's control.

No other deviations. `INTERVIEW_EVALUATOR_PROMPT` is byte-identical to its state at plan start. No `npm install` was run by this plan; `package.json`/`package-lock.json` changes visible in the repo are 06-01's `remark-gfm` install.

## Self-Check

- `lib/interview/evaluation.ts` exists: FOUND.
- Exports present: `runInterviewEvaluation`, `validateEvaluationResult`, `EVALUATION_JSON_SCHEMA`, `hasAnyScore`, `coerceScore` (internal), types `RawEvaluation`, `ValidatedEvaluation`, `EvaluationInput`, `EvaluationOutcome`, `EvaluationFailure` — all present in file (249 lines, exceeds `min_lines: 120`).
- Commit `c198b17` contains this file: FOUND (`git show --stat c198b17` lists `lib/interview/evaluation.ts`).
- `git diff HEAD -- lib/interview/prompts.ts`: empty (contract file unmodified).

## Self-Check: PASSED
