---
phase: 14-practice-pitches
plan: 09
subsystem: engine
tags: [typescript, pitch, deck, prompts, registry, visible-context, negotiation, session-length]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "InteractionTypeConfig, resolveSessionConfig, applyVisibleContext (turn.cursors), OutcomeRecordConfig, buildRubricJsonSchema"
  - phase: 14-practice-pitches
    provides: "14-02 clampAdjustableBudget + pitch-deck InstanceConfig; 14-04 buildEvaluationImages hook; 14-05 slideHighWaterMark null-means-nothing-revealed + checkpointing:client-driven; 14-08 elevator registry pattern + verify-pitch-types elevator section"
provides:
  - "PITCH_DECK_TYPE registered as pitch-deck"
  - "buildDeckSystemPrompt / DECK_EVALUATOR_PROMPT / buildDeckEvaluationContext / buildDeckEvaluationImages"
  - "proposeDeckSeconds + DECK_ENVELOPE_SECONDS [1200,1800]"
  - "buildSlidesChannel + SLIDES_CHANNEL_KEY + DECK_VISIBLE_CONTEXT"
  - "scripts/verify-pitch-types.ts deck section (eleven assertions)"
affects: [14-11-visible-context-cursor, 14-12-deck-wizard, 14-13-deck-shell, 14-14-report-panels, 14-15-tuning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Type is one registry record plus prompts — no route, evaluator module, or report page"
    - "Slide visibility = Phase 13 applyVisibleContext with turn.cursors.slides = server high-water mark; no second gate"
    - "Ask + fair band are session-constant instance config; only settled terms are outcome fields"
    - "Session length is a pure proposal (proposeDeckSeconds); clampAdjustableBudget is the only server clamp"

key-files:
  created:
    - lib/pitch/slides-channel.ts
    - lib/pitch/session-length.ts
    - lib/pitch/deck-prompts.ts
    - lib/pitch/deck-type.ts
  modified:
    - lib/engine/registry.ts
    - scripts/verify-pitch-types.ts
    - scripts/verify-report-structure.ts

key-decisions:
  - "DECK_VISIBLE_CONTEXT.visibleChannels = '*' — Phase 13 has no per-channel progressive-mode field; cursor gating is turn.cursors[SLIDES_CHANNEL_KEY]"
  - "proposeDeckSeconds anchors: ≤8 → 1200s, ≥25 → 1800s, linear + round-to-60 between (16 → 1500)"
  - "Nine dimension keys in order: visual, vocal, content, behavioral, deck_structure, deck_text_density, deck_visual_quality, slide_speech_correlation, negotiation"
  - "Outcome fields: dealReached, settledPriceUsd, settledEquityPct, negotiationNotes — ask/fair ABSENT from schema"
  - "avatarMayEnd: false (structural opposite of pitch-elevator); no postProcessScores"
  - "buildDeckEvaluationImages ctx extends { config } with optional userId, slideHighWaterMark, loadSlideImage; thumb variant; 1-based labels"
  - "setupSteps: deck-upload → negotiation-ask → session-length (CameraConsentStep appended by SetupWizard, not declared)"
  - "checkpointing: client-driven (14-05); timeBudget.totalSeconds is pre-proposal default only"

patterns-established:
  - "verify-pitch-types.ts deck section appended below elevator; leave elevator untouched"
  - "Slides channel adapter declares config only — applyVisibleContext owns .slice(0, cursor+1)"

requirements-completed: [P14-SC3, P14-SC4, P14-SC5]

# Metrics
duration: 6min
completed: 2026-10-04
---

# Phase 14 Plan 09: Pitch Deck Type Record Summary

**`pitch-deck` is one config record plus prompts: nine rubric dimensions, cursor-gated slides channel, ask/fair as instance config with settled-terms-only outcome, and a soft adjustable 20–30 minute envelope the avatar cannot close.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-10-04T14:59:59Z
- **Completed:** 2026-10-04T15:05:56Z
- **Tasks:** 3
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- Shipped slides-channel adapter over Phase 13's `applyVisibleContext` (no parallel gate).
- Session-constant investor prompts with ask + hidden fair band; soft time; explicit ban on ending the meeting.
- Registered `PITCH_DECK_TYPE` with five first-class extras, settled-terms outcome, adjustable envelope, `avatarMayEnd: false`.
- Proved eleven locked decisions in `scripts/verify-pitch-types.ts` (elevator + deck ALL PASS).

## Locked details for downstream plans (14-11 / 14-12 / 14-13 / 14-14)

### `applyVisibleContext` call shape (slides cursor)

```ts
import { applyVisibleContext } from "@/lib/engine/visible-context";
import { SLIDES_CHANNEL_KEY, buildSlidesChannel } from "@/lib/pitch/slides-channel";

const sessionState = {
  [SLIDES_CHANNEL_KEY]: buildSlidesChannel(slideTexts), // { index, text }[] zero-based
};
const visible = applyVisibleContext(
  config.visibleContext, // DECK_VISIBLE_CONTEXT → visibleChannels: "*"
  sessionState,
  { cursors: { [SLIDES_CHANNEL_KEY]: slideHighWaterMark } }, // HIGH-WATER MARK, never current slide
);
// Admitted entries: indices 0 .. slideHighWaterMark inclusive (primitive does slice(0, cursor+1))
// null slideHighWaterMark (14-05) means nothing revealed — do not pass a cursor (or treat as no slides)
```

**Awkwardness recorded:** Phase 13's `VisibleContextConfig` has only `visibleChannels` — there is no per-channel "progressively revealed" mode flag. Cursor gating is entirely turn-side via `VisibleContextTurn.cursors`. The adapter therefore exports the channel key + entry builder + permissive `DECK_VISIBLE_CONTEXT`; it does not invent a second config shape.

### `proposeDeckSeconds` anchors

| slideCount | seconds |
| --- | --- |
| ≤ 0 or ≤ 8 | 1200 |
| 16 (mid) | 1500 (60s boundary) |
| ≥ 25 | 1800 |

`DECK_ENVELOPE_SECONDS = [1200, 1800] as const`

### Nine dimension keys (order)

`visual`, `vocal`, `content`, `behavioral`, `deck_structure`, `deck_text_density`, `deck_visual_quality`, `slide_speech_correlation`, `negotiation`

### `buildDeckEvaluationImages` signature

```ts
export async function buildDeckEvaluationImages(ctx: {
  config: ResolvedSessionConfig;
  userId?: string;                    // required in production to read private storage
  slideHighWaterMark?: number | null; // null/omit → [] (nothing revealed)
  loadSlideImage?: typeof loadDeckSlideImage; // test seam
}): Promise<EvaluatorImage[]>
// Loads variant "thumb" for indices 0..mark; labels "slide 1".."slide N" (1-based)
// Does NOT sample — 14-04 MAX_EVALUATOR_IMAGES handles large decks
```

**Wiring note:** `InteractionPromptsConfig.buildEvaluationImages` is still typed `{ config }` only. Optional extras keep assignability; evaluation-runner today passes only `{ config }` — 14-14 must thread `userId` + `slideHighWaterMark` from the report or images stay empty.

### Outcome / negotiation

- Ask (`askPriceUsd` / `askEquityPct`) and `fairValueBand` — instance config, in system prompt, never in outcome schema.
- Outcome: `dealReached`, `settledPriceUsd`, `settledEquityPct`, `negotiationNotes`.

### setupSteps

`deck-upload` → `DeckUploadStep`; `negotiation-ask` → `NegotiationAskStep`; `session-length` → `SessionLengthStep` (camera consent appended by SetupWizard).

## Task Commits

Each task was committed atomically:

1. **Task 1: The slides context channel, the session-length proposal, and the investor prompts** - `234de8c` (feat)
2. **Task 2: The pitch-deck type record, registered** - `75c85a6` (feat)
3. **Task 3: Prove the deck type's config honors every locked decision** - `3457653` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `lib/pitch/slides-channel.ts` — `SLIDES_CHANNEL_KEY`, `buildSlidesChannel`, `DECK_VISIBLE_CONTEXT`
- `lib/pitch/session-length.ts` — `DECK_ENVELOPE_SECONDS`, `proposeDeckSeconds`
- `lib/pitch/deck-prompts.ts` — live + evaluator prompts, eval context, eval images
- `lib/pitch/deck-type.ts` — `PITCH_DECK_TYPE`
- `lib/engine/registry.ts` — one import + one `ENGINE_TYPES` entry
- `scripts/verify-pitch-types.ts` — eleven deck assertion sections
- `scripts/verify-report-structure.ts` — pitch-deck + difficult-conversation instance stubs

## Decisions Made

See `key-decisions` in frontmatter. Claude's-Discretion anchors (8/25 slides) may be tuned in 14-15.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] verify-report-structure instance stubs**
- **Found during:** Task 3
- **Issue:** Registering `pitch-deck` (instance.required) broke section 6.1; `difficult-conversation` was already failing the same loop with `{ kind: "none" }`.
- **Fix:** Added pitch-deck and difficult-conversation synthetic instances alongside the existing pitch-elevator stub.
- **Files modified:** `scripts/verify-report-structure.ts`
- **Committed in:** `3457653`

**2. [Rule 3 - Blocking] buildDeckEvaluationImages ctx extras**
- **Found during:** Task 1
- **Issue:** Typed hook is `{ config }` only, but images need `userId` + final high-water mark; tests need a load stub.
- **Fix:** Exported function accepts optional `userId`, `slideHighWaterMark`, `loadSlideImage` (still assignable to the hook type). Documented for 14-14 wiring.
- **Files modified:** `lib/pitch/deck-prompts.ts`
- **Committed in:** `234de8c`

**3. [Rule 3 - Blocking] clampAdjustableBudget return shape**
- **Found during:** Task 3
- **Issue:** Plan prose wrote `clampAdjustableBudget(config, 600) === 1200`; real API returns `{ seconds, clamped }` and takes `TimeBudgetConfig`.
- **Fix:** Assert `.seconds` against `result.config.timeBudget` (14-02 real signature).
- **Files modified:** `scripts/verify-pitch-types.ts`
- **Committed in:** `3457653`

---

**Total deviations:** 3 auto-fixed (all Rule 3)
**Impact on plan:** Necessary for correctness against real Phase 13/14 signatures; no scope creep.

## Issues Encountered

None beyond the deviations above. Pre-existing `grep typeSlug ===` hit in `lib/engine/prompts.ts` and substring `drive` matches in "driven"/"drivers" are out of scope (not introduced here).

## User Setup Required

None.

## Next Phase Preview

Plans 14-11 (live cursor wiring), 14-12 (wizard steps), 14-13 (deck shell), and 14-14 (report ask vs settled vs fair + evaluation-runner image wiring) consume the signatures above.

## Self-Check: PASSED

- FOUND: `lib/pitch/slides-channel.ts`
- FOUND: `lib/pitch/session-length.ts`
- FOUND: `lib/pitch/deck-prompts.ts`
- FOUND: `lib/pitch/deck-type.ts`
- FOUND: `234de8c`, `75c85a6`, `3457653` in git log
- FOUND: `npx tsx scripts/verify-pitch-types.ts` exits 0
