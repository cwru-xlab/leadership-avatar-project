---
phase: 21-adaptive-mastery-path
plan: 25
subsystem: study-plan
tags: [knowledge-checks, ownership-scoping, s3, mastery, prisma, privacy]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path
    provides: "extractSessionMoments / SessionMoment (21-04); prepareMomentsForGeneration's momentOwnerUserIds contract (21-07); generateChecksForCompetency's GenerateChecksArgs shape (21-10); competencyForDimension / CompetencyKey catalog (21-02)"
provides:
  - "loadGenerationSources() in lib/study-plan/checks/sources.ts — the single, named, ownership-scoped assembler of 21-10's four inputs (REQ-123)"
  - "assembleSources() — the pure, DB/S3-free post-query assembly step, independently testable"
  - "assertMomentOwnerAlignment() / buildSelfNameVariants() — independently testable invariant/helper exports"
  - "GenerationSources / SOURCE_LIMITS / ReportForAssembly — the shapes 21-19's POST route consumes"
  - "scripts/verify-generation-sources.ts — 36-check battery (compile-time shape pin, pure behavior, DB-backed ownership end-to-end)"
affects: [21-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ownership scoped in every WHERE clause (userId: requestingUserId, status: READY) PLUS a throwing belt-and-braces assertion over the result set — never a post-filter, so a query-scoping bug surfaces as a thrown error instead of a silently-trimmed result"
    - "momentOwnerUserIds built in the SAME loop as moments, never via a later .map(), so index alignment is structural; assertMomentOwnerAlignment is still called and exported standalone so the invariant can be proven to fire on a constructed mismatch"
    - "Absent-vs-empty: a competency with zero contributing moments is left OUT of momentsByCompetency's Map entirely, never present with an empty array — the exact distinction 21-19's pre-check needs"
    - "Bounded concurrency (mapWithConcurrency, limit 4) for S3 transcript reads instead of a serial loop or unbounded Promise.all, respecting the route's 60s budget on both ends"
    - "DB/S3-free pure core (assembleSources) wrapped by a thin I/O shell (loadGenerationSources) — the pattern that let the full degradation/alignment/cap battery run with zero credentials"

key-files:
  created:
    - lib/study-plan/checks/sources.ts
    - scripts/verify-generation-sources.ts
  modified: []

key-decisions:
  - "Growth-area-to-competency mapping: ReportGrowthArea carries no dimension key of its own (only title/detail/suggestion/timecodes/source), so there is no direct per-growth-area competency link in the data model. The chosen mapping: for each report, compute the SET of competencies its non-null `scores` entries evidence (via competencyForDimension), then attribute every moment that links to at least one growth area (linkedGrowthAreaTitles.length > 0) to every competency in that set. A moment with no linked growth area contributes to no competency's queue. This is a judgment call the plan's prose did not fully specify a mechanism for — documented here rather than left implicit."
  - "selfNames: User carries a single `name` field (no separate first/preferred-name column), so the 'every distinct non-empty variant' requirement resolves to: full name, plus its first whitespace token when that differs from the full name, case-insensitively deduplicated, dropping anything under 2 characters. Extracted as a pure, exported buildSelfNameVariants() so the DB-free battery can test it directly."
  - "assertMomentOwnerAlignment and buildSelfNameVariants are exported standalone (not just inlined) specifically so the battery can prove the alignment invariant fires on a constructed violation and exercise selfNames edge cases without a database — construction already guarantees alignment in the real code path, so there is no organic way to break it end-to-end."
  - "A report whose transcript read fails/is absent is excluded from BOTH moments and transcriptsByReportId; a report whose transcript succeeds but whose structured report is missing/invalid is ALSO excluded from both (not just from moments) — a transcript nobody can site a quote against must not leak into the output either."
  - "A foreign report id is silently absent from the result (not degraded, not erroring) — degradedReports is reserved for a report the requesting user owns but could not be used; a non-owned id must look indistinguishable from one that never existed."

patterns-established:
  - "Pattern: belt-and-braces ownership assertion over an already-scoped query result, throwing rather than filtering, documented explicitly as 'surfaces a query bug instead of hiding it.'"
  - "Pattern: pure assembly core + thin I/O shell, specifically to keep a credential-gated adversarial battery runnable with zero environment variables."

requirements-completed: [REQ-123]

# Metrics
duration: ~70min
completed: 2026-10-20
---

# Phase 21 Plan 25: Ownership-Scoped Generation Source Assembler Summary

**`lib/study-plan/checks/sources.ts` ships `loadGenerationSources()` — the one named, exported assembler that turns a requesting user and a set of report ids into `generateChecksForCompetency`'s four inputs plus 21-19's availability pre-check index, with ownership enforced in every WHERE clause plus a throwing assertion, index alignment guaranteed by construction, bounded S3 concurrency, and per-report degradation that never fails the whole assembly.**

## Performance

- **Duration:** ~70 min
- **Completed:** 2026-10-20
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- `loadGenerationSources(requestingUserId, reportIds, opts?)` scopes `prisma.interactionReport.findMany` by `userId: requestingUserId` AND `status: "READY"` in the WHERE clause, then asserts (throws, never post-filters) that every returned row's `userId` matches — a query bug surfaces loudly instead of being quietly trimmed.
- `selfNames` is built from `User.name` (the schema's single name field) via the exported pure `buildSelfNameVariants()`: full name + distinct first token, case-insensitively deduped, 2-character floor, `[]` when unset.
- Transcripts are read with bounded concurrency 4 (`mapWithConcurrency`) via an injectable `readTranscript` (defaults to `s3Storage.getInterviewTranscript`); a missing key, a failed read, or a missing/invalid `StructuredReport` degrades exactly that report (`degradedReports`, reason recorded) without touching any other report's moments.
- `moments` and `momentOwnerUserIds` are built in the same per-report loop (never a later `.map()`), with the alignment invariant both guaranteed by construction and asserted via the standalone-exported `assertMomentOwnerAlignment()`, which the battery proves fires on a constructed six-moments/five-ids mismatch.
- `momentsByCompetency` groups growth-area-linked moments by the competencies a report's scored dimensions evidence (via 21-02's `competencyForDimension`); a competency with zero contributing moments is absent from the `Map` entirely — proven via `has(key) === false`, not an empty array.
- The per-competency cap (`SOURCE_LIMITS.maxMomentsPerCompetency`, 12) keeps the most recent reports' moments, proven against actual `createdAt` dates in a 30-moment/one-competency test, not just a count.
- `assembleSources()` is the pure, DB/S3-free post-query step that makes all of the above testable with zero credentials; `scripts/verify-generation-sources.ts` runs 36 checks across three sections — compile-time shape pin, pure behavior, and a database-backed ownership end-to-end section proving a foreign report's transcript text is absent from a full `JSON.stringify` sweep of the result, not just from the obvious fields.
- The module imports nothing from `lib/engine/`, calls neither a model nor 21-07's redaction entry point, and the compile-time shape pin (`Parameters<typeof generateChecksForCompetency>[0]` satisfied by `GenerationSources`'s spread) was demonstrated once to fail `tsc` when a field was renamed, then restored.

## Task Commits

1. **Task 1: Build the ownership-scoped source assembler** — `51b8c5e` (feat) — `lib/study-plan/checks/sources.ts`
2. **Task 2: Battery — ownership, shape match, alignment, degradation** — `aea255f` (test) — `lib/study-plan/checks/sources.ts` (alignment/selfNames helpers extracted for testability), `scripts/verify-generation-sources.ts`

**Plan metadata:** (this commit) — `docs(21-25): complete generation source assembler plan`

## Files Created/Modified

- `lib/study-plan/checks/sources.ts` (~410 lines) — `loadGenerationSources`, `assembleSources`, `assertMomentOwnerAlignment`, `buildSelfNameVariants`, `GenerationSources`, `SOURCE_LIMITS`, `ReportForAssembly`, `AssembleSourcesArgs`
- `scripts/verify-generation-sources.ts` (~610 lines) — 36-check battery: Section 1 (shape pin), Section 2 (pure `assembleSources` behavior, 8 sub-cases), Section 3 (DB-backed ownership end-to-end, 9 checks)

## Decisions Made

See `key-decisions` in frontmatter. The one genuinely open judgment call: `ReportGrowthArea` carries no dimension key, so growth-area-to-competency attribution is derived from the REPORT's scored dimensions (via `competencyForDimension`) intersected with which moments actually link to a growth area — not from a fresh per-growth-area judgment. This is a reasonable, data-driven reading of the plan's instruction to "go through the report's scored dimensions and growth areas," but it is a judgment call worth a reviewer's attention, since the plan did not name an exact algorithm.

## Deviations from Plan

None affecting scope — one necessary internal refactor. The plan's Task 2 instructs extracting "the post-query assembly into an exported pure `assembleSources(...)`... if it is not already separable." It was not separable as originally written (Task 1's inline alignment-assertion and selfNames logic were private), so two additional exports were added during Task 2 specifically to make the invariant and the selfNames edge cases independently testable without a database: `assertMomentOwnerAlignment()` (so the inverted-alignment test could prove the throw fires on a real constructed mismatch, since the real code path's construction never produces one organically) and `buildSelfNameVariants()` (the pure half of the DB-backed `loadSelfNames`). Both are additive exports on the same file from Task 1; no behavior changed.

Two bugs caught and fixed in the verifier's own test fixtures before the final passing run (not defects in `sources.ts`):
- The 30-report cap-enforcement fixture initially computed `createdAt` dates in the wrong direction (newest index given the oldest date), which would have made the cap test pass by coincidence rather than by proving recency; fixed to the correct ascending mapping.
- The cross-user leak-detection fixture initially gave users A and B transcripts with identical placeholder text (both "second 5"), which would have made the "B's text appears nowhere" assertion pass trivially since A's own legitimately-included text matched too; fixed by giving B's transcript a distinct timestamp/text.

## Issues Encountered

None beyond the two verifier-fixture bugs above, both caught and fixed before the Task 2 commit landed.

## User Setup Required

None — no external service configuration required. `DATABASE_URL` is set in the local environment (auto-loaded, per this project's existing convention); Section 3 of the battery ran against the real local database with real, cleaned-up `User`/`InteractionReport` fixtures. S3 access is injectable and no AWS credentials were used or required.

## Next Phase Readiness

- `loadGenerationSources`'s return shape (`GenerationSources`) is compile-time pinned to `generateChecksForCompetency`'s (21-10) parameter shape; 21-19's route can call `loadGenerationSources(userId, reportIds)` directly and spread the result into `generateChecksForCompetency`.
- `momentsByCompetency` is ready for 21-19's POST pre-check: `momentsByCompetency.has(competencyKey)` is the exact absent/available signal it needs, with no risk of a false "available" from an empty array.
- 21-19's own verifier is expected to assert its route contains no `s3Storage`/`getInterviewTranscript`/`prisma.user.find` — all of that now lives exclusively in `lib/study-plan/checks/sources.ts`.
- No blockers identified for downstream plans.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-20*

## Self-Check: PASSED
