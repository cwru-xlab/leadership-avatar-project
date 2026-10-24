# Phase 23: Learning Paths Hub - Context

**Gathered:** 2026-10-24 (user decisions via orchestrator Q&A)

## Decisions (user, 2026-10-24)

- **Duolingo mechanics:** KEEP the 21-CONTEXT exclusion. Levels + daily/weekly goals only. No streaks, no step unlocking.
- **Live grading in coached/path voice sessions:** live spoken technique tips during the session; numeric grade ONLY at the end.
- **Shell:** coached sessions reuse the practice shell's chrome (camera consent, self-view + visual capture, vocal capture, push-to-talk, avatar stage), extracted to a shared location (Phase 22 G4).
- **Navigation:** study plans and paths get their own sidebar tabs; `/paths` lets the student pick a plan and generate its path if it has none.
- **Mastery:** reflects BOTH live practice sessions and path learning. Pre-hook READY reports are backfilled as LIVE_SESSION contributions (idempotent script).
- **Growth baseline:** both a 30-day window delta on /mastery and a per-plan "since this plan was generated" delta on paths.
- **Declines:** shown honestly as "Recent movement" (ups and downs). Each drop links to a practice action.
- **Testing:** automated Playwright loops may call real HeyGen + OpenAI.
- **Planning:** Phase 22 closes on shared-shell reuse; this phase holds the hub, mastery integration and learning-loop iteration.

## Hard boundary

Do not change how interview, case studies, networking practice, practice pitches or difficult conversations work.
