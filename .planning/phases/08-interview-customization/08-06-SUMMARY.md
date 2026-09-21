---
phase: 08-interview-customization
plan: 06
subsystem: ui
tags: [react, nextjs, sessionStorage, interview-customization]

# Dependency graph
requires:
  - phase: 08-interview-customization
    provides: "resolveInterviewType/InterviewCustomizationInput (08-01/08-04) and the sessionStorage write-site contract (08-05)"
provides:
  - "Wizard reads the picker's sessionStorage handoff exactly once, resolves the customized InterviewType, and stays two steps"
  - "InterviewSessionShell resends the identical customization payload on session/start and every /api/interaction/chat turn"
  - "Client-side advanceProgress() stage thresholds scale with targetQuestionCount instead of a hardcoded 9-question shape"
affects: ["08-07", "08-08"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ref-guarded mount effect for a read-once-then-clear sessionStorage handoff (survives React strict-mode double-invoke)"
    - "Derive stage-machine thresholds from a session-length knob with Math.round(targetQuestionCount / 3), clamped, rather than hardcoded literals"

key-files:
  created: []
  modified:
    - "app/interview/[type]/page.tsx"
    - "components/interview/InterviewSessionShell.tsx"

key-decisions:
  - "advanceProgress's resumeQuestionCap and behavioralCategoryQuota are both derived as Math.round(targetQuestionCount / 3), matching the plan's explicit decision; verified this evaluates to 3/3 for the 9-question standard length, producing a byte-identical stage sequence to the pre-change function"
  - "The wizard renders a spinner until the one-tick handoff read resolves, so the hero stats and the object handed to the shell are never briefly the uncustomized preset"

patterns-established:
  - "Client components that must read-once-then-clear a sessionStorage handoff use a useRef guard inside the mount effect, not a state flag, to survive strict-mode's double-invoke"

requirements-completed: [REQ-19, REQ-21, REQ-23]

# Metrics
duration: 35min
completed: 2026-09-21
---

# Phase 8 Plan 06: Wire Customization Into the Wizard and Live Session Summary

**The picker's resolved customization now survives one navigation into the two-step wizard, rides byte-identical on session start and every chat turn, and the client progress tracker's stage thresholds scale with the chosen question count instead of assuming the shipped 9-question shape.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-21T14:20:00Z (approx, session start)
- **Completed:** 2026-09-21
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- `app/interview/[type]/page.tsx` reads `sessionStorage:interview:customization:{slug}` exactly once on mount (ref-guarded against strict-mode's double-invoke), clears it immediately, and resolves the type via `resolveInterviewType` instead of the raw `getInterviewType` — a parse failure or absent key falls back cleanly to the preset defaults.
- Both the resolved `InterviewType` and the raw `customization` object are passed to `InterviewSessionShell`, which resends the raw object unchanged in the `/api/interview/session/start` body and in every `/api/interaction/chat` body's `interview.customization` field — never on `checkpoint`/`finish`, never re-derived per turn.
- `advanceProgress()` now takes a third parameter, `targetQuestionCount`, and derives `resumeQuestionCap`/`behavioralCategoryQuota` from it (`Math.round(targetQuestionCount / 3)`, clamped) instead of the hardcoded literal `3` — for the 9-question `standard` preset both thresholds still evaluate to exactly 3.

## Task Commits

Each task was committed atomically:

1. **Task 1: Read the handoff once in the wizard and pass the customized type down** - `0529271` (feat)
2. **Task 2 + 3: Resend customization unchanged and make progress tracking length-aware** - `9b271b9` (feat)

Tasks 2 and 3 were committed together: both are sequential, tightly-coupled edits to the same single file (`InterviewSessionShell.tsx`) discovered to have no clean line-level separation once both were written; splitting them would have required re-deriving hunks after the fact with no functional benefit.

**Plan metadata:** (this commit, to follow)

## Files Created/Modified
- `app/interview/[type]/page.tsx` - Read-once-then-clear sessionStorage handoff, `resolveInterviewType` replacing `getInterviewType`, spinner gate before first render, `customization` prop passed to the shell.
- `components/interview/InterviewSessionShell.tsx` - New `customization` prop resent unchanged on session start and every chat turn; `advanceProgress()` made length-aware via `targetQuestionCount`.

## Decisions Made
- Followed the plan's explicit formula for `resumeQuestionCap`/`behavioralCategoryQuota` (`Math.max(1, Math.round(targetQuestionCount / 3))` and `Math.max(2, Math.round(targetQuestionCount / 3))` clamped to `BEHAVIORAL_CATEGORIES.length`) rather than any alternative — the plan required the 9-question case to be bit-for-bit unchanged and this formula does exactly that.
- Combined Task 2 and Task 3 into one commit for pragmatic reasons described above; no scope change, both were plan-specified edits to the same file.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1-4 auto-fixes were needed; the three tasks matched the plan's `<action>` blocks directly.

One process note, not a code deviation: `git add "app/interview/[type]/page.tsx"` (Task 1's first commit attempt) was unintentionally interpreted by git's pathspec glob matching against the literal `[type]` bracket in the path and picked up unrelated, pre-existing uncommitted work from a concurrently-running 08-07 agent (a product-rename string change and a new `ReportCustomizationStrip.tsx` component, neither part of this plan's `files_modified`). Caught immediately via `git show --stat`, undone with a non-destructive `git reset HEAD~1` (no data lost — nothing discarded, the commit was simply removed and the index reset), and redone with the literal pathspec form `git add -- ':(literal)app/interview/[type]/page.tsx'`, which staged only the intended file. Both final commits (`0529271`, `9b271b9`) were confirmed via `git show --name-only` to contain exactly the one file each declared in `files_modified`.

## Issues Encountered

- A concurrently-running agent (plan 08-07) landed two commits (`b286154`, `df22daa`) on the same branch while this plan was executing, which is why `git log` shows interleaved 08-06/08-07 commits. No conflict with this plan's files; confirmed via `git show --name-only` on both of this plan's own commits.

## User Setup Required

None - no external service configuration required.

## Verification Performed

- `npx tsc --noEmit` clean after every task and again at the end.
- `grep -n "getInterviewType" "app/interview/[type]/page.tsx"` — zero matches.
- `grep -n "SetupStep" "app/interview/[type]/page.tsx"` — unchanged three-value union (`"interviewer" | "resume" | "session"`).
- `grep -n "customization" components/interview/InterviewSessionShell.tsx` — appears in exactly the `session/start` body and the `/api/interaction/chat` body, and does not appear in the `checkpoint` or `finish` request bodies.
- `grep -n ">= 3" components/interview/InterviewSessionShell.tsx` — zero matches (the two hardcoded literals were both replaced).
- A throwaway `tsx` script (deleted after) ran the pre-change `advanceProgress` and the new one side by side through 14 turns: for `targetQuestionCount=9` the two produced an **identical stage sequence** (`resume,resume,behavioral,behavioral,behavioral,role_specific,closing,...`), confirming the 9-question `standard` path is bit-for-bit unchanged; for `targetQuestionCount=5` the resume stage shortened to 1 question and behavioral to 2 categories before reaching `role_specific`; for `targetQuestionCount=13` both stages lengthened proportionally.
- End-to-end against the local dev DB with a real temporary test user (`0806-temp@case.edu`, created and deleted): logged in via `/api/auth/login`, confirmed `/interview/general`, `/interview/early-career`, and `/interview/does-not-exist` all return `200` (client-rendered, so the unavailable-card branch is a client-side check, not a server 404 — matches the existing pre-Phase-8 behavior); called `/api/interview/session/start` with the exact `customization` shape the shell now sends (`{industrySlug, roleSlug, difficulty, lengthSlug: "quick", personalitySlug}`) against the `technical` preset and confirmed the created report row persisted the resolved "quick" length values (`targetMinutes: 10`, `targetQuestionCount: 5`, `industry: "technology"`, `difficulty: "Advanced"`) — proving the same customization object the client resends flows correctly through `resolveInterviewType` end to end. Test report and user deleted after.
- A local `next dev` server was started (inline `DATABASE_URL`) for this verification since no pre-existing server was occupying port 3000 this run (unlike prior 08-05/07-02 plans); it was left running afterward because a broad `pkill` was blocked by the permission system — noted here rather than worked around.
- Full interactive browser click-through (opening the picker's Customize panel, choosing "Quick", pressing Start, watching the wizard hero read "10 min", refreshing to confirm the key was cleared, and watching DevTools Network tab for byte-identical `customization` objects across three live chat turns) was **not performed** — it requires a real browser session and mic/avatar hardware that this environment cannot drive. Server-side round-trip verification (above) and the static/greps checks substitute for it, consistent with the limitation class already logged in `07-02-SUMMARY.md`, `07-04-SUMMARY.md`, and `08-05-SUMMARY.md`.

## Next Phase Readiness

Wave 3 continues with 08-07 (report customization display), already in progress concurrently by another agent per the commits observed above. This plan's two files are the last client-side pieces of the customization pipeline for the live session itself; no known blockers for 08-07/08-08.

---
*Phase: 08-interview-customization*
*Completed: 2026-09-21*

## Self-Check: PASSED
