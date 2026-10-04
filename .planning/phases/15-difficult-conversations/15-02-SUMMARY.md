---
phase: 15-difficult-conversations
plan: 02
subsystem: infra
tags: [s3, validation, ownership, difficult-conversation, privacy]

requires:
  - phase: 09-scenario-authoring
    provides: Owner-scoped CRUD, 404-never-403 loader, published-is-discovery-only semantic
provides:
  - DifficultConversationRecord type with DIFFICULTY_BANDS and DC_LIMITS
  - validateDifficultConversationInput (all failing fields at once)
  - DIFFICULT_CONVERSATIONS_PREFIX S3 object type + index
  - loadOwnedDifficultConversation / loadDifficultConversationForPlay / save / list / delete
affects: [15-04, 15-05, 15-07]

tech-stack:
  added: []
  patterns:
    - "New S3 object type with own prefix+index (ported from cases/, not retrofitted)"
    - "404-never-403 owner loader returns null uniformly"
    - "published gates discovery only; forPlay ignores published and ownership"

key-files:
  created:
    - lib/difficult-conversation/types.ts
    - lib/difficult-conversation/validation.ts
    - lib/difficult-conversation/store.ts
    - scripts/verify-dc-store.ts
  modified:
    - lib/s3-client.ts

key-decisions:
  - "Three difficulty bands: receptive / guarded / hostile (Claude's Discretion)"
  - "DC_LIMITS sized for gradeable scenarios without essays"
  - "listDifficultConversationObjects returns index summaries (never hiddenPosition)"

patterns-established:
  - "One shared validator importable by routes and client UI"
  - "ownerId and published stamped server-side only on save"
  - "forPlay is the session read path; callers must strip hiddenPosition"

issues-created: []

duration: 7min
completed: 2026-10-04
---

# Phase 15 Plan 02: Difficult-Conversation Store Summary

**New S3 object type under `difficult-conversations/` with shared validator, 404-never-403 ownership, and published-is-discovery-only play path**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-04T04:13:18Z
- **Completed:** 2026-10-04T04:20:28Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- `DifficultConversationRecord` with documented `hiddenPosition` / `published` semantics and three difficulty bands
- Single `validateDifficultConversationInput` returning every failing field with problem+fix copy
- S3 helpers on `DIFFICULT_CONVERSATIONS_PREFIX` plus owner-scoped store (no `lib/engine/` dependency)
- `scripts/verify-dc-store.ts` proves all eleven sections against the live bucket

## Task Commits

1. **Task 1: The record type and the one validator** - `3a80774` (feat)
2. **Task 2: The S3 layer and the owner-scoped loader** - `6614473` (feat)
3. **Task 3: Prove validation, ownership and the privacy boundary** - `4142970` (feat)

**Plan metadata:** `4fd31d8` (docs: complete plan)

## Contract for downstream plans (15-04 / 15-05 / 15-07)

### Difficulty bands

```ts
DIFFICULTY_BANDS = ["receptive", "guarded", "hostile"] as const
```

- `receptive` — defensive but reachable
- `guarded` — deflects, needs to be pinned down
- `hostile` — counter-attacks; bottom line stated late

Hidden entirely during the live session.

### DC_LIMITS

| Field | Min | Max |
|-------|-----|-----|
| title | 4 | 80 |
| avatarRole | 2 | 80 |
| studentRole | 2 | 80 |
| situation | 40 | 1200 |
| sharedBackstory | 40 | 2000 |
| hiddenPosition | 40 | 2000 |
| studentObjective | 10 | 400 |
| stakes | 10 | 600 |

### S3 layout

- Prefix: `difficult-conversations/` (`DIFFICULT_CONVERSATIONS_PREFIX`)
- Object key: `difficult-conversations/{id}.json`
- Index key: `difficult-conversations/index.json`
- Does **not** touch `cases/`

### Store signatures

```ts
loadOwnedDifficultConversation(id: string, userId: string): Promise<DifficultConversationRecord | null>
loadDifficultConversationForPlay(id: string): Promise<DifficultConversationRecord | null>
saveDifficultConversation(input: DifficultConversationSaveInput, userId: string): Promise<DifficultConversationRecord>
listDifficultConversations(options?: { ownerId?: string; publishedOnly?: boolean }): Promise<DifficultConversationSummary[]>
deleteDifficultConversation(id: string, userId: string): Promise<boolean>
```

`DifficultConversationSummary` = index entry fields only (id, title, avatarRole, difficulty, published, ownerId, updatedAt) — never `hiddenPosition`.

## Files Created/Modified

- `lib/difficult-conversation/types.ts` — record type, bands, limits
- `lib/difficult-conversation/validation.ts` — shared all-fields validator
- `lib/difficult-conversation/store.ts` — owner/play loaders, save, list, delete
- `lib/s3-client.ts` — new prefix + five object helpers + index (additive only)
- `scripts/verify-dc-store.ts` — executable proof (11 sections)

## Decisions Made

- Index listing returns lightweight summaries rather than hydrating full objects (privacy + speed)
- `saveDifficultConversation` throws `"Difficult conversation not found"` on non-owned update; loaders return `null` for the 404-never-403 rule
- Verify script dynamic-imports modules after dotenv so AWS credentials resolve at S3 client init

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] dotenv must load before s3-client import**
- **Found during:** Task 3 (verify script)
- **Issue:** ESM import hoisting constructed the S3 client with empty credentials before `dotenv.config()` ran
- **Fix:** Restructured `scripts/verify-dc-store.ts` to `loadEnv` then dynamic-import store/s3 modules; probe via a real write that throws on credential failure
- **Files modified:** `scripts/verify-dc-store.ts`
- **Verification:** `npx tsx scripts/verify-dc-store.ts` exits 0, all 11 sections pass
- **Committed in:** `4142970` (Task 3)

---

**Total deviations:** 1 auto-fixed (1 blocking), 0 deferred
**Impact on plan:** Required for the verification script to hit S3; no scope creep.

## Issues Encountered

None beyond the dotenv load-order fix above.

## Next Phase Readiness

- Plans 15-04 (routes) and 15-05 (publish) can import store + validator directly
- Plan 15-07 can list via `listDifficultConversations` without ever seeing `hiddenPosition`
- No Phase 13 / `lib/engine/` dependency

## Self-Check: PASSED

- FOUND: `lib/difficult-conversation/types.ts`
- FOUND: `lib/difficult-conversation/validation.ts`
- FOUND: `lib/difficult-conversation/store.ts`
- FOUND: `lib/s3-client.ts` contains `DIFFICULT_CONVERSATIONS_PREFIX`
- FOUND: `scripts/verify-dc-store.ts`
- FOUND: commit `3a80774`
- FOUND: commit `6614473`
- FOUND: commit `4142970`

---
*Phase: 15-difficult-conversations*
*Completed: 2026-10-04*
