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

## Path design decisions (user, 2026-10-24, second round)

- **Targeting:** a plan's path ranks the plan's OWN weak skills first (its source sessions' lowest-scored competencies / priority themes); global mastery gaps only fill remaining slots.
- **Voice drills:** add a short VOICE_DRILL step kind — a 60-90s spoken rep in the shared practice shell (camera + vocal/visual analysis), live technique tip, graded at the end, counting toward mastery at the coached weight.
- **Prove-it step:** the final UNAIDED_SESSION opens the plan's source practice type with setup pre-filled and a brief naming the target skill; practice behaviour is unchanged when not pre-filled. Graded as a normal live session.
- **Order:** learn → drill → rework → prove (knowledge check, voice drill(s), coached rework of the real moment, then one pre-filled unaided session).
- **Since-plan baseline:** ledger-recomputed figure before the path's generatedAt (the selection snapshot is null for plans generated before the backfill).

## Round three (user, 2026-10-24/25)

- **Weak line:** plan skills averaging below 70% are weak targets; plan skills at or above 70% rank after themes and global gaps; never-measured skills are "absent" gaps.
- **Concept checks:** when a skill has no quotable student moment, generate a concept check (MC / pick-better) that quotes nothing, so every path keeps learn → drill → prove.
- **Prove-it carry-over:** reuse the source session's resume, job posting and pasted interviewer persona (ownership-scoped); decks need re-upload.
- **Demonstrations:** use only facts the student actually said; otherwise bracketed placeholders ("[your result]"). Never invent achievements.
- **Migration 20261124000000_add_voice_drills_and_prove_it:** applied to the LOCAL dev DB with the user's go-ahead (2026-10-24). Prod NOT migrated.
- **Grader determinism:** every path grader (drill, coached attempt, rewrite check, moment scoring, reply classifier) runs at temperature 0 with a fixed seed. The LIVE practice evaluator (`lib/engine/evaluation.ts`) is deliberately left untouched (user, 2026-10-25).
