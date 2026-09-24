# Phase 8: Interview Customization - Research

**Researched:** 2026-09-21
**Domain:** Next.js App Router + Prisma app; prompt-assembly customization for an LLM-driven interview simulator
**Confidence:** HIGH (this is entirely a codebase-architecture problem, not a third-party-library problem — every finding below is read directly from the repo, not from external docs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Preset catalog**
- 3–4 focused presets at launch. Exact set is Claude's to propose, grounded in the existing prompt structure and the five rubric categories.
- Today's `general` record stays, is the default, and is listed first. It is the shipped, human-validated end-to-end path (Phases 5–7); it is not to be rewritten as part of building the new presets.
- Presets remain data records in the registry, consistent with the Phase 1 guarantee that a new variant is a record, not a page.

**Entry point and flow placement**
- A separate picker page sits before the existing wizard. The Practice Interviews dashboard tile routes to a preset index; choosing a preset enters the existing two-step wizard (Interviewer → Resume) at that preset's slug. The wizard itself does NOT gain a third step.
- Each preset card shows name, one-line description, and what it covers — difficulty, rough length, and the question areas — so presets are distinguishable before a student commits ~20 minutes.
- Customization lives on the preset picker page, attached to the chosen preset, pre-filled from that preset's defaults.
- Customization is hidden behind a "Customize" affordance. The defaults render as read-only summary text; the controls appear only when the student asks for them. The fast path (pick a preset, start) stays fast.
- Settings lock when the session begins. No mid-session changes — this is what preserves the session-constant prompt guarantee.

**The knobs**
- Industry and role: dropdowns of curated options. Fixed lists, not free text — predictable prompt quality, and no unsanitized student input reaches the system prompt.
- Difficulty keeps its current meaning. Beginner/Intermediate/Advanced drives follow-up depth and how hard the interviewer presses, exactly as `lib/interview/types.ts` documents and `prompts.ts` implements. It does NOT change question count or length.
- Session length IS a student-facing knob (target minutes / question count). Deliberate addition beyond the original success criterion 2.
- A blank or cleared field falls back to the preset's default. The assembled prompt must never receive an empty value for any placeholder.

**Interviewer personality**
- In scope, in two parts: a simple personality dial, PLUS an optional free-text "who is interviewing you" input that the model distills into a persona. The second part is substantial enough to be its own plan within the phase.
- Personality is independent of the avatar. The avatar chosen in wizard step 1 supplies face and voice only. `interviewerPersona` lives on the interview type, not on the avatar record.
- The pasted-profile persona plays the named person directly — the avatar takes the name and background and speaks as them, rather than being merely "styled after" them. Chosen deliberately for rehearsal realism, with the confabulation tradeoff understood and accepted.

**Report surface**
- The report records and displays the customization that produced it — preset, industry, role, difficulty, length. Planner should check what `InterviewReport` and `InterviewReportDTO` already carry before adding fields (they do NOT carry these — see Architecture Patterns below).

### Claude's Discretion

- The specific preset set (names, personas, role/industry defaults, difficulty and length per preset) — proposed below.
- The curated industry and role lists — contents and granularity — proposed below.
- Whether tweaks persist between sessions. User deferred this; resetting to preset defaults each time is the acceptable simple answer if that's what storage supports.
- The personality dial's exact options (something like warm / neutral / pressure-testing) and how it composes with the preset's persona string.
- How the pasted profile text is turned into a persona — prompt design, distillation step, length limits.

### Deferred Ideas (OUT OF SCOPE)

- Fetching a LinkedIn (or any) URL server-side to build a persona. Rejected on feasibility and ToS grounds. Do not research or propose server-side URL fetching in any form.
- Persisting customization presets a student authored themselves ("save my usual setup") — shades into Phase 9, Student-Authored Scenarios.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| REQ-17 | Registry holds 3-4 preset records; `general` preserved unchanged, default, listed first; a preset is a data record not a page | See "Preset catalog proposal" — `INTERVIEW_TYPES` is already a `Record<string, InterviewType>`; adding records requires zero changes to `getInterviewType`/`listInterviewTypes`. `GENERAL_INTERVIEW` must not be edited. |
| REQ-18 | Picker page between dashboard tile and wizard; cards show name/description/difficulty/length/question areas; wizard stays 2 steps | See "Entry point" section — `lib/interactions/index.ts`'s `interviews` tile `route` must change from `/interview/general` to the new picker route; `app/interview/[type]/page.tsx`'s `SetupStep` union is untouched. |
| REQ-19 | Customization on picker page, pre-filled from preset defaults, behind "Customize" affordance, read-only summary otherwise; settings lock at session start | See "Where customization state lives" — resolved client-side into a plain object before the wizard's `session` step is ever reached; nothing after that step may re-open it. |
| REQ-20 | Industry/role curated dropdowns (no free text); difficulty keeps existing meaning; blank/cleared falls back to preset default | See "Curated lists" and "Server-side validation" — enums must be enforced in the SAME validation function on both `session/start` and the chat route, not just in the UI. |
| REQ-21 | Session length is a student-facing knob; `buildProgressBlock` / live progress tracking stays coherent with the chosen length | See "Session length knob" — `buildProgressBlock` already takes `targetMinutes` from the object passed to it; the only actual risk is `advanceProgress`'s hardcoded `>= 3` / `>= 3` thresholds in `InterviewSessionShell.tsx`, which assume roughly a 9-question shape regardless of `targetQuestionCount`. |
| REQ-22 | Personality dial + optional pasted-profile distillation, independent of avatar; no server-side URL fetch; rehearsal framing; scoped persistence | See "Personality dial and pasted-profile persona" — distillation must happen through a dedicated one-shot endpoint mirroring the existing `/api/interview/upload-resume` pattern, never inline per chat turn. |
| REQ-23 | Assembled system prompt session-constant; customization resolved once into an `InterviewType`-shaped object; nothing per-turn | See "The central technical question" — this is the crux of the whole phase; concrete resolution below. |
| REQ-24 | Report records and displays the customization that produced it | See "Report surface: what needs to change" — confirmed schema gap in `InterviewReport`, confirmed blind spot in `evaluation-runner.ts:70` (evaluator always re-derives role_context from the PRESET default via `getInterviewType(report.typeSlug)`, discarding any customization entirely). |
</phase_requirements>

## Summary

Phase 8 is not a new subsystem; it's an extension of an existing, well-factored parameterization seam. `InterviewType` (`lib/interview/types.ts`) already has every field customization needs to touch — `interviewerPersona`, `defaultRoleTitle`, `defaultIndustry`, `difficulty`, `targetMinutes`, `targetQuestionCount` — and `buildInterviewSystemPrompt`/`buildProgressBlock` (`lib/interview/prompts.ts`) already consume exactly that shape. **No change to the prompt-assembly functions themselves is required.** The entire phase is about (1) adding preset records, (2) building a picker + customization UI that produces an `InterviewType`-shaped object, (3) getting that object from the browser to the server on every request *safely* without breaking the prefix-cache contract, and (4) persisting+displaying what was chosen.

The one real architectural gap is REQ-23/REQ-24 combined: today `getInterviewType(typeSlug)` is a pure registry lookup — the server trusts nothing from the client except a slug. Customization means the server must accept *some* client-supplied override data every turn (since the chat route currently re-resolves the interview type from scratch on every single POST — it does not look anything up by `reportId`). The fix is a **validating resolver**, not a new storage/lookup layer: a function that takes `(typeSlug, customizationInput)` and returns an `InterviewType` object by merging validated overrides onto the preset — curated dropdowns checked against fixed lists, difficulty checked against the 3-value enum, length checked against a small enum of allowed (minutes, questionCount) pairs (not arbitrary numbers — this is what keeps `buildProgressBlock` coherent), and the persona string treated exactly like `resumeText` already is (free text, truncated, never re-validated beyond length) because the codebase already accepts that trust model for pasted-in content. Because this resolver is deterministic and the client resends the identical customization payload on every turn of one session — exactly how `resumeText` already travels on every `/api/interaction/chat` call today — the assembled system prompt stays byte-identical turn-to-turn, which is all the "prefix cache" contract actually requires. It does not require server-side storage keyed by session; it requires client-side stability across turns, which the existing resend-every-turn pattern already provides for `resumeText`.

The other confirmed gap: `evaluation-runner.ts:70` calls `getInterviewType(report.typeSlug) ?? DEFAULT_INTERVIEW_TYPE` to build `role_context` for the post-interview grader — meaning **even without any UI work, a customized session's evaluation, today's code as written, would silently grade against the preset's default role/industry/difficulty, not what the student actually experienced.** This must be fixed by persisting the resolved customization on the `InterviewReport` row at `session/start` and having `evaluation-runner.ts` read those columns instead of re-deriving from `typeSlug` alone.

**Primary recommendation:** Add a `resolveInterviewType(typeSlug, customization)` function in `lib/interview/types.ts` (or a sibling `customization.ts`) that both `app/api/interview/session/start/route.ts` and `app/api/interaction/chat/route.ts` call instead of the raw `getInterviewType`. Add 5–6 new nullable columns to `InterviewReport` (industry, roleTitle, difficulty, targetMinutes, targetQuestionCount, interviewerPersona or a short "personality" label) written once at `session/start` and read by both `evaluation-runner.ts` and `report-dto.ts`. Everything else is UI work reusing existing patterns (curated `<Select>` dropdowns, a distillation endpoint shaped like `upload-resume`).

## Architecture Patterns

### Current data flow (as-is, verified by direct read)

```
app/interview/[type]/page.tsx (wizard: interviewer -> resume -> session)
  ├─ getInterviewType(params.type)              // registry lookup, trusts only the slug
  └─ renders InterviewSessionShell(interviewType, ...)
        ├─ ensureReport() -> POST /api/interview/session/start
        │     body: { typeSlug, interviewerAvatarId, interviewerName, resumeId, resumeText }
        │     route re-resolves: getInterviewType(typeSlug)   // only slug is trusted
        │     creates InterviewReport row { typeSlug, interviewerAvatarId, interviewerName, resumeId, resumeText }
        ├─ sendMessage() -> POST /api/interaction/chat  (EVERY TURN)
        │     body: { messages, language, interview: { typeSlug, resumeText, progress, startedAt } }
        │     route re-resolves: getInterviewType(typeSlug)   // only slug is trusted, EVERY turn
        │     buildInterviewSystemPrompt(interviewType, { resumeText, language })  // session-constant part
        │     buildProgressBlock(progress, { elapsedMinutes, targetMinutes: interviewType.targetMinutes })
        ├─ checkpoint() -> POST /api/interview/session/checkpoint (fire-and-forget, every assistant turn)
        │     body: { reportId, turns, progress }  -- no typeSlug, no customization
        └─ handleEnd() -> POST /api/interview/session/finish
              body: { reportId, turns, progress }  -- no typeSlug, no customization
                 -> waitUntil(runAndPersistEvaluation(userId, reportId))
                       -> getInterviewType(report.typeSlug) ?? DEFAULT_INTERVIEW_TYPE   // ** ignores any customization **
                       -> role_context = { roleTitle: type.defaultRoleTitle, industry: type.defaultIndustry, difficulty: type.difficulty }
```

Key fact confirmed by reading the code: **`resumeText` is already resent, unvalidated beyond truncation, on every single chat turn.** This is the existing precedent for how customization data should travel — not a new pattern to invent.

### Pattern 1: Resolve-don't-store customization (the REQ-23 answer)

**What:** Instead of teaching the server to look up a per-session "resolved" `InterviewType` from a database keyed by `reportId` (which would require plumbing `reportId` into the chat route, which it does not currently receive), the client resolves the full customization object once, holds it in React state for the session's lifetime, and resends the identical validated payload on every request (`session/start`, every chat turn, `checkpoint`, `finish`). The server's job is not to trust that payload, but to *re-derive* the same `InterviewType` object from it deterministically, validating every field against a fixed set on every request.

**When to use:** This is the only viable approach given the current chat route's request shape (no `reportId`, no DB round-trip inside the hot per-turn path) and given the constraint that nothing may be injected per-turn beyond the tail block.

**Why it doesn't break the cache:** OpenAI's prefix cache is about byte-identical system-prompt content across turns of *one conversation*. It was never keyed on "the value must come from a database" — `resumeText` is proof the codebase already resolves free-form, non-database-backed input into the cached prefix once per session and resends it unchanged. Customization is the same shape of problem: resolve once (in the browser, right when the student leaves the picker/wizard), then treat the resulting object as immutable for the rest of the session.

**Example (shape, not literal code):**
```typescript
// lib/interview/types.ts — new function alongside getInterviewType
export interface InterviewCustomizationInput {
  industry?: string;         // must match a slug in CURATED_INDUSTRIES
  roleTitle?: string;        // must match a slug in CURATED_ROLES
  difficulty?: string;       // must be one of InterviewDifficulty
  lengthPreset?: string;     // must be one of SESSION_LENGTH_PRESETS keys — NOT a raw number
  personalityDial?: string;  // must be one of PERSONALITY_DIALS keys
  interviewerPersona?: string; // pre-distilled text ONLY (see Pattern 3) — never raw pasted text
}

export function resolveInterviewType(
  slug: string | undefined | null,
  customization?: InterviewCustomizationInput | null
): InterviewType | null {
  const base = getInterviewType(slug);
  if (!base) return null;
  if (!customization) return base;
  return {
    ...base,
    defaultIndustry: validateIndustry(customization.industry) ?? base.defaultIndustry,
    defaultRoleTitle: validateRole(customization.roleTitle) ?? base.defaultRoleTitle,
    difficulty: validateDifficulty(customization.difficulty) ?? base.difficulty,
    ...resolveLengthPreset(customization.lengthPreset, base),
    interviewerPersona: composePersona(customization, base),
  };
}
```
Both `session/start/route.ts` and `interaction/chat/route.ts` call `resolveInterviewType` instead of `getInterviewType`. This is a small, surgical change to two call sites — the prompt-assembly functions (`buildInterviewSystemPrompt`, `buildProgressBlock`) need **zero changes**, because they already take a plain `InterviewType` object and don't care how it was constructed.

### Pattern 2: Enum-shaped "length" knob, not a free number (the REQ-21 answer)

**What goes wrong if length is a raw number input:** `buildProgressBlock` computes `remaining = targetMinutes - elapsedMinutes` and fires "move to closing" at `remaining <= 2`. That logic is robust to any positive `targetMinutes`. The actual fragile spot is in `InterviewSessionShell.tsx`'s **client-side** `advanceProgress()` (lines ~81-129), which hardcodes stage-transition thresholds: `resume` stage advances to `behavioral` at `questionsAsked >= 3`; `behavioral` advances to `role_specific` once 3 categories are covered (fixed at 3, not derived from `targetQuestionCount`). If a student picks a short "quick" session with `targetQuestionCount: 5`, this logic still tries to cover the same fixed 3 resume-questions + 3 behavioral-categories + 1-2 role-specific before closing — the actual conversation could run long relative to the requested length, since `advanceProgress` and the prompt's own stated `targetMinutes`/`targetQuestionCount` are not derived from the same source.

**Recommendation:** Define session length as a small closed set of presets (e.g. Quick / Standard / Extended, each an explicit `{ targetMinutes, targetQuestionCount }` pair), not a free-typed number, and — this is a plan-level decision the phase should make explicit — either (a) scale `advanceProgress`'s thresholds proportionally to the chosen `targetQuestionCount` (e.g. resume-stage cap and behavioral-category-count derived from a fraction of `targetQuestionCount` rather than hardcoded `3`), or (b) accept and document that stage transitions are approximate and the closing trigger is time-based (`buildProgressBlock`'s "time target nearly reached" line) as the real backstop regardless of the number of stages completed. Either is coherent; leaving the hardcoded thresholds untouched while only changing `targetMinutes`/`targetQuestionCount` on the `InterviewType` is the one option that is NOT coherent, since the model gets told a length that the client-side progress tracker doesn't structurally aim for.

### Pattern 3: One-shot persona distillation, not inline (the REQ-22 answer)

**What:** The pasted "who is interviewing you" text must become a persona string exactly once, before the session starts — mirroring the existing resume flow, which has its own dedicated endpoint (`POST /api/interview/upload-resume`) that runs once, returns extracted/processed text, and the client then holds that result in state for the rest of the flow. Do the same: a new endpoint (e.g. `POST /api/interview/persona/distill`) takes the pasted text, runs one LLM call server-side that produces a persona description written in the voice the system prompt expects (a sentence or two describing who the interviewer is, matching the register of `GENERAL_INTERVIEW.interviewerPersona`), applies a length cap server-side on both the input (before the call — e.g. 4,000 chars) and the output (after the call — e.g. 600 chars, matching how tightly-scoped `interviewerPersona` values already are in the registry), and returns the distilled string to the client. The client then holds that returned string exactly like it holds `resumeText` — resending it unchanged on every subsequent request as `interviewerPersona` (or as `customization.interviewerPersona`, feeding `resolveInterviewType`'s `composePersona`).

**Trust model:** Once distilled, this text is free-form and gets interpolated into the system prompt exactly the way `interviewerPersona` already is for every preset today (`buildInterviewSystemPrompt` line 60: `` `...playing the role of: ${type.interviewerPersona}.` ``) — no different in kind from a curated preset's persona string, just student-supplied instead of engineer-authored. This is consistent with the user's explicit, accepted tradeoff (confabulation risk, named-person realism chosen deliberately) — the research finding here is only that the SAME length/trust discipline already applied to `resumeText` should apply to this string too, and that the distillation step (not raw pasted text) is what should ever reach `resolveInterviewType`.

**Framing requirement (REQ-22):** The UI must present the resulting session as a rehearsal simulation, not a portrait of a real person — this is a copy/UX requirement, not a technical one, but it belongs on the picker page near the paste box and probably again as a one-line reminder inside the session shell header.

**Retention requirement (REQ-22):** The pasted text and the distilled persona are "a third party's personal information" per CONTEXT.md and should persist only as long as the session needs it. Concretely: do NOT add a persisted `pastedProfileText` column to `InterviewReport` or any other table. The distilled `interviewerPersona` string used for that session MAY be stored on the report row (needed anyway for REQ-24's "what customization produced this report" display) since it is a derived summary, not the raw third-party text, and it never leaves the student's own report page (owner-only 404 pattern, already established in Phase 6).

### Anti-Patterns to Avoid

- **Re-validating customization only in the browser.** REQ-20's "no unsanitized student input reaches the system prompt" is a server-side requirement. The picker UI restricting `<Select>` options to a curated list does nothing to stop a crafted `POST /api/interaction/chat` body from sending an arbitrary `industry` string — `resolveInterviewType` (or whatever the validating function is named) must independently check every field against the same fixed lists server-side, exactly as `session/start/route.ts` already independently re-validates `resumeId` against a UUID regex rather than trusting the client's claim that it's a valid id.
- **Threading `reportId` into the chat route to do a DB lookup per turn.** This would work but is a bigger, riskier change than necessary (new required field on an existing hot path, new failure mode if the row is deleted/mismatched, doesn't match how `resumeText` already flows) when the resend-and-revalidate pattern already solved this exact problem for resume text.
- **Letting `advanceProgress`'s stage thresholds silently ignore the chosen length.** Silently shipping the length knob without touching `advanceProgress` produces a UI that promises "Quick, 10 minutes" but a progress tracker that still expects to march through the same fixed stage counts as the 20-minute `general` preset.
- **Trusting `getInterviewType(report.typeSlug)` inside `evaluation-runner.ts` for a customized session.** Confirmed bug-in-waiting: as written today, this line ignores any customization and grades against preset defaults. Must be changed to read the customization actually recorded on the `InterviewReport` row.
- **Adding a `pastedProfileText` (raw) column to `InterviewReport`.** Contradicts the "persists only as long as the session needs it" / "exposed on no surface beyond the student's own session" constraints from CONTEXT.md. Store only the distilled persona (already a derived, bounded-length summary), not the raw paste.

## Preset catalog proposal (Claude's Discretion)

Grounded in what `buildInterviewSystemPrompt` actually does with `defaultRoleTitle`/`defaultIndustry`/`caseBackground`, and in the five evaluator rubric categories (Visual, Vocal, Content & Structure, Behavioral & Mindset — Visual/Vocal always null today). The prompt's question structure (opening → resume → 3-4 behavioral → 1-2 role-specific → closing) is generic enough that a "preset" is really just: a different persona + role/industry framing + optionally a `caseBackground` string that gives the role-specific stage something concrete to ask about. Recommend **4 presets total, `general` plus 3 new**, so the catalog reads as real without thin near-duplicates:

1. **General Interview** (`general`, unchanged, default, listed first) — as today: generalist hiring-manager persona, cross-industry, Intermediate, 20 min / 9 questions.
2. **Technical / Engineering Interview** (`technical`) — persona: a pragmatic senior engineering manager who probes for how the candidate thinks through tradeoffs, not trivia; `defaultRoleTitle`: "a software engineering role"; `defaultIndustry`: "technology"; a short `caseBackground` giving the role-specific stage a concrete prompt (e.g., ask the candidate to describe a system/technical decision they made and defend it) rather than open-ended chit-chat, since technical interviews are exactly the case where "role/industry-specific question" needs grounding to not feel generic. Difficulty Intermediate by default (student can raise it). Same 20 min / 9 questions default — no reason to differ from `general`.
3. **Consulting / Case-Style Interview** (`consulting`) — persona: a composed, Socratic consulting-firm interviewer; `defaultRoleTitle`: "a management consulting associate role"; `defaultIndustry`: "management consulting"; `caseBackground`: a short generic business-case prompt (framing, not the full case-play product — Phase 9 owns real student-authored scenarios) so the role-specific stage has a concrete business problem to discuss. Difficulty Advanced by default (case interviews are harder by convention) — student can lower it.
4. **Early-Career / Internship Interview** (`early-career`) — persona: a warmer, more encouraging early-career recruiter persona (explicitly less "pressure-testing" than `general`'s hiring manager); `defaultRoleTitle`: "an internship or entry-level rotational role"; `defaultIndustry`: "general / cross-industry"; Difficulty Beginner by default; shorter default length (Quick preset — see below) since internship screens are conventionally shorter than a 20-minute loop round.

This set gives clear differentiation on the picker cards (role, industry, difficulty, length all differ pairwise) without inventing content the existing prompt structure doesn't already support (no new question-structure logic needed — `caseBackground` already exists and is optional).

## Curated lists (Claude's Discretion)

**Industry dropdown** — recommend a short, generically-useful list (~8-10 entries) rather than an exhaustive taxonomy, since it feeds a persona/context sentence, not a matching algorithm: General / cross-industry (default, matches `GENERAL_INTERVIEW`), Technology, Consulting, Finance, Healthcare, Nonprofit / Public sector, Marketing / Communications, Retail / Consumer, Manufacturing / Operations, Education. Store as `{ slug, label }` pairs, same shape as `INTERVIEW_TYPES`, in a new small const array (e.g. `lib/interview/customization-options.ts`) — not free text, not user-extensible.

**Role dropdown** — recommend keeping this **independent of industry** (a flat list, not a per-industry cascading list) to avoid combinatorial catalog maintenance; the prompt only ever interpolates the label into one sentence (`Target role: ${type.defaultRoleTitle}`), so a flat curated list like: Early-career / entry-level role, Individual contributor role, Team lead / people-manager role, Senior / staff-level role, Consulting / advisory role, Technical / engineering role, Sales / client-facing role, Product / program management role covers the realistic range without pretending to model every job title. Same `{ slug, label }` shape.

**Difficulty** — no new list; reuse `InterviewDifficulty` (`Beginner | Intermediate | Advanced`) verbatim, unchanged meaning per REQ-20.

**Session length** — recommend an explicit enum of 3 presets rather than a slider, per Pattern 2 above: Quick (`~10 min / 5 questions`), Standard (`~20 min / 9 questions`, matches today's `general` default exactly), Extended (`~30 min / 13 questions`). Each preset's picker-card display should read "~X min" per REQ-18's "rough length" requirement.

**Personality dial** — recommend 3 options composing as a short modifier clause appended/prepended to the base persona sentence, not replacing it: Warm & encouraging, Neutral & professional (default — closest to how `general`'s persona already reads), Pressure-testing (closest to `general`'s existing "press politely for specifics" framing, dialed up). Concretely, `composePersona()` should take the preset's `interviewerPersona` base sentence and splice in a clause keyed by the dial (e.g. for Pressure-testing: "...and you press hard for specifics, following up more than once if an answer stays vague"), unless the student also supplied a distilled pasted-profile persona, in which case (per REQ-22, "plays the named person directly") the distilled persona REPLACES the base sentence entirely and the personality dial should probably be disabled/hidden in that mode rather than composed with it — worth flagging as an explicit planning decision, since composing a dial modifier onto a named real person's persona ("and Jane Smith presses hard for specifics...") is a different, odder shape than composing it onto a generic "hiring manager" persona.

## Report surface: what needs to change (REQ-24)

Confirmed by reading `prisma/schema.prisma`'s `InterviewReport` model (lines 284-318) and `lib/interview/report-dto.ts`: **the row currently stores none of industry/role/difficulty/length.** It stores `typeSlug`, `interviewerAvatarId`/`interviewerName`, `resumeId`/`resumeText`, transcript/turn data, and scores. `typeSlug` alone is insufficient once presets are customizable — two students could pick the same preset and customize it into very different sessions, and `typeSlug` can't distinguish them.

**Recommended new nullable columns on `InterviewReport`** (a migration, confirmed by STATE.md to be permitted — target the LOCAL dev DB only, hand off via `npm run setup` exactly as Phase 6's `06-01` did):
- `industry String?` — the resolved `defaultIndustry` used for this session (preset default or override)
- `roleTitle String?` — the resolved `defaultRoleTitle` used
- `difficulty String?` (or reuse the existing `InterviewDifficulty`-shaped string) — the resolved difficulty used
- `targetMinutes Int?`, `targetQuestionCount Int?` — the resolved length used
- `interviewerPersona String? @db.Text` — the resolved persona string used (preset base + dial composition, or the distilled pasted-profile persona) — needed both for REQ-24's display and to fix the `evaluation-runner.ts:70` blind spot described above

All six should be written once, at `session/start`, alongside the existing `typeSlug`/`interviewerAvatarId` fields — the same point in the flow where the resolved `InterviewType` object already exists client-side and is already being sent to that endpoint.

**Two consumers must be updated to read these columns instead of re-deriving from `typeSlug`:**
1. `lib/interview/evaluation-runner.ts` line 70 — change `getInterviewType(report.typeSlug) ?? DEFAULT_INTERVIEW_TYPE` to build `role_context` from the report row's own stored `roleTitle`/`industry`/`difficulty` (falling back to `getInterviewType` only for pre-Phase-8 rows that predate these columns, i.e. `report.roleTitle ?? getInterviewType(report.typeSlug)?.defaultRoleTitle ?? DEFAULT_INTERVIEW_TYPE.defaultRoleTitle`).
2. `lib/interview/report-dto.ts`'s `toInterviewReportDTO` — add the new fields to `InterviewReportDTO` (following the existing "explicit field-by-field mapping, never spread the Prisma row" discipline already documented in that file's comment) so `app/interview/[type]/report/[reportId]/page.tsx` can render them. That page currently shows only `interviewerName` and `completedAt` in its header (`ReportShell` props) — REQ-24 wants industry/role/difficulty/length visible too, most naturally added to that same header area or as a small summary strip above `ReportScoreCards`.

**Backfill note:** no existing rows predate this phase in a way that matters (Phase 6/7 validation used only `general` with no customization), but the columns must be nullable regardless since older `general`-only rows won't have them populated, and the DTO/evaluation-runner fallback chains above already handle that.

## Entry point and wizard integration (REQ-17, REQ-18)

- `lib/interactions/index.ts`'s `interviews` tile currently hardcodes `route: "/interview/general"`. Phase 7's locked decision (module comment, lines 5-9) says this module must never import from `lib/interview` — that constraint is unaffected by Phase 8: the route just needs to change to the new picker page's path (e.g. `/interview` as an index, or a new top-level path like `/practice-interviews` — recommend `/interview` itself as the picker index, since `/interview/[type]` is the existing per-preset wizard route and Next.js App Router supports a static `app/interview/page.tsx` sibling to the dynamic `app/interview/[type]/page.tsx` without conflict).
- The picker page fetches `listInterviewTypes()` (already exported, already returns `InterviewType[]`) to render preset cards — no new data-fetching endpoint needed for the catalog itself, unlike `interviewers` which is fetched via `/api/interview/interviewers` because that catalog lives outside this repo's static registry (HeyGen avatar list). Presets are static in-repo data, so a client component can import `listInterviewTypes` directly the same way `app/interview/[type]/page.tsx` already does `getInterviewType`.
- Card content per REQ-18 (name, one-line description, difficulty, rough length, question areas) is already present or trivially derivable from `InterviewType`: `label`, `description`, `difficulty`, `targetMinutes` are direct fields; "question areas" isn't a field today — recommend either (a) a new optional `questionAreas: string[]` display field added to `InterviewType` per preset (e.g. `["Resume", "Behavioral", "Technical judgment"]` for the technical preset), or (b) deriving a generic fixed list since all presets share the same question STRUCTURE (opening/resume/behavioral/role-specific/closing) and only the role-specific stage's flavor differs — (a) is more honest to what actually differs preset-to-preset and costs one extra field.
- Customization UI (dropdowns + "Customize" disclosure + personality dial + paste box) belongs on this same picker page per CONTEXT.md's explicit decision ("Customization lives on the preset picker page"), pre-filled from the selected preset's defaults, producing the resolved `InterviewType`-shaped object that gets threaded through `router.push` (query params or, more robustly, through client-side navigation state / a short-lived client store) into the existing `app/interview/[type]/page.tsx` wizard, which then passes it to `InterviewSessionShell` in place of the plain `getInterviewType(params.type)` result it uses today.
  - **Concrete mechanism recommendation:** rather than serializing the full customization object into the URL (awkward for a persona string that could be a few hundred characters, and `[type]` is meant to stay a clean slug per the existing `report.typeSlug !== params.type` redirect logic on the report page), pass the resolved customization via `router.push` + a lightweight client-side handoff — e.g. `sessionStorage` keyed by a short-lived token, or (simpler, and avoiding any new storage API) hold it in the picker page's own state and have the wizard route accept it as a prop by making the picker page itself render the wizard conditionally instead of doing a full navigation — but CONTEXT.md is explicit that the picker is "a separate picker page" that the tile routes to, implying an actual route change, so `sessionStorage` (cleared on session start, matching "settings lock when session begins") is the pragmatic choice: write once when the student clicks into a preset from the picker, read once when `app/interview/[type]/page.tsx` mounts, clear immediately after reading so a page refresh mid-wizard falls back cleanly to preset defaults rather than reusing stale state.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Curated dropdown validation | A new generic "form validation library" or schema library | Plain TypeScript functions checking membership in a small const array/enum, matching the existing `getInterviewType`/UUID-regex validation style already used in `session/start/route.ts` and `chat/route.ts` | The codebase has zero validation-library dependency (no zod/yup found in the files read); introducing one for ~4 small enums is disproportionate, and every existing validation in this codebase is hand-written membership/regex checks kept inline at the route |
| Persona distillation | A new prompt-chaining abstraction | One direct call to the same LLM client already used by `createLLMStream`/the evaluator (`lib/interview/evaluation.ts`, `app/api/llm/common`) | The evaluator already demonstrates the exact pattern needed: one-shot, non-streaming, JSON-or-text-constrained LLM call server-side; reuse that client wiring, don't add a new one |
| Cross-request customization handoff | A new server-side session/cache store | `sessionStorage` client-side (see above) plus the resend-every-turn pattern already used for `resumeText` | The codebase has no session cache infra today (Redis, etc.); adding one for a handoff that only needs to survive one client-side navigation is overkill |

**Key insight:** every mechanism this phase needs — validated-enum checking, one-shot LLM pre-processing, resend-per-turn state — already exists in this codebase in a slightly different shape (resume upload, evaluator prompt, resumeText-on-every-chat-turn). The phase's job is applying the same shapes to new fields, not inventing new machinery.

## Common Pitfalls

### Pitfall 1: Treating `resumeText`'s pattern as license to skip server-side enum validation
**What goes wrong:** `resumeText` is genuinely free text by design (it's extracted PDF content) — there's no curated list it could be checked against. Industry/role/difficulty/length are NOT free text (REQ-20 is explicit about this) — reusing "resend every turn" for the *transport* pattern is correct, but validation must be added at the server, distinct from resumeText's total absence of validation.
**Why it happens:** the two problems (transport shape, validation strictness) look similar because both ride in the same request body.
**How to avoid:** the validating resolver (`resolveInterviewType`) must reject/fallback any industry/role/difficulty value not found in the fixed lists, on every call, not just at `session/start`.
**Warning signs:** if `chat/route.ts`'s interview branch ever does `type.defaultIndustry = interviewInput.industry` without a membership check, that's the bug.

### Pitfall 2: Forgetting the chat route has no `reportId`
**What goes wrong:** a planner unfamiliar with the exact request shape might assume "just look up the report row and read its stored customization" is available inside `chat/route.ts`. It is not — that route receives `{ messages, language, interview: { typeSlug, resumeText, progress, startedAt } }` with no `reportId` at all today.
**Why it happens:** `checkpoint`/`finish` DO receive `reportId`, so it's easy to assume chat does too.
**How to avoid:** either (a) keep the resend-and-revalidate pattern (recommended, matches REQ-23's "resolved once... reach both" without adding a DB round-trip to the hottest path in the app), or (b) explicitly add `reportId` to the chat request and do a lookup — a real option, but a bigger, riskier change to an already-shipped, validated hot path; note this explicitly as an open question for the planner rather than assuming it away.
**Warning signs:** any plan that says "fetch the InterviewReport row inside the chat route" without also adding `reportId` to that route's request/response contract has skipped a step.

### Pitfall 3: `caseBackground` reuse temptation for the "role-specific" grounding in new presets
**What goes wrong:** `caseBackground` exists today only as an optional, unused-by-`general` field. It's tempting to write a full "mini case study" for the Consulting preset, edging into Phase 9 (Student-Authored Scenarios) territory.
**Why it happens:** the field is right there, and a richer scenario feels more realistic.
**How to avoid:** keep `caseBackground` for new presets short (one or two sentences of framing, not a multi-paragraph case), consistent with the phase boundary explicitly stated in CONTEXT.md ("Not in this phase: student-authored scenarios (Phase 9)").

### Pitfall 4: Missing that `advanceProgress` is a second, independent copy of the stage logic
**What goes wrong:** `InterviewSessionShell.tsx` has its own client-side `advanceProgress()` that duplicates/approximates the stage-transition logic the system prompt describes to the model — it is NOT reading `interviewType.targetQuestionCount` at all today. A plan that changes only `lib/interview/types.ts` (adding new preset records with different `targetQuestionCount`) without touching `InterviewSessionShell.tsx` will ship a UI progress tracker that's silently wrong for every preset except `general`.
**Warning signs:** grep for the literal `>= 3` thresholds in `advanceProgress` — if a plan doesn't mention that function, length customization is incomplete.

## Open Questions

1. **Should the personality dial and the pasted-profile persona be mutually exclusive in the UI, or does the dial modify the distilled persona too?**
   - What we know: REQ-22 treats them as two parts of one feature ("a simple personality dial, PLUS an optional free-text input"). The pasted-profile persona is supposed to "play the named person directly," which reads awkwardly if also modified by a generic "pressure-testing" clause.
   - What's unclear: whether the user wants the dial to still apply as a stylistic filter on top of a named-person persona, or whether picking a named person should hide/disable the dial.
   - Recommendation: default to disabling the dial once a pasted-profile persona is provided (composePersona uses distilled persona verbatim, ignoring the dial in that branch), and surface this explicitly to the planner as a UX decision to confirm, not something to silently decide in code.

2. **Where exactly does the resolved customization travel from picker to wizard?**
   - What we know: CONTEXT.md is explicit that the picker is a separate page and the wizard enters "at that preset's slug" — implying a real navigation, not a same-page state transition.
   - What's unclear: whether `sessionStorage` (recommended above), a signed short-lived server-side token, or query-string encoding is the intended mechanism — this wasn't specified in CONTEXT.md and is a legitimate implementation decision for the planner.
   - Recommendation: `sessionStorage`, cleared on read, is the simplest option consistent with "settings lock when session begins" and requires no new server endpoint; flag as a plan-level decision rather than research-locking it, since it's genuinely Claude's-discretion-shaped and low-risk either way.

3. **Does the chat route need `reportId` added to its contract for a more robust (DB-backed) version of REQ-23, or is resend-and-revalidate sufficient?**
   - What we know: resend-and-revalidate matches existing precedent (`resumeText`) exactly and requires no changes to the chat route's request shape beyond adding customization fields alongside `typeSlug`.
   - What's unclear: whether a future phase (e.g., staff-side auditing, which is explicitly out of scope per STATE.md's individual-only model) would ever need server-side "this is what this session was really running" independent of client honesty during the LIVE session (not just after, via the report row) — today nothing needs that.
   - Recommendation: ship resend-and-revalidate; the `InterviewReport` row (written once at `session/start`) already gives a tamper-resistant post-hoc record for REQ-24, which is the only place persistence actually matters.

## Sources

### Primary (HIGH confidence — direct repo reads, this session)
- `/Users/ajabreu79/projects/leadership-avatar-project/lib/interview/types.ts` — full read
- `/Users/ajabreu79/projects/leadership-avatar-project/lib/interview/prompts.ts` — full read
- `/Users/ajabreu79/projects/leadership-avatar-project/app/interview/[type]/page.tsx` — full read
- `/Users/ajabreu79/projects/leadership-avatar-project/components/interview/InterviewSessionShell.tsx` — full read
- `/Users/ajabreu79/projects/leadership-avatar-project/lib/interactions/index.ts` — full read
- `/Users/ajabreu79/projects/leadership-avatar-project/app/api/interview/session/start/route.ts` — full read
- `/Users/ajabreu79/projects/leadership-avatar-project/app/api/interaction/chat/route.ts` — full read
- `/Users/ajabreu79/projects/leadership-avatar-project/app/api/interview/session/checkpoint/route.ts` — full read
- `/Users/ajabreu79/projects/leadership-avatar-project/app/api/interview/session/finish/route.ts` — full read
- `/Users/ajabreu79/projects/leadership-avatar-project/lib/interview/report-dto.ts` — full read
- `/Users/ajabreu79/projects/leadership-avatar-project/app/interview/[type]/report/[reportId]/page.tsx` — full read
- `/Users/ajabreu79/projects/leadership-avatar-project/prisma/schema.prisma` (`InterviewReport` model, lines 284-318) — read
- `/Users/ajabreu79/projects/leadership-avatar-project/lib/interview/evaluation-runner.ts` (lines 1-75) — read, confirmed the `getInterviewType(report.typeSlug) ?? DEFAULT_INTERVIEW_TYPE` role_context derivation
- `/Users/ajabreu79/projects/leadership-avatar-project/lib/interview/transcript.ts` (grep) — confirmed `typeSlug` field on `InterviewTranscript`
- `.planning/phases/08-interview-customization/08-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — full reads

### Secondary / Tertiary
None used. This research required no external library or framework investigation — it is entirely a read of this codebase's existing, already-battle-tested patterns (Phases 1-7). No Context7/WebSearch calls were necessary or would have added confidence beyond direct source reading.

## Metadata

**Confidence breakdown:**
- Architecture / data flow: HIGH — every claim traced to a specific file and line read this session, not inferred
- Preset/curated-list content proposals: MEDIUM — these are product judgment calls within the "Claude's Discretion" scope, grounded in existing code shape but not verifiable against an external source of truth
- REQ-24 schema gap and evaluation-runner blind spot: HIGH — directly confirmed by reading `evaluation-runner.ts` line 70 and the `InterviewReport` model's actual columns

**Research date:** 2026-09-21
**Valid until:** Stable — this is internal architecture, not a fast-moving external dependency; valid until the phase is planned and executed (no external expiry).
