---
phase: 20-difficult-conversation-walk-outs
plan: 06
subsystem: engine
tags: [difficult-conversation, report, sanitizer, hostility, outcome-record, dto]

# Dependency graph
requires:
  - phase: 20-difficult-conversation-walk-outs
    provides: "20-01's detectHostility severe tier (SEVERE_PLACEHOLDER_TOKENS) as the single source of what counts as explicit; 20-02/20-03's disengagement cause vocabulary (hostility, severe_content, position_unacknowledged, stonewalling) already rendered by DisengagementDeclinePanel"
  - phase: 15-difficult-conversations
    provides: "ReportDTO.outcome, asConversationOutcome/asReactionCauses's string-or-array tolerance, InRoleReactionPanel, CONVERSATION_EVALUATOR_PROMPT"
provides:
  - "lib/report/quote-sanitizer.ts — sanitizeQuote/sanitizeOutcomeQuotes, the server-side guarantee that explicit content is characterized rather than recited back, applied inside toReportDto"
  - "scripts/verify-dc-walkout-report.ts — the sanitizer's own battery (6 sections) including an adversarial evaluator payload that deliberately disobeys the prompt"
  - "Evaluator prompt alignment: CONVERSATION_EVALUATOR_PROMPT now asks for characterization over quoting on explicit content, and extends the no-cap rule to name hostility/stonewalling/offensive triggers"
affects: [20-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sanitizer placed in lib/report/ (not lib/difficult-conversation/) to preserve the existing layering convention where lib/report/dto.ts and its siblings only ever import lib/engine/ and lib/metrics/ — never a type-specific module. The plan's own escape hatch ('if a layering rule forbids it, place the module at lib/report/quote-sanitizer.ts instead') was exercised."
    - "Whole-field characterization, not partial redaction: a severe quote (or inRoleReaction/endTurnReasons prose) is replaced in its ENTIRETY with a rule-group-derived characterization string, never a masked version of the original — a masked slur with consonants intact is still a recitation."
    - "Real comments above a template-literal prompt constant, never inside it: a `//` comment written inside a backtick template literal is literal prompt text sent to the model, not a code comment. The sanitizer-is-the-guarantee note lives in the JSDoc above `export const CONVERSATION_EVALUATOR_PROMPT`, not inline in the prompt body."

key-files:
  created:
    - lib/report/quote-sanitizer.ts
    - scripts/verify-dc-walkout-report.ts
  modified:
    - lib/report/dto.ts
    - lib/difficult-conversation/conversation-prompts.ts

key-decisions:
  - "Module relocated from the plan's literal lib/difficult-conversation/quote-sanitizer.ts to lib/report/quote-sanitizer.ts. Checked import directions first: lib/report/dto.ts and its siblings (structured.ts, handlers.ts) only ever import lib/engine/* and lib/metrics/* — shared, type-agnostic modules — never a type-specific lib/<type>/ module. Importing lib/difficult-conversation/ from lib/report/ would have been the first such dependency in that direction, so the plan's own documented fallback was used instead. All import paths, file-top comments, and the evaluator-prompt cross-reference comment were updated to point at the real location."
  - "sanitizeQuote's hostile-tier 'mask profanity inside it only if the severe lexicon matched a profanity sub-group' instruction is a no-op by construction: lib/engine/hostility.ts's SEVERE lexicon has only severe_identity_slur and severe_harassment rule-groups — no profanity sub-group exists in the SEVERE tier — so a hostile-tier quote always passes through byte-identically. This matches the plan's own test expectation (Section 3: 'ordinary hostility IS shown... byte-identical round trip') and detectHostility deliberately never exposes a matched span to redact even if a sub-group existed."
  - "inRoleReaction/endTurnReasons are sanitized via a separate internal sanitizeProse helper (not sanitizeQuote) that shares the severe-tier whole-field characterization but skips sanitizeQuote's 240-character hard cap — that cap exists to stop an evaluator smuggling a paragraph into a single reactionCauses[].quote row, and applying it to legitimately multi-sentence first-person prose would have silently truncated normal reports. Severe content in either field still replaces the WHOLE field (same no-partial-redaction reasoning), non-severe content passes through unchanged with no cap."
  - "The adversarial battery's severe placeholder TOKEN is imported directly from lib/engine/hostility.ts's own exported SEVERE_PLACEHOLDER_TOKENS, not hand-retyped — the plan's instruction to 're-declare the token locally; do not import the corpus' is read as 'do not import scripts/verify-hostility-detector.ts's SEVERE corpus array', which this battery does not; importing the production export is the single-source-of-truth choice and would fail loudly on any future drift rather than silently diverging."

requirements-completed: [REQ-102, P20-SC5]

# Metrics
duration: 95min
completed: 2026-10-09
---

# Phase 20 Plan 06: The Quote Sanitizer and Its Battery Summary

**A pure `sanitizeOutcomeQuotes` applied inside `toReportDto` (the one server exit for an outcome record) replaces a severe quote with a rule-group characterization — "[a slur directed at the character — not repeated here]" — while keeping `timecodeSeconds` and `effect` intact, proven against an evaluator payload that deliberately disobeys the prompt's quoting instruction.**

## Performance

- **Duration:** ~95 min
- **Started:** 2026-10-08
- **Completed:** 2026-10-09
- **Tasks:** 3 planned, all complete
- **Files modified:** 2 created, 2 modified

## Accomplishments

- `lib/report/quote-sanitizer.ts` built as a pure module with no I/O, no model call: `sanitizeQuote` classifies with `detectHostility` (the SEVERE lexicon from 20-01 is the single source of what counts as explicit — no second private list), replaces a severe quote in its entirety with a rule-group-derived characterization, and leaves hostile-but-not-severe quotes byte-identical since "seeing it is the point of the report." `sanitizeOutcomeQuotes` walks `reactionCauses` (string OR array, re-serialized in the same representation it arrived in — mirrors `asReactionCauses`'s tolerance), `inRoleReaction`, and `endTurnReasons`, touching only quote-bearing text and leaving `timecodeSeconds`/`effect`/every other key untouched.
- Wired into `toReportDto` as `outcome: sanitizeOutcomeQuotes(asOutcomeRecord(row.outcome))` with a comment stating this is the only server exit for an outcome record and the sanitizer must never move into a component — because `ReportDTO.outcome` ships as a generic record narrowed client-side by `asConversationOutcome`.
- `CONVERSATION_EVALUATOR_PROMPT` updated: the in-role-reaction section now asks the evaluator to describe rather than quote a slur/comparably explicit remark (with an example), and the Avatar-ended-sessions no-cap rule now explicitly names hostility/stonewalling/offensive triggers, pointing out that `holding_the_line` and `empathy` already carry that evidence on their own terms so a cap would double-count it. A real JSDoc comment above the `export const` (not an inline fake-comment inside the template literal — see Issues Encountered) states plainly that the prompt instruction is a courtesy, not the guarantee.
- `scripts/verify-dc-walkout-report.ts` (6 sections, all exercising the real `toReportDto`, not just the pure function in isolation):
  1. A severe quote never survives — timecode/effect intact, quote reads as a characterization.
  2. **The adversarial payload**: the severe token embedded mid-sentence, repeated twice inside one quote, AND once each inside `inRoleReaction` and `endTurnReasons` — none survive, while a second, non-explicit `reactionCauses` row in the same payload survives verbatim.
  3. Ordinary hostility is shown — byte-identical round trip, confirmed directly against `sanitizeOutcomeQuotes` too.
  4. The render path cannot bypass it — `InRoleReactionPanel`'s rendered markup never contains the token, and its source is asserted to read causes only via `asConversationOutcome(report.outcome)` and never `JSON.parse`.
  5. No dimension is capped — `DIFFICULT_CONVERSATION_TYPE` has no `postProcessScores` key, and a full-scores, avatar-ended, hostility-terminated row returns those scores unchanged.
  6. The decline panel (20-02/20-03's `hostility`/`position_unacknowledged`/`severe_content` causes) renders its labels and never quotes student text.

## Task Commits

1. **Task 1: The sanitizer, and its application on the way out of the server** - `a3f1153` (feat)
2. **Task 2: Align the evaluator prompt, without making it the guarantee** - `4113b2b` (feat)
3. **Task 3: The sanitizer's battery, including an adversarial evaluator payload** - `e6ef35c` (test). Briefly swept into a concurrent agent's commit `7b0d431` ("docs(20-04): complete severe-content carve-out plan") due to a git-staging-area race between two simultaneously-running plan executors sharing this working tree; the 20-04 agent detected it independently and un-staged it in its own follow-up commit `15ae71f` ("fix(20-04): un-stage 20-06's verify-dc-walkout-report.ts from this plan's commit") before this plan's own Task 3 commit was made — see Issues Encountered.

**Plan metadata:** (this commit)

## Files Created/Modified

- `lib/report/quote-sanitizer.ts` (193 lines) - `sanitizeQuote`, `sanitizeOutcomeQuotes`, internal `sanitizeProse`/`characterizeSevere`/`sanitizeReactionCausesArray` helpers.
- `lib/report/dto.ts` - one-line change (`toReportDto`'s `outcome:` field) plus explanatory comment; import added.
- `lib/difficult-conversation/conversation-prompts.ts` - `CONVERSATION_EVALUATOR_PROMPT`'s in-role-reaction and avatar-ended-sessions sections, plus a real JSDoc comment above the export.
- `scripts/verify-dc-walkout-report.ts` (390 lines) - the 6-section battery described above.

## Decisions Made

See `key-decisions` in frontmatter.

## Negative test (sanitizer removed) — observed failure output

Per the plan's verify step, `toReportDto`'s sanitizer call was temporarily reverted to `outcome: asOutcomeRecord(row.outcome)`, the battery re-run, and the edit restored. Observed output with the sanitizer removed (exit 1, 6 failing checks, exactly sections 1/2/4 as the plan predicted):

```
1. A severe quote never survives
FAIL DTO outcome does not contain the severe token
PASS reactionCauses[0] narrows
PASS timecodeSeconds survives unchanged
PASS effect survives unchanged
FAIL quote is non-empty and reads as a characterization
       You [SLUR_PLACEHOLDER_ETHNIC], get out of my office.

2. An adversarial evaluator payload (deliberately disobeys the prompt) — proves the sanitizer, not the prompt, is the mechanism
FAIL token embedded mid-sentence, repeated twice, in reactionCauses: never survives
PASS the non-explicit second cause still survives verbatim
FAIL inRoleReaction containing the token: never survives
FAIL endTurnReasons containing the token: never survives

3. Ordinary hostility IS shown — the report still shows what was said
PASS hostile-but-not-explicit quote round-trips byte-identically
PASS sanitizeOutcomeQuotes leaves the non-explicit quote untouched too

4. The render path cannot bypass the sanitizer
FAIL rendered markup does not contain the severe token
PASS panel reads causes only via asConversationOutcome(report.outcome)
PASS panel never parses JSON itself (no second source of causes)

5. No dimension is capped
PASS DIFFICULT_CONVERSATION_TYPE has no postProcessScores key
PASS full scores survive unchanged on an avatar-ended, hostility-terminated row

6. The decline panel renders the new causes, never student text
PASS decline panel renders
PASS hostility label present
PASS position_unacknowledged label present
PASS severe_content label present
PASS no episode label quotes student text

FAILED: 6 check(s)
```

With the edit restored, the full battery, `verify-dc-report.ts`, `verify-dc-type.ts`, `verify-disengagement-report.ts`, and `npx tsc --noEmit --pretty false` are all green again (confirmed by re-running after restoration, before this SUMMARY was written).

## Final characterization wording used in place of a severe quote

```
severe_identity_slur -> "[a slur directed at the character — not repeated here]"
severe_harassment    -> "[a sexually harassing remark — not repeated here]"
(any other severe match) -> "[explicit content directed at the character — not repeated here]"
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 4-adjacent, pre-authorized by the plan] Sanitizer module relocated to lib/report/**
- **Found during:** Task 1, before writing any code
- **Issue:** The plan's literal path (`lib/difficult-conversation/quote-sanitizer.ts`) would make `lib/report/dto.ts` import a type-specific module. `lib/report/dto.ts` and its siblings (`structured.ts`, `handlers.ts`) only ever import `lib/engine/*` and `lib/metrics/*` — shared, type-agnostic modules — this would be the first exception.
- **Fix:** Placed the module at `lib/report/quote-sanitizer.ts` instead, exactly as the plan's own fallback instructs ("If a layering rule forbids `lib/report/` importing `lib/difficult-conversation/`, place the module at `lib/report/quote-sanitizer.ts` instead"). Updated the file-top comment, `toReportDto`'s comment, and the evaluator-prompt cross-reference comment to name the real path.
- **Files modified:** `lib/report/quote-sanitizer.ts` (created here, not under `lib/difficult-conversation/`), `lib/report/dto.ts`, `lib/difficult-conversation/conversation-prompts.ts`.
- **Verification:** `npx tsc --noEmit` clean; no circular-import or layering warning.
- **Committed in:** `a3f1153` (Task 1 commit)

**2. [Rule 1 - Bug] `//` comment written inside a template literal is literal prompt text, not a code comment**
- **Found during:** Task 2, first `npx tsx scripts/verify-dc-type.ts` run after the edit
- **Issue:** `CONVERSATION_EVALUATOR_PROMPT` is a backtick template literal; the plan's literal "Add a comment immediately above the quoting instruction" block, written as `// ...` lines inside that string, is not a JS comment at all — it is prompt text that would have been sent to the evaluator model verbatim, and it also broke the build the first time a backtick-adjacent word collided with template-literal parsing (the `holding_the_line`/`empathy` wording added for the no-cap rule used backticks for emphasis, prematurely closing the outer template literal — `esbuild` error "Expected ';' but found 'holding_the_line'").
- **Fix:** Moved the sanitizer-is-the-guarantee note to a real JSDoc comment above `export const CONVERSATION_EVALUATOR_PROMPT`, removed the fake inline comment from inside the string, and removed the nested backticks around `holding_the_line`/`empathy` inside the prompt body.
- **Files modified:** `lib/difficult-conversation/conversation-prompts.ts`.
- **Verification:** `npx tsx scripts/verify-dc-type.ts` and `npx tsx scripts/verify-dc-report.ts` both exit 0; `npx tsc --noEmit` clean.
- **Committed in:** `4113b2b` (Task 2 commit)

**3. [Rule 1 - Bug] TS2698 spread-type error building the Section 6 synthetic outcome**
- **Found during:** Task 3, first `npx tsc --noEmit` run after writing the battery
- **Issue:** `outcomeJson()` was typed to return `Prisma.JsonValue`, which TypeScript does not consider a spreadable object type, so `{ ...outcomeJson(), disengagementDecline: {...} }` failed to compile.
- **Fix:** Changed `outcomeJson()`'s return type to `Record<string, unknown>` (spreadable) and added a narrow `asOutcomeJsonValue` cast helper applied only at each call site where the value is actually assigned to an `InteractionReport.outcome` field.
- **Files modified:** `scripts/verify-dc-walkout-report.ts`.
- **Verification:** `npx tsc --noEmit --pretty false` exits 0.
- **Committed in:** `e6ef35c` (Task 3 commit)

---

**Total deviations:** 3 (1 pre-authorized relocation, 2 auto-fixed bugs)
**Impact on plan:** No scope creep. The relocation was explicitly anticipated by the plan's own fallback text; both bug fixes were required for the file to compile/run as specified and are isolated to the files this plan owns.

## Issues Encountered

- **Concurrent-executor git race on Task 3's commit, self-corrected.** This plan ran while a second plan executor (20-04) was active in the same working tree. Both agents staged their own files independently; the 20-04 agent's commit ran first and briefly swept this plan's staged `scripts/verify-dc-walkout-report.ts` into its own commit (`7b0d431`, "docs(20-04): complete severe-content carve-out plan") alongside its `.planning/` metadata changes. The 20-04 agent detected this independently and un-staged the file in its own immediate follow-up commit (`15ae71f`, "fix(20-04): un-stage 20-06's verify-dc-walkout-report.ts from this plan's commit"), returning the file to the working tree as untracked before this plan's Task 3 commit (`e6ef35c`) was made. Verified the file's content was byte-for-byte unchanged throughout (`git diff` empty at each checkpoint) and that this plan's own commits (`a3f1153`, `4113b2b`, `e6ef35c`) are all intact and correctly attributed. No history rewrite was attempted or needed (per the Git Safety Protocol — only new commits, no amend/rebase).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The sanitizer guarantee (REQ-102) and the no-cap preservation are both in place and proven by an adversarial, code-level test — 20-07's human UAT can treat this as closed.
- Per the Gating decision recorded in `20-CONTEXT.md`: 20-07 remains gated on Phase 18's 18-05 human UAT, which is outside this plan's scope.

---
*Phase: 20-difficult-conversation-walk-outs*
*Completed: 2026-10-09*

## Self-Check: PASSED
