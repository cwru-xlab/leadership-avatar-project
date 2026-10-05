---
phase: 16-networking-practice
plan: 04
subsystem: api
tags: [networking, persona-store, s3, owner-scoped, never-publishable, attestation-receipt]

requires:
  - phase: 16-networking-practice
    provides: NetworkingAttestation store + consumeAttestation (16-02)
  - phase: 16-networking-practice
    provides: kind:networking-persona InstanceConfig member (16-03)
provides:
  - Owner-scoped S3 store for distilled networking personas (networking-personas/{ownerId}/{personaId}.json)
  - POST/GET /api/networking/persona and GET/DELETE /api/networking/persona/[personaId]
  - scripts/verify-networking-persona-store.ts (eight-section proof)
affects:
  - 16-05 (distill route may save via POST after consume)
  - 16-08 / 16-09 (wizard relaunch against saved persona)
  - 16-11 (phase close / seam handoff)

tech-stack:
  added: []
  patterns:
    - Owner-partitioned S3 keys (prefix list, not full scan + filter)
    - loadOwnedScenario 404-never-403 idiom on instance reads
    - Spent-attestation receipt as second decision-8 enforcement point

key-files:
  created:
    - lib/networking/persona-store.ts
    - app/api/networking/persona/route.ts
    - app/api/networking/persona/[personaId]/route.ts
    - scripts/verify-networking-persona-store.ts
  modified: []

key-decisions:
  - "No Phase 13 shared instance-storage helper existed; copied s3Storage saveCase/getCase Put/Get/Delete pattern into persona-store.ts with owner-partitioned keys"
  - "S3 key layout: networking-personas/{ownerId}/{personaId}.json (deliberate divergence from flat cases/{id}.json)"
  - "ReportDTO does not generalize; hand-rolled toPersonaDto strips ownerId + attestationId"
  - "Assertion 7 excludes app/api/networking/persona/distill/ (16-05) which legitimately accepts profileText"

patterns-established:
  - "Pattern: never-publishable networking instance — no published field, no publish route, no listAll"
  - "Pattern: POST requires already-consumed owned attestationId as receipt (all sources including written/generated)"

requirements-completed: [P16-SC1, P16-SC3]

duration: 12min
completed: 2026-10-04
---

# Phase 16 Plan 04: Networking Persona Store Summary

**Owner-scoped S3 store and CRUD routes for distilled networking personas — private relaunch without re-paste, cross-student 404, spent-attestation receipt, and structurally no publish surface.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-04T04:19:00Z
- **Completed:** 2026-10-04T04:31:00Z
- **Tasks:** 3/3
- **Files modified:** 4 (all created)

## Accomplishments

- Distilled persona persists under `networking-personas/{ownerId}/{personaId}.json` with belt-and-braces ownership checks (`loadOwnedScenario` idiom → null → 404)
- POST creates from an already-distilled sentence + spent attestation receipt; GET list omits `persona`/`attestationId`; GET one strips `ownerId`/`attestationId`; DELETE is owner-scoped
- Eight-section verify script exits 0 against local DB + S3 — including roadmap criterion 3 cross-student invisibility and decision 7 publish absence

## Task Commits

Each task was committed atomically:

1. **Task 1: Owner-scoped persona storage on the CaseStudy precedent** - `9c31452` (feat)
2. **Task 2: The three owner-scoped routes** - `ed69150` (feat)
3. **Task 3: Prove owner scoping and the never-publishable absence** - `509f1fb` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `lib/networking/persona-store.ts` — save/load/list/delete with owner-partitioned keys; imports `MAX_PERSONA_LENGTH` from customization
- `app/api/networking/persona/route.ts` — POST + GET list; `requireSpentOwnedAttestation` helper; `profileText` 400 tripwire
- `app/api/networking/persona/[personaId]/route.ts` — GET one + DELETE; no PATCH/publish
- `scripts/verify-networking-persona-store.ts` — eight assertion sections

## Phase 13 shared helper

**No Phase 13 shared instance-storage helper existed** (searched for `saveInstance` / `loadOwnedInstance` / `INSTANCE_PREFIX` — none). Copied the Put/Get/Delete Object pattern from `s3Storage.saveCase` / `s3Storage.getCase` into this module rather than extending `lib/s3-client.ts` (keeps plan file scope tight; owner partitioning has no case-index analogue).

## S3 key layout

```
networking-personas/{ownerId}/{personaId}.json
```

Deliberate divergence from `cases/{caseId}.json`: cross-owner reads cannot be expressed by accident; `listOwnedNetworkingPersonas` is a prefix list. There is no `listAllNetworkingPersonas`.

## Decisions Made

- Owner-partitioned keys over flat `cases/`-style layout (plan-mandated)
- Hand-rolled `toPersonaDto` because `lib/report/dto.ts` is InteractionReport-shaped and does not generalize
- Assertion 7 scopes raw-paste grep to the storage layer files and allows 16-05's distill route to keep `profileText` (matches non_negotiable: nothing outside distill-adjacent files)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Assertion 7 vs concurrent 16-05 distill route**
- **Found during:** Task 3 (verify script)
- **Issue:** Plan grep path `app/api/networking/persona/` also matches `persona/distill/route.ts`, which 16-05 landed and legitimately uses `profileText`
- **Fix:** Scoped assertion 7 to `persona-store.ts`, `persona/route.ts`, and `[personaId]/route.ts`, excluding distill; documented 16-01/16-05 exception per non_negotiables
- **Files modified:** `scripts/verify-networking-persona-store.ts`
- **Verification:** All eight sections pass
- **Committed in:** `509f1fb` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** Necessary for correct verify under parallel 16-05; no scope creep into distill.

## Issues Encountered

None beyond the assertion-7 path adjustment above. Pre-existing `tsc` noise in unrelated `scripts/verify-dc-prepublish.ts` left untouched (out of scope). Concurrent `lib/engine/registry.ts` dirty tree from other agents — not touched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 16-05 can POST a saved persona after `consumeAttestation` + distill
- Wizard / relaunch plans can list and load owned personas by id
- No publish affordance exists to accidentally wire later

## Self-Check: PASSED

- FOUND: `lib/networking/persona-store.ts`
- FOUND: `app/api/networking/persona/route.ts`
- FOUND: `app/api/networking/persona/[personaId]/route.ts`
- FOUND: `scripts/verify-networking-persona-store.ts`
- FOUND: commit `9c31452`
- FOUND: commit `ed69150`
- FOUND: commit `509f1fb`
- VERIFY: `npx tsx scripts/verify-networking-persona-store.ts` exits 0 (eight sections)

---
*Phase: 16-networking-practice*
*Completed: 2026-10-04*
