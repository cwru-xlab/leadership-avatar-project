/**
 * Plan 19-01: prove `lib/pitch/deck-modes.ts` names all five deck modes,
 * every per-mode difference, and that `proposeDeckSeconds` stays inside each
 * mode's own envelope.
 *
 * Style mirrors scripts/verify-pitch-surface-count.ts.
 *
 * Run: npx tsx scripts/verify-deck-mode-table.ts
 */
import { SHARED_DECK_DIMENSIONS } from "../lib/pitch/deck-rubric";
import {
  DECK_MODES,
  type DeckModeSlug,
  getDeckMode,
  listDeckModes,
} from "../lib/pitch/deck-modes";
import { DECK_ENVELOPE_SECONDS, proposeDeckSeconds } from "../lib/pitch/session-length";

let failures = 0;

function fail(msg: string): void {
  console.log(`  FAIL ${msg}`);
  failures += 1;
}

function ok(msg: string): void {
  console.log(`  ok   ${msg}`);
}

function check(name: string, pass: boolean, detail?: string): void {
  if (pass) {
    ok(name);
  } else {
    fail(`${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

console.log("verify-deck-mode-table: checking lib/pitch/deck-modes.ts\n");

// 1. Exactly five modes, slugs as declared.
const modes = listDeckModes();
const EXPECTED_SLUGS: DeckModeSlug[] = [
  "pitch-deck",
  "pitch-funding",
  "pitch-product",
  "pitch-talk",
  "pitch-general",
];
check(
  "listDeckModes() returns exactly five modes in picker order",
  modes.length === 5 &&
    modes.every((m, i) => m.slug === EXPECTED_SLUGS[i]),
  `got: ${modes.map((m) => m.slug).join(", ")}`,
);

// 2. Exactly ONE mode negotiates, and it is pitch-deck.
const negotiating = modes.filter((m) => m.negotiates);
check(
  "exactly one mode negotiates, and it is pitch-deck",
  negotiating.length === 1 && negotiating[0]?.slug === "pitch-deck",
  `negotiating: ${negotiating.map((m) => m.slug).join(", ")}`,
);

// 3. pitch-general has no mode input, no distinctive dimension, no outcome panel.
const general = DECK_MODES["pitch-general"];
check(
  "pitch-general has no mode input, no distinctive dimension, no outcome panel",
  general.modeInputStepId === null &&
    general.modeInputStepComponent === null &&
    general.distinctiveDimensionKeys.length === 0 &&
    general.outcomeFieldKeys.length === 0 &&
    general.hasOutcomePanel === false,
);

// 4. Every other mode has a non-null step id+component and >= 1 distinctive dimension.
const others = modes.filter((m) => m.slug !== "pitch-general");
check(
  "every non-general mode has a mode-input step id, component, and distinctive dimension",
  others.every(
    (m) =>
      typeof m.modeInputStepId === "string" &&
      m.modeInputStepId.length > 0 &&
      typeof m.modeInputStepComponent === "string" &&
      m.modeInputStepComponent.length > 0 &&
      m.distinctiveDimensionKeys.length >= 1,
  ),
  others
    .filter(
      (m) =>
        !m.modeInputStepId ||
        !m.modeInputStepComponent ||
        m.distinctiveDimensionKeys.length < 1,
    )
    .map((m) => m.slug)
    .join(", "),
);

// 5. No distinctive key collides with SHARED_DECK_DIMENSIONS; negotiation only on pitch-deck.
const sharedKeys = new Set(SHARED_DECK_DIMENSIONS.map((d) => d.key));
const collisions = modes.flatMap((m) =>
  m.distinctiveDimensionKeys.filter((k) => sharedKeys.has(k)),
);
const negotiationOwners = modes.filter((m) =>
  m.distinctiveDimensionKeys.includes("negotiation"),
);
check(
  "no distinctive dimension key collides with SHARED_DECK_DIMENSIONS",
  collisions.length === 0,
  `collisions: ${collisions.join(", ")}`,
);
check(
  "negotiation appears only in pitch-deck's distinctive keys",
  negotiationOwners.length === 1 && negotiationOwners[0]?.slug === "pitch-deck",
  `owners: ${negotiationOwners.map((m) => m.slug).join(", ")}`,
);

// 6. Every envelope is [low, high] with 0 < low < high; pitch-deck equals DECK_ENVELOPE_SECONDS.
check(
  "every mode's envelope is [low, high] with 0 < low < high",
  modes.every(
    (m) => m.envelopeSeconds[0] > 0 && m.envelopeSeconds[0] < m.envelopeSeconds[1],
  ),
);
check(
  "pitch-deck's envelope equals DECK_ENVELOPE_SECONDS",
  DECK_MODES["pitch-deck"].envelopeSeconds[0] === DECK_ENVELOPE_SECONDS[0] &&
    DECK_MODES["pitch-deck"].envelopeSeconds[1] === DECK_ENVELOPE_SECONDS[1],
);

// 7. proposeDeckSeconds(n, envelope) lands inside each mode's envelope.
const SLIDE_COUNTS = [0, 1, 8, 12, 25, 60];
let escaped: string[] = [];
for (const m of modes) {
  for (const n of SLIDE_COUNTS) {
    const proposed = proposeDeckSeconds(n, m.envelopeSeconds);
    if (proposed < m.envelopeSeconds[0] || proposed > m.envelopeSeconds[1]) {
      escaped.push(`${m.slug}@${n}=${proposed}`);
    }
  }
}
check(
  "proposeDeckSeconds lands inside each mode's own envelope for all slide counts",
  escaped.length === 0,
  escaped.join(", "),
);

// 8. Every card field is a non-empty string; negotiationMarker differs for negotiating vs not.
const CARD_STRING_FIELDS: (keyof typeof general)[] = [
  "cardTitle",
  "cardBlurb",
  "listenerLine",
  "scoredLine",
  "negotiationMarker",
  "listenerDisplayName",
  "wizardHeadline",
  "wizardStudioStat",
];
const emptyFields = modes.flatMap((m) =>
  CARD_STRING_FIELDS.filter((f) => {
    const v = m[f];
    return typeof v !== "string" || v.trim().length === 0;
  }).map((f) => `${m.slug}.${f}`),
);
check(
  "every card field is a non-empty string for all five modes",
  emptyFields.length === 0,
  emptyFields.join(", "),
);
check(
  "negotiationMarker differs between a negotiating and a non-negotiating mode",
  DECK_MODES["pitch-deck"].negotiationMarker !==
    DECK_MODES["pitch-general"].negotiationMarker,
);

// 9. getDeckMode trims+lowercases; unknown and non-deck slugs resolve to null.
check(
  'getDeckMode("PITCH-TALK ") resolves via trim + lowercase',
  getDeckMode("PITCH-TALK ")?.slug === "pitch-talk",
);
check(
  'getDeckMode("pitch-elevator") returns null (the elevator is not a deck mode)',
  getDeckMode("pitch-elevator") === null,
);

console.log("");
if (failures === 0) {
  console.log("verify-deck-mode-table: ALL PASS\n");
  process.exit(0);
} else {
  console.log(`verify-deck-mode-table: FAILED (${failures} failure(s))\n`);
  process.exit(1);
}
