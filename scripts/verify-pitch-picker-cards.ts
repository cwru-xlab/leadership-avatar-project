/**
 * Plan 19-08: prove the deck-settings page renders all five deck modes' four
 * required facts from `lib/pitch/deck-modes.ts`. The UI overhaul moved the
 * modes off the picker's in-place disclosure onto their own page,
 * `app/practice/pitches/deck/page.tsx`, so this checks the picker links there
 * and that no other screen or route was added.
 *
 * Style mirrors scripts/verify-deck-mode-table.ts.
 *
 * Run: npx tsx scripts/verify-pitch-picker-cards.ts
 */
import fs from "node:fs";
import path from "node:path";

import { DECK_MODES, listDeckModes } from "../lib/pitch/deck-modes";
import { routes } from "../lib/routes";

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

console.log(
  "verify-pitch-picker-cards: checking app/practice/pitches/page.tsx and deck/page.tsx\n",
);

const PAGE_PATH = path.join(
  __dirname,
  "..",
  "app",
  "practice",
  "pitches",
  "page.tsx",
);
const DECK_PAGE_PATH = path.join(
  __dirname,
  "..",
  "app",
  "practice",
  "pitches",
  "deck",
  "page.tsx",
);
const pickerSource = fs.readFileSync(PAGE_PATH, "utf8");
const deckSource = fs.existsSync(DECK_PAGE_PATH)
  ? fs.readFileSync(DECK_PAGE_PATH, "utf8")
  : "";
// The four facts and the mode launch live on the deck page; slug hygiene
// applies to both pages.
const rawSource = deckSource;
const bothSources = `${pickerSource}\n${deckSource}`;

// Strip comments (block and line) before literal/slug scans, so a slug
// mentioned only in a code comment doesn't trip the hardcoding check.
const sourceNoComments = bothSources
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

const modes = listDeckModes();

// 1. For every mode, the page source references the four required field
// names at least once — the four facts come from data, not re-declared copy.
const REQUIRED_FIELD_NAMES = [
  "listenerLine",
  "scoredLine",
  "envelopeSeconds",
  "negotiationMarker",
];
const missingFieldRefs = REQUIRED_FIELD_NAMES.filter(
  (field) => !rawSource.includes(field),
);
check(
  "deck page source references listenerLine, scoredLine, envelopeSeconds and negotiationMarker",
  missingFieldRefs.length === 0,
  `missing: ${missingFieldRefs.join(", ")}`,
);
check(
  "listDeckModes() returns five modes to source the four facts from",
  modes.length === 5,
  `got ${modes.length}`,
);

// 2. No deck-mode slug literal appears in the page (comments stripped).
// "pitch-elevator" is explicitly allowed (it is not a deck mode).
const DECK_SLUG_LITERAL = /"pitch-(deck|funding|product|talk|general)"/;
check(
  "neither page contains a deck-mode slug literal (pitch-elevator excluded)",
  !DECK_SLUG_LITERAL.test(sourceNoComments),
  sourceNoComments.match(DECK_SLUG_LITERAL)?.[0] ?? "",
);
check(
  'picker still references "pitch-elevator" as a literal (the elevator is not a deck mode)',
  /"pitch-elevator"/.test(pickerSource),
);

// 3. "With a deck" is a link to its own page, not an in-place disclosure.
//
// Accepts either the typed helper or the literal. `09dda6e` moved these pages
// onto `lib/routes.ts` (`routes.deckPitches()`), so pinning the literal URL
// made the guard fail while the link was correct. Asserting the helper's
// RETURN VALUE keeps the destination guarded without re-freezing the spelling.
check(
  `picker links "With a deck" to ${routes.deckPitches()}`,
  pickerSource.includes("routes.deckPitches()") ||
    pickerSource.includes(`href="${routes.deckPitches()}"`),
);
check(
  "deck page links back to the picker",
  deckSource.includes("routes.pitches()") ||
    deckSource.includes(`backHref="${routes.pitches()}"`),
);

// 4. The picker plus its canonical sub-routes; no decks directory exists.
const PITCHES_DIR = path.join(__dirname, "..", "app", "practice", "pitches");
const pitchesDirEntries = fs.readdirSync(PITCHES_DIR, {
  withFileTypes: true,
});
const subRoutes = pitchesDirEntries.filter((entry) => entry.isDirectory());
// `elevator/` joined `deck/` when the canonical named routes landed; both are
// thin wrappers over the shared launcher. The property worth guarding is that
// no OTHER sub-route appears (in particular no pluralised `decks/`).
const EXPECTED_PITCH_SUBROUTES = ["deck", "elevator"];
check(
  `app/practice/pitches has only the ${EXPECTED_PITCH_SUBROUTES.join(" + ")} subdirector${EXPECTED_PITCH_SUBROUTES.length > 1 ? "ies" : "y"}`,
  subRoutes.length === EXPECTED_PITCH_SUBROUTES.length &&
    subRoutes
      .map((e) => e.name)
      .sort()
      .every((name, i) => name === EXPECTED_PITCH_SUBROUTES[i]),
  subRoutes.map((e) => e.name).join(", "),
);
check(
  "app/practice/pitches/page.tsx and deck/page.tsx both exist",
  fs.existsSync(PAGE_PATH) && fs.existsSync(DECK_PAGE_PATH),
);
const DECKS_DIR = path.join(__dirname, "..", "app", "practice", "decks");
check(
  "no app/practice/decks directory exists",
  !fs.existsSync(DECKS_DIR),
);

// 5. A practice route is the only launch target shape; no direct API or report
// fetch lives on either page.
//
// Originally pinned the literal shape href={`/practice/${...}`}. `09dda6e`
// replaced those template literals with typed helpers
// (`routes.elevatorPitch()`, `routes.deckPitch(mode.slug)`), so the shape
// regex no longer matched even though both pages still launch correctly.
// Accept either: a /practice/ template literal, or a routes helper that
// returns a /practice/ URL.
const LINK_PRACTICE = /href=\{`\/practice\/\$\{/g;
const ROUTES_HELPER = /href=\{routes\.\w+\(/g;
const launchesPractice = (source: string) =>
  (source.match(LINK_PRACTICE) ?? []).length +
    (source.match(ROUTES_HELPER) ?? []).length >=
  1;

check(
  "picker launches the elevator via a /practice/ route",
  launchesPractice(pickerSource),
);
check(
  "deck page launches each mode via a /practice/ route",
  launchesPractice(deckSource),
);
// The helpers must actually resolve under /practice/, or the check above would
// accept any routes.* call at all.
check(
  "the elevator and deck-mode helpers resolve to /practice/ URLs",
  routes.elevatorPitch().startsWith("/practice/") &&
    routes.deckPitch("pitch-funding").startsWith("/practice/"),
  `${routes.elevatorPitch()}, ${routes.deckPitch("pitch-funding")}`,
);
check(
  "neither page contains an /api/ fetch",
  !bothSources.includes("/api/"),
);
check(
  "neither page contains a /report/ path",
  !bothSources.includes("/report/"),
);

// 6. Mode-table consistency the picker depends on: every negotiationMarker
// is non-empty, and pitch-deck's marker differs from the shared marker text
// used by the four non-negotiating modes.
const emptyMarkers = modes.filter(
  (m) => typeof m.negotiationMarker !== "string" || m.negotiationMarker.trim().length === 0,
);
check(
  "every mode's negotiationMarker is non-empty",
  emptyMarkers.length === 0,
  emptyMarkers.map((m) => m.slug).join(", "),
);

const nonNegotiatingMarkers = new Set(
  modes.filter((m) => !m.negotiates).map((m) => m.negotiationMarker),
);
check(
  "the four non-negotiating modes share one marker text",
  nonNegotiatingMarkers.size === 1,
  `markers: ${[...nonNegotiatingMarkers].join(" | ")}`,
);
check(
  "pitch-deck's negotiationMarker differs from the non-negotiating modes' shared marker",
  !nonNegotiatingMarkers.has(DECK_MODES["pitch-deck"].negotiationMarker),
  `pitch-deck: ${DECK_MODES["pitch-deck"].negotiationMarker}`,
);

console.log("");
if (failures === 0) {
  console.log("verify-pitch-picker-cards: ALL PASS\n");
  process.exit(0);
} else {
  console.log(`verify-pitch-picker-cards: FAILED (${failures} failure(s))\n`);
  process.exit(1);
}
