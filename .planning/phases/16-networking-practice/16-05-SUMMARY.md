---
phase: 16-networking-practice
plan: 05
subsystem: api
tags: [attestation, persona-distill, openai, networking, gate]

requires:
  - phase: 16-networking-practice
    provides: NetworkingAttestation model + recordAttestation/consumeAttestation primitives (16-02)
  - phase: 08
    provides: Original interview persona distill route (REQ-22) whose prompt/model path was extracted
provides:
  - lib/interview/persona-distill.ts — the one distillPersona + PERSONA_DISTILL_SYSTEM_PROMPT
  - GET/POST /api/networking/attestation — wording serve + record
  - POST /api/networking/persona/distill — consume-before-distill gate
  - scripts/verify-networking-distill-gate.ts — eleven fail-closed assertions with stubbed model
affects:
  - 16-04 (persona save requires already-spent attestationId)
  - 16-08 (wizard step that calls these routes)
  - 16-11 (validation record cites two-point enforcement)

tech-stack:
  added: []
  patterns:
    - Extract shared distiller; gate via a DIFFERENT route (never a forgeable source flag)
    - consumeAttestation awaited before distillPersona; non-ok returns with zero provider calls
    - Verify-script override hook (__setDistillPersonaForVerify) for counting spy without a test runner

key-files:
  created:
    - lib/interview/persona-distill.ts
    - app/api/networking/attestation/route.ts
    - app/api/networking/persona/distill/route.ts
    - scripts/verify-networking-distill-gate.ts
  modified:
    - app/api/interview/persona/distill/route.ts
    - lib/networking/attestation.ts

key-decisions:
  - "Gate is a separate networking distill route; Phase 8 interview route stays ungated so its contract is byte-identical"
  - "not-found and not-owned collapse to opaque reason not-found (no existence oracle)"
  - "Failed distillation does not release a spent attestation — re-tick required"
  - "recordAttestation now returns attestedAt for the 201 response body"

patterns-established:
  - "Pattern: one prompt / one model path shared by interview and networking distill routes"
  - "Pattern: two-point enforcement — gated distill + spent-attestationId required on persona save (16-04)"

requirements-completed: [P16-SC1, P16-SC3]

duration: 6min
completed: 2026-10-04
---

# Phase 16 Plan 05: Attestation-Gated Persona Distill Summary

**Shared `distillPersona` extracted from Phase 8; networking distill spends a fresh attestation before any model call; interview route contract unchanged — eleven verify assertions prove zero provider calls on every rejection.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-10-04T04:18:01Z
- **Completed:** 2026-10-04T04:24:16Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Extracted the one distiller (`PERSONA_DISTILL_SYSTEM_PROMPT`, three length constants, `distillPersona`, RETENTION contract) into `lib/interview/persona-distill.ts` with a compile-time lock against `customization.ts`'s `MAX_PERSONA_LENGTH`.
- Phase 8 `POST /api/interview/persona/distill` is now a thin import; error strings, status codes, and log field names are unchanged.
- `GET/POST /api/networking/attestation` serves current wording and records ticks; `POST /api/networking/persona/distill` consumes then distills (never the reverse).
- Verify script stubs the model via `__setDistillPersonaForVerify` — all eleven sections pass against local `leadership_avatar_dev` with zero real provider calls.

## Task Commits

1. **Task 1: Extract the one distiller into a shared module** - `6904746` (refactor)
2. **Task 2: Attestation route and gated networking distill route** - `ebd180f` (feat)
3. **Task 3: Prove the gate precedes the model call** - `3b750ac` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `lib/interview/persona-distill.ts` — single distillPersona + prompt + limits + verify override hook
- `app/api/interview/persona/distill/route.ts` — thin Phase 8 route (contract unchanged)
- `app/api/networking/attestation/route.ts` — GET wording / POST record
- `app/api/networking/persona/distill/route.ts` — consume-before-distill gate
- `lib/networking/attestation.ts` — `recordAttestation` also returns `attestedAt`
- `scripts/verify-networking-distill-gate.ts` — eleven assertions

## Extraction diff shape

**Moved (verbatim intent):** constants `MAX_PERSONA_LENGTH` / `MAX_PROFILE_TEXT_LENGTH` / `MAX_DISPLAY_NAME_LENGTH`, `PERSONA_DISTILL_SYSTEM_PROMPT`, `distillPersona` + `stripWrappingQuotes`, RETENTION / no-URL-fetch doc block (plus one sentence naming the two importers).

**Unchanged on the interview route:** `runtime`, `maxDuration`, `response()` helper, auth, validation, every error string (`Unauthorized`, `Invalid JSON body`, `profileText is required`, `We could not process that description. Please try again.`, `Unable to process that description. Please try again.`), status codes 401/400/502/500/200, success body `{ persona, displayName }`, log messages and field sets (`userId`, `inputLength`, `outputLength`, `hasDisplayName`).

**Added only:** import from shared module + one doc line noting the extraction.

## Gate machine error codes

| Condition | HTTP | `reason` |
|-----------|------|----------|
| Missing/empty `attestationId` or `profileText` | 400 | (error string only) |
| Unknown id OR other user's id | 403 | `not-found` (opaque) |
| Already spent | 403 | `already-consumed` |
| Past freshness window | 403 | `expired` |
| Wording version ≠ current | 403 | `stale-wording` |
| Model failure after consume | 502 | (Phase 8 user-facing string; tick stays spent) |

Attestation POST stale wording → **409** `{ error, wordingVersion }` (client must re-fetch GET).

## Two-point enforcement (design_note)

1. `POST /api/networking/persona/distill` consumes an attestation before calling the shared `distillPersona`.
2. `POST /api/networking/persona` (plan 16-04) refuses to save unless `attestationId` names an owned, already-spent attestation.

A client that bypasses (1) via the ungated Phase 8 interview route gets a persona sentence it cannot save as a networking persona and cannot launch a networking session with. The reachable bypass yields nothing usable. A forgeable `source`/`isNetworking` flag on the interview route is explicitly rejected.

## Decisions Made

- Separate gated route rather than conditional gate on the existing interview route (preserves Phase 8 callers; avoids forgeable bypass).
- Opaque collapse of `not-found` / `not-owned` at the route layer.
- No refund on model failure after consume.
- Small additive change: `recordAttestation` returns `attestedAt` for the 201 body.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `recordAttestation` now returns `attestedAt`**
- **Found during:** Task 2
- **Issue:** Plan's POST 201 body requires `attestedAt`, but 16-02's result type only returned `attestationId`
- **Fix:** Extended select + return type with `attestedAt: Date`
- **Files modified:** `lib/networking/attestation.ts`
- **Committed in:** `ebd180f`

**2. [Rule 2 - Missing Critical] Verify-script override hook on shared module**
- **Found during:** Task 1 / Task 3
- **Issue:** No test runner; ESM exports cannot be monkey-patched reliably for a call-count spy
- **Fix:** Added `__setDistillPersonaForVerify` (null in production) so the verify script stubs without provider calls
- **Files modified:** `lib/interview/persona-distill.ts`
- **Committed in:** `6904746`

---

**Total deviations:** 2 auto-fixed (both Rule 2)
**Impact on plan:** Necessary for route contract and for proving zero provider calls; no scope creep.

## Issues Encountered

None blocking. Full-repo `tsc --noEmit` still reports pre-existing / parallel-agent errors outside this plan's files (see `deferred-items.md`).

## Auth Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 16-04 can require spent `attestationId` on persona save.
- 16-08 wizard can GET wording, POST attestation, then POST gated distill.
- 16-11 can cite two-point enforcement and the eleven-section verify script.

## Self-Check: PASSED

- FOUND: `lib/interview/persona-distill.ts`
- FOUND: `app/api/interview/persona/distill/route.ts`
- FOUND: `app/api/networking/attestation/route.ts`
- FOUND: `app/api/networking/persona/distill/route.ts`
- FOUND: `scripts/verify-networking-distill-gate.ts`
- FOUND: commits `6904746`, `ebd180f`, `3b750ac`
- VERIFY: `npx tsx scripts/verify-networking-distill-gate.ts` exits 0 (all eleven groups)

---
*Phase: 16-networking-practice*
*Completed: 2026-10-04*
