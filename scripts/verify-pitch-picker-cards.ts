/**
 * Plan 19-08: prove `app/practice/pitches/page.tsx` renders all five deck
 * modes' four required facts from `lib/pitch/deck-modes.ts`, that the
 * "With a deck" expansion is an accessible disclosure (not a bare div with
 * an onClick), and that no second screen or route was added.
 *
 * Style mirrors scripts/verify-deck-mode-table.ts.
 *
 * Run: npx tsx scripts/verify-pitch-picker-cards.ts
 */
import fs from "node:fs";
import path from "node:path";

import { DECK_MODES, listDeckModes } from "../lib/pitch/deck-modes";

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
  "verify-pitch-picker-cards: checking app/practice/pitches/page.tsx\n",
);

const PAGE_PATH = path.join(
  __dirname,
  "..",
  "app",
  "practice",
  "pitches",
  "page.tsx",
);
const rawSource = fs.readFileSync(PAGE_PATH, "utf8");

// Strip comments (block and line) before literal/slug scans, so a slug
// mentioned only in a code comment doesn't trip the hardcoding check.
const sourceNoComments = rawSource
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
  "page source references listenerLine, scoredLine, envelopeSeconds and negotiationMarker",
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
  "page contains no deck-mode slug literal (pitch-elevator excluded)",
  !DECK_SLUG_LITERAL.test(sourceNoComments),
  sourceNoComments.match(DECK_SLUG_LITERAL)?.[0] ?? "",
);
check(
  'page still references "pitch-elevator" as a literal (the elevator is not a deck mode)',
  /"pitch-elevator"/.test(sourceNoComments),
);

// 3. The expansion is an accessible disclosure: aria-expanded + aria-controls.
check(
  "page contains aria-expanded",
  rawSource.includes("aria-expanded"),
);
check(
  "page contains aria-controls",
  rawSource.includes("aria-controls"),
);

// 4. Exactly one picker page; no deck sub-route or decks directory exists.
const PITCHES_DIR = path.join(__dirname, "..", "app", "practice", "pitches");
const pitchesDirEntries = fs.readdirSync(PITCHES_DIR, {
  withFileTypes: true,
});
const subRoutes = pitchesDirEntries.filter((entry) => entry.isDirectory());
check(
  "app/practice/pitches has no subdirectory (no second screen)",
  subRoutes.length === 0,
  subRoutes.map((e) => e.name).join(", "),
);
check(
  "exactly one page.tsx exists under app/practice/pitches",
  fs.existsSync(PAGE_PATH),
);
const DECKS_DIR = path.join(__dirname, "..", "app", "practice", "decks");
check(
  "no app/practice/decks directory exists",
  !fs.existsSync(DECKS_DIR),
);

// 5. router.push("/practice/" + ...) is the only navigation target shape;
// no direct API or report fetch lives on the picker.
const ROUTER_PUSH_PRACTICE = /router\.push\(`\/practice\/\$\{/g;
const routerPushMatches = rawSource.match(ROUTER_PUSH_PRACTICE) ?? [];
check(
  "page navigates via router.push(`/practice/${...}`) at least twice (elevator + deck modes)",
  routerPushMatches.length >= 2,
  `found ${routerPushMatches.length}`,
);
check(
  "page contains no /api/ fetch",
  !rawSource.includes("/api/"),
);
check(
  "page contains no /report/ path",
  !rawSource.includes("/report/"),
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
