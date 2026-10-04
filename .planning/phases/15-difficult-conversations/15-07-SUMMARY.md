---
phase: 15-difficult-conversations
plan: 07
subsystem: ui
tags: [discovery, authoring, publish-gate, conversations, difficult-conversation]

requires:
  - phase: 15-difficult-conversations
    provides: "List/add/edit/delete/publish routes + response shapes (15-05)"
  - phase: 15-difficult-conversations
    provides: "Shared validator + DC_LIMITS (15-02)"
provides:
  - "Three-section /conversations discovery (Featured → Mine → From other students)"
  - "ConversationCard with Practice + owner-only actions"
  - "ConversationBuilder six-field form with 422/503 publish panels"
  - "Owner-only edit at /conversations/[id] via loadOwnedDifficultConversation → notFound"
  - "Dashboard tile difficult-conversations → /conversations live"
affects: [15-08, 15-11]

tech-stack:
  added: []
  patterns:
    - "Provenance from section headings, not mixed-list badges (Phase 9 /case-play mirror)"
    - "Client imports validateDifficultConversationInput — same module as server routes"
    - "422 rejected panel vs 503 try-again panel — distinct copy, no moderation path"
    - "Edit page: server loadOwnedDifficultConversation + notFound() (404-never-403)"

key-files:
  created:
    - app/conversations/page.tsx
    - app/conversations/new/page.tsx
    - app/conversations/[id]/page.tsx
    - components/difficult-conversation/ConversationCard.tsx
    - components/difficult-conversation/ConversationBuilder.tsx
  modified:
    - lib/interactions/index.ts
    - app/api/difficult-conversation/list/route.ts
    - middleware.ts

key-decisions:
  - "Registry lives at lib/interactions/index.ts (plan said registry.ts) — flipped difficult-conversations to route /conversations, availability live"
  - "List summaries hydrate studentRole/situation/lastCheckStatus from full records so cards meet CONTEXT fields without a get route"
  - "Edit page is a Server Component using loadOwnedDifficultConversation — seeded/non-owner → notFound()"
  - "Parallel skip_checkpoints:true — Task 3 human walkthrough deferred to /gsd/verify-work 15"

patterns-established:
  - "Practice links always /practice/difficult-conversation/{id}"
  - "Publish panels: rejected = reason+fix+still-playable; unavailable = try-again without rejected/violation language"
  - "Hidden stance collected only in builder, never on cards or list wire"

requirements-completed: [P15-SC2, P15-SC3]

duration: 25min
completed: 2026-10-04
---

# Phase 15 Plan 07: Discovery + Authoring UI Summary

**Three-section /conversations catalog and six-field builder with honest 422/503 publish panels, wiring the dashboard tile to the live route**

## Performance

- **Duration:** 25 min
- **Started:** 2026-10-04T04:29:26Z
- **Completed:** 2026-10-04T04:50:00Z
- **Tasks:** 2 auto complete; 1 human-verify deferred (parallel skip_checkpoints)
- **Files modified:** 8

## Accomplishments

- Discovery at `/conversations` in locked order: Featured → Your conversations → From other students
- Cards offer Practice for everyone; Edit/Publish/Delete only when `isMine`
- Builder shares server validator; save stays private; publish shows reason+fix or try-again
- Owner edit via server loader; seeded/other-user ids → standard not-found
- Dashboard `difficult-conversations` tile points at `/conversations` (live)

## Task Commits

1. **Task 1: The three-section discovery page and the card** - `0176377` (feat)
2. **Task 2: The builder — six fields, shared validation, honest publish** - `3248834` (feat); follow-up `558037f` (fix: page copy / min_lines)
3. **Task 3: Human walkthrough** - deferred (see below)

**Plan metadata:** (docs commit after this file)

## Deferred human verify

Parallelization config has `skip_checkpoints: true`. Interactive Task 3 was **not** blocked on. Re-run via `/gsd/verify-work 15` (or manual walkthrough). Automated checks already run:

- `npx tsx scripts/verify-dc-routes.ts` — ALL SECTIONS PASSED
- `npx tsx scripts/verify-dc-store.ts` — all sections passed
- `npx tsx scripts/verify-dc-seeded.ts` — all eight sections passed
- `npx tsx scripts/verify-dc-prepublish.ts` — ALL SECTIONS PASSED
- Scoped `tsc` clean for plan files; no `hiddenPosition` / appeal / moderator copy in UI paths

### Walkthrough steps for later verification

**A — The catalog**
1. Open `/conversations`. Confirm three headed sections in order: Featured, Your conversations, From other students — provenance from section, not a badge.
2. Confirm all seven featured conversations appear and read as real situations.

**B — Author and practise immediately (P15-SC2)**
3. Write a scenario. Confirm helper under "What they privately think" makes it clear the player never sees that field.
4. Submit with two fields too short — both errors inline with reason+fix.
5. Fix and save — land on **Practise it now** vs **Publish it**; nothing auto-published.
6. Practise while still private — session starts at `/practice/difficult-conversation/{id}`.

**C — The publish gate (P15-SC2)**
7. Publish — succeeds; card shows published.
8. Edit with injection in shared backstory — saved, unpublished, panel names problem+fix, still privately playable.
9. No appeal / request review / report / contact-moderator affordance.
10. Remove injection, publish again — live.
11. Harsh-but-legitimate firing scenario with mild profanity in hidden position — **must pass**. Record FAIL + exact text/reason if rejected (feeds 15-11 Section 2).
12. Unpublish — instant, cannot fail.

**D — The other student (P15-SC3)**
13. Second account: published scenario under "From other students"; card has **only** Practice.
14. Practise as second account.
15. Second account opens `/conversations/{first-account-id}` → standard not-found (not 403).
16. First account still owner; can edit/unpublish.

**E — Seeded records are not yours**
17. Featured cards have no Edit/Publish/Delete; `/conversations/{featured-id}` → not-found.

**F — Copy judgement**
18. Rejection panel — help vs accusation?
19. Unavailable panel — obviously different from rejection?
20. Hidden-position helper — would an author mistake it for briefing?

### Publish panel copy (as shipped)

| Panel | Headline / key lines |
|-------|----------------------|
| Rejected (422) | "This can't be published yet" + reason + "What to change: {fix}" + "Your scenario is saved, and you can still practise it yourself right now." Actions: Edit the text / Practise it privately |
| Unavailable (503) | "We couldn't run the safety check just now" + "Nothing is wrong with your scenario. Try publishing again in a minute." Action: Retry |
| Demoted edit | "Your changes were saved. This scenario has been unpublished until the problem below is fixed." then rejected/unavailable body |
| Unpublish | Instant 200; confirmation "Unpublished. Only you can find it now." |

**Step 11 false-positive result:** not run in this parallel execution — record at verify-work time.

**Seeded-text changes from user:** none yet (deferred walkthrough).

## Files Created/Modified

- `app/conversations/page.tsx` — three-section catalog + fromOthers paging
- `app/conversations/new/page.tsx` — create mode shell
- `app/conversations/[id]/page.tsx` — owner-only server edit / notFound
- `components/difficult-conversation/ConversationCard.tsx` — Practice + owner actions
- `components/difficult-conversation/ConversationBuilder.tsx` — six fields + publish panels
- `lib/interactions/index.ts` — difficult-conversations → `/conversations` live
- `app/api/difficult-conversation/list/route.ts` — hydrate card fields (Rule 2)
- `middleware.ts` — `/conversations` + `/api/difficult-conversation` in STUDENT_ROUTES

## Decisions Made

- Plan referenced `lib/interactions/registry.ts`; actual module is `lib/interactions/index.ts` — edited that file only for the tile
- List route enriched (outside original files_modified) so cards can show studentRole, situation, and owner-only lastCheckStatus without a new get API
- Middleware student-route entries required so pages/APIs match `/case-play` auth posture

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] List summaries lacked card fields**
- **Found during:** Task 1
- **Issue:** 15-05 DiscoverySummary only had id/title/avatarRole/difficulty/published/updatedAt/isMine — cards need studentRole, situation, lastCheckStatus
- **Fix:** Hydrate seeded from memory and mine/fromOthers from full S3 objects; still never serialize private stance
- **Files modified:** `app/api/difficult-conversation/list/route.ts`
- **Verification:** `verify-dc-routes` section 13 still passes (no hiddenPosition on wire)
- **Committed in:** `0176377`

**2. [Rule 2 - Missing Critical] Student routes missing for /conversations**
- **Found during:** Task 1
- **Issue:** New pages/APIs would fall through generic auth without student-role gate
- **Fix:** Added `/conversations` and `/api/difficult-conversation` to STUDENT_ROUTES
- **Files modified:** `middleware.ts`
- **Verification:** middleware includes both prefixes
- **Committed in:** `0176377`

**3. [Rule 3 - Blocking] @heroui/radio not installed**
- **Found during:** Task 2
- **Issue:** Plan-implied RadioGroup import failed tsc
- **Fix:** Difficulty band as three selectable cards
- **Files modified:** `ConversationBuilder.tsx`
- **Verification:** scoped tsc clean
- **Committed in:** `3248834`

### Deferred Enhancements

- Human walkthrough Task 3 (steps 1–20 above) — parallel skip_checkpoints
- Step 11 harsh-legitimate false-positive evidence for 15-11 — pending verify-work

---

**Total deviations:** 3 auto-fixed (2 missing critical, 1 blocking), 2 deferred
**Impact on plan:** List/middleware changes required for correct cards and auth; no scope creep beyond plan must_haves.

## Issues Encountered

- Parallel tree dirt from Phases 14/16 — stayed in 15-07 file scope except Rule 2 list/middleware
- Global `tsc` still reports pre-existing errors in unrelated Phase 14/16 files; scoped check for 15-07 files is clean
- ESLint project-wide known broken (`eslint-config-next` flat-config); not re-run as a gate

## User Setup Required

None beyond existing auth + OpenAI/S3 for publish checks during walkthrough.

## Next Phase Readiness

- 15-08 can assume Practice links hit `/practice/difficult-conversation/{id}`
- 15-11 can drive UI against shipped panel copy; needs verify-work for step 11 corpus evidence
- No `lib/engine/` edits (15-06 ownership respected)

## Self-Check: PASSED

- FOUND: `app/conversations/page.tsx` (264 lines)
- FOUND: `app/conversations/new/page.tsx` (61 lines)
- FOUND: `app/conversations/[id]/page.tsx` (73 lines)
- FOUND: `components/difficult-conversation/ConversationBuilder.tsx` (649 lines)
- FOUND: `components/difficult-conversation/ConversationCard.tsx` (321 lines)
- FOUND: commit `0176377`
- FOUND: commit `3248834`
- FOUND: commit `558037f`
- Verify: `scripts/verify-dc-routes.ts` ALL SECTIONS PASSED

---
*Phase: 15-difficult-conversations*
*Completed: 2026-10-04*
