---
phase: 16-networking-practice
plan: 10
subsystem: ui
tags: [networking, report, outcome-panel, ReportChrome, verify]

requires:
  - phase: 13-one-on-one-conversation-engine
    provides: one report page + ReportChrome extras slots + unified ReportDTO.outcome
  - phase: 15-difficult-conversations
    provides: ConversationOutcomePanel idiom (dashed border, Outcome record eyebrow, not-a-score caption)
  - phase: 16-networking-practice
    provides: seven rubric dims + outcome config (16-07), wizard startable sessions (16-08)
provides:
  - components/practice/panels/NetworkingOutcomePanel.tsx — ask/landing/common-ground + early-end line
  - ReportChrome networking registration (extras.below)
  - scripts/verify-networking-report-surfaces.ts — nine-section surface proof
affects:
  - 16-11 (surface guard / final phase close)
  - Human UAT of real networking reports (skipped checkpoint)

tech-stack:
  added: []
  patterns:
    - "Per-type outcome panel via ReportChrome extras.below — no second report page"
    - "Export pure formatting helpers from the panel for verify-script render assertions"
    - "never-asked rendered at same visual weight as agreed/deflected/declined"

key-files:
  created:
    - components/practice/panels/NetworkingOutcomePanel.tsx
    - scripts/verify-networking-report-surfaces.ts
  modified:
    - components/practice/ReportChrome.tsx

key-decisions:
  - "Followed Phase 15 ConversationOutcomePanel idiom (14-14 SUMMARY absent; Phase 15 landed)"
  - "Early-end line lives inside the outcome panel (below scores), not a separate above banner"
  - "Checkpoint Task 3 skipped (skip_checkpoints); verify-script evidence recorded below"
  - "Early-end mapping: disengaged | not-worth-continuing | out-of-time → student-facing phrases"

patterns-established:
  - "Networking outcome panel is a sibling of ConversationOutcomePanel — dashed border, data-not-a-score"
  - "Avatar end reason kept in data-outcome only; visible copy never shows the raw enum"

requirements-completed: [P16-SC4]

duration: 15min
completed: 2026-10-04
---

# Phase 16 Plan 10: Networking Report Surfaces Summary

**Ask/outcome/common-ground panel plus neutral early-end feedback on Phase 13's one report page — seven dimensions from the type declaration, never-asked as first-class copy, no interview framing, no second report route.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-10-04T04:35:06Z
- **Completed:** 2026-10-04T04:50:00Z
- **Tasks:** 3/3 (Task 3 human-verify skipped per `skip_checkpoints`)
- **Files modified:** 3

## Accomplishments

- `NetworkingOutcomePanel` renders goal (+ privacy note), ask made Yes/No, four distinct ask-landing phrases, common ground (or "None identified."), and a neutral early-end block when the avatar ended — null outcome returns nothing.
- One `NETWORKING_CHROME` entry in `ReportChrome.tsx` wires `extras.below` only; APPEND to the existing map; no second report page.
- `scripts/verify-networking-report-surfaces.ts` proves nine sections including seven DTO keys, CAMERA_OFF_OPTOUT, four outcome renderings, early-end mapping, and one report page.

## Task Commits

Each task was committed atomically:

1. **Task 1: The outcome panel and its one registration** — `7159abc` (feat)
2. **Task 2: Prove the surfaces, including every outcome case** — `c9940a4` (feat)
3. **Task 3: Read a real networking report** — skipped (`skip_checkpoints`); automated evidence below (no separate commit)

**Plan metadata:** (docs commit after this SUMMARY)

## Files Created/Modified

- `components/practice/panels/NetworkingOutcomePanel.tsx` — outcome panel + exported formatters / `asNetworkingOutcome`
- `components/practice/ReportChrome.tsx` — import + `NETWORKING_CHROME` + `slug === "networking"` branch
- `scripts/verify-networking-report-surfaces.ts` — nine-section executable proof

## Outcome-panel idiom

**Followed Phase 15's `ConversationOutcomePanel` / `ConversationEndBanner` idiom** (14-14 SUMMARY not present in-repo; Phase 15 has landed). Reused:

- Dashed border, transparent background, "Outcome record" eyebrow
- `data-not-a-score="true"` and a caption separating factual outcome from 1–5 scores
- Neutral early-end styling (`border-[#c5d5df] bg-[#f4f8fa]`) and "still scored" line
- `data-outcome={reason}` for test hooks while visible copy uses mapped phrases

Difference by design: networking puts the early-end line *inside* the below-scores panel (plan placement) rather than a separate `extras.above` banner.

## Early-end reason → phrase mapping

| `avatarEndReasons` (16-07) | Student-facing phrase |
|---|---|
| `disengaged` | They stepped away from the conversation. |
| `not-worth-continuing` | They decided it was not worth continuing. |
| `out-of-time` | They ran out of time. |

Plus: "The other person ended the conversation." and "All seven dimensions are still scored from what happened."

## Ask-outcome renderings

| `askOutcome` | Phrase |
|---|---|
| `agreed` | They agreed to what you asked for. |
| `deflected` | They neither agreed nor refused — the ask was softened or sidestepped. |
| `declined` | They said no. |
| `never-asked` | The ask was never made. |

## Decisions Made

- Panel path follows plan (`components/practice/panels/`) even though Phase 15 panels live under `components/practice/report/` — chrome import bridges them.
- `asNetworkingOutcome` lives in the panel file (plan scope excludes `lib/report/dto.ts`).
- Human-verify checkpoint skipped; P16-SC4 narrative-copy judgment on real sessions deferred to a later UAT pass with 16-09 reports.

## Checkpoint Task 3 — skipped (`skip_checkpoints: true`)

Human walk of 16-09 block B / E / D reports was not run. Automated substitute:

```
npx tsx scripts/verify-networking-report-surfaces.ts  → PASSED (9 sections)
```

Printed evidence:

- Seven keys: `visual, vocal, content, behavioral, rapport, self-introduction, goal-progress`
- Four renderings including never-asked unmarked as error
- Early-end mapping for all three reasons; raw enums absent from visible copy
- Null outcome → empty output; exactly one report page; no `networking`+`report` path
- Goal text + privacy line present; `profileText` absent from `lib/report/snapshot.ts`

Prior verify scripts still exit 0: `verify-networking-type`, `verify-networking-engine-extensions`, `verify-networking-characters`, `verify-networking-attestation`, `verify-networking-distill-gate`, `verify-networking-persona-store`, `verify-dc-report`, `verify-engine-surface-count`.

**P16-SC4 human verdict (step 5 narrative quality):** not collected — deferred. Script proves no `/answer|STAR|candidate|interview/` in panel source or rendered HTML for all four outcome cases.

## Deviations from Plan

None - plan executed exactly as written (checkpoint skipped per orchestrator `skip_checkpoints: true`).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Report surfaces ready for real-session UAT whenever 16-09 reports exist.
- 16-11 can include this verify script in the phase surface-guard suite.
- No engine / schema / second-page changes.

## Self-Check: PASSED

- FOUND: `components/practice/panels/NetworkingOutcomePanel.tsx` (202 lines ≥ 90)
- FOUND: `components/practice/ReportChrome.tsx` contains `networking` + `NetworkingOutcomePanel`
- FOUND: `scripts/verify-networking-report-surfaces.ts` (484 lines ≥ 70)
- FOUND: commit `7159abc`
- FOUND: commit `c9940a4`
- FOUND: `find app -ipath "*networking*report*"` → empty

---
*Phase: 16-networking-practice*
*Completed: 2026-10-04*
