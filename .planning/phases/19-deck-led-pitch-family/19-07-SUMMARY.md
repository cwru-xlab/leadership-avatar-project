---
phase: 19-deck-led-pitch-family
plan: 07
subsystem: ui
tags: [react, nextjs, pitch, wizard, setup-wizard, deck-modes]

# Dependency graph
requires:
  - phase: 19-deck-led-pitch-family
    provides: "19-01's DECK_MODES table/getDeckMode/listDeckModes; 19-02's shared deck InstanceConfig+modeInputs widening; 19-03's pitch-deck interviewer step + walk-out-off; 19-04/19-05's four new TYPE records all declaring interviewer; 19-06's FundingAskStep/BuyerProfileStep/TalkAudienceStep"
provides:
  - "app/practice/[type]/page.tsx generalized to read all deck behavior off getDeckMode() instead of any pitch-deck slug comparison — all five deck modes (investor, funding, product, talk, general) launch through the one wizard, one camera gate, one session shell"
  - "lib/pitch/deck-modes.ts#tagModeInput — the one place a mode-input value's `mode` discriminator literal is written, so the wizard page never writes a mode slug itself"
  - "scripts/verify-deck-wizard-generic.ts — 38-assertion mechanical proof: no deck-mode slug branch, every declared step renders, all five modes share the one avatar-picker path, one camera gate, one wizard route, negotiation fields provably gated"
affects: ["19-09 (report chrome)", "19-10 (surface-count guard)", "19-11 (human sign-off)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Collapsed per-mode wizard state: one deckModeInput slot (NegotiationAskValue | DeckModeInputs | null) keyed by deckMode.negotiates / deckMode.modeInputStepId, instead of one state variable per mode — state does not grow with the number of modes."
    - "Conditional-spread instance assembly: askPriceUsd/askEquityPct/modeInputs are spread into the instance/payload object literal only when the mode calls for them, so a non-negotiating mode's object never contains the negotiation keys at all (absence, not null/0)."
    - "Generic effect-retirement gate: declaresInterviewerStep = engineType.setupSteps.some(id === 'interviewer') replaces a slug check, so the auto-pick fallback and the InterviewerStep-owned path can never both be live for one type."
    - "tagModeInput(modeSlug, value) in the one mode-data table (deck-modes.ts) attaches a mode's `mode` discriminator from a value already resolved via getDeckMode(), so the generic wizard page passes deckMode.slug through instead of writing a literal."

key-files:
  created:
    - scripts/verify-deck-wizard-generic.ts
  modified:
    - "app/practice/[type]/page.tsx"
    - lib/pitch/deck-modes.ts

key-decisions:
  - "Collapsed negotiationAsk and the three 19-06 mode-input values into ONE state slot (deckModeInput: NegotiationAskValue | DeckModeInputs | null), narrowed back to each shape via deckMode.negotiates / deckMode.modeInputStepId at the two read sites (negotiationAskValue, modeInputValue) — chosen over keeping negotiationAsk separate so the number of state variables stays constant as modes are added."
  - "Added lib/pitch/deck-modes.ts#tagModeInput rather than writing `mode: \"pitch-funding\"` (etc.) literals inline in page.tsx. This is a one-file, one-function addition outside the plan's stated files_modified list, made under deviation Rule 3 (blocking issue directly caused by executing Task 1 as specified) — see Deviations below."
  - "The InstanceConfig literal `kind: \"pitch-deck\"` is kept, unquoted-nowhere-else, for all five modes per the plan's own Task 1 item 4 and REQ-93 (no new InstanceConfig kind). The verify script explicitly treats this one literal as the required discriminator constant, not a mode-identity branch, and fails on any OTHER deck-mode slug literal."
  - "Three Stat tiles now read, in order: the mode's envelope as a formatted range (formatEnvelopeRange helper), deckMode.wizardStudioStat, and the literal 'Deck' label — matching the plan's Task 1 item 5 description of what drives the three tiles, while keeping the existing icon/label scaffold (Clock3/Practice, UsersRound/listenerDisplayName, LockKeyhole/Deck)."

patterns-established:
  - "A mode-specific literal (a discriminator tag, a kind constant) belongs in the ONE data table that already owns mode identity (lib/pitch/deck-modes.ts), never inline in a page that is supposed to be slug-agnostic — exposed as a small pure function (tagModeInput) rather than duplicated per call site."

requirements-completed: [REQ-87, REQ-89, REQ-91, P19-SC1, P19-SC2, P19-SC4]

# Metrics
duration: 30min
completed: 2026-10-08
---

# Phase 19 Plan 07: Generic Deck Wizard Summary

**Rewired `app/practice/[type]/page.tsx` to drive every deck-specific behavior off `getDeckMode()` instead of `slug === "pitch-deck"`, retiring the avatar auto-pick generically (gated on a declared `interviewer` step, not a slug) so all five deck modes share one wizard, one camera gate, and one session shell while `pitch-elevator` keeps its fallback.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 2 completed
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments
- `app/practice/[type]/page.tsx` no longer contains a single `pitch-deck`-slug comparison; `deckMode = getDeckMode(engineType?.slug)` and `isDeckMode = deckMode !== null` replace `isPitchDeck` everywhere — wizard copy, stat tiles, report title, progress label, listener label, exit step, session chrome (`mediaLayout`/`sessionPanelClassName`/`sessionPanel`), and instance/payload assembly.
- The avatar auto-pick effect is retired generically: gated on `declaresInterviewerStep = engineType.setupSteps.some(s => s.id === "interviewer")`, not a slug. All five deck modes (which all declare `interviewer`) are now owned entirely by `InterviewerStep`; `pitch-elevator` (declares no `interviewer` step) still runs the auto-pick fallback exactly as before — proven by `scripts/verify-deck-wizard-generic.ts`'s section 3c, which asserts `pitch-elevator`'s registered type has no `interviewer` step and every deck mode's type does.
- One collapsed `deckModeInput` wizard-state slot (`NegotiationAskValue | DeckModeInputs | null`) replaces the single `negotiationAsk` state, narrowed back to each shape via `deckMode.negotiates` / `deckMode.modeInputStepId` — the state surface does not grow as modes are added.
- Negotiation fields (`askPriceUsd`/`askEquityPct`) and `modeInputs` are spread into both the shell-only instance and the launch payload CONDITIONALLY, so a non-negotiating mode's object literal never contains the negotiation keys at all (REQ-89) — proven by the verify script's section 7 (every `askPriceUsd:` assignment sits inside a `deckMode.negotiates`-gated block).
- `renderStep` gained three new cases (`funding-ask`, `buyer-profile`, `talk-audience`) wired to the 19-06 components, dispatched purely by declared step id, matching the existing pattern for `networking-goal`/`negotiation-ask`.
- `scripts/verify-deck-wizard-generic.ts` — a new 38-assertion, source-text + registry proof — ALL PASS, covering: no deck-mode slug branch (excluding the one required `kind: "pitch-deck"` discriminator), `getDeckMode`/`isDeckModeSlug` import, every declared step for every mode renders, all five modes declare exactly one shared `interviewer` step with no parallel avatar picker, the auto-pick gate and elevator/deck-mode asymmetry, exactly one camera gate and one wizard route (no `app/practice/pitch-*/page.tsx`), and negotiation-field conditionality.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace slug equality with the mode record** - `3b1c050` (feat)
2. **Task 2: Prove the wizard is generic and every declared step is renderable** - `dab3f35` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `app/practice/[type]/page.tsx` - Generalized off `getDeckMode()`; collapsed deck-mode wizard state; conditional negotiation/modeInputs assembly; generic interviewer-step gate; mode-driven copy/chrome; three new `renderStep` cases.
- `lib/pitch/deck-modes.ts` - Added `tagModeInput(modeSlug, value)`, a pure helper that tags a mode-input step's bare value with its mode discriminator, so the wizard page never writes a `mode: "pitch-..."` literal.
- `scripts/verify-deck-wizard-generic.ts` - New mechanical proof script (38 assertions, ALL PASS).

## Decisions Made
See key-decisions in frontmatter: collapsed wizard state, `tagModeInput` addition (deviation, see below), `kind: "pitch-deck"` treated as the required constant rather than a branch, and the three-Stat-tile mapping.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `lib/pitch/deck-modes.ts#tagModeInput`, a file outside the plan's stated `files_modified` list**
- **Found during:** Task 1, item 3 (collapsing wizard state) and item 6 (`renderStep` cases for the three new mode-input components)
- **Issue:** The three 19-06 step components (`FundingAskStep`, `BuyerProfileStep`, `TalkAudienceStep`) emit bare values (`FundingAskValue`, etc.) with no `mode` discriminator, but the collapsed `deckModeInput` state's `DeckModeInputs` member requires one. Writing `{ mode: "pitch-funding", ...next }` inline in `page.tsx` for each of the three cases would plant exactly the kind of mode-slug literal the plan's hard constraint prohibits ("no deck-mode slug literal... everything mode-specific comes from `getDeckMode()`"), and would also fail the plan's own Task 1 `<verify>` grep for deck-mode slug literals.
- **Fix:** Added one small pure function, `tagModeInput<T extends object>(modeSlug: DeckModeSlug, value: T): DeckModeInputs`, to `lib/pitch/deck-modes.ts` — the file the plan itself calls "the ONE data home for the deck-led pitch family" and "the ONLY place a deck mode's identity lives." The wizard page now calls `tagModeInput(deckMode.slug, next)`, passing through the slug it already resolved via `getDeckMode()` rather than writing any literal itself.
- **Files modified:** `lib/pitch/deck-modes.ts` (addition only, no existing code touched; confirmed via `git diff` that the only change is the new function at the end of the file)
- **Verification:** `npx tsc --noEmit` clean; `npx eslint` clean on both files; `scripts/verify-deck-mode-table.ts`, `scripts/verify-deck-family-types.ts`, `scripts/verify-deck-family-plumbing.ts` all still ALL PASS; `scripts/verify-deck-wizard-generic.ts` (this plan's own new script) confirms zero deck-mode slug literals remain in `page.tsx` outside the required `kind: "pitch-deck"` discriminator.
- **Committed in:** `3b1c050` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal, additive, and in the spirit of the plan's own stated architecture (mode identity lives in exactly one table). No scope creep — no other code in `deck-modes.ts` was touched.

## Issues Encountered
- `npm run lint` (`eslint --fix`, no file glob) reformatted ~280 unrelated files repo-wide on first run. These were identified via `git status --short` immediately after and reverted with `git checkout --` before staging anything, keeping only the two files this plan intentionally touched. No unrelated change was committed.
- The plan's own Task 1 `<verify>` command (`grep -nE '"pitch-(deck|funding|product|talk|general)"' ...` returns NOTHING) is in tension with the plan's own Task 1 item 4, which explicitly requires keeping the literal `kind: "pitch-deck"` for all five modes (REQ-93: no new InstanceConfig kind). That literal necessarily matches the grep. Resolved by treating `kind: "pitch-deck"` as the one legitimate, required discriminator constant (not a mode-identity branch) and building `scripts/verify-deck-wizard-generic.ts`'s section 1 to assert there is no OTHER deck-mode slug literal in the file, which is the actual intent behind the hard constraint. The literal grep in isolation would report two matches; the smarter script built for Task 2 is the authoritative proof and passes cleanly.
- `scripts/verify-pitch-types.ts` reports its one pre-existing elevator/walk-out failure (`assistantTurnCount:2 + lost_interest ACCEPTED`), documented in `18-PITCH-TYPES-REGRESSION.md` and reconfirmed in every prior 19-xx summary as not owned by this plan. Confirmed unchanged before/after this plan's edits.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `app/practice/[type]/page.tsx` is fully mode-table-driven; a sixth deck mode needs only a `DECK_MODES` row (19-01) and a registered TYPE record — no edit to this page.
- `pitch-elevator`'s avatar auto-pick fallback is proven reachable (static proof in `verify-deck-wizard-generic.ts` section 3c; `declaresInterviewerStep` is false for its type, so the auto-pick effect still runs).
- Ready for 19-09 (report chrome for the four new modes — the known `verify-report-chrome-coverage.ts` failure for those modes is explicitly that plan's scope, not repaired here) and 19-10 (surface-count guard).
- No blockers introduced by this plan.

---
*Phase: 19-deck-led-pitch-family*
*Completed: 2026-10-08*

## Self-Check: PASSED

All created/modified files (`app/practice/[type]/page.tsx`, `lib/pitch/deck-modes.ts`, `scripts/verify-deck-wizard-generic.ts`, this summary) and both task commit hashes (`3b1c050`, `dab3f35`) verified present on disk and in git history.
