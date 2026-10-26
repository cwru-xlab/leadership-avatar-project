---
phase: 21-adaptive-mastery-path
plan: 06
subsystem: study-plan
tags: [knowledge-checks, validation, engine-boundary-guard, verification]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path
    provides: "MIN_QUOTABLE_LENGTH and the verbatim-quote vocabulary (21-04); the seven-table schema recording KnowledgeCheck.format as MULTIPLE_CHOICE | FILL_IN_BLANK | PICK_BETTER_RESPONSE | REWRITE_WEAK_LINE (21-03)"
provides:
  - "CHECK_FORMATS, per-format payload/answer-key interfaces, validateCheckPayload(), validateAnswerKey(), isDeterministicFormat(), CONTRIBUTION_SOURCE_FOR_FORMAT() in lib/study-plan/checks/types.ts"
  - "A proven-to-bite guard (scripts/verify-knowledge-check-surface.ts) that no knowledge-check format ever becomes a registered engine interaction type"
affects: [21-10, 21-11, 21-15, 21-20, future coached-mode plans (21-12/21-23/21-24)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discriminated-union payload/answer-key interfaces tagged by `format`, validated at the boundary the same way validateStudyPlanContent already does"
    - "A single derivation function (CONTRIBUTION_SOURCE_FOR_FORMAT, built on isDeterministicFormat) as the one place a format's mastery weight class is decided"
    - "Named, enumerated carve-out list (ENGINE_IMPORT_CARVE_OUTS) with an assert-length-equals-one guard, so a second exemption requires a deliberate code change"
    - "Guard proven non-vacuous by planting a violation, observing the walk catch it, then removing it and re-confirming a clean pass — not just asserting zero today"

key-files:
  created:
    - lib/study-plan/checks/types.ts
    - scripts/verify-knowledge-check-surface.ts
  modified: []

key-decisions:
  - "readString/readArray/isRecord-style helpers were REIMPLEMENTED locally in lib/study-plan/checks/types.ts rather than imported from lib/study-plan/types.ts, because that file does not currently export them and this plan's files_modified excludes it — lib/study-plan/types.ts was left completely untouched (REQ-120)."
  - "ENGINE_TYPES.length's expected count (13) is a LOCAL const in the verifier, not read from an existing export, because no existing engine-surface verifier declares/exports one — several (verify-pitch-surface-count.ts, verify-deck-family-surface-count.ts) explicitly avoid hardcoding it since parallel phases add engine types concurrently. Documented here as a deliberately brittle tripwire for a silent widening, not a restatement of Phase 13's authoritative count."
  - "The 'label' field named in the plan's guard signature does not exist on InteractionTypeConfig (the real field is `name`); real ENGINE_TYPES entries are mapped onto {slug, label} at the call site so the offendingSlugs() helper signature matches the plan's wording exactly, while still checking the registry's actual `name` field."
  - "lib/study-plan/coached/ does not exist yet. The directory walk treats its absence as zero carved-out files (not an error, not a vacuous pass) — confirmed by an explicit check and a log line."
  - "Any future subdirectory under lib/study-plan/ other than checks/ and the one carved-out coached/ is held to the SAME absolute no-engine-import bar by default (an 'everything else' bucket), rather than silently passing through unchecked — stricter than the plan's literal wording required, but consistent with its intent."

patterns-established:
  - "Pattern: a format's weight class (deterministic vs model-graded) is read through one derivation function, never duplicated as a second hand-maintained map."
  - "Pattern: an engine-import guard enumerates its carve-outs as a named, length-asserted const, with the authorizing decision doc named in a comment."

requirements-completed: [REQ-108]

# Metrics
duration: ~20min
completed: 2026-10-20
---

# Phase 21 Plan 06: Knowledge-Check Format Modelling & Engine-Boundary Guard Summary

**Four validated knowledge-check payload formats living entirely inside `lib/study-plan/`, plus a filesystem/registry guard — proven to bite on a planted violation — that mechanically keeps them from ever becoming a registered engine interaction type.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-10-20T15:28:24Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- `lib/study-plan/checks/types.ts` models all four formats — `MULTIPLE_CHOICE` (exactly 4 distinct options, 1..240 chars), `FILL_IN_BLANK` (1..3 blanks, `segments.length === blankCount + 1`, per-blank synonym acceptance), `PICK_BETTER_RESPONSE` (exactly 2 distinct candidates, optional rationale prompt), and `REWRITE_WEAK_LINE` (weak line floored at the imported `MIN_QUOTABLE_LENGTH`, a technique hint, 1..4 rubric criteria) — each discriminated by a `format` literal field.
- `validateAnswerKey` makes REQ-111's deterministic/model-graded split structural: it throws if a non-null key is supplied for `REWRITE_WEAK_LINE` and throws if `null` is supplied for any of the other three, rather than leaving that asymmetry to convention.
- `isDeterministicFormat` and `CONTRIBUTION_SOURCE_FOR_FORMAT` give 21-11 and 21-15 a single, non-duplicated source of truth for a format's mastery weight class.
- `scripts/verify-knowledge-check-surface.ts` runs 43 checks (above the 25-check floor): full accept/reject coverage for all four formats with field-naming throw messages, a registry guard proving no `ENGINE_TYPES` entry's slug or name is a knowledge-check format or mentions "knowledge"/"quiz"/"check", a directory walk proving nothing under `lib/study-plan/` imports from the engine except the one named `lib/study-plan/coached/` carve-out (asserted to have exactly one entry), a non-vacuous proof that planting an engine import under `checks/` is caught and then cleanly removed, and an inverted assertion proving the slug-matching helper actually fires on synthetic offenders (and does NOT false-positive on an unrelated real type).
- Confirmed zero engine imports in the new module (`grep -c "lib/engine\|@/lib/engine" lib/study-plan/checks/types.ts` returns 0 — the module's own doc comment had to be reworded once to avoid tripping its own grep gate, same pattern 21-04 used for `competencies`).

## Task Commits

Each task was committed atomically, with an explicit pathspec on every `git commit` line (three sibling executors shared this git index):

1. **Task 1: Model and validate the four check payloads** — `1908517` (feat) — `lib/study-plan/checks/types.ts`
2. **Task 2: Battery plus the no-engine-registry negative guard** — `9a1a20a` (feat) — `scripts/verify-knowledge-check-surface.ts`

**Plan metadata:** (this commit) — `docs(21-06): complete knowledge-check format modelling plan`

## Files Created/Modified

- `lib/study-plan/checks/types.ts` (391 lines) — `CHECK_FORMATS`, `CheckFormat`, four payload interfaces, three answer-key interfaces, `CheckPayload`, `AnswerKey`, `validateCheckPayload`, `validateAnswerKey`, `isDeterministicFormat`, `CONTRIBUTION_SOURCE_FOR_FORMAT`. Zero imports from the engine module tree; one import from `lib/study-plan/verbatim.ts` (`MIN_QUOTABLE_LENGTH`).
- `scripts/verify-knowledge-check-surface.ts` (548 lines) — the payload battery, the registry guard, the planted-violation proof, and the inverted assertion.

## Decisions Made

See `key-decisions` in frontmatter. In short: reimplemented validation helpers locally rather than touch `lib/study-plan/types.ts`; used a local, documented-as-brittle `ENGINE_TYPES.length` tripwire since no existing verifier exports one; mapped the registry's `name` field onto the plan's literal `label` wording for the guard helper; treated the not-yet-existing `coached/` directory as legitimately empty; and extended the "absolute" bar to any future unnamed subdirectory as a defensive default.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Doc comment tripped its own grep verification gate**
- **Found during:** Task 1 verification (`grep -c "lib/engine\|@/lib/engine" lib/study-plan/checks/types.ts`)
- **Issue:** The module's own explanatory doc comment contained the literal substring `` `lib/engine/` `` while describing why the file imports nothing from it — the verification command counts matching *lines*, and one comment line matched, returning 1 instead of the required 0.
- **Fix:** Reworded the comment to say "the engine module tree" instead of the literal path, preserving the explanation without the substring.
- **Files modified:** `lib/study-plan/checks/types.ts`
- **Verification:** Re-ran the grep (now 0 matches / exit 1 meaning "no match found", which is correct) and `npx tsc --noEmit` (clean).
- **Commit:** `1908517` (folded into the task's single commit, since the fix landed before the commit was made)

---

**Total deviations:** 1 auto-fixed (1 bug, cosmetic — no behavioral code was affected)
**Impact on plan:** None on scope; purely a documentation wording fix caught by the plan's own verification step.

## Issues Encountered

- `InteractionTypeConfig` (in `lib/engine/types.ts`) names its human-readable field `name`, not `label` as the plan's guard-helper signature literally says. Resolved by keeping the helper's parameter shape as `{slug, label}` (matching the plan's exact wording, and matching Section 3's synthetic test literal) while mapping `ENGINE_TYPES`' real `name` field onto `label` at the one call site in Section 2a. No functional gap — the `name` field (e.g. "Networking Practice") is exactly what a human-visible `label` would be.
- No existing engine-surface verifier exports an expected `ENGINE_TYPES.length`; several explicitly avoid hardcoding it for concurrency reasons. Per the plan's own fallback instruction, used a local const (13, current as of this plan) and documented the duplication and its rationale in both the script's inline comment and this Summary's `key-decisions`.

## User Setup Required

None — no external service configuration required. The database-gated note in the plan's instructions did not apply: this plan's verifier reads only in-process modules (`ENGINE_TYPES`, the new `checks/types.ts`) and the filesystem; it performs no database read.

## Requirements Note

`REQ-108` appears in this plan's frontmatter `requirements:` list, but is
NOT marked complete by this plan's execution. REQ-108's full text requires
the four formats to be "modelled, persisted... **and ANSWERABLE BY THE
STUDENT**" via an authenticated route — that answering surface is 21-22,
not this plan. `requirements mark-complete REQ-108` was deliberately NOT
run, matching the precedent 21-05-SUMMARY.md set for REQ-107 (a multi-plan
requirement left unchecked until the whole thing ships). A pre-existing,
out-of-scope discrepancy was also found and logged rather than fixed: the
Traceability table in `REQUIREMENTS.md` already shows `REQ-108 | Phase 21 |
Complete` from 21-03's commit, before 21-22 lands. See
`.planning/phases/21-adaptive-mastery-path/deferred-items.md`.

## Next Phase Readiness

- `validateCheckPayload`, `validateAnswerKey`, `isDeterministicFormat`, and `CONTRIBUTION_SOURCE_FOR_FORMAT` are ready for 21-10 (check generation), 21-11, and 21-15 (mastery weighting) to import directly.
- The engine-boundary guard is in place and already accounts for the coached-mode carve-out that 21-12/21-23/21-24 will need — those plans can create `lib/study-plan/coached/` without first editing this guard.
- No blockers identified for downstream plans.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-20*

## Self-Check: PASSED

- FOUND: `lib/study-plan/checks/types.ts`
- FOUND: `scripts/verify-knowledge-check-surface.ts`
- FOUND: commit `1908517` (Task 1)
- FOUND: commit `9a1a20a` (Task 2)
- `npx tsc --noEmit` clean
- `npx tsx scripts/verify-knowledge-check-surface.ts` exit 0, 43/43 checks passed
- `npx tsx scripts/verify-engine-surface-count.ts` exit 0 (unchanged)
- `git diff --name-only` for both commits touches nothing under `lib/engine/`
