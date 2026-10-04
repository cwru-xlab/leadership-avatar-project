---
phase: 16-networking-practice
plan: 08
subsystem: ui
tags: [networking, wizard, attestation, setup-steps, react]

requires:
  - phase: 13-one-on-one-conversation-engine
    provides: SetupWizard + SetupStepNav + SetupStepDeclaration + InterviewerStep + CameraConsentStep
  - phase: 16-networking-practice
    provides: person generate (16-01), persona CRUD (16-04), attestation-gated distill (16-05), networking setupSteps (16-07)
provides:
  - components/practice/steps/NetworkingPersonStep.tsx — character grid XOR bring-in with attestation
  - components/practice/steps/NetworkingGoalStep.tsx — required private goal (300-char cap)
  - lib/networking/wizard-client.ts — tick → distill → save client sequence
  - app/practice/[type]/page.tsx registration for networking-person / networking-goal
affects:
  - 16-09 (goal-leak real-session walk uses this wizard)
  - 16-10 (report assumes sessions started with goal in snapshot)
  - 16-11 (startSession networking path still an extension handoff)

tech-stack:
  added: []
  patterns:
    - "Page-owned renderStep(stepId) map — customComponent strings are labels only"
    - "One shared description Textarea across paste/write/generate so edits structurally reach distill"
    - "Server-served attestation wording; client checkbox is courtesy only"

key-files:
  created:
    - lib/networking/wizard-client.ts
    - components/practice/steps/NetworkingPersonStep.tsx
    - components/practice/steps/NetworkingGoalStep.tsx
  modified:
    - app/practice/[type]/page.tsx

key-decisions:
  - "Goal length cap = 300 characters"
  - "Minimum page registration required — 13-09 does not auto-mount customComponent by name"
  - "Checkpoint Task 3 skipped (skip_checkpoints); automated evidence recorded below"
  - "startSession networking InputSnapshot path remains an extension handoff (no engine edit in this plan)"

patterns-established:
  - "wizard-client.ts encodes call ORDER; UI holds ephemeral text only in React state"
  - "character branch: no attestation (decision 8); bring-in: attest → distill → save"

requirements-completed: [P16-SC1, P16-SC2]

duration: 8min
completed: 2026-10-04
---

# Phase 16 Plan 08: Networking Wizard Steps Summary

**Networking person + required private goal steps on Phase 13's generic SetupWizard, with a typed tick→distill→save client and practice-page registration — character path needs no persona authoring; bring-in gates on server-served attestation wording.**

## Performance

- **Duration:** ~8 min (plus parallel-overwrite rewire)
- **Started:** 2026-10-04T04:28:31Z
- **Completed:** 2026-10-04T04:34:12Z
- **Tasks:** 3/3 (Task 3 human-verify skipped per `skip_checkpoints`)
- **Files modified:** 4

## Accomplishments

- `lib/networking/wizard-client.ts` — six typed helpers over generate / attestation / distill / persona routes; maps 403 gate reasons and 409 stale wording; no browser-storage persistence of input text.
- `NetworkingPersonStep` — two-card choice: `listNetworkingCharacters()` grid (no attestation) or bring-in with saved-persona list, Paste/Write/Generate sharing one editable description field, server wording checkbox, tick→distill→save, distilled preview before complete.
- `NetworkingGoalStep` — required goal, 300-char cap, copy states the other person will not be told the goal.
- Practice page wires `networking-person` / `networking-goal` / reused `interviewer` (+ wizard-owned camera gate).

## Task Commits

Each task was committed atomically:

1. **Task 1: The client call sequence module** — `c614947` (feat)
2. **Task 2: The person-choice step and the required-goal step** — `12019a3` (feat)
3. **Task 3: Walk both wizard branches** — skipped (`skip_checkpoints`); automated evidence below (no separate commit)
4. **Rule 3 rewire after parallel 14-10 page overwrite** — `ea3d3ec` (fix)

**Plan metadata:** (this docs commit)

## Files Created/Modified

- `lib/networking/wizard-client.ts` — generateDescription, fetchAttestationWording, recordAttestationTick, distillWithAttestation, saveBroughtInPersona, listSavedPersonas
- `components/practice/steps/NetworkingPersonStep.tsx` — person choice + attestation bring-in
- `components/practice/steps/NetworkingGoalStep.tsx` — required private goal (`NETWORKING_GOAL_MAX_LENGTH = 300`)
- `app/practice/[type]/page.tsx` — minimum registration alongside pitch-elevator paths

## Phase 13 step-contract names (real)

| Plan name | Real export / behavior | Drift? |
|---|---|---|
| `SetupStepDeclaration` | `lib/engine/types.ts` — `{ id, label, customComponent?, optional? }` | None |
| Step props / cannot-advance | Steps receive `SetupStepNav` (`goNext`, `goBack`, `stepNumber`, `totalSteps`, `optional`); cannot-advance = disabled Continue | None — no wizard-owned validity API |
| `customComponent` | String label only; **page** `renderStep(stepId)` mounts the component | **Yes** — not auto-resolved by SetupWizard |
| `InterviewerStep` | Reused on `id: "interviewer"` | None |
| `CameraConsentStep` | Appended by SetupWizard as `id: "camera"` — not in networking `setupSteps` | None |
| `onLaunch` / customization | `buildStartPayload(cameraMode)` → POST body; networking sends `instanceId` + `customization: { characterId, goal }` | None at wizard layer |

**Did expressing steps require editing SetupWizard.tsx?** No. Editing `app/practice/[type]/page.tsx` was required (minimum registration) — same pattern as interview resume + 14-10 pitch steps. Not an extension handoff for SetupWizard itself.

## Goal field length cap

**300 characters** (`NETWORKING_GOAL_MAX_LENGTH` in `NetworkingGoalStep.tsx`).

## Automated verification (Task 3 skipped)

| Check | Result |
|---|---|
| `npx tsc --noEmit` (16-08 files) | Clean (pre-existing errors only in unrelated scripts) |
| `npx eslint` on wizard-client + Networking* steps | Clean (0 errors) |
| `grep localStorage\|sessionStorage` on Networking* + wizard-client | Empty |
| `grep CAMERA_BLOCK_COPY\|interviewers` on Networking* | Empty |
| Prior verify scripts (`verify-networking-type`, `-engine-extensions`, `-persona-store`, `-distill-gate`) | ALL PASS |
| `git show` task commits touch only plan files (+ page) — no intentional engine/route work | Pass |
| `find … *networking*publish*` | Empty |
| Authenticated `GET /practice/networking` | HTTP 200 (final URL `/practice/networking`); no "not available" / app-error banner |
| Registry setupSteps | `networking-person` → NetworkingPersonStep; `networking-goal` → NetworkingGoalStep; `interviewer` → InterviewerStep |

### Human blocks A–E (skipped)

Not run interactively. Structural evidence for each:

- **A (no-input path):** character grid from `listNetworkingCharacters()`; attestation UI only under bring-in branch (comment + conditional render).
- **B (goal required/private):** Continue disabled on whitespace; copy includes "will not be told this".
- **C (bring-in modes):** one shared description state/field; Use disabled until attested; order tick→distill(current value)→save.
- **D (relaunch):** `listSavedPersonas` + one-click sets `instanceId` without new attestation.
- **E (reused surfaces):** page mounts stock `InterviewerStep`; camera still SetupWizard-owned.

## Decisions Made

- Goal cap 300 chars — short typed ask matching CONTEXT examples.
- Page `renderStep` registration is the real 13-09 seam (customComponent is declarative only).
- Documented startSession gap rather than editing `lib/engine/session.ts` (plan forbids engine edits).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Practice page overwrite by parallel 14-10**
- **Found during:** Post-Task-2 verification
- **Issue:** `feat(14-10)` replaced `app/practice/[type]/page.tsx`, dropping networking `renderStep` wiring from `12019a3`
- **Fix:** Re-applied networking registration alongside pitch-elevator paths
- **Files modified:** `app/practice/[type]/page.tsx`
- **Verification:** tsc clean for page; authenticated `/practice/networking` → 200
- **Committed in:** `ea3d3ec`

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** Necessary to keep `/practice/networking` startable in the wizard UI after parallel phase work. No scope creep into engine.

## Issues Encountered

- **`startSession` networking path not wired:** `lib/engine/session.ts` still treats `!instance.required` as interview-only (`resolveInterviewType` → "Unknown interview type"). Wizard can complete through camera; launch will fail until a later plan extends start/snapshot for `kind:"networking"`. Recorded as **16-11 Section 4 extension handoff** — not patched here (plan non-negotiable: no engine edit).
- Browser MCP tabs unavailable this run; used authenticated curl for page 200 evidence instead of interactive walkthrough.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 16-09 can drive `/practice/networking` through the wizard UI for leak testing once startSession accepts networking customization/instance.
- Extension handoff: networking branch in `startSession` writing `NetworkingInputSnapshot` (goal evaluator-only; characterId or persona instance).

## Self-Check: PASSED

- FOUND: `lib/networking/wizard-client.ts`
- FOUND: `components/practice/steps/NetworkingPersonStep.tsx`
- FOUND: `components/practice/steps/NetworkingGoalStep.tsx`
- FOUND: commit `c614947`
- FOUND: commit `12019a3`
- FOUND: commit `ea3d3ec`
- VERIFY: prior networking verify scripts exit 0; authenticated `/practice/networking` → 200

---
*Phase: 16-networking-practice*
*Completed: 2026-10-04*
