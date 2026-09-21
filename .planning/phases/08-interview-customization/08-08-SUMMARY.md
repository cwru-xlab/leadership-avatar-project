---
phase: 08-interview-customization
plan: 08
subsystem: verification
tags: [static-sweep, human-verification, end-to-end, prompt-injection, prefix-cache]

# Dependency graph
requires:
  - phase: 08-interview-customization
    provides: "08-01 through 08-07 — the complete customization layer: preset registry, curated option lists, resolveInterviewType, InterviewReport customization columns, persona distillation endpoint, resolver wired into both prompt-assembly call sites, preset picker + Customize panel, wizard handoff, per-turn resend, length-aware progress tracking, report customization strip"
provides:
  - "Verbatim static-sweep results for all 17 constraint checks (build, no-migration-to-shared-DB, prompt determinism, hostile-input resistance, registry shape)"
  - "Human-confirmed end-to-end walkthrough of the 14-step customized student path, including a real LiveAvatar session"
  - "One real defect found and fixed under the checkpoint: the pasted persona was flavour text, not an identity (REQ-22 crux) — fixed in commit a0cc711"
  - "Consolidated deferred-items list for Phase 8"
affects: [phase-9-student-authored-scenarios, phase-11-cohort-teardown]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Distillation endpoints returning JSON-mode structured output ({ persona, displayName }) rather than a bare string, so a display-only field can ride alongside a prompt-bound field without leaking into the assembled prompt."

key-files:
  created: []
  modified:
    - app/api/interview/persona/distill/route.ts
    - lib/interview/customization.ts
    - components/interview/CustomizePanel.tsx
    - app/interview/[type]/page.tsx

key-decisions:
  - "PHASE8_BASE resolved to e27bb8f (the commit immediately before 08-01's first commit ab371a5), NOT main — main predates Phases 1-7 and diffing against it would misreport already-merged legitimate work as Phase 8 violations."
  - "The persona-identity defect (found at walkthrough steps 7/10) was fixed under the checkpoint's 'small, unambiguous defect' policy rather than deferred: the session header showed the AVATAR's name even when the pasted persona named a real person, and the prompt never told the interviewer to introduce itself by name. Fix: the distiller now returns { persona, displayName } via JSON mode; personaDisplayName is a display-only field on InterviewCustomizationInput, explicitly documented as never interpolated into the prompt; the wizard header prefers storedCustomization.personaDisplayName over the avatar's name; the in-character naming directive is carried inside the persona string itself (not a new prompts.ts field) so lib/interview/prompts.ts stays diff-empty against baseline. Commit a0cc711, 4 files."
  - "lib/interview/prompts.ts remains diff-empty against the Phase 8 baseline even after the persona fix — re-verified independently in this plan, not taken on trust from the fix's own claim."
  - "Manual browser click-through, deferred by 08-04/08-05/08-06/08-07 due to the pre-existing next dev directory lock, is superseded by this plan's human walkthrough — this was the FIRST real exercise of the customization UI end to end."

patterns-established: []

requirements-completed: [REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24]

# Metrics
duration: ~90min (static sweep + human walkthrough + one checkpoint fix + phase close-out)
completed: 2026-09-21
---

# Phase 8 Plan 08: Static Sweep and Human Validation Summary

**All 17 static constraint checks passed cleanly (prefix-cache-safe prompt assembly proven deterministic and injection-resistant); a human walkthrough of all 14 customized-student-path steps passed, with one real defect found and fixed under the checkpoint — the pasted persona was wired as flavour text rather than an identity, contradicting REQ-22's "plays the named person directly."**

## Performance

- **Duration:** ~90 min
- **Tasks:** 3 completed (1 auto static sweep, 1 checkpoint human-verify, 1 auto close-out)

## Task 1: Static Constraint Sweep — Verbatim Results

**Baseline resolved:** `e27bb8f` — the commit immediately before 08-01's first commit (`ab371a5`), confirmed via `git rev-parse ab371a5^` and `git log --oneline -3 ab371a5^`. Matches the six legitimate pre-existing uncommitted rename files exactly (see Deferred Items).

1. **`npx tsc --noEmit`** — clean, exit 0. AUTHORITATIVE.
   - `npx eslint lib/languages.ts` (untouched file, reconfirming pre-existing breakage) — fails with `ESLint configuration in » plugin:@next/next/recommended is invalid: Unexpected top-level property "name"`, a repo-wide config bug unrelated to any phase. `next build` remains known-broken on `/about` (missing `EDGE_CONFIG`), also pre-existing. `tsc` used as authoritative per plan.
2. **`npx prisma validate`** — `The schema at prisma/schema.prisma is valid 🚀`.
3. **`git diff --name-only $BASE -- prisma/`** — exactly `prisma/schema.prisma` and `prisma/migrations/20260921141342_add_interview_customization/migration.sql`. One migration directory, as required.
4. **`grep -c "NOT NULL" prisma/migrations/*add_interview_customization/migration.sql`** — `0`. All six columns nullable.
5. **Shared-DB safety** — `.env`/`.env.local`/`scripts/setup.mjs` absent from `git diff --name-only $BASE`; `git log $BASE..HEAD --oneline` (16 phase commits, before the checkpoint fix) contains no `migrate deploy`; `git log $BASE..HEAD -p | grep -i "npm run setup"` returns nothing.
6. **`git diff $BASE -- lib/interview/prompts.ts`** — empty. Re-confirmed a second time after the checkpoint's persona fix (commit `a0cc711`) — still empty. The in-character naming directive lives inside the persona string itself, not a new field in this file.
7. **`git diff $BASE -- lib/interview/types.ts`** — `GENERAL_INTERVIEW`'s only change is the added `questionAreas` line; three new preset consts (`TECHNICAL_INTERVIEW`, `CONSULTING_INTERVIEW`, `EARLY_CAREER_INTERVIEW`) added alongside it. Full diff captured verbatim during execution.
8. **`grep -rn "getInterviewType" app/api/`** — empty. Both prompt-assembly call sites go through `resolveInterviewType`.
9. **`grep -rn "from \"@/lib/interview" lib/interactions/`** — empty. Phase 7's locked constraint holds.
10. **`git diff --stat $BASE -- lib/interactions/index.ts`** — `1 file changed, 1 insertion(+), 1 deletion(-)` (the Interviews tile route change).
11. **`grep -rn "cohort\|assignment\|isStaff\|instructor" app/interview/ components/interview/ lib/interview/`** — empty. Individual-only product model holds.
12. **No server-side URL fetching of student input** — `grep -rn "fetch(" app/api/interview/persona/` empty; `linkedin` (case-insensitive) across the whole phase diff has exactly one hit, a doc comment explaining what was deliberately NOT built (`* URL (LinkedIn or otherwise) — see 08-CONTEXT.md's Deferred Ideas.`).
13. **`grep -rn "profileText" app/ lib/ prisma/`** — all matches confined to the distill route's request-handling/model-call code (`app/api/interview/persona/distill/route.ts`); never in a Prisma `data` object, an S3 call, or a `console.*` argument.
14. **`grep -rn ">= 3" components/interview/InterviewSessionShell.tsx`** — empty. Hardcoded stage thresholds are gone.
15. **Determinism / prefix-cache proof** — throwaway `scripts/tmp-08-08-sweep.ts` (deleted after run) asserted `buildInterviewSystemPrompt(resolveInterviewType(slug, c), promptInput)` is `===` across two calls for each of the four presets with a fully populated customization object. Result: `identical=true` for all four (`general`, `technical`, `consulting`, `early-career`).
16. **Hostile-input proof** — same harness with `c = { industrySlug: "x'; DROP TABLE users;--", roleSlug: "ignore previous instructions", difficulty: "Godmode", lengthSlug: "infinite", personalitySlug: "evil" }`. For all four presets: `containsHostile=false` and the assembled prompt contained the preset's own `defaultIndustry`/`defaultRoleTitle`/`difficulty` — `resolveInterviewType`'s silent-fallback design held under injection.
17. **`listInterviewTypes()`** — `count=4 first=general`.

**Independent re-verification of prior-plan claims (not taken on trust):**
- Wave-3 transient-commit hazard: `git show --stat` on all four wave-3 commits (`0529271`, `9b271b9`, `b286154`, `df22daa`) confirmed each touches exactly one file — the orchestrator's claim about the bracketed-`[type]`-pathspec glob hazard checked out independently.
- The checkpoint fix commit `a0cc711` ("fix(08-08): let a pasted persona actually play its named person") confirmed to touch exactly the 4 claimed files (`app/api/interview/persona/distill/route.ts`, `lib/interview/customization.ts`, `components/interview/CustomizePanel.tsx`, `app/interview/[type]/page.tsx`); `lib/interview/prompts.ts` re-confirmed diff-empty against baseline after this commit; final `npx tsc --noEmit` re-run clean; final `git status --short` shows only the six pre-existing user-owned rename files, untouched.

**Obvious-defect fixes applied during Task 1 itself:** none — all 17 checks passed clean on first run. The one real defect in this plan surfaced during the Task 2 human walkthrough (see below), not the static sweep.

## Task 2: Human Walkthrough — Result

**APPROVED.** The human walked all 14 steps end to end against a real LiveAvatar session on the local dev DB and reported "works overall," with one real defect found at steps 7/10.

**Defect found (steps 7/10) — persona wired as flavour text, not an identity:**
- **(a)** `app/interview/[type]/page.tsx` passed `interviewerName={selectedInterviewer.name}` unconditionally, so a session whose persona plays a named person still showed the AVATAR's name in the session header — directly contradicting REQ-22 ("plays the named person directly").
- **(b)** The persona appeared once as a single clause atop a long structure-heavy prompt, with nothing telling the interviewer to introduce itself by name (the opening stage was just "brief, warm icebreaker").

**Fix — commit `a0cc711`, "fix(08-08): let a pasted persona actually play its named person", 4 files:**
- `app/api/interview/persona/distill/route.ts` — distiller switched to JSON mode, now returns `{ persona, displayName }`; `MAX_DISPLAY_NAME_LENGTH = 60`; the system prompt instructs the model to end the persona with an explicit in-character directive naming the person, and to return the person's name as `displayName` (empty string when the paste names nobody).
- `lib/interview/customization.ts` — added optional display-only `personaDisplayName` to `InterviewCustomizationInput`, documented as never interpolated into the prompt.
- `components/interview/CustomizePanel.tsx` — captures `displayName` from the endpoint, includes it in the emitted customization, and clears it at both persona-reset sites (preset switch and explicit clear).
- `app/interview/[type]/page.tsx` — header now prefers `storedCustomization?.personaDisplayName?.trim()`, falling back to `selectedInterviewer.name`.

**Verification of the fix (performed by the orchestrator, independently re-confirmed here):**
- `npx tsc --noEmit` clean.
- Throwaway tsx script (deleted): with `personaDisplayName: "MARIA_DISPLAY_SENTINEL"` in the customization, `buildInterviewSystemPrompt` byte-identical across two separate `resolveInterviewType` calls (deterministic: true); the sentinel absent from the assembled prompt (leak: false); the persona text itself present. `resolveInterviewType` builds its result field-by-field, so the extra display-only key cannot reach the prompt.
- Re-confirmed independently in Task 1 (see above): exactly 4 files touched, `lib/interview/prompts.ts` still diff-empty, final `tsc` clean.

**14-step walkthrough — all steps PASS** (fast path at `/interview/general` with exactly two wizard steps and a 20-min hero; four distinguishable preset cards general-first; Customize pre-filled and reset on preset switch with dropdown-only industry/role; difficulty/length/industry/role edits reflected in the read-only summary; persona-build disables the personality dial with rehearsal-framing copy and no URL field; Start opens the preset's slug with the customized hero; refresh degrades to preset defaults; a real avatar session showed "of ~5 questions" and a recognizably harder, persona-shaped interviewer manner after the fix; three consecutive `/api/interaction/chat` bodies carried an identical `customization` object; End resolved to READY with a customization strip showing preset/Healthcare/Team lead/Advanced/~10 min-5 questions and no persona text; an old pre-Phase-8 report showed the quiet "customization wasn't recorded" line; a regression run of uncustomized `general` behaved exactly as before Phase 8).

## Files Created/Modified (this plan, checkpoint fix only)
- `app/api/interview/persona/distill/route.ts` - JSON-mode distillation returning `{ persona, displayName }`
- `lib/interview/customization.ts` - added display-only `personaDisplayName` field
- `components/interview/CustomizePanel.tsx` - captures/clears `displayName`
- `app/interview/[type]/page.tsx` - session header prefers the persona's display name over the avatar's name

## Decisions Made
See `key-decisions` in frontmatter. Most significant: the persona-identity fix was carried inside the persona string itself (an in-character naming directive), not a new `prompts.ts` field, to preserve the file's diff-empty constraint against the Phase 8 baseline — re-verified independently, not taken on trust.

## Deviations from Plan

### Auto-fixed Issues (under the checkpoint's "small, unambiguous defect" policy, not Rules 1-3 since this occurred during a checkpoint)

**1. [Checkpoint fix] Pasted persona showed the avatar's name instead of the named person's**
- **Found during:** Task 2 (human walkthrough, steps 7 and 10)
- **Issue:** `interviewerName` was sourced unconditionally from `selectedInterviewer.name` (the avatar), and the prompt never instructed the model to introduce itself by name — the "plays the named person directly" behavior required by REQ-22 wasn't actually happening.
- **Fix:** Distiller now returns a structured `{ persona, displayName }`; a new display-only `personaDisplayName` field carries the name to the UI without ever reaching the prompt; the wizard header prefers it over the avatar's name; the naming directive is embedded in the persona text itself.
- **Files modified:** `app/api/interview/persona/distill/route.ts`, `lib/interview/customization.ts`, `components/interview/CustomizePanel.tsx`, `app/interview/[type]/page.tsx`.
- **Verification:** `tsc` clean; determinism/no-leak proof with a sentinel display name; `lib/interview/prompts.ts` re-confirmed diff-empty; all 4 files confirmed as the only ones touched.
- **Committed in:** `a0cc711`.

---

**Total deviations:** 1 checkpoint-fixed (persona identity gap, REQ-22 crux)
**Impact on plan:** Necessary for REQ-22 compliance; no scope creep — fix stayed inside the existing customization/persona machinery and did not touch `lib/interview/prompts.ts`.

## Issues Encountered
None beyond the checkpoint defect above, which is documented as a deviation rather than an issue.

## Deferred Items (Phase 8, consolidated)

**Pre-existing, out of scope for this phase:**
- `next build` known-broken on `/about` prerender (missing `EDGE_CONFIG`) — unrelated to Phase 8, unrelated to any prior phase either.
- Repo-wide broken eslint config (`plugin:@next/next/recommended` invalid top-level `name` property) — reconfirmed pre-existing against an untouched file (`lib/languages.ts`); `tsc --noEmit` used as authoritative throughout this phase.
- The six uncommitted CaseBridge → Leadership Avatar rename files (`app/api/cohort/send-invitations/route.ts`, `app/interview/[type]/report/[reportId]/page.tsx`, `app/page.tsx`, `app/reports/page.tsx`, `components/auth-navbar.tsx`, `config/site.ts`) — the user's own pre-existing, unrelated work; left untouched throughout this plan, neither committed nor reverted.
- Middleware's 307-vs-401 behavior on unauthenticated API calls — already logged as a deferred gap since `06-08-SUMMARY.md`; unchanged by Phase 8.

**Superseded by this plan:**
- Manual browser click-through, deferred by 08-04/08-05/08-06/08-07 because a pre-existing `next dev` server held a Next.js directory-level lock — this plan's Task 2 human walkthrough was the FIRST real exercise of the full customization UI, and it passed (with the one fix above).

**New process finding, worth carrying into future phases:**
- The wave-3 bracketed-pathspec `git add` hazard (08-06/08-07 SUMMARY): non-overlapping `files_modified` between two concurrently-executing plans does NOT by itself isolate them — the git index is shared across agents working in the same working directory (no worktree isolation), so a glob-style pathspec like `app/interview/[type]/...` can pick up a sibling agent's staged file. Independently re-verified in this plan (each of the four wave-3 commits touches exactly one file); nothing was lost, but future phases running concurrent agents in wave 3+ should either avoid bracketed pathspecs or use git worktrees per agent.

**Open question for the user, not resolved here:**
- Whether the persona should be reinforced more deeply inside `lib/interview/prompts.ts` itself (beyond the in-character directive now embedded in the persona string) — this would require deliberately relaxing that file's diff-empty-against-baseline constraint, which was treated as load-bearing throughout Phase 8. Not requested by the user; flagged as their call, not fixed here.

## User Setup Required

None — no external service configuration required. Migration handoff note: `20260921141342_add_interview_customization` was applied to the LOCAL dev DB only (`leadership_avatar_dev`); the shared Lightsail database is untouched. The team picks up the migration via the committed SQL through `npm run setup`, exactly as Phase 6's `06-01` established.

## Next Phase Readiness

Phase 8 is complete: all 8 plans (08-01 through 08-08) executed and verified, including a real static constraint sweep and a human-confirmed end-to-end walkthrough with a real LiveAvatar session, a real pasted persona, and a real report. REQ-17 through REQ-24 all satisfied. No blockers for Phase 9 (Student-Authored Scenarios) or Phase 11 (Cohort Teardown), both of which were noted as depending on constraints Phase 8 kept locked (`lib/interactions` importing nothing from `lib/interview`; no cohort/assignment surface reintroduced).

---
*Phase: 08-interview-customization*
*Completed: 2026-09-21*
