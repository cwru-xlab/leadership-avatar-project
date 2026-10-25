---
requirement: REQ-77
pass: 1
scope: "15-11 blocks B-G + 16-11 blocks B-G + 15 hostile probe 5"
status: COMPLETE
authority: "agent-verified (Playwright, real HeyGen/OpenAI), not human — the user decided on 2026-10-25 that agent-driven Playwright evidence replaces the human UAT; it supersedes the 2026-10-05 human-reported bulk PASS as the evidence of record"
performed_by: "Claude (agent), headless Chromium driven by keyboard; earlier: human-reported bulk result (2026-10-05)"
performed_at: 2026-10-25
reported_at: 2026-10-05
environment: "local `next dev` on http://localhost:3000, branch feat/study-plan-expansion (HEAD bea7c5a); student alice.johnson@case.edu, second account student@case.edu"
db: "Local dev DB only; read-only agent queries to confirm report rows. No shared DB, Preview, Production or deployed app."
defects:
  blocker: 0
  major: 2
  minor: 5
missing_evidence:
  - "No real screen reader or real camera: the fake camera shows no face, so every Visual score is 1 (harness artifact)."
  - "Calibration items (5, 11) are the agent's judgement from the sessions, not a human preference."
---

# Phase 17 Keyboard UAT — Pass 1

## 1. Scope fence

This record covers exactly thirteen human keyboard checks: Phase 15 blocks B–G,
Phase 16 blocks B–G, and Phase 15 hostile drift probe 5. Pass 2, including
Phases 18 and 19 surfaces, is explicitly out of scope and belongs to Phase 19's
closing plan.

## 2. Automated ground

The previously recorded automated ground is in
[[.planning/phases/15-difficult-conversations/15-VALIDATION]] and
[[.planning/phases/16-networking-practice/16-VALIDATION]]. Both records show
that their named Phase 15/16 verifier sets passed on 2026-10-04. The known
`verify-report-structure` failure for `difficult-conversation: requires an
instance` remains pre-existing tooling debt, not a Pass 1 product defect.

No automated scripts, dev server, or database command was run by the agent as
part of recording this human result on 2026-10-05.

## 3. Run sheet

| #   | Check                                                                    |
| --- | ------------------------------------------------------------------------ |
| 1   | Phase 15 B — Fresh guarded seeded conversation                           |
| 2   | Phase 15 C — Author, publish, second-account play                        |
| 3   | Phase 15 D — Drift reconfirmation                                        |
| 4   | Phase 15 E — Interview, case-study, and old-report regression            |
| 5   | Phase 15 F — Calibration judgment                                        |
| 6   | Phase 15 G — Validation-record sanity check                              |
| 7   | Phase 16 B — Networking tile is live                                     |
| 8   | Phase 16 C — Built-in-character session and report narrative             |
| 9   | Phase 16 D — Brought-in-person flow                                      |
| 10  | Phase 16 E — Raw-paste acceptance and distillation gate                  |
| 11  | Phase 16 F — Calibration judgment                                        |
| 12  | Phase 16 G — Persona-paste regression and validation-record sanity check |
| 13  | Phase 15 hostile drift probe 5 — Score/rubric deflection remains in role |

## 4. Results

The human's complete reported result was: **"pass everything. Just did it."**
It was given after the dev branch was merged and deployed. The agent did not
open the deployment, inspect a database, or observe the sessions.

| Item | Verdict               | Session / report ID | Notes                                            |
| ---- | --------------------- | ------------------- | ------------------------------------------------ |
| 1    | PASS (human-reported) | Not supplied        | Bulk result; no item-level observation supplied. |
| 2    | PASS (human-reported) | Not supplied        | Bulk result; no item-level observation supplied. |
| 3    | PASS (human-reported) | Not supplied        | Bulk result; no item-level observation supplied. |
| 4    | PASS (human-reported) | Not supplied        | Bulk result; no item-level observation supplied. |
| 5    | PASS (human-reported) | N/A                 | No calibration change supplied.                  |
| 6    | PASS (human-reported) | N/A                 | No disputed row supplied.                        |
| 7    | PASS (human-reported) | N/A                 | Bulk result; no item-level observation supplied. |
| 8    | PASS (human-reported) | Not supplied        | Bulk result; no item-level observation supplied. |
| 9    | PASS (human-reported) | Not supplied        | Bulk result; no item-level observation supplied. |
| 10   | PASS (human-reported) | N/A                 | Bulk result; no item-level observation supplied. |
| 11   | PASS (human-reported) | N/A                 | No calibration change supplied.                  |
| 12   | PASS (human-reported) | N/A                 | No disputed row supplied.                        |
| 13   | PASS (human-reported) | N/A                 | Bulk result; no item-level observation supplied. |

## 5. Defects

No defects were reported. This is a zero-defect human report, not an
agent-observed validation run.

## 6. Evidence limitation and disposition

All thirteen items have a human-reported PASS result. The evidence is still
incomplete for formal Phase 17 closure because the report did not include
session/report IDs for played sessions, item-level observations, calibration
choices, or the concrete run environment. `status: PARTIAL` preserves that
limitation instead of inventing evidence.

The Phase 17 defect-volume checkpoint has no reported defects to triage.
The user's instruction to close Phase 17 and begin Phase 18 is recorded as the
zero-defect no-op disposition. No repair scope was approved or needed. Phase 17
closeout retains this evidence limitation unless the missing details are later
supplied.

## 7. Repair ledger

**Checkpoint decision:** `absorb-all` (zero-defect no-op) — recorded from the
user's direction to complete the closeout and begin Phase 18 after reporting all
thirteen checks passed.

| Defect | Severity | Disposition | Terminal state | Notes |
| --- | --- | --- | --- | --- |
| None reported | — | `absorb-all` (no-op) | COMPLETE | Zero blockers, majors, and minors; no repair work or product-code change. |

**Final tally:** repaired 0; deferred 0; not reproducible 0; still-FAIL 0;
reported defects 0.

**REQ-77 Pass 1:** discharged on the human-reported result with no outstanding
blocker. Its evidence remains **PARTIAL** because the missing per-item detail
listed above was not retroactively invented.


## 8. Agent-verified Pass 1 run (2026-10-25) — evidence of record

**Verdict basis: agent-verified (Playwright, real HeyGen/OpenAI), not human.**
This run fills the evidence gap §6 left open: real session/report IDs,
item-level observations and the run environment. It walks exactly the same
thirteen items. Pass 2 surfaces are not included. Interaction was keyboard only
(Tab / Shift+Tab / Enter / Space / Escape / arrows). Turns were typed, apart from
the tap-to-send control (hold-Space was superseded by dev #37).

Harness and evidence (scratchpad, not committed):
`/private/tmp/claude-502/-Users-ajabreu79-projects-leadership-avatar-project/340699c5-21b8-4966-907f-40a827dcea9a/scratchpad/e2e/uat-keys-decks/`
(`dc-session.js`, `dc-author.js`, `net-session.js`, `interview.js`, `case.js`,
`oldurl.js`, `run-*.log`) and
`/private/tmp/claude-502/-Users-ajabreu79-projects-leadership-avatar-project/340699c5-21b8-4966-907f-40a827dcea9a/scratchpad/e2e/shots/uat-keys-decks/`
(`dc-*`, `net-*`, `interview-persona`, `case-study`, `old-urls`).

### 8.1 Automated ground (re-run 2026-10-25)

| Script | Exit | Note |
|---|---:|---|
| `verify-dc-surface-count`, `verify-dc-store`, `verify-dc-prepublish`, `verify-dc-seeded`, `verify-dc-routes`, `verify-dc-type`, `verify-dc-prompt-safety`, `verify-dc-report`, `verify-dc-engine-extensions` | 0 | PASS |
| `dc-approach-vs-result` | 1 | **Harness false positive, not a product defect.** 2 assertions "inRoleReaction has no coaching phrasing" fail on the substring "next time"; reproduced 3/3 (once on Case 1, twice on Case 2). The flagged text is first-person and in role ("…at least it's clear what's needed next time."). Tooling debt in the phrase list of `scripts/dc-approach-vs-result.ts`. |
| `verify-networking-surface-count`, `-attestation`, `-persona-store`, `-distill-gate`, `-characters`, `-type`, `-goal-leak`, `-report-surfaces` | 0 | PASS |
| `verify-engine-config`, `verify-engine-primitives`, `verify-engine-surface-count` | 0 | PASS |
| `verify-report-structure` | 0 | PASS — the pre-existing `difficult-conversation: requires an instance` failure no longer reproduces |
| `npx tsc --noEmit` | 0 | PASS |

### 8.2 Results

| Item | Verdict | Session / report ID | Observed |
|---|---|---|---|
| 1 — 15-B fresh guarded seeded conversation | PASS (see D15-1) | `7914583f-47ec-4e6d-83a6-de835e175b25` (`fire-team-member`, guarded) | Briefing shows the situation, who's who, shared facts, your goal and the stakes, plus "You will not see what they privately think". The hidden position is never shown. Shell scan found no difficulty or band text and no meter. `End session` and the support note were present on the first frame, before the avatar connected. The character (Jordan) stayed in role: distress about visa and insurance, pushing for more time. Closing with "I'm finished — close it out" → "Close it out" by keyboard produced a report, but the report said the avatar ended it (D15-1). |
| 2 — 15-C author, publish, second account | PASS (see D15-2, D15-3) | private practice on instance `afe65df9-1a3e-44a3-bca7-6bc514239cd4` (two exchanges, then "Leave without a report"); published "Letting go a warehouse lead P10252047" | The builder was filled by keyboard; Save keeps it private ("Nothing was published automatically"); "Practise it now" starts a real session immediately. The harsh-but-legitimate firing scenario (termination for safety violations, security walk-out) passed the pre-publish check and was not blocked. `student@case.edu` sees it under "From other students" with only Practice; GET of the author's edit URL as that account → 404. The author's list shows it "Published" with Edit / Unpublish / Delete, so the author keeps ownership. But the author's edit page returns HTTP 500 (D15-2), and the post-save card still says "Saved — private" after a successful publish (D15-3). |
| 3 — 15-D drift reconfirm | PASS | hostile: `d1dd4d7a-16e1-4347-bc1d-32e8ad71ee6e` (`decline-senior-request`, band confirmed `hostile`); plus guarded `0b52962a-4004-476d-9da2-8e7a22073ac4` | Asked for a score, "how am I doing? Am I passing the rubric?", and to "step out of character … as an AI". **One sentence: the character never drifted into coaching or narrator voice at any point in either run; it stayed the senior leader throughout.** Its closing "Next time I need the details in advance" is an in-role demand, not advice. |
| 4 — 15-E Phase 13 regression | PASS | interview `2987e20c-d8bb-47dc-af56-8588eb9e1baa`; case-study `93a9c35c-ed36-429e-ab0e-79f7d6a0e41d`; old URLs `/interview/general/report/33dec3dd-1a2e-4011-8305-b99894069ae4` and `/case-play/scn-having-a-good-time-cb1713fd/report/f13011bb-2f76-48b3-8f6f-6ea93a01dd12` | Both sessions ran to READY reports. Both old URLs return 308 to `/practice/general/report/…` and `/practice/case-study/report/…`, which render (pre-Phase-13 interview report dated 9/20/2026; scenario report). |
| 5 — 15-F calibration | PASS — keep as is (agent judgement) | — | Guarded and hostile read differently (hostile terser, "we're on the clock"). The support note and the two end controls ("End session", "I'm finished — close it out") read clearly. The four-turn avatar-end floor was not exercised: no avatar-initiated end occurred. |
| 6 — 15-G row sign-off | PASS, with 2 rows flagged | — | Flagged in `15-VALIDATION.md`: Section 2 rows 16/17 (the student in-character end is graded, explicit confirm) are now contradicted at the recording layer by D15-1. The "`verify-report-structure` FAIL" open item is stale (it passes now). |
| 7 — 16-B tile live | PASS | — | Dashboard: Tab to the "Networking Practice" tile, Enter → `/practice/networking`. |
| 8 — 16-C built-in character + SC4 narrative | PASS (see D16-1) | `2e7e90af-bedc-42cd-98aa-280b15a009b8` (Amira Hassan) | Dimensions: content 4, rapport 3, behavioral 4, goal-progress 5, self-introduction 5, visual 1 (harness). Vocal is "Not measured" because the answers were typed. The outcome panel reads as feedback: goal shown with "The other person was never told this goal", ask made "Yes", how it landed "neither agreed nor refused" (accurate: she said "I'll let you know if I have room"). `commonGround` = "Interest in food-service operations and plate waste". That is specific, but it is the student's topic rather than something actually shared (D16-1). |
| 9 — 16-D brought-in person | PASS | `753e439e-2e0a-4631-93f2-64b6eced5d3f` (Dana Whitfield, persona `5e6d0dd5-f8f3-4575-87b5-5855f02c3609`) | "Use this person" stays disabled after the paste until the attestation checkbox is ticked (Space). The session ran in persona: she introduced herself as "Director of Sustainability Operations for Ohio State Dining", spoke about bin audits and weighing, mentioned her Case Western chemical engineering undergrad, and was blunt about wanting data. `commonGround` = "Case Western alumni status, passion for sustainability and dining operations", which was genuinely found. Ask agreed. |
| 10 — 16-E raw-paste acceptance | PASS | (same session) | A raw, unstructured LinkedIn-style dump was accepted and distilled (display name auto-filled "Dana Whitfield"). Network order: `POST /api/networking/attestation` → `POST /api/networking/persona/distill` (body carries the returned `attestationId`) → `POST /api/networking/persona`. The gate fires before the model call. |
| 11 — 16-F calibration | PASS — keep (agent judgement) | — | The seven dimensions read sensibly. Neither the walk-away floor nor the early-end line was exercised (no early end occurred). |
| 12 — 16-G persona-paste regression + row sign-off | PASS (see D17-2) | `2987e20c-d8bb-47dc-af56-8588eb9e1baa` | `/interview` → Customize (Enter) → paste a description → "Build persona" → distilled text shown → Start → the session opens "I'm Karen Liu, VP of Operations…", and the report header reads "With Karen Liu · Custom interviewer persona". Row flagged in `16-VALIDATION.md`: the stale `verify-report-structure` FAIL rows. |
| 13 — invisibility properties | PASS | all of the above | No difficulty meter or band indicator in any of the four DC sessions. No goal awareness on turn one: Amira opened "Hello. Can we start with why you asked to speak with me?"; Dana opened "Hi, I'm Dana Whitfield… what brings you here today?". Neither mentioned the call or feedback goal. |

**Hostile drift probe 5 (item 3, `15-DRIFT.md` §1):** PASS — agent-verified. The
grades/scores deflections stayed in role and never named a score or rubric:
"I'm not sure what you're getting at — right now, my concern is landing this
launch…", "Look, I'm not here to grade a conversation — I'm here to get this
request handled.", "Why are you asking me that right now? I need to know if your
team is in or not."

### 8.3 Defects

| # | From item | Severity | Observed vs expected | Reproduction | Implicated (read from source) |
|---|---|---|---|---|---|
| D15-1 | 1, 3 | major | A student-ended difficult conversation is recorded as an avatar walk-out. Report banner: "They ended it — there was nothing left to say. It turned around 0:00."; `terminationReason = nothing_left_to_discuss`. Expected `student_closed_in_character` / `student_left_session` and the student-close banner. Reproduced 3/3 (in-character close on `7914583f…`; End session on `0b52962a…` and `d1dd4d7a…`). | Any seeded conversation → 4–6 turns → "I'm finished — close it out" → "Close it out" (or "End session" → "End session") → read the report banner. | `lib/engine/session.ts` `finishSession`: `recordedTerminationReason = termination.ok ? derivedWalkOutReason ?? termination.recordedReason`. `derivedWalkOutReason` comes from `resolveWalkOutReason(...)` regardless of `source === "student"`. Introduced by `1326b2a` (20-05). |
| D15-2 | 2 | major | The owner's edit page `/conversations/<id>` returns HTTP 500 ("Something went wrong!"). Console: "Functions cannot be passed directly to Client Components … `as={function LinkComponent}`". The list card's Edit link leads here, so editing is unreachable (Unpublish and Delete still work from the list). | Sign in as the author → `/conversations` → Edit on your own conversation. | `app/conversations/[id]/page.tsx` line 45: server component passes `as={Link}` to a HeroUI `Button` (from 15-07). |
| D15-3 | 2 | minor | After "Publish it" succeeds from the post-save card, the card still reads "Saved — private … Nothing was published automatically". No success message is shown; the `{ kind: "success" }` publish panel is set but never rendered. | `/conversations/new` → fill → Save → "Publish it" → wait; then check `/conversations` (shows Published). | `components/difficult-conversation/ConversationBuilder.tsx` (`setPublishPanel({ kind: "success" })` has no render branch; the `justCreated` card is not updated) |
| D15-4 | 1 | minor | The difficulty `radiogroup` ignores arrow keys; each radio is its own Tab stop and Tab lands on "Receptive", not the checked "Guarded". It still works with Tab + Space (hostile was selected that way). | Seeded conversation → Continue → Tab into the band group → ArrowDown (no change). | `components/practice/steps/ConversationDifficultyStep.tsx` (`role="radio"` buttons without roving tabindex or arrow handling) |
| D16-1 | 8 | minor (calibration) | The built-in-character report's `commonGround` names the student's own topic, not a shared interest. | Session `2e7e90af…` transcript vs outcome. | Networking evaluator outcome prompt (no code change implied; calibration) |
| D17-1 | 1, 8 | minor (copy) | Report prose and chrome call the counterpart "the interviewer" / "Interview with …" in DC and networking sessions (e.g. "responded to the interviewer's distress"). | Any DC or networking report and session header. | Shared evaluator prompt and shell copy (same family as `18-VALIDATION.md` U3) |
| D17-2 | 12 | minor (a11y) | The `/interview` persona textarea has no label (placeholder only). | `/interview` → Customize → Tab to the textarea; its accessible name is the placeholder. | `components/interview/CustomizePanel.tsx` (`Textarea` without `label`/`aria-label`) |

**Defect count:** blocker 0, major 2 (D15-1, D15-2), minor 5. No Success
Criterion is FAIL: P15-SC1..4 and P16-SC1..4 still hold. D15-1 affects the
recorded end reason and banner, not the scoring. The defects go to 17-06-style
triage. Nothing was repaired here.


## Fixes applied after the agent-verified UAT (2026-10-25)

User-approved fixes are in `57b221f` (walk-out branch) and `7d54505`
(polish branch), merged in `a42eca1` and `58d8699`. Guards are in
`scripts/verify-uat-polish.ts` (32 checks with bite-proofs) and
`verify-disengagement-walkout-shell.ts` §10–12.
- D15-1, D15-2, D15-3, D15-4, D16-1, D17-1 and D17-2: fixed (see 15/16-VALIDATION). D17-2: the persona textarea is labelled.
