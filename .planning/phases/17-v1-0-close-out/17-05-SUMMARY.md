---
phase: 17-v1-0-close-out
plan: 05
status: complete
requirements: [REQ-77]
completed: 2026-10-25
verdict_basis: "agent-verified (Playwright, real HeyGen/OpenAI), not human — user decision 2026-10-25"
---

# 17-05 Summary — REQ-77 Pass 1 keyboard UAT (agent-verified)

## What was done

On 2026-10-25 the user decided that agent-driven Playwright evidence on the real
APIs replaces the human keyboard UAT. Claude walked exactly the thirteen Pass 1
items (Phase 15 blocks B–G, Phase 16 blocks B–G, Phase 15 hostile drift probe 5)
against `next dev` on `http://localhost:3000`, using the keyboard only, with real
HeyGen avatars and OpenAI. The results are recorded in `17-KEYBOARD-PASS-1.md` §8
(the 2026-10-05 human-reported bulk PASS is kept above it as history). Both
validation files now cite that record with real session IDs. No Phase 18 or 19
surface entered this pass. No product code changed.

## Verdicts — agent-verified (Playwright, real HeyGen/OpenAI), not human

| # | Item | Verdict | Session / report |
| --- | --- | --- | --- |
| 1 | 15-B fresh guarded seeded conversation | PASS (D15-1 on the end banner) | `7914583f-47ec-4e6d-83a6-de835e175b25` |
| 2 | 15-C author, publish, second account | PASS (D15-2, D15-3) | private practice on `afe65df9-…`; published scenario seen by `student@case.edu` |
| 3 | 15-D drift reconfirm (hostile) | PASS — no drift | `d1dd4d7a-16e1-4347-bc1d-32e8ad71ee6e`, `0b52962a-4004-476d-9da2-8e7a22073ac4` |
| 4 | 15-E Phase 13 regression | PASS | interview `2987e20c-…`, case-study `93a9c35c-…`, two old URLs 308 → render |
| 5 | 15-F calibration | PASS — keep (agent judgement) | — |
| 6 | 15-G row sign-off | PASS, 2 rows flagged | — |
| 7 | 16-B tile live | PASS | — |
| 8 | 16-C character session + SC4 narrative | PASS (minor D16-1) | `2e7e90af-bedc-42cd-98aa-280b15a009b8` |
| 9 | 16-D brought-in person | PASS | `753e439e-2e0a-4631-93f2-64b6eced5d3f` |
| 10 | 16-E raw-paste acceptance + distill gate | PASS | same |
| 11 | 16-F calibration | PASS — keep (agent judgement) | — |
| 12 | 16-G persona-paste regression + row sign-off | PASS (minor D17-2) | `2987e20c-d8bb-47dc-af56-8588eb9e1baa` |
| 13 | Invisibility: no difficulty meter, no turn-one goal awareness | PASS | all of the above |

Hostile probe 5: PASS. The character deflected the score and rubric questions in
role ("I'm not here to grade a conversation — I'm here to get this request
handled.") and never named a score.

## Defects (by severity)

- **blocker 0**
- **major 2**
  - **D15-1:** a student-ended difficult conversation (in-character close or End
    session) is recorded as an avatar walk-out. The report reads "They ended it —
    there was nothing left to say"; reproduced 3/3. Cause:
    `lib/engine/session.ts` `finishSession` applies `derivedWalkOutReason`
    regardless of `source === "student"` (from `1326b2a`, 20-05).
  - **D15-2:** the owner's edit page `/conversations/<id>` returns HTTP 500,
    because `app/conversations/[id]/page.tsx` passes `as={Link}` to a client
    `Button` from a server component.
- **minor 5:**
  - D15-3: the post-publish card still says "private".
  - D15-4: the difficulty radiogroup has no arrow-key support.
  - D16-1: the `commonGround` calibration is thin.
  - D17-1: "interviewer" copy appears in DC and networking reports.
  - D17-2: the persona textarea has no label.

No Success Criterion is FAIL, so no Section 6 gap was opened in either validation
file.

## Automated ground

The Phase 15, Phase 16 and shared engine verifiers all exit 0. One exception:
`dc-approach-vs-result` exits 1, a harness false positive on the substring "next
time" inside an in-role reaction (verified by printing the text).
`verify-report-structure` now passes; its long-standing debt no longer
reproduces. `npx tsc --noEmit` exits 0.

## Marker counts

- `grep -c "DEFERRED → /gsd:verify-work 15" 15-VALIDATION.md` (the colon spelling
  the plan names): 0 before, 0 after. The file actually uses the slash spelling
  `DEFERRED → /gsd/verify-work 15`: **6 before → 1 after**. The one left is the
  historical `skip_checkpoints` mode line at the top.
- `16-VALIDATION.md` `UNVERIFIED`: **16 before → 4 after**. The four left are the
  mode line, the Section 6 note, and decisions 2 (generate-then-edit, not walked)
  and 22 (avatar early end, not triggered).
- The bare line "Phase 16 keyboard sign-off: **NOT completed**" was already gone
  before this plan.

## REQ-77 Pass 1 disposition

Pass 1 is now **evidenced** (status COMPLETE, agent-verified) rather than
human-reported PARTIAL. It is **not clean**: 2 major and 5 minor defects carry into
17-06-style triage. The coordinator decides the fixes. Nothing was repaired here.

## Database boundary

Local dev DB only. The agent made read-only queries to confirm report rows and
bands. No shared DB, Preview, Production or deployed app.
