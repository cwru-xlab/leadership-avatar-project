# Phase 16: Networking Practice - Research

**Researched:** 2026-10-03
**Domain:** Next.js/TypeScript interaction-type config on top of an (unexecuted) Phase 13 conversation engine; persona distillation; S3-backed owner-scoped instances; Prisma JSON columns.
**Confidence:** HIGH for codebase facts (all verified by direct file read with line numbers). MEDIUM for Phase 13 exact export names, since Phase 13 is unexecuted and its plans can still drift during execution (14-02 already documents this drift risk explicitly and the convention for handling it).

## Summary

Phase 16 is a pure **configuration + prompts** phase on top of Phase 13's engine, following the Phase 14 precedent exactly. Phase 13 (15 plans, ALL UNEXECUTED as of this research — confirmed via `.planning/STATE.md:1567`, "Stopped At: Phase 16 context gathered") declares every primitive Phase 16 needs: `terminationPolicy` (with avatar-initiated end), the per-turn `visibleContext` slice, the type-declared `outcome` record, the four-shared-plus-extras rubric, one evaluator, one session lifecycle, one generic wizard, and one report page. Phase 14 already extended two of those primitives (the avatar-end floor, via `avatarEndFloor` in `TerminationPolicyConfig`) in its own plan 14-02 rather than editing Phase 13 — Phase 16 explicitly reuses that same floor per CONTEXT.md decision 13, so if Phase 14 lands first, Phase 16 needs ZERO new engine extension for termination; it only needs the floor value Phase 14 already wired to be used by the `networking` type's `terminationPolicy.avatarEndFloor` field, with `avatarMayEnd: true` and a declared `avatarEndReasons` list.

The one Phase 16 need that is NOT already satisfied anywhere in Phase 13 or 14 is the **never-publishable instance kind** — Phase 13's `InstanceConfig` discriminated union has no "cannot be published" marker at all (publish is a Phase 9 `CaseStudy.published` boolean convention, not an engine primitive), so Phase 16 must either (a) declare its own S3-backed instance shape with no `published` field and no route that could ever flip one, or (b) ask Phase 13/14's revision to add an engine-level "publishable: boolean" declaration. Given the instance is S3 JSON exactly like `CaseStudy` (not a Prisma model), the simplest and most consistent choice is (a): give the `networking-persona` instance kind no `published` field and ship no `/api/networking/*publish*` route — the absence IS the enforcement, matching CONTEXT.md decision 7's "publish affordance absent, not merely off."

The seven-dimension rubric, the hidden-goal visible-context slice, and the outcome record are all directly expressible with Phase 13's declared shapes with no extension needed — Phase 16 is, like Phase 14, almost entirely config-plus-prompts. The one genuinely new piece of infrastructure Phase 16 needs that Phase 13/14 do NOT provide is the **attestation record** (user + timestamp + wording version), which has no Phase 10 precedent to literally reuse — Phase 10's "camera consent" is a single nullable `DateTime` column on `User` with NO wording-version field at all. Phase 16 must add a new, versioned attestation record (new Prisma column(s) or small table), which requires a migration under the existing human-run-local-only discipline.

**Primary recommendation:** Treat Phase 16 exactly like Phase 14 structurally — gate every plan except the ones that touch zero engine code behind "Phase 13's 15 plans executed and signed off," name `requirements: [P16-SC1..P16-SC4]` in frontmatter (no REQ IDs exist for this phase, matching the roadmap), and front-load a Phase-13-extension-declaring plan (an `16-0X` analog to `14-02`) for the one real engine gap: the never-publishable instance declaration. Everything else (the character records, the generation route, the attestation gate, the wizard steps, the report rendering) is config/new-route work that depends on Phase 13's wizard/session/report primitives existing, so it is blocked exactly like most of Phase 14 was.

## User Constraints (from CONTEXT.md)

### Locked Decisions
1. Three persona input sources (LinkedIn paste, own writing, AI-generated) all converge on Phase 8's EXISTING `/api/interview/persona/distill` route. No second distillation path.
2. AI generation is generate → show in an EDITABLE box → student edits → distill. The generation step is a NEW, separate model call producing description text (not a persona sentence).
3. No networking SETTING in this phase (deferred).
4. Student's own side is ONE short typed goal, REQUIRED to start. No resume upload on this type.
5. The goal is HIDDEN from the avatar — evaluator-only, withheld via Phase 13's per-turn visible-context slice.
6. Raw paste stays EPHEMERAL — `app/api/interview/persona/distill/route.ts` never-persisted contract preserved unchanged. Roadmap criterion 3's "stored privately" is read as being about the DISTILLED persona.
7. The distilled persona (+displayName) is saved as a Phase 13 private INSTANCE record, owner-scoped, NEVER publishable (publish affordance absent, not merely off).
8. An explicit attestation checkbox gates the paste; the attestation is RECORDED following the Phase 10 camera-consent pattern (user, timestamp, wording version) and ENFORCED server-side before distillation runs. Applies to the brought-in-person path only, not built-in characters.
9. Default characters are NAMED FICTIONAL PEOPLE with backstories; four to six of them, varied by SENIORITY AND FIELD (not difficulty); declared as TypeScript CODE RECORDS in the Phase 13 config layer (no seed script, no migration).
10. The student picks the avatar/voice via the existing Phase 2 interview card-grid picker. No avatar id pinned in character records.
11. SEVEN rubric dimensions: Phase 13's shared four (Visual, Vocal, Content, Behavioral) plus three type-declared extras — Rapport, Self-Introduction, Goal Progress.
12. A type-declared OUTCOME RECORD is persisted via Phase 13's outcome primitive: whether the ask was made and how it landed (agreed/deflected/declined/never asked), plus the common ground found.
13. The avatar MAY end the session early via Phase 13's `terminationPolicy` with a recorded reason, using the same avatar-end floor knob Phase 14's `pitch-elevator` declares (14-02).

### Claude's Discretion
- Prompt wording for all of: the `networking` TYPE's live avatar prompt, the evaluator prompt's three extra dimensions, and the new person-generation prompt.
- The specific four-to-six characters — their names, employers, fields and manner — subject to the seniority-and-field spread above.
- Wizard step ORDER and how the character-vs-bring-your-own branch is presented (two cards, a toggle, a tabbed step).
- Hint-field shape for AI generation (one free-text box vs. a few structured fields) and the generated description's length.
- Where the networking type's modules live, and whether the generation call is its own route or an option on an existing one — provided the distillation itself stays the Phase 8 route.
- Exact attestation wording, and where the recorded attestation lives relative to the Phase 10 consent record (same table/shape vs. a sibling).
- How the outcome record renders on the report page.
- Session length / time budget default for the type.

### Deferred Ideas (OUT OF SCOPE)
- Networking SETTING as a wizard step (conference reception, alumni mixer, etc.) — write the TYPE record and prompt assembly so a setting clause COULD be composed in later, but do not build it.
- Difficulty as a character axis — characters vary by seniority/field only; a difficulty ladder is a possible later, additive expansion.
- Publishing a brought-in persona to other students — ruled out permanently for real-person personas.

## Phase Requirements

Phase 16 has **no REQ IDs** (confirmed: `.planning/ROADMAP.md`'s Phase 16 section carries no REQ list, matching Phase 14's precedent at `.planning/ROADMAP.md:370-375`). Each plan must instead name the Success Criteria it serves as `P16-SC1`..`P16-SC4` in its `requirements` frontmatter array — confirmed as the live convention by grepping every `14-*-PLAN.md`'s `requirements:` line (e.g. `14-02-PLAN.md:24: requirements: [P14-SC1, P14-SC5]`, `14-15-PLAN.md:14: requirements: [P14-SC1, P14-SC2, P14-SC3, P14-SC4, P14-SC5]`).

| ID | Roadmap text | Research support |
|----|-------------|-----------------|
| P16-SC1 | "A student can paste a description of a real person and practice against a persona distilled from it, through the existing distillation path." | The distill route contract at `app/api/interview/persona/distill/route.ts` (full text read below); the attestation gate must wrap this route's caller, not the route itself, per decision 8. |
| P16-SC2 | "A curated set of default characters is playable with no input at all [beyond the required goal and avatar pick]." | `lib/engine/registry.ts` (Phase 13, not yet created) is where 4-6 named-fictional-person code records live, following the `case-study` record's shape as the nearest precedent (`13-01-PLAN.md` Task 2). |
| P16-SC3 | "Pasted third-party text is stored privately and never appears in another student's session." | Satisfied by (a) the distill route's existing never-persisted contract (verified unchanged, `app/api/interview/persona/distill/route.ts:62-70`) and (b) the distilled persona's instance being owner-scoped S3 data, following `CaseStudy`'s `ownerId` precedent (`lib/scenario/validation.ts:252`), with no publish route. |
| P16-SC4 | "The report judges rapport-building and the clarity of the student's self-introduction, not interview-style answer quality." | The three extra rubric dimensions (Rapport, Self-Introduction, Goal Progress) riding Phase 13's `extraRubricDimensions` array (`13-01-PLAN.md` Task 1) and the type-declared `evaluatorPrompt`. |

## Need → Primitive Mapping (the core table)

| Phase 16 need | Already-declared Phase 13/14 primitive | New extension needed? |
|---|---|---|
| Config as TypeScript code records | `InteractionTypeConfig` in `lib/engine/types.ts`, registry pattern in `lib/engine/registry.ts` (13-01) | NO — add one `networking` record + 4-6 character records, same file. |
| 3 persona sources → 1 distiller | Existing `app/api/interview/persona/distill/route.ts` (already built, Phase 8) | NO engine change. Networking's wizard calls this route directly; the engine's `InstanceConfig` just needs a member to carry the result (see below). |
| AI-generated description (generate→edit→distill) | Nothing in Phase 13/14 provides a "generate description" primitive — it is genuinely new, one-off model-call infra like Phase 8's distiller itself. | NEW route, but NOT an engine extension — it's a sibling API route (e.g. `app/api/networking/persona/generate/route.ts`) with its own prompt, independent of Phase 13's engine. |
| Required, hidden-from-avatar goal | `VisibleContextConfig` / `applyVisibleContext` (13-03) — general per-turn slice; the goal is simply a channel the type declares NOT admitted to the avatar, admitted only to `buildEvaluationContext`. | NO — this is exactly what the primitive is for (CONTEXT.md decision 5 flags this as the primitive's "second concrete use" after Phase 14's slide cursor; if it turns out NOT general enough, that is itself a signal to raise per 13-CONTEXT's own success test). |
| Owner-scoped, reusable distilled-persona instance | `InstanceConfig` discriminated union (13-01) — the `case-study` member is the shape precedent; S3-backed via `CaseStudy`'s `ownerId` pattern (`lib/scenario/validation.ts`). | NEW MEMBER needed: add a `{ kind: "networking-persona"; personaId; displayName; persona; ownerId }` member to `InstanceConfig` — additive, same shape of change 14-02 made for `pitch-elevator`/`pitch-deck`. This is Phase 16's own `phase_13_extensions_declared` entry, exactly like 14-02's. |
| NEVER-publishable instance | **NOTHING in Phase 13 declares "publishable" at all** — publish is purely a Phase 9 `CaseStudy.published` boolean + its own `/api/scenario/publish` route, which Phase 13's `InstanceConfig` doesn't model as a primitive. | NOT an engine gap in the sense CONTEXT.md worries about — simplest fix is absence: give the new `networking-persona` instance shape NO `published` field and ship NO publish route for it. No Phase 13 extension required; just don't build the affordance. Flag this explicitly in the plan so a reviewer doesn't later "helpfully" add parity with `CaseStudy`. |
| Attestation (user, timestamp, wording version) gating the paste | Phase 10's "camera consent" is `User.videoAnalysisConsentAt: DateTime?` — **a single nullable column, enforced via `app/api/metrics/consent/route.ts`, with NO wording-version field whatsoever.** (Verified: `prisma/schema.prisma:63`; `app/api/metrics/consent/route.ts` full text has no version concept.) | NEW. The literal Phase 10 pattern does not carry a wording version, so CONTEXT.md's "following the Phase 10 pattern" means "persist account-level, timestamped, enforced server-side" — the wording-version field is a genuinely new requirement beyond Phase 10's actual shape. Needs a new nullable column set or a tiny table, via a human-run LOCAL-only additive migration (HANDOFF.md §3 path, same discipline 13-02 and 14-05 already follow). |
| Avatar-initiated early end with recorded reason, floor-gated | `TerminationPolicyConfig.avatarMayEnd` + `avatarEndReasons` (13-01/13-03) PLUS `avatarEndFloor` (14-02's extension) | NO extension IF Phase 14 has landed first and the floor field exists. If Phase 16 executes before Phase 14's 14-02 plan, Phase 16 must itself add `avatarEndFloor` to `TerminationPolicyConfig` (duplicate 14-02's Task 1 edit) — coordinate so only one phase adds the field. Recommend Phase 16 explicitly depends on 14-02 having landed (see Gate section) rather than re-deriving the floor. |
| 7-dimension rubric (4 shared + Rapport/Self-Intro/Goal Progress) | `extraRubricDimensions: RubricDimension[]` (13-01); type-derived JSON schema via `buildRubricJsonSchema` (13-05); dimension-driven report rendering (13-12) | NO — exactly the designed extension point. Zero engine change; just 3 entries in the array + prompt text for the evaluator's extra dimensions. |
| Outcome record (ask made? how landed; common ground) | `OutcomeRecordConfig` + `validateOutcome` (13-03); `InteractionReport.outcome: Json?` column (13-02) | NO — declare the field shape (`askMade: boolean`, `askOutcome: "agreed"|"deflected"|"declined"|"never-asked"`, `commonGround: string | null`) in the type's `OutcomeRecordConfig`. Rendering it on the report page is new UI (13-12's `app/practice/[type]/report/[reportId]/page.tsx` is dimension-driven but outcome rendering is explicitly left to Phase 14+ per 13-12 non-negotiables — "Phase 13 only RECORDS it... Do not design report copy for it"). Phase 16 must add its OWN outcome-rendering panel, following whatever precedent 14's negotiation-triple panel sets (14-15 mentions "a negotiation triple... report panel"). |
| Avatar/voice pick via existing Phase 2 picker | `InterviewerStep.tsx` (13-09) ports the existing `/api/interview/interviewers` fetch into a wizard step component | NO — reuse `InterviewerStep.tsx` verbatim as the networking type's declared avatar-pick step. |
| Wizard steps (character-vs-bring-your-own, goal, avatar pick, attestation) | `SetupWizard.tsx` generic step machine + `setupSteps: SetupStepDeclaration[]` declaration on the type (13-01, 13-09) | NO engine change — networking declares its own step list and supplies custom step components (character picker, goal field, attestation checkbox) exactly as the deck-upload step is custom for pitch-deck. |
| Hardcoded `required: ["visual","vocal","content","behavioral"]` | Addressed BY Phase 13 itself: `lib/report/structured.ts:109`'s literal is superseded by `buildRubricJsonSchema` (13-05 Task 1), which merges `STRUCTURED_REPORT_REQUIRED` with the type-derived list. Phase 13's plan 13-05 explicitly tests this against a synthetic type with two extra dimensions (`13-05-PLAN.md` Task 3, assertion 3). | NO Phase 16 action needed — this is fully handled by Phase 13 already; Phase 16 is simply the third type (after the two pitch types) to prove it generalizes past four dimensions. |

## Exact Existing-Code Touch Points

- **`app/api/interview/persona/distill/route.ts`** (full file read) — contract to preserve exactly:
  - `MAX_PERSONA_LENGTH = 600`, `MAX_PROFILE_TEXT_LENGTH = 4000`, `MAX_DISPLAY_NAME_LENGTH = 60` (lines 11-14).
  - Retention comment at lines ~62-70: "used for exactly one non-streaming model call and is never written to Prisma, S3, or any cache, and never logged — only lengths are logged." This is a locked contract per CONTEXT.md decision 6; Phase 16 must NOT touch this file.
  - It is called with `{ profileText: string }` and returns `{ persona, displayName }`. The attestation gate (decision 8) must sit in FRONT of this route — either as a new wrapper route networking calls, or as a server-side check the networking persona-setup route performs before forwarding to this exact route. Recommend a thin new route (e.g. `app/api/networking/persona/distill/route.ts` or reusing the same route with an additional required field) — but CONTEXT.md decision 1 says "no second distillation path," so the cleanest shape is: **the existing route stays untouched and generic; a new networking-specific route enforces the attestation and then calls the SAME distill logic** (import `distillPersona`-equivalent, or just call the existing route server-to-server). Since `distillPersona` is a private (non-exported) function inside the route file, Phase 16 either (a) exports it for reuse, which IS an edit to `distill/route.ts` (small, additive — export one function, change nothing else), or (b) has the client itself attest first then call the existing public route directly, enforcing the attestation server-side via a SEPARATE check endpoint that must return OK before the client is allowed to call distill. Recommend (a): export `distillPersona` (and the length constants) from the route module or extract them into a small shared `lib/interview/persona-distill.ts`, then have BOTH the existing interview route and a new networking route import it, with the networking route enforcing attestation first. This is the smallest surface change that still satisfies "no second distillation path" (same model call, same prompt, same limits) while letting Phase 16 gate it.
- **`lib/interview/customization.ts`** (full file read, 123 lines) — `composePersona` (lines ~52-69) already demonstrates the exact mechanic Phase 16 reuses conceptually: "if a distilled persona was pasted in, it REPLACES the preset persona entirely." Phase 16's engine-type prompt-builder should follow the identical rule — a networking character's or distilled persona's text is the WHOLE persona, no personality-dial composition. `MAX_PERSONA_LENGTH = 600` is exported from this file and duplicated (deliberately, per its own comment) in the distill route; Phase 16 should reuse the SAME exported constant rather than inventing a third copy.
- **Phase 10 "camera consent" pattern** — located at `prisma/schema.prisma:63` (`User.videoAnalysisConsentAt DateTime?`) and enforced in `app/api/metrics/consent/route.ts` (full file read). Key facts for the planner:
  - It is idempotent-on-write (`POST` returns the ORIGINAL timestamp on repeat calls, never refreshes it) — comment at lines ~19-27 explicitly says "the audit trail depends on it never moving."
  - It is a single DateTime column, NOT a table, NOT versioned.
  - **CONTEXT.md's "wording version" requirement is NOT present in the Phase 10 precedent at all.** This means Phase 16 needs a NEW schema element: either `User.networkingAttestationAt: DateTime?` + `User.networkingAttestationWordingVersion: String?` (two nullable columns, additive, same migration discipline), or — better, since the attestation is logically PER-PASTE, not per-account like camera consent (a student can distill multiple different third-party pastes over time and decision 8 says "enforced server-side before distillation runs" each time, not just once-ever) — a small attestation record tied to the resulting instance/persona rather than the account. Re-reading decision 8: "Rejected: ... a once-per-student acknowledgement that later sessions skip." This directly RULES OUT literally copying the User-level once-ever Phase 10 pattern. **Recommendation: store the attestation on the persisted networking-persona INSTANCE itself** (since that instance is the thing created per-paste) — e.g. fields `attestedAt: DateTime`, `attestedWordingVersion: string` on the instance record (S3 JSON, no migration needed at all if the instance lives in S3 like `CaseStudy`) rather than a new Prisma column. This sidesteps the migration question entirely and is enforced server-side by the distill-wrapper route requiring these fields be present and freshly-submitted before calling the distiller.
- **`lib/interactions/index.ts:61-73`** (full file read) — the `networking` registry record:
  ```ts
  {
    slug: "networking",
    name: "Networking Practice",
    description: "Rehearse introducing yourself and building rapport with a stranger in a professional setting.",
    icon: "Users",
    estimatedMinutes: 15,
    route: null,
    availability: "coming-soon",
  }
  ```
  To ship, flip `route` to the real path (e.g. `/practice/networking` per Phase 13's `/practice/[type]` convention) and `availability` to `"live"`. This file is explicitly NOT the engine config (13-01 non-negotiables: "a DIFFERENT namespace with its own slugs... Do not touch it [[in 13-01]]... A later plan (13-13) owns that file" — so whichever Phase 13 plan ends up flipping dashboard tiles, Phase 16 needs its OWN plan to flip this specific one, analogous to how 13-13 flips existing tiles and a Phase 14 plan presumably flips `pitches`).
- **`app/api/interview/interviewers/route.ts`** (full file read) — `GET` returns `InterviewerOption[]` (`avatarId`, `name`, `previewUrl`, `voice`), filtered to the LiveAvatar catalog, cached 10 min server-side. CONTEXT.md decision 10 says reuse this exact route/picker for networking's avatar/voice pick — no changes needed here; Phase 16's wizard step component imports the same fetch.
- **`lib/report/structured.ts:95-127`** (read directly) — confirms the `category_notes` object hardcodes `required: ["visual","vocal","content","behavioral"]` and `rubric_notes`/`practice_next` are generic. Per 13-05's plan, this gets addressed BY Phase 13 (additive export of the rubric-dimension-property builder) before Phase 16 ever touches it — Phase 16 should NOT need to edit this file at all; it only supplies three extra `RubricDimension` entries through the type config.
- **`lib/scenario/validation.ts`** (read lines 1-50, and line 252) — `loadOwnedScenario` / ownership check pattern: `if (!scenario || !scenario.ownerId || scenario.ownerId !== userId) { ... }` (line 252). This is the exact ownership-check idiom Phase 16's networking-persona instance loader should copy for "never appears in another student's session" (P16-SC3).
- **`app/api/scenario/publish/route.ts`** (read in full) — shows the shape of a publish toggle Phase 16 must NOT build an analog of. Its own comment underlines that `published` "gates DISCOVERY only and is not access control" — reinforcing that for networking, the right move is to omit the field/route entirely rather than add a permanently-false flag (which would invite a future "oops I flipped it" bug; true absence is safer, matching CONTEXT.md's explicit instruction).

## Phase 13 Primitives Phase 16 Configures (exact shapes, from unexecuted 13-01/13-02/13-03/13-05/13-07/13-09/13-12 plans)

- `lib/engine/types.ts` (13-01): `InteractionTypeConfig { slug, name, description, extraRubricDimensions: RubricDimension[], prompts: {liveSystemPrompt, evaluatorPrompt, buildEvaluationContext}, limits: {targetMinutes, targetQuestionCount}, terminationPolicy, visibleContext, outcome, timeBudget, instance: {required: boolean}, setupSteps }`. Networking: `extraRubricDimensions` = Rapport/Self-Introduction/Goal Progress; `instance.required` = **false** per CONTEXT.md ("playable with no input at all" for built-in characters) — but a student's OWN distilled persona needs an instance. This means networking's `instance.required` should be `false` (default characters need none) while still supporting an OPTIONAL instance for the brought-in-person path — confirm 13-01's `InstanceConfig` supports an optional instance on an `instance.required: false` type (the interview presets already do this with `instanceId?` in the wizard per 13-09's `onLaunch` posting `{typeSlug, instanceId?, customization?}` — Task 1 of 13-09). So networking is structurally like the interview presets (instance optional), not like `case-study` (instance required).
- `TerminationPolicyConfig { studentMayEnd, avatarMayEnd, avatarEndReasons: string[], avatarEndFloor?: {minAssistantTurns: number} | null }` (13-01 + 14-02 extension). Networking: `avatarMayEnd: true`, declare `avatarEndReasons` (e.g. `["disengaged", "ran-out-of-time", "conversation-derailed"]` — discretion), and reuse the SAME `avatarEndFloor` shape/value Phase 14's `pitch-elevator` declares per CONTEXT.md decision 13 (do not invent a second floor mechanism).
- `VisibleContextConfig` / `applyVisibleContext(config, sessionState, turn)` (13-03): admits/excludes named "channels" of session state per turn. Networking declares the goal field as a channel NOT admitted to the avatar's visible slice but admitted to `buildEvaluationContext` (the evaluator sees everything). Zero deck/slide vocabulary required — this is a plain channel exclusion, the simplest possible use of the primitive (simpler than Phase 14's slide cursor).
- `OutcomeRecordConfig` / `validateOutcome(config, produced)` (13-03): declare fields `askMade: boolean`, `askOutcome: "agreed"|"deflected"|"declined"|"never-asked"`, `commonGround: string|null`. Written to `InteractionReport.outcome: Json?` (13-02 schema, already additive/nullable).
- `TimeBudgetConfig { totalSeconds, warnAtRemainingSeconds }` (13-01/13-03) — Phase 16's discretion item "session length default." Recommend ~12-15 minutes (`estimatedMinutes: 15` already declared in `lib/interactions/index.ts:66`), matching the dashboard tile's existing promise. No adjustable range needed (that's a pitch-deck-specific extension, 14-02) unless CONTEXT.md later wants it — not required by any Phase 16 decision.
- `ResolvedSessionConfig` (13-01) — carries the full rubric list (4 shared + 3 extras in order), resolved instance, and `customization` passthrough. Networking's "customization" is effectively just the character selection + avatar/voice pick + goal text + (if bring-your-own) the distilled persona/displayName — same pattern as interview's `distilledPersona`/`personaDisplayName` fields in `InterviewCustomizationInput` (`lib/interview/customization.ts` lines ~30-42).
- `buildRubricJsonSchema(config)` (13-05) — networking gets `rapport_score`, `self_introduction_score`, `goal_progress_score` properties for free by declaring the three `RubricDimension` entries; `required[]` auto-includes them.
- `SetupWizard.tsx` + `setupSteps: SetupStepDeclaration[]` (13-01/13-09) — networking declares steps: character-or-bring-your-own (custom component), goal field (custom, simple), avatar/voice pick (reuse `InterviewerStep.tsx`), attestation (custom, only shown on the bring-your-own branch), camera consent (reused automatically — `CameraConsentStep.tsx` is wizard-owned, "placed immediately before launch for every type" per 13-09 Task 1).
- Report page (13-12) — dimension-driven rendering is automatic once the type declares its 7 dimensions; the ONLY new UI work is an outcome-record panel (not provided by 13-12, which explicitly defers outcome-record rendering design to the type's own phase, same as it defers `terminationReason` rendering).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| A second persona distillation call/prompt | A new "networking persona distiller" | The existing `app/api/interview/persona/distill/route.ts` logic (export/share `distillPersona` + the three length constants) | CONTEXT.md decision 1 is explicit and locked; a second distiller duplicates a tuned prompt and halves the audit surface for the ephemeral-paste contract. |
| A new avatar/voice catalog or picker | A networking-specific avatar grid | `InterviewerStep.tsx` (13-09) / `/api/interview/interviewers` | Decision 10 locks this; also avoids the "pinned avatar went INACTIVE" failure class Phase 2's catalog filtering exists to prevent. |
| A new camera-consent dialog | A networking-specific metrics-consent gate | `CameraConsentStep.tsx` (13-09) — wizard-owned, automatically placed before launch for every type | 13-09 exists specifically to stop a third hand-copy of `CAMERA_BLOCK_COPY`; networking must not become the third. |
| A publish toggle defaulted off | `published: false` field + unused publish route on the networking-persona instance | Nothing — omit the field and the route entirely | CONTEXT.md decision 7: "publish affordance absent, not merely off." A defaulted-off flag is a latent bug; an absent field/route cannot be flipped by any future code path. |
| A once-per-account attestation flag | Literal copy of `User.videoAnalysisConsentAt`'s single-column, write-once-ever pattern | A per-instance (or per-distillation-event) attestation record carrying `attestedAt` + `attestedWordingVersion`, since CONTEXT.md rejects "a once-per-student acknowledgement that later sessions skip" | Decision 8 explicitly rejects the once-ever shape; the Phase 10 precedent literally IS that shape, so copying it verbatim would violate the decision that claims to follow it. |

## Common Pitfalls

### Pitfall 1: Treating "follows the Phase 10 camera-consent pattern" as "reuse the same column"
**What goes wrong:** A planner reads decision 8, finds `User.videoAnalysisConsentAt`, and adds a sibling `User.networkingAttestationAt` column — a once-per-account flag.
**Why it happens:** The decision text says "following the Phase 10 pattern," which sounds like direct reuse.
**How to avoid:** Decision 8 ALSO explicitly rejects "a once-per-student acknowledgement that later sessions skip" — read the full decision, not just the pattern-reference clause. The wording-version requirement is the tell: Phase 10 has no wording version, so "following the pattern" means matching its STRUCTURE (user + timestamp + enforced server-side), not its account-level cardinality.
**Warning signs:** If the plan adds exactly one new nullable column to `User`, re-check against decision 8's rejected alternatives.

### Pitfall 2: Building the AI-generation step as part of the Phase 8 distill route
**What goes wrong:** Extending `app/api/interview/persona/distill/route.ts` to accept a "generate mode" flag, conflating two different model calls (generate-description vs. distill-to-persona-sentence) in one route.
**Why it happens:** Both calls feel adjacent and the route is right there.
**How to avoid:** CONTEXT.md decision 2 is explicit: generation produces DESCRIPTION TEXT, not a persona sentence, and is "a new, separate model call" from the distiller. Keep it a separate route/function with its own prompt; the distiller's system prompt (`PERSONA_DISTILL_SYSTEM_PROMPT` in the route file) is tuned specifically to continue the phrase "You are playing the role of:" — a generation prompt has a completely different job (produce free narrative text a student edits) and must not share that prompt.

### Pitfall 3: Giving networking's instance a `published` field "for consistency" with CaseStudy
**What goes wrong:** Copy-pasting the `CaseStudy` shape (which has `ownerId` + `published`) for the networking-persona instance without noticing `published` should never exist here.
**Why it happens:** `CaseStudy` is the closest existing precedent for "owner-scoped S3 instance," and it's natural to mirror its full shape.
**How to avoid:** Re-read CONTEXT.md decision 7 before modeling the instance type: "Never publishable... The publish affordance must be absent, not merely off." Model the type WITHOUT the field from the start.

### Pitfall 4: Building Phase 16 plans before confirming Phase 13/14 have actually landed
**What goes wrong:** Writing plans against assumed export names (`resolveSessionConfig`, `applyVisibleContext`, etc.) that drift during Phase 13's real execution, the same risk 14-02 flagged explicitly ("If a Phase 13 contract shifted during execution, reconcile here").
**Why it happens:** Phase 13 is fully unexecuted (confirmed via STATE.md) — every name in this research is a PLAN, not a built artifact.
**How to avoid:** Follow the exact Phase 14 convention: Phase 16's engine-touching plans must declare `blocked_by_phase: 13-one-on-one-conversation-engine` and `depends_on` on Phase 13 AND Phase 14's 14-02 (for the avatar-end floor), and must read the REAL `13-0X-SUMMARY.md` / `14-02-SUMMARY.md` files at execution time, reconciling any drifted name per `14-02-PLAN.md`'s own `<blocking_dependency>` block.

## Code Examples

### The existing distill route's contract (verbatim, to preserve)
```typescript
// Source: app/api/interview/persona/distill/route.ts:62-70
/**
 * RETENTION: the pasted text is a third party's personal information. It is
 * used for exactly one non-streaming model call and is never written to
 * Prisma, S3, or any cache, and never logged — only lengths are logged.
 *
 * This route accepts pasted TEXT only. It must never fetch a student-supplied
 * URL (LinkedIn or otherwise) — see 08-CONTEXT.md's Deferred Ideas.
 */
```

### The composePersona "replace entirely" rule Phase 16 should mirror
```typescript
// Source: lib/interview/customization.ts:52-69
export function composePersona(
  base: InterviewType,
  input: InterviewCustomizationInput
): string {
  if (input.distilledPersona && input.distilledPersona.trim()) {
    return input.distilledPersona.trim().slice(0, MAX_PERSONA_LENGTH);
  }
  // ...personality dial composition for presets only
}
```

### The ownership-check idiom to copy for "never appears in another student's session"
```typescript
// Source: lib/scenario/validation.ts:252
if (!scenario || !scenario.ownerId || scenario.ownerId !== userId) {
  // treated as not found / not owned
}
```

### The Phase 14 pattern for declaring a Phase 13 extension (to copy structurally for the never-publishable gap)
```yaml
# Source: 14-02-PLAN.md frontmatter, lines 7-16
blocked_by_phase: 13-one-on-one-conversation-engine
phase_13_seams_consumed:
  - "13-01 lib/engine/types.ts — InteractionTypeConfig, TerminationPolicyConfig, ..."
phase_13_extensions_declared:
  - "Against 13-01: TerminationPolicyConfig gains avatarEndFloor; ..."
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Per-type route trees (`/interview/*`, `/case-play/*`) | One `/practice/[type]` engine tree | Phase 13 (planned, unexecuted) | Phase 16 ships at `/practice/networking`, not a new top-level route. |
| Camera consent as a one-time account flag | (New for Phase 16) per-event attestation with a wording version | This phase | First consent-like primitive in the codebase that is NOT "once ever" — worth flagging to whoever eventually generalizes consent patterns. |
| Fixed four rubric dimensions | Type-declared extras via `extraRubricDimensions` | Phase 13 (planned) | Networking is the third type (after two pitch types) to exercise this, proving it scales past "4+1" to "4+3". |

**Deprecated/outdated:** None — Phase 13/14 are themselves unbuilt, so there is no legacy networking code to deprecate; `lib/interactions/index.ts`'s `networking` tile is the only existing artifact and it is a placeholder by design.

## Open Questions

1. **Does the networking-persona instance live in S3 (like `CaseStudy`) or does Phase 13's `InstanceConfig` end up backed differently for non-`case-study` members?**
   - What we know: 13-01's `InstanceConfig` is a discriminated union; `case-study` is S3-backed. Phase 14's `pitch-deck` instance (`deckId`, `slideTexts`, etc., per 14-02) is ALSO effectively S3/manifest-backed per `lib/deck/store.ts` (14-06) — "no database table" per that plan's must_haves.
   - What's unclear: whether Phase 13 lands a generic "S3-backed instance" helper Phase 16 can reuse directly, or whether each type re-implements its own S3 read/write (as `case-study` and `pitch-deck` currently each do independently).
   - Recommendation: the planner should read whichever `13-0X-SUMMARY.md` exists at plan time for a shared instance-storage helper; if none exists, follow `lib/scenario/validation.ts` / `s3Storage.getCase`/`saveCase` as the literal pattern to copy for a new `s3Storage.getNetworkingPersona`/`saveNetworkingPersona` pair, scoped by `ownerId` exactly like scenarios.

2. **Exact migration shape for the attestation record.**
   - What we know: it must NOT be a once-per-account column (Pitfall 1); it should likely live with the persisted instance rather than as a new `User`/`InteractionReport` column, in which case NO Prisma migration is needed at all (S3 JSON instance, like `CaseStudy`).
   - What's unclear: whether the product wants the attestation queryable/auditable via Postgres (e.g. for compliance review) rather than buried in S3 JSON a human can't easily query.
   - Recommendation: default to the S3-instance-field approach (zero migration, matches decision 6's "no second storage surface" spirit) unless the planner's discretion call (where CONTEXT.md explicitly leaves "where the recorded attestation lives" open) decides auditability matters enough to warrant a small new Prisma table — in which case follow the exact human-run-local-only migration path (`HANDOFF.md §3`), never touching the shared Lightsail DB.

3. **Whether Phase 16 should literally wait for Phase 14's 14-02 to land, or re-declare `avatarEndFloor` independently.**
   - What we know: CONTEXT.md decision 13 says "use the SAME engine knob" Phase 14 declares in 14-02 — implying ordering dependency, not independent redeclaration.
   - What's unclear: the actual phase execution order the user intends (roadmap lists 14 before 16, but both "depend only on Phase 13, not on each other" per `STATE.md:1633` — meaning they CAN run in parallel, which could create a race on who adds `avatarEndFloor` to `lib/engine/types.ts` first).
   - Recommendation: Phase 16's plan touching `TerminationPolicyConfig` should check at execution time whether `avatarEndFloor` already exists (from 14-02) and, if not, add it itself with IDENTICAL shape — documenting in its SUMMARY that this is a duplicate-avoidance check, exactly as 14-02 told future plans to reconcile by reading `13-01-SUMMARY.md`.

## Which Plans Can Run Before Phase 13 Lands

**None**, unlike Phase 14 (which had 14-01/14-03/14-06/14-07 — a self-contained deck-processing pipeline with zero engine dependency). Phase 16 has no equivalent isolated subsystem:
- The AI-generation route (decision 2) is the closest candidate — it's a standalone model-call route with its own prompt, similar in spirit to 14-01's deck-render spike. It touches NO engine file and could plausibly be built and tested independently (its only external dependency is an OpenAI call and feeding output into the EXISTING, already-built distill route for a manual end-to-end test). **Recommend this be Phase 16's one "safe to run before Phase 13" plan**, mirroring 14-01's role — build `app/api/networking/persona/generate/route.ts` (or wherever discretion places it) and prove generate→edit→distill works manually against the Phase 8 route, which already exists today.
- Everything else — the `networking` TYPE record, the character records, the wizard steps, the attestation gate's server-side enforcement point, the outcome-record panel, the dashboard-tile flip — depends on `lib/engine/{types,registry,resolve}.ts` (13-01), the wizard (13-09), the session lifecycle (13-07), and the report page (13-12), none of which exist yet.

## Recommendations on Claude's-Discretion Items

- **Prompt wording (live avatar prompt, evaluator extras, generation prompt):** Model the live prompt on the EXISTING distill route's register (plain prose, named-person directive, no markdown) and on `lib/interview/prompts.ts`'s general system-prompt assembly style (not read in full here, but referenced throughout 13-01/13-03 as the pattern to extend). For the evaluator's three extras, write short, concrete rubric descriptions in the same shape as `category_notes`' fields (`lib/report/structured.ts:107-115`) — one sentence per dimension stating what a 1 vs 5 looks like, mirroring whatever style the (not-yet-written) Phase 13 interview rubric descriptions use.
- **The four-to-six characters:** Pick names/employers/fields/manner now, since this is pure content with no technical dependency — e.g. a VC partner, a technical recruiter, a peer-level engineer at a fintech, a VP at a consumer brand, matching CONTEXT.md's seniority-and-field spread. Write them as plain TypeScript records; defer exact prose to the planner/executor since it is pure copywriting, not an architectural decision.
- **Wizard step order and branch presentation:** Recommend a single first step — two large cards, "Pick a person to practice with" (built-in characters, shown as a grid) vs. "Bring in someone real" (reveals the paste/write/generate sub-choice + attestation) — rather than a toggle, because it mirrors the existing Phase 2 card-grid idiom decision 10 already reuses elsewhere, keeping the whole wizard visually consistent.
- **Hint-field shape for AI generation:** One free-text box ("describe who you want to practice with — e.g. a busy VP of marketing at a mid-size CPG company"), not structured fields — consistent with decision 2's emphasis on free text over categories (see also Phase 14's "free text, no category list" framing for the pitch subject, CONTEXT.md 14 §Elevator pitch framing). Generated description length: target 2-4 sentences (roughly 300-500 characters) — long enough to feel like a real LinkedIn-style blurb, short enough to fit the existing `MAX_PROFILE_TEXT_LENGTH = 4000` ceiling with huge headroom and to be comfortably editable in a textarea.
- **Where networking's modules live / is generation its own route:** Put type config in `lib/engine/registry.ts` (Phase 13's one file) per the locked decision 9; put generation in its own route (`app/api/networking/persona/generate/route.ts`) separate from the Phase 8 distill route, both because decision 2 calls it "a new, separate model call" and because it lets the generation route be the one safe-to-build-early plan.
- **Attestation wording/location:** Wording should name what is being attested (consent to use a real person's publicly/privately known description for a role-play simulation, confirming the student has a legitimate basis for sharing it) — exact legal-ish phrasing is a product/legal call, not an engineering one; flag for human sign-off at plan time rather than inventing final legal copy. Location: per Open Question 2, default to storing on the persisted instance (S3 JSON), not a new Prisma column, unless auditability needs override that.
- **Outcome record rendering:** A compact panel below the score cards, modeled on whatever shape Phase 14's negotiation-triple panel takes (per `14-15-PLAN.md`'s mention of "report panels for... the negotiation triple") — likely a small table: "Ask made: Yes/No", "Outcome: Agreed/Deflected/Declined/Never asked", "Common ground found: <text>". Follow Phase 14's actual implementation once it exists rather than inventing a second outcome-panel idiom.
- **Session length default:** 15 minutes, matching the existing dashboard tile's `estimatedMinutes: 15` (`lib/interactions/index.ts:66`) — no adjustable range needed.

## Sources

### Primary (HIGH confidence — direct file reads with line numbers)
- `.planning/phases/16-networking-practice/16-CONTEXT.md` — full locked decisions and discretion list.
- `.planning/ROADMAP.md` lines 98-110, 370-420 — Phase 14 gate language and Phase 16 success criteria/scope note.
- `.planning/phases/13-one-on-one-conversation-engine/13-CONTEXT.md`, `13-01-PLAN.md`, `13-02-PLAN.md`, `13-03-PLAN.md`, `13-05-PLAN.md`, `13-07-PLAN.md`, `13-09-PLAN.md`, `13-12-PLAN.md` — full text read for exact declared shapes.
- `.planning/phases/14-practice-pitches/14-02-PLAN.md` (full), `14-CONTEXT.md` (partial), `14-01-PLAN.md`/`14-03-PLAN.md`/`14-06-PLAN.md`/`14-07-PLAN.md` (headers), `14-15-PLAN.md` (Section 4 definition + task text) — Phase 14's handoff/extension convention.
- `app/api/interview/persona/distill/route.ts` (full file) — distill contract.
- `lib/interview/customization.ts` (full file) — persona composition rule.
- `app/api/metrics/consent/route.ts` (full file), `prisma/schema.prisma:47-63` — Phase 10 consent shape, proven NOT versioned.
- `lib/interactions/index.ts` (full file) — dashboard tile to flip.
- `lib/scenario/validation.ts` (lines 1-50, 240-260), `app/api/scenario/publish/route.ts` (full file) — ownership/publish precedent.
- `app/api/interview/interviewers/route.ts` (partial, ~80 lines) — avatar/voice picker contract.
- `lib/report/structured.ts` lines 95-127 — the hardcoded `required[]` and `category_notes` shape.
- `lib/metrics/types.ts`, `lib/metrics/bands.ts`, `lib/metrics/coverage.ts` (grepped) — four-state Visual/Vocal handling confirmed present and untouched by this phase.
- `.planning/STATE.md` lines 1567, 1575-1633 — confirms Phase 13 fully unexecuted at research time.

### Secondary / Tertiary
None used — this research was entirely internal-codebase and internal-planning-doc verification; no external library or ecosystem research was needed since Phase 16 adds no new third-party dependency.

## Metadata

**Confidence breakdown:**
- Codebase facts (distill route, customization.ts, consent route, interactions registry, scenario validation): HIGH — all read directly with line citations.
- Phase 13/14 primitive shapes: MEDIUM-HIGH — read directly from the PLAN files, which are detailed and specific, but Phase 13 is unexecuted so exact final export names may drift (explicitly anticipated by Phase 14's own plans).
- Discretion-item recommendations: MEDIUM — reasoned from stated decisions and sibling-phase precedent, not externally verified (no external research applicable).

**Research date:** 2026-10-03
**Valid until:** Until Phase 13 (and ideally Phase 14's 14-02) actually executes and produces real `13-0X-SUMMARY.md` / `14-02-SUMMARY.md` files — at that point this research's primitive-name assumptions must be reconciled against the real summaries, exactly as 14-02 instructs for itself. Treat this as valid for ~30 days or until Phase 13 execution begins, whichever comes first.
