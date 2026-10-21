---
phase: quick/005-study-plan-report-selection
plan: 005
type: execute
wave: 1
depends_on: []
files_modified:
  - app/api/study-plans/generate/route.ts
  - app/reports/page.tsx
  - scripts/verify-study-plan-selection.ts
autonomous: false
requirements: [SPS-01, SPS-02, SPS-03, SPS-04]

must_haves:
  truths:
    - "A student with more completed interview reports than the per-plan cap can still generate a study plan — the 413 refusal is no longer reachable through the UI."
    - "A student can choose WHICH completed interviews a study plan is built from, and sees which ones were used."
    - "With no explicit selection, the plan is built from the most recent MAX_REPORTS_PER_PLAN eligible reports, and the response states how many were considered out of how many exist."
    - "A report belonging to another user can never enter a plan, even if its id is supplied directly in the request body."
    - "Selecting more than MAX_REPORTS_PER_PLAN reports is refused with a clear message naming the cap, not silently truncated."
    - "lib/study-plan/generate.ts is UNCHANGED — the closed-vocabulary privacy filter and its SAFE_RUBRIC_LABELS / SAFE_RATINGS markers still pass 21-07's frozen-path guard, and generateStudyPlan still receives only AnonymousBehavioralReport[]."
  artifacts:
    - path: "app/api/study-plans/generate/route.ts"
      provides: "POST accepting an optional ownership-scoped reportIds[] with a declared per-plan cap, and a recent-N default when none is supplied"
      exports: ["POST", "MAX_REPORTS_PER_PLAN"]
    - path: "app/reports/page.tsx"
      provides: "A picker listing eligible interviews (type, date, score) with the cap enforced in the UI, additive to the existing study-plan surface"
    - path: "scripts/verify-study-plan-selection.ts"
      provides: "Battery over ownership scoping, the cap, the recent-N default, and the unchanged anonymous payload shape"
  key_links:
    - from: "app/reports/page.tsx"
      to: "app/api/study-plans/generate/route.ts"
      via: "POST body { reportIds }"
      pattern: "reportIds"
    - from: "app/api/study-plans/generate/route.ts"
      to: "lib/study-plan/generate.ts"
      via: "generateStudyPlan(reports) — signature and payload shape unchanged"
      pattern: "generateStudyPlan\\("
---

<objective>
Let a student choose which completed interviews a study plan is built from, with a
declared per-plan cap, and make the existing 413 refusal unreachable through the UI.

Purpose: `MAX_SOURCE_REPORTS = 50` in `app/api/study-plans/generate/route.ts`
refuses rather than silently truncating, with a comment explaining why. That guard
is correct and stays. But a real local account (`alice.johnson@case.edu`, 56
`general` reports) is now permanently unable to generate a plan — the guard has
become a dead end instead of a safeguard.

Selection is the better answer in product terms, not only a workaround: a plan
synthesized from 56 sessions is less useful to a student than one built from the
handful that matter now.

Output: an optional ownership-scoped `reportIds[]` on the POST, a recent-N
default, a picker on the study-plan surface, and a verifier.
</objective>

<decisions_already_made>
Read these before writing code. They are settled; do not relitigate them.

**1. Cap is 10, named `MAX_REPORTS_PER_PLAN`.** Not 5. Mastery already exposes a
lifetime and a current-window figure; a 5-report plan would introduce a third,
narrower definition of "recent" in the same product. 10 keeps the plan's horizon
roughly aligned with the current window. Export the constant so the UI and the
verifier both read one number.

**2. `MAX_SOURCE_REPORTS = 50` STAYS.** It is a different guard, for a different
failure: it refuses a pathological history rather than silently dropping rows.
Keep it, keep its comment, and keep the 413 reachable by a direct API call. What
changes is that the UI never provokes it, because selection and the recent-N
default both cap the set first.

**3. No selection supplied → most recent N, not all.** Order by `completedAt`
desc, take `MAX_REPORTS_PER_PLAN`. The response must state how many were
considered and how many exist, so a student is never told "every report was
considered" when it was not. This is the same honesty the 413 was protecting.

**4. Ownership goes in the WHERE clause, never a post-filter.** A supplied
`reportIds[]` is scoped by `userId` in the query. A post-filter hides a query
bug; this is the pattern 21-25 established in `lib/study-plan/checks/sources.ts`.

**5. Over-cap selection is REFUSED, not truncated**, with a message naming the
cap. Truncating while reporting success is the exact dishonesty decision 3 avoids.

**6. `lib/study-plan/generate.ts` is FROZEN. Do not edit it.** 21-07 installed a
marker guard (`scripts/verify-moment-boundary.ts` Section 1) asserting it still
contains `SAFE_RUBRIC_LABELS`, `SAFE_RATINGS` and the exact prompt instruction,
and that it imports none of the new moment path. The privacy contract is
unchanged: selection only changes WHICH reports get anonymized before
`generateStudyPlan` receives `AnonymousBehavioralReport[]`.
</decisions_already_made>

<tasks>

<task type="execute">
  <name>Task 1: Ownership-scoped selection and a recent-N default in the route</name>
  <files>app/api/study-plans/generate/route.ts</files>
  <action>
Add `MAX_REPORTS_PER_PLAN = 10` (exported) and accept an optional
`{ reportIds?: string[] }` JSON body. Parse defensively — a malformed body must
behave as "no selection", never throw.

Selection path: when `reportIds` is a non-empty array, refuse with 400 if its
length exceeds `MAX_REPORTS_PER_PLAN`, naming the cap. Otherwise query with
`userId: currentUser.id` AND `id: { in: reportIds }` in the same WHERE, plus the
existing `status: "READY"`, `reportMarkdown: { not: null }` and
`typeSlug: { in: INTERVIEW_TYPE_SLUGS }` conditions. If the returned count is
fewer than the ids supplied, refuse with 400 naming how many were not eligible —
do not silently proceed with a subset.

Default path: no selection → same WHERE minus the id filter, `orderBy:
{ completedAt: "desc" }`, `take: MAX_REPORTS_PER_PLAN`. Keep the existing
`MAX_SOURCE_REPORTS + 1` count probe as a separate, still-reachable guard so a
pathological history is still refused on a direct API call.

Include in the success response `consideredReportCount` and
`eligibleReportCount` so the client can state "built from 10 of your 56
interviews". Preserve the existing `reportNumber` ordinal assignment and the
`MAX_ANONYMOUS_SOURCE_BYTES` byte check unchanged.
  </action>
  <verify>
`npx tsc --noEmit` clean. `npx tsx scripts/verify-moment-boundary.ts` exits 0 —
21-07's frozen-path guard still passes, proving `lib/study-plan/generate.ts` was
not touched. `grep -c "post-filter\|\.filter((r) => r.userId" app/api/study-plans/generate/route.ts`
shows no ownership post-filtering. `grep -c "MAX_SOURCE_REPORTS" app/api/study-plans/generate/route.ts`
is still non-zero.
  </verify>
  <done>The route accepts an optional ownership-scoped selection, refuses over-cap
and non-eligible selections with named reasons, defaults to the most recent N, and
reports considered-vs-eligible counts. The 50-report guard and the frozen lib are
both intact.</done>
</task>

<task type="execute">
  <name>Task 2: The picker on the study-plan surface</name>
  <files>app/reports/page.tsx</files>
  <action>
Additive change only — `app/reports/page.tsx` is working study-plan surface and
Phase 21 already widened it by +145/-0. Match that discipline.

List eligible interviews with type, completion date and overall score, each
selectable. Enforce `MAX_REPORTS_PER_PLAN` in the UI: at the cap, further
checkboxes are disabled with a visible reason rather than silently ignoring the
click. Default the selection to the most recent N so the primary action works
with zero interaction. Send `{ reportIds }` on POST.

After generation, state plainly how many interviews the plan was built from out
of how many exist, using the route's `consideredReportCount` /
`eligibleReportCount`. Keep the existing `NO_COMPLETED_REPORTS` handling.
  </action>
  <verify>
`npx tsc --noEmit` clean. `npm run build` exits 0. `git diff --numstat -- app/reports/page.tsx`
shows zero deleted lines. `grep -c "reportIds" app/reports/page.tsx` is non-zero.
  </verify>
  <done>A student can pick which interviews feed the plan, cannot exceed the cap
through the UI, gets a sensible default with no interaction, and is told what the
plan was built from.</done>
</task>

<task type="execute">
  <name>Task 3: Verifier</name>
  <files>scripts/verify-study-plan-selection.ts</files>
  <action>
Battery with a DB-gated section, following the conventions in
`scripts/verify-generation-sources.ts`:

- another user's report id supplied directly is NOT included (ownership proven in
  the query, with an inverted assertion showing the check fires)
- over-cap selection refused, with the cap named in the message
- a supplied id that is not eligible (wrong status, null markdown, non-interview
  type) refused rather than silently dropped
- no selection yields exactly the most recent `MAX_REPORTS_PER_PLAN` by
  `completedAt`, and `consideredReportCount` / `eligibleReportCount` are both
  correct when more reports exist than the cap
- the payload handed to `generateStudyPlan` still contains only
  `AnonymousBehavioralReport` fields — no transcript text, no report ids, no
  student name
- `MAX_SOURCE_REPORTS`'s 413 is still reachable on a direct call

Prove at least one assertion bites: break it, capture the verbatim failure,
restore, confirm exit 0.
  </action>
  <verify>`npx tsx scripts/verify-study-plan-selection.ts` exits 0 with its DB
section RUN (not SKIP) against the local database. The recorded bite-proof output
is included in the SUMMARY.</verify>
  <done>Ownership, the cap, the default, the refusal paths and the unchanged
anonymous payload are all mechanically asserted, with one assertion proven to
bite.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Human verification</name>
  <action>
Build nothing new here. Tasks 1-3 are complete and committed; this task is the
blocking human gate. Present the steps below, STOP, and wait. Do not self-verify
past this gate and do not invent a result — step 3's whole point is that a human
confirms an account that was previously blocked now works.
  </action>
  <what-built>Selection on the study-plan surface, an ownership-scoped capped
route, and a recent-N default.</what-built>
  <how-to-verify>
1. Log in as `alice.johnson@case.edu` (56 eligible `general` reports — the
   account that previously could not generate a plan at all).
2. Open the study-plan surface. Confirm the picker lists interviews with type,
   date and score, and that the most recent 10 are preselected.
3. Generate with the default selection. Confirm it SUCCEEDS where it previously
   returned "Your completed feedback history is too large to synthesize safely."
4. Confirm the result states how many interviews it was built from out of how
   many exist.
5. Try to select an 11th interview. Confirm it is prevented with a visible
   reason, not silently ignored.
6. Deselect all but two, generate again, and confirm the plan reflects those two
   — a different plan from step 3.
7. Confirm the existing saved study plans and their Phase 21 paths still render.
  </how-to-verify>
  <resume-signal>Report per-step results. Step 3 is the load-bearing one: the
account that was blocked must now work.</resume-signal>
</task>

</tasks>

<verification>
- `npx tsx scripts/verify-moment-boundary.ts` exits 0 — the frozen privacy path is untouched
- `npx tsx scripts/verify-study-plan-selection.ts` exits 0 with its DB section run
- `npx tsc --noEmit` clean; `npm run build` exits 0
- `git diff --numstat -- app/reports/page.tsx` shows zero deletions
- `alice.johnson@case.edu` can generate a study plan
</verification>

<success_criteria>
A student chooses which interviews a study plan is built from, within a declared
cap, and is told honestly what it was built from. The 50-report guard and the
frozen closed-vocabulary privacy filter both survive unchanged.
</success_criteria>
