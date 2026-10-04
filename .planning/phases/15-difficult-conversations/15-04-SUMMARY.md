---
phase: 15-difficult-conversations
plan: 04
subsystem: content
tags: [seeded-catalog, heygen, avatar-assignment, difficult-conversation, verification]

requires:
  - phase: 15-02
    provides: DifficultConversationRecord, DC_LIMITS, validateDifficultConversationInput, loadOwnedDifficultConversation
provides:
  - SEEDED_CONVERSATIONS — seven typed built-in records with findSeededConversation
  - assignSeededAvatar — deterministic live ACTIVE catalog pick with paired voice
  - scripts/verify-dc-seeded.ts — eight-section proof (validator, ownership, live avatars)
affects: [15-06, 15-07, 15-11]

tech-stack:
  added: []
  patterns:
    - "Seeded records are code with ownerId null (not S3); avatarId/voiceId resolved at runtime"
    - "Deterministic catalog index via sha256(conversationId) over sorted ACTIVE avatars"
    - "Same validateDifficultConversationInput for seeded and authored — no privileged exception"

key-files:
  created:
    - lib/difficult-conversation/avatar-assignment.ts
    - lib/difficult-conversation/seeded.ts
    - scripts/verify-dc-seeded.ts
  modified: []

key-decisions:
  - "Default difficulty band is guarded for all seven; student may pick another at setup"
  - "Three neighbours: client slip (outward), peer attribution (no authority), senior decline (upward refusal)"
  - "Avatar filter lives in avatar-assignment.ts mirroring interviewers route (parallel wave cannot edit that route)"
  - "genderHint via SEEDED_AVATAR_GENDER_HINTS + first-name soft match when API omits gender"

patterns-established:
  - "UNRESOLVED empty avatar/voice placeholder filled by assignSeededAvatar"
  - "Catalog-churn risk fails loudly in verify-dc-seeded, not silently at session start"

issues-created: []

duration: 5min
completed: 2026-10-04
---

# Phase 15 Plan 04: Seeded Catalog Summary

**Seven role-specific difficult conversations as version-controlled code records with deterministic live ACTIVE avatar assignment and an eight-section verification script**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-04T04:22:54Z
- **Completed:** 2026-10-04T04:27:36Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Deterministic `assignSeededAvatar` from the live ACTIVE+default_voice catalog (paired voice, loud failure)
- Seven seeded records (brief's four + three power-direction neighbours), all `ownerId: null`, default `difficulty: "guarded"`
- `scripts/verify-dc-seeded.ts` proves validator parity, withheld hidden position, unownability, and today's resolved avatar pairs

## Task Commits

1. **Task 1: Deterministic avatar assignment from the live catalog** - `f900c63` (feat)
2. **Task 2: The seven seeded conversations** - `8043ae9` (feat)
3. **Task 3: Prove the catalog is valid, unownable, and resolvable today** - `bdc5639` (feat)

**Plan metadata:** `b29fab0` (docs: complete plan)

## Seeded catalog (stable ids for 15-11)

| Id | One-line summary |
|----|------------------|
| `confront-low-performer` | Manager gets a written improvement plan from a slipping direct report |
| `fire-team-member` | Manager delivers a signed-off termination with dignity, no renegotiation |
| `ask-for-raise` | IC secures a specific number and date from their manager |
| `challenge-grade` | Student wins a rubric-tied regrade or written explanation from a professor |
| `deliver-bad-news-client` | Account lead lands a six-week slip date and keeps the client |
| `peer-conflict` | Peer lead locks an attribution agreement without managerial authority |
| `decline-senior-request` | Team lead declines or renegotiates an unabsorbable senior ask |

**Default difficulty:** `guarded` for all seven (middle band; student chooses at setup).

### Neighbour choices (Claude's Discretion)

1. **`deliver-bad-news-client`** — outward-facing; no authority over the other person
2. **`peer-conflict`** — no power differential; holding the line without authority
3. **`decline-senior-request`** — upward refusal; the inverse of `ask-for-raise`

## Avatar pairs resolved at verification time

Resolved 2026-10-04 against this account's ACTIVE LiveAvatar catalog (5 usable profiles). Pairs are deterministic per id while the catalog is unchanged; they are **not** hardcoded in the records.

| Conversation | Avatar (name) | avatarId / voiceId |
|--------------|---------------|--------------------|
| `confront-low-performer` | Jenny Hawkins | `0192261e-bef3-4de4-be8d-8ed075b9aea9` / `d40f2c2f-dace-4cfa-8d43-36432c3ef495` |
| `fire-team-member` | Scott Cowen | `52b24044-7b0c-4211-b113-239443801a5b` / `66f105d8-a342-4a5d-9d41-6ffd21674806` |
| `ask-for-raise` | Scott Cowen | `52b24044-7b0c-4211-b113-239443801a5b` / `66f105d8-a342-4a5d-9d41-6ffd21674806` |
| `challenge-grade` | Jenny Hawkins | `0192261e-bef3-4de4-be8d-8ed075b9aea9` / `d40f2c2f-dace-4cfa-8d43-36432c3ef495` |
| `deliver-bad-news-client` | Richard Boyatsis | `c0fdc362-a015-40b9-bb20-ec8805ddb01e` / `a2677eec-c829-4f63-af8f-9ddc766f6600` |
| `peer-conflict` | Richard Boyatsis | `c0fdc362-a015-40b9-bb20-ec8805ddb01e` / `a2677eec-c829-4f63-af8f-9ddc766f6600` |
| `decline-senior-request` | Jenny Hawkins | `0192261e-bef3-4de4-be8d-8ed075b9aea9` / `d40f2c2f-dace-4cfa-8d43-36432c3ef495` |

Gender hints (`SEEDED_AVATAR_GENDER_HINTS`) narrow the pool when a first-name match exists; API payloads on this account omit `gender`.

## Files Created/Modified

- `lib/difficult-conversation/avatar-assignment.ts` — fetch/filter ACTIVE catalog; `assignSeededAvatar`
- `lib/difficult-conversation/seeded.ts` — seven records, `findSeededConversation`, gender hints
- `scripts/verify-dc-seeded.ts` — eight-section executable proof

## Decisions Made

- Kept the ACTIVE+default_voice filter in `avatar-assignment.ts` rather than extracting from `app/api/interview/interviewers/route.ts`, because parallel Phase 15/16 waves forbid editing that route; criteria are mirrored and documented.
- Soft gender matching uses API `gender` when present, else a small first-name set; empty match falls back to the full catalog (hint, never requirement).
- Empty avatar/voice ship as `UNRESOLVED` (`""`) so records stay validator-clean and grep for hardcoded `avatarId: "` stays empty.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Avatar filter not extracted into the interviewers route**
- **Found during:** Task 1
- **Issue:** Plan preferred extracting shared filter from the route; parallel-wave file boundary forbids modifying `app/api/interview/interviewers/route.ts`
- **Fix:** Implemented identical ACTIVE/non-expired/default_voice filter in `avatar-assignment.ts` with a sync comment
- **Files modified:** `lib/difficult-conversation/avatar-assignment.ts`
- **Verification:** `assignSeededAvatar` resolves pairs; verify section 7 passes
- **Committed in:** `f900c63` (Task 1)

**2. [Rule 3 - Blocking] LiveAvatar API has no `gender` field on this account**
- **Found during:** Task 1 (catalog probe)
- **Issue:** `genderHint` cannot match an API field that is always undefined
- **Fix:** Soft first-name match with full-catalog fallback
- **Files modified:** `lib/difficult-conversation/avatar-assignment.ts`
- **Verification:** Female-hinted ids resolve to Jenny Hawkins; male-hinted ids resolve to male avatars
- **Committed in:** `f900c63` (Task 1)

**3. [Rule 1 - Bug] Prettier vs plan grep on empty `avatarId: ""`**
- **Found during:** Task 3 (eslint)
- **Issue:** Double-quoted empty strings match `avatarId: "` grep; single quotes fail prettier
- **Fix:** `const UNRESOLVED = ""` referenced by all records
- **Files modified:** `lib/difficult-conversation/seeded.ts`
- **Verification:** `grep -rn 'avatarId: "' lib/difficult-conversation/` empty; verify exits 0
- **Committed in:** `bdc5639` (Task 3)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug), 0 deferred
**Impact on plan:** Necessary for parallel-safe execution and clean verification; no scope creep.

## Issues Encountered

- Parallel agents restored/touched other Phase 15/16 files concurrently; this plan only committed the three allowed paths (+ SUMMARY/docs).
- Working tree had `scripts/verify-dc-store.ts` deleted locally; restored from HEAD for cross-check only (not part of this plan's diff).

## Next Phase Readiness

- Plans 15-06 / 15-07 / 15-11 can import `SEEDED_CONVERSATIONS`, `findSeededConversation`, and `assignSeededAvatar`
- Resolver should call `assignSeededAvatar(id, { genderHint: SEEDED_AVATAR_GENDER_HINTS[id] })` at session start
- No `lib/engine/` dependency from this plan

## Self-Check: PASSED

- FOUND: `lib/difficult-conversation/avatar-assignment.ts`
- FOUND: `lib/difficult-conversation/seeded.ts`
- FOUND: `scripts/verify-dc-seeded.ts`
- FOUND: commit `f900c63`
- FOUND: commit `8043ae9`
- FOUND: commit `bdc5639`
- VERIFIED: `npx tsx scripts/verify-dc-seeded.ts` exits 0 (all eight sections)
- VERIFIED: `npx tsx scripts/verify-dc-store.ts` exits 0
- VERIFIED: no `lib/engine` imports in seeded/avatar-assignment

---
*Phase: 15-difficult-conversations*
*Completed: 2026-10-04*
