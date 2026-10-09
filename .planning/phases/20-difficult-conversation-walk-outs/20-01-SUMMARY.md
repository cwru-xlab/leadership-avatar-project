---
phase: 20-difficult-conversation-walk-outs
plan: 01
subsystem: engine
tags: [hostility-detection, lexicon, deterministic, difficult-conversation, regex]

# Dependency graph
requires:
  - phase: 18-avatar-disengagement-walk-out
    provides: "computeDisengagementOverTranscript, repeated_response + short_response_streak stall signals, calibration policy"
  - phase: 15-difficult-conversations
    provides: "SEEDED_CONVERSATIONS catalogue (seven seeded scenarios) and the difficult-conversation type"
provides:
  - "lib/engine/hostility.ts — pure deterministic detectHostility(text) classifying student text into none/hostile/severe tiers"
  - "scripts/verify-hostility-detector.ts — the false-positive corpus (24 rows derived from all seven seeded scenarios) plus true-positive, severe, and stonewalling corpora"
  - "Settled discretion finding: stonewalling needs NO new signal — Phase 18's existing stall signals already measure it"
affects: [20-02, 20-03, 20-04, 20-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Clause-level targeting: an attack term only counts as hostile when a second-person reference (you/your/you're/yourself) appears in the SAME clause"
    - "Explicit veto patterns (POSITION_OBJECT, PROCESS_CONSEQUENCE) rather than a tunable score, so firm-but-not-hostile language is excluded by name, not by threshold"
    - "Severe tier checked first and independent of targeting — a slur does not need a 'you'"
    - "matched: string[] returns rule-group names only, never the matched span, so no caller can echo a slur or insult out of the module"

key-files:
  created:
    - lib/engine/hostility.ts
    - scripts/verify-hostility-detector.ts
  modified: []

key-decisions:
  - "Stonewalling needs NO new code: the fixture transcript (six pure-refusal lines) produced a disengagement value of 0.425 under Phase 18's existing repeated_response + short_response_streak signals — materially non-zero against the 0.6 threshold — so detectHostility deliberately returns tier:\"none\" for stonewalling text; it is a stall signal, not an attack."
  - "SEVERE tier uses masked placeholder tokens ([SLUR_PLACEHOLDER_ETHNIC] etc.) in the test corpus rather than real slur text, to prove the tier is reachable and separate without committing real slurs to the repo."
  - "Un-targeted profanity (e.g. \"this is a shitty position\") is never hostile by construction: profanity_at_person phrases are self-contained imperatives/direct-address forms, so a profanity word with no person-targeting anywhere in the clause simply never fires any category."
  - "Every number introduced (SHOUTING_CAPS_RATIO 0.6, SHOUTING_MIN_LENGTH 15, SHOUTING_MIN_WORDS 4, the leet map, the single-letter-padding collapse) is labelled PROVISIONAL UNTIL CALIBRATED in a header block, with its only evidence named as this plan's fixture corpus — no live session, no human-labelled transcript. Phase 18's calibration policy (18-VALIDATION.md) is quoted verbatim."

patterns-established:
  - "Pattern: clause-split + explicit veto regex (POSITION_OBJECT_PATTERN, PROCESS_CONSEQUENCE_PATTERN) is the mechanism for separating firm language from hostility — future hostility-adjacent detectors in this codebase should prefer named exclusion patterns over score thresholds when the false-positive boundary is itself the requirement."

requirements-completed: [REQ-96, REQ-97]

# Metrics
duration: 35min
completed: 2026-10-08
---

# Phase 20 Plan 01: Deterministic Hostility Detector Summary

**Pure deterministic hostility/severe-content classifier (`detectHostility`) that passes a 24-row false-positive corpus built from all seven seeded confrontation scenarios' own register, proving firm language like "your performance has been unacceptable and this is your final warning" never trips it while person-targeted insults, contempt, threats and shouting do.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 (3 planned, all complete — Task 3's two closing jobs were already satisfied by work landed in Tasks 1–2 and required no additional changes)
- **Files modified:** 2 created, 0 modified

## Accomplishments

- Built the false-positive corpus FIRST, before any implementation existed, per the plan's TDD-style ordering — the corpus is the specification, not a check added afterward.
- `FIRM_NOT_HOSTILE` (24 rows) derives at least three lines per seeded scenario from each record's own `studentObjective`/`situation`/`stakes`/`hiddenPosition`, and a script-level assertion (`SEEDED_CONVERSATIONS.every(...)`) guarantees the corpus cannot drift out of sync with the catalogue if a seeded scenario is ever added or removed.
- `detectHostility` implements the TARGETING rule as its core design: an attack term only becomes "hostile" when paired with explicit second-person reference in the same clause, with two named, commented veto patterns (`POSITION_OBJECT_PATTERN` for judgement-of-work/decision/process, `PROCESS_CONSEQUENCE_PATTERN` for consequences stated about HR/escalation/a-formal-process) that keep firm confrontation language out of the hostile tier.
- `SEVERE` is a fully separate tier, checked first and independent of targeting, using masked placeholder tokens in the test corpus so no real slur text is committed anywhere in the repo.
- Settled the Claude's-Discretion stonewalling question empirically: fed the six `STONEWALLING_CANDIDATES` rows through Phase 18's real `computeDisengagementOverTranscript`, got a printed value of **0.425** (materially non-zero against the 0.6 threshold Phase 18 uses elsewhere) — concluding stonewalling needs no new signal.
- Every constant introduced is labelled `PROVISIONAL UNTIL CALIBRATED` in a header block quoting Phase 18's calibration policy verbatim, naming the fixture corpus as the only evidence behind each number.

## Task Commits

1. **Task 1: Write the corpus and the failing verifier first** - `9e1cbfc` (test)
2. **Task 2: Implement the detector so the corpus passes** - `7e16630` (feat)
3. **Task 3: Record the provisional-calibration and stonewalling findings** - no new commit; both closing jobs (the CALIBRATION header comment in `lib/engine/hostility.ts` and the "Stonewalling coverage" verifier section) were already written as part of Tasks 1–2, confirmed present by grep/inspection, nothing left to change.

**Plan metadata:** (this commit)

## Files Created/Modified

- `scripts/verify-hostility-detector.ts` (390 lines) - Four corpora (`FIRM_NOT_HOSTILE` 24 rows, `HOSTILE` 14 rows, `SEVERE` 6 rows, `STONEWALLING_CANDIDATES` 6 rows) and seven verification sections: firm-is-not-hostile, hostility-detected, severe-is-separate, stonewalling-is-not-an-attack, determinism, corpus-covers-every-seeded-scenario, stonewalling-coverage (prints the 0.425 disengagement value).
- `lib/engine/hostility.ts` (300 lines) - `detectHostility`, `HOSTILITY_TIERS`, `HostilityVerdict`, `SEVERE_PLACEHOLDER_TOKENS`; clause-splitting, leet/separator-evasion normalization, ALL-CAPS shouting signal computed on original text, and the full CALIBRATION header block.

## Decisions Made

See `key-decisions` in frontmatter. In addition:

- The `INSULT_TERMS`/`CONTEMPT_PHRASES`/`PROFANITY_AT_PERSON_PHRASES`/`THREAT_TO_PERSON_PHRASES` lexicons were kept deliberately short and self-contained (explicit idiomatic phrases rather than broad generic patterns like `/end your \w+/`) specifically so legitimate process language — "ending your employment" (a stated HR decision), "I will escalate this to HR" — could never collide with threat detection. This trades lexicon breadth for false-positive safety, matching the plan's explicit preference ("missing a hostile turn costs one turn of accumulation; firing on a seeded firing conversation breaks the product").
- No corpus row required resolving as a deliberate false-negative — all `FIRM_NOT_HOSTILE`, `HOSTILE`, `SEVERE`, and `STONEWALLING_CANDIDATES` rows passed on the first fully-implemented pass of the detector (one regex-range bug fixed during Task 2, documented below, not a corpus conflict).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Severe-harassment regex range too narrow for one corpus row**
- **Found during:** Task 2 (implementing the detector; first full verifier run)
- **Issue:** `SEVERE_HARASSMENT_PHRASES`'s gap allowance between "keep touching my arm" and "where it goes" was `.{0,20}`, too short to span "like that and we'll see where it goes," so `"Keep touching my arm like that and we'll see where it goes."` was classified `tier: "none"` instead of `"severe"`.
- **Fix:** Widened the gap to `.{0,40}` and simplified the trailing alternative to the single phrase `where it goes` (dropped the redundant `see where` alternative).
- **Files modified:** `lib/engine/hostility.ts`
- **Verification:** Re-ran `npx tsx scripts/verify-hostility-detector.ts` — all 50 corpus assertions pass, `ALL PASS`.
- **Committed in:** `7e16630` (part of Task 2 commit)

**2. [Rule 3 - Blocking] eslint formatting warnings on the new module**
- **Found during:** Task 2, post-implementation lint pass
- **Issue:** `npx eslint lib/engine/hostility.ts` reported 5 prettier/padding-line-between-statements warnings (no errors) — blank-line spacing style only.
- **Fix:** Ran `npx eslint --fix lib/engine/hostility.ts` scoped to this single file only (never the bare repo-wide `npm run lint`, per this plan's explicit warning).
- **Files modified:** `lib/engine/hostility.ts`
- **Verification:** `npx eslint lib/engine/hostility.ts` now reports zero warnings/errors; `npx tsc --noEmit --pretty false` and the verifier both still pass.
- **Committed in:** `7e16630` (part of Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking/lint). Both scoped to the one new file this plan owns. No scope creep.

## Issues Encountered

An earlier executor turn ran `gsd-tools roadmap update-plan-progress 20` before this plan's SUMMARY.md existed, which overwrote `ROADMAP.md`'s hand-written Phase 20 plan-status line (`"Plans: 7 plans in 6 waves — planned 2026-10-08 (7f0726d), plan-checker VERIFICATION PASSED..."` and the progress table's `"Planned, verified"` cell) with a generic `"0/7 plans executed"` / `"Planned"` line, losing content. This was caught before committing and reverted with `git checkout -- .planning/ROADMAP.md`; `ROADMAP.md` is updated by hand below instead, preserving the existing prose while reflecting 1/7 plans executed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `detectHostility` exists, is fully proven against the seven seeded scenarios' own register, and has NO callers yet (confirmed: `grep -rn "detectHostility" lib app components` shows only the definition) — exactly the "ships the detector and its proof, nothing wired" boundary this plan specifies.
- 20-02 can now build the three new observable disengagement causes and the accumulation/ratchet logic directly on top of `detectHostility`'s tiers.
- 20-04's severe-content carve-out in `resolveTermination` has a clean, separately-enumerable `severe` tier and `SEVERE_PLACEHOLDER_TOKENS` precedent to follow (real severe lexicon entries, never placeholders, in production code).
- The stonewalling discretion finding (0.425, no new signal needed) is available for 20-02 to cite rather than re-litigate.

---
*Phase: 20-difficult-conversation-walk-outs*
*Completed: 2026-10-08*

## Self-Check: PASSED

- FOUND: `lib/engine/hostility.ts`
- FOUND: `scripts/verify-hostility-detector.ts`
- FOUND: commit `9e1cbfc` (Task 1)
- FOUND: commit `7e16630` (Task 2)
