---
phase: 13-one-on-one-conversation-engine
plan: 07
subsystem: api
tags: [typescript, session, InteractionReport, nextjs, REQ-59, REQ-62, REQ-64, REQ-69, REQ-72]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "lib/engine/{types,registry,resolve}.ts from 13-01 — InteractionTypeConfig + resolveSessionConfig"
  - phase: 13-one-on-one-conversation-engine
    provides: "InteractionReport + InputSnapshot from 13-02"
  - phase: 13-one-on-one-conversation-engine
    provides: "resolveTermination / validateOutcome from 13-03"
  - phase: 13-one-on-one-conversation-engine
    provides: "runAndPersistEvaluation({ reportId }) from 13-05"
provides:
  - "lib/engine/session.ts: startSession / checkpointSession / finishSession — the one lifecycle"
  - "/api/practice/session/{start,checkpoint,finish} — the one HTTP surface (REQ-59)"
  - "Five legacy session routes as thin delegations pending 13-13 deletion"
affects: [13-08-report-routes, 13-10-interview-client-migrate, 13-11-scenario-client-migrate, 13-13-delete-legacy-routes, "14-16 new interaction types"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Type-declared checkpointing: 'client-driven' | 'none' and finishPendingFlip: 'request-path' | 'runner' preserve Section-A divergences (REQ-69)"
    - "Handlers return plain result objects; routes own auth + NextResponse status mapping"
    - "parseMetricsPayload sits above the finish-shape branch so no type can skip it (REQ-72)"

key-files:
  created:
    - lib/engine/session.ts
    - app/api/practice/session/start/route.ts
    - app/api/practice/session/checkpoint/route.ts
    - app/api/practice/session/finish/route.ts
  modified:
    - lib/engine/types.ts
    - lib/engine/registry.ts
    - app/api/interview/session/start/route.ts
    - app/api/interview/session/checkpoint/route.ts
    - app/api/interview/session/finish/route.ts
    - app/api/scenario/session/start/route.ts
    - app/api/scenario/session/finish/route.ts

key-decisions:
  - "Added checkpointing and finishPendingFlip as declared InteractionTypeConfig fields so REQ-69 divergences are readable and assertable, not slug if-chains."
  - "case-study start still returns the InteractionLog to callers (practice route includes it; legacy scenario start returns {success, reportId, log} at 201) — required by the un-migrated case-play client."
  - "Legacy routes preserve today's status codes (201 start, interview finish 202 with status PENDING, scenario 409 without reportId) while practice routes use the unified 200/202/409 contract."

requirements-completed: [REQ-62, REQ-64]
# REQ-59 remains open as a split: this plan delivers one start/checkpoint/finish;
# report-GET still needs 13-08+. REQ-69 is the phase-wide invisibility constraint
# (session divergences preserved here; report chrome / client migrate later).
# REQ-72 already MET in 13-05; reinforced by unconditional parseMetricsPayload.

# Metrics
duration: 4min
completed: 2026-10-04
---

# Phase 13 Plan 07: Unified Session Lifecycle Summary

**One `startSession` / `checkpointSession` / `finishSession` module plus `/api/practice/session/{start,checkpoint,finish}` collapses five per-type session routes into one engine lifecycle that always writes `InteractionReport`, always parses metrics, and preserves interview-vs-scenario checkpoint/finish divergences as type-declared properties.**

## Performance

- **Duration:** ~4 min (measured wall clock from plan init to summary)
- **Started:** 2026-10-04T02:21:44Z
- **Completed:** 2026-10-04T02:25:08Z
- **Tasks:** 3
- **Files modified:** 10 (4 created, 6 modified; plus types/registry for declared lifecycle fields)

## Accomplishments
- `lib/engine/session.ts` owns start / checkpoint / finish for every type, writing `InteractionReport` only (no dual-write).
- Type records declare `checkpointing` and `finishPendingFlip`; case-study checkpoint calls are rejected with 400.
- Practice routes expose the one HTTP surface; five legacy routes are thin auth+translate wrappers with today's response contracts.
- Local API E2E: interview (start → 3 checkpoints → finish → READY) and scenario (start → finish, zero checkpoints → READY).

## Engine route request/response shapes (for 13-10 / 13-11 clients)

### `POST /api/practice/session/start`
**Body:** `{ typeSlug, instanceId?, customization?, cameraMode?, interviewerAvatarId?, interviewerName?, resumeId?, resumeText?, language? }`
**200:** `{ reportId, cameraMode }` — case-study also includes `{ success: true, log }`
**400** unknown slug; **401** unauth; **404** missing/unplayable instance

### `POST /api/practice/session/checkpoint`
**Body:** `{ reportId, turns, progress? }`
**200:** `{ ok: true, turnCount }`
**400** if type declares `checkpointing: "none"`; **409** if not `IN_PROGRESS`

### `POST /api/practice/session/finish`
**Body:** `{ reportId, turns?, progress?, metrics?, log?, terminationReason?, terminationSource?, outcome? }`
**202:** `{ reportId }`
**409:** `{ error, reportId, status }` on double-submit

## Type-declared divergences (REQ-69)

| Property | Interview presets | case-study |
| --- | --- | --- |
| `checkpointing` | `"client-driven"` | `"none"` |
| `finishPendingFlip` | `"request-path"` (PENDING in finish) | `"runner"` (runner flips) |
| Start shape | One Prisma write, zero S3 | S3 getCase → Prisma → InteractionLog → compensating delete → second Prisma write |

## Real local sessions verified

| Type | reportId | Path | Checkpoints | Final status |
| --- | --- | --- | --- | --- |
| `general` (interview) | `67737230-2573-47fb-b3ed-52d2a5531118` | legacy `/api/interview/session/*` | 3 (simulated) | READY (`gpt-4.1`) |
| `case-study` | `f13011bb-2f76-48b3-8f6f-6ea93a01dd12` | legacy `/api/scenario/session/*` | 0 (checkpoint rejected 400) | READY (`gpt-4.1`) |

Neither row exists in `InterviewReport` / `ScenarioReport`. Also verified practice-route contracts: start 200, finish 202 then 409 with `reportId`+`status`, bogus slug 400, case-study start 200 with log.

## Task Commits

Each task was committed atomically:

1. **Task 1: The engine session lifecycle** - `10229ce` (feat)
2. **Task 2: Expose the three engine routes** - `ac84db7` (feat)
3. **Task 3: Reduce the five legacy session routes to thin delegations** - `1a8957c` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/engine/session.ts` — start/checkpoint/finish handlers
- `lib/engine/types.ts` / `registry.ts` — `checkpointing` + `finishPendingFlip` on every built-in type
- `app/api/practice/session/{start,checkpoint,finish}/route.ts` — the one endpoints
- Five legacy session routes — DEPRECATED thin delegations

## Decisions Made
See `key-decisions` in frontmatter. Clients (`InterviewSessionShell`, `case-play/[caseId]/page.tsx`) were deliberately left byte-unchanged for 13-10/13-11.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] case-study start must return `log`**
- **Found during:** Task 1
- **Issue:** Plan said return `{ reportId, cameraMode }` for both, but the case-play client requires `data.log` from start.
- **Fix:** `StartSessionSuccess.log` optional; practice + legacy scenario start include it.
- **Files modified:** `lib/engine/session.ts`, start routes
- **Committed in:** `10229ce` / `ac84db7` / `1a8957c`

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Required to keep un-migrated case-play working; no scope creep.

## Issues Encountered
None blocking. Full browser avatar sessions were not run (HeyGen); verification used the same legacy HTTP paths the UI calls, exercised end-to-end against local PostgreSQL + S3, with evaluation confirming READY.

## User Setup Required
None.

## Next Phase Readiness
- 13-08 can build report GET against `InteractionReport`.
- 13-10 / 13-11 can point clients at `/api/practice/session/*` using the shapes above.
- 13-13 can delete the five DEPRECATED files once no client calls them.
- REQ-67 shared-DB migrate remains deferred (local only).

## Self-Check: PASSED

All claimed files found on disk; task commits `10229ce`, `ac84db7`, `1a8957c` found in `git log`.

---
*Phase: 13-one-on-one-conversation-engine*
*Completed: 2026-10-04*
