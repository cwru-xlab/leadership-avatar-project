---
phase: 15-difficult-conversations
plan: 09
subsystem: ui
tags: [difficult-conversation, report, ReportChrome, extras-slot, outcome, in-role-reaction]

requires:
  - phase: 15-difficult-conversations
    provides: Eight-dimension type + unscored outcome record (15-06); DifficultConversationInputSnapshot (15-01)
  - phase: 13-one-on-one-conversation-engine
    provides: Unified report page, ReportChrome, toReportDto, ReportScoreCards
provides:
  - asConversationOutcome narrowing on the unified DTO (outcome never touches scores)
  - terminationAtSeconds on ReportDTO
  - ReportChrome per-type extras slot in 14-14's declared shape (above/below)
  - ConversationEndBanner / ConversationOutcomePanel / InRoleReactionPanel
  - scripts/verify-dc-report.ts (8 sections, exits 0)
affects:
  - 15-10 / 15-11 (P15-SC4 evidence)
  - 14-14 (must consume the same extras slot; page should call renderReportExtras)

tech-stack:
  added: []
  patterns:
    - "ReportChrome extras slot: Partial<Record<'above'|'below', (report) => ReactNode>> + renderReportExtras helper"
    - "Outcome record rendered as fact, never scored; pairing line reconciles high approach + unmet objective"
    - "Avatar-end banner is a named outcome in neutral styling, not an error"

key-files:
  created:
    - components/practice/report/ConversationEndBanner.tsx
    - components/practice/report/ConversationOutcomePanel.tsx
    - components/practice/report/InRoleReactionPanel.tsx
    - scripts/verify-dc-report.ts
  modified:
    - lib/report/dto.ts
    - components/practice/ReportChrome.tsx
    - app/practice/[type]/report/[reportId]/page.tsx

key-decisions:
  - "Extras slot ADDED in 14-14's shape (14-14 had not landed): above/below renderers + renderReportExtras; DC registers banner above, outcome+reaction below"
  - "MomentsPanel NOT reused — it requires VisualMetrics episodes; reused formatTimecode from lib/metrics/bands instead"
  - "Report page wired with generic renderReportExtras calls only (Rule 3) — no slug branch"
  - "Human-verify checkpoint skipped (skip_checkpoints:true) — deferred to /gsd/verify-work 15"

patterns-established:
  - "Per-type report panels only via ReportChrome.extras — never typeSlug === in the report page"
  - "asConversationOutcome: malformed fields degrade to absent; scores remain intact"

issues-created: []

duration: 18min
completed: 2026-10-04
---

# Phase 15 Plan 09: Difficult-Conversation Report Panels Summary

**Eight-dimension report with factual unscored outcome, avatar-end banner, and in-role reaction delivered through ReportChrome's per-type extras slot**

## Performance

- **Duration:** 18 min
- **Started:** 2026-10-04T04:32:18Z
- **Completed:** 2026-10-04T04:50:00Z
- **Tasks:** 3 (Task 3 human-verify auto-skipped)
- **Files modified:** 6

## Accomplishments

- Surfaced `terminationAtSeconds` and documented that `outcome` is render-only on the unified DTO; added `asConversationOutcome` with graceful degradation
- Added ReportChrome per-type extras slot (14-14 shape) and registered `difficult-conversation` with three panels
- Named avatar-end banner (four reasons) + student-end copy in neutral styling; factual outcome panel with pairing line; character's private reaction with causal turns
- `scripts/verify-dc-report.ts` — all eight sections exit 0

## Final panel copy (for 15-10 / 15-11 / verify-work)

### Outcome panel caption

> What happened, for the record. This isn't part of your score — the scores above judge how you handled the conversation, not whether you got what you wanted.

### Reconciling / pairing line

> You didn't get it — and you still pursued it well. That's deliberate: this score is about your approach.

Shown only when `objectiveStatus` is `not_met` or `partially_met` AND `objective_achieved` is 4 or 5.

### Avatar-end outcome names

| reason | name |
| --- | --- |
| `walked_out` | They walked out. |
| `shut_down` | They stopped engaging. |
| `escalated` | It escalated. |
| `nothing_left_to_discuss` | They ended it — there was nothing left to say. |

Still-scored line: *"Everything below is still scored on what did happen."*

Student ends: `student_closed_in_character` → "You closed it."; `student_left_session` → "Session ended early."

### Reaction panel heading

`{avatarRole}, afterwards` (from snapshot `role`, else "The character")

## Decisions Made

1. **Extras slot: ADDED (not consumed).** 14-14 had not executed. Added in 14-14's declared shape: `extras?: Partial<Record<"above"|"below", ReportExtrasRenderer>>` plus `renderReportExtras(chrome, slot, report)`. Phase 14 must consume this slot — do not add a second one.
2. **Moments reuse: NO.** `MomentsPanel` takes `VisualMetrics` episodes. Reused `formatTimecode` from `lib/metrics/bands` for the same clock formatting.
3. **Report page: generic extras consumer added (Rule 3).** Plan preferred no page edit, but without `renderReportExtras` the slot was dead. Two calls only — above/below scores — no slug branch. 14-14 must reuse these calls, not add a second consumer.
4. **Human walkthrough: DEFERRED** (`skip_checkpoints:true`). Step 3 verdict for live reports is not yet available — record at `/gsd/verify-work 15`. Script proves structural separation.

## Task Commits

1. **Task 1: Surface the outcome record on the one DTO** - `618ad27` (feat)
2. **Task 2: Three panels through the extras slot** - `a77e9eb` (feat)
3. **Task 3: Prove the separation by script** - `a87a067` (feat); human-verify skipped
4. **Rule 3 page wiring** - `b4aa69c` (fix)

**Plan metadata:** (docs commit after this file)

## Files Created/Modified

- `lib/report/dto.ts` — `terminationAtSeconds`, outcome doc comment, `asConversationOutcome`
- `components/practice/ReportChrome.tsx` — extras slot + DC chrome entry + `renderReportExtras`
- `components/practice/report/ConversationEndBanner.tsx` — named end banner
- `components/practice/report/ConversationOutcomePanel.tsx` — factual unscored outcome + pairing line
- `components/practice/report/InRoleReactionPanel.tsx` — character voice + causes
- `scripts/verify-dc-report.ts` — eight-section proof
- `app/practice/[type]/report/[reportId]/page.tsx` — generic `renderReportExtras` above/below (Rule 3)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wired report page to renderReportExtras**
- **Found during:** Task 2/3
- **Issue:** Extras slot with no page consumer left panels unreachable in the browser
- **Fix:** Two generic calls (`above` / `below`) — no slug branch
- **Files modified:** `app/practice/[type]/report/[reportId]/page.tsx`
- **Verification:** `grep difficult-conversation app/practice/[type]/report/` empty; verify-dc-report §7 passes
- **Committed in:** `b4aa69c`

### Deferred Enhancements

- **Human report walkthrough** — skipped (`skip_checkpoints:true`). Deferred to `/gsd/verify-work 15`. Step 3 verdict (especially Objective-achieved scoring approach vs result) not yet recorded; P15-SC4 live evidence incomplete until then.
- **Eight-card grid legibility** — `ReportScoreCards` still hardcodes four shared cards; extras dimensions ride the score map but are not yet separate cards in that component. Out of 15-09 file scope; shared-grid fix if verify-work finds eight cards unreadable.

---

**Total deviations:** 1 auto-fixed (Rule 3), 2 deferred
**Impact on plan:** Necessary for panels to reach the one report page; no slug branch introduced.

## Issues Encountered

None blocking script verification.

## Next Phase Readiness

- 15-10 / 15-11 may cite this SUMMARY for SC4 structure; must complete verify-work walkthrough before claiming SC4 live.
- 14-14 must consume the existing extras slot and the page's `renderReportExtras` calls — do not add a second slot or a second page consumer.

## Self-Check: PASSED

- FOUND: `lib/report/dto.ts`
- FOUND: `components/practice/ReportChrome.tsx`
- FOUND: `components/practice/report/ConversationEndBanner.tsx`
- FOUND: `components/practice/report/ConversationOutcomePanel.tsx`
- FOUND: `components/practice/report/InRoleReactionPanel.tsx`
- FOUND: `scripts/verify-dc-report.ts`
- FOUND: commits `618ad27`, `a77e9eb`, `a87a067`, `b4aa69c`
- FOUND: `npx tsx scripts/verify-dc-report.ts` exits 0

---
*Phase: 15-difficult-conversations*
*Completed: 2026-10-04*
