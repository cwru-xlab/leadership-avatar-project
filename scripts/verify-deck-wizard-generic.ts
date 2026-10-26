/**
 * Phase 19 plan 19-07: prove app/practice/[type]/page.tsx is a GENERALIZATION
 * of the one pre-session wizard, not an extension — no deck-mode slug
 * literal drives any branch, every declared step renders, all five deck
 * modes share one avatar-picker path, and there is still exactly one
 * camera-consent gate and one session shell.
 *
 * Style mirrors scripts/verify-pitch-surface-count.ts and
 * scripts/verify-deck-mode-table.ts (house `check()` pattern). Reads source
 * text and the type registry only — no React render, no browser.
 *
 * Run: npx tsx scripts/verify-deck-wizard-generic.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { getEngineType } from "../lib/engine/registry";
import { listDeckModes } from "../lib/pitch/deck-modes";

const ROOT = resolve(__dirname, "..");

let failures = 0;

function fail(msg: string): never {
  console.log(`  FAIL ${msg}`);
  failures += 1;
  console.log(
    `\nverify-deck-wizard-generic: FAILED (${failures} failure(s))\n`,
  );
  process.exit(1);
}

function ok(msg: string) {
  console.log(`  ok   ${msg}`);
}

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    ok(name);
  } else {
    fail(`${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

function abs(...parts: string[]) {
  return join(ROOT, ...parts);
}

function rel(p: string) {
  return relative(ROOT, p).replace(/\\/g, "/");
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === ".next" ||
      name === ".git" ||
      name === ".tmp" ||
      name === "coverage" ||
      name === ".planning"
    ) {
      continue;
    }
    const full = join(dir, name);
    let st;

    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const PAGE_PATH = "app/practice/[type]/page.tsx";
const WIZARD_PATH = "components/practice/SetupWizard.tsx";

const pageSrcRaw = readFileSync(abs(...PAGE_PATH.split("/")), "utf8");
const pageSrc = stripComments(pageSrcRaw);

console.log("\n=== verify-deck-wizard-generic ===\n");

// --- 1. No deck-mode slug literal drives a branch -------------------------
//
// `kind: "pitch-deck"` is the one InstanceConfig discriminator the plan's
// own Task 1 item 4 requires to be kept verbatim for ALL five modes (19-02
// made it the shared deck payload; REQ-93 forbids a new InstanceConfig
// kind). That is not a mode-identity BRANCH — it is a constant required by
// the type system, identical regardless of which deck mode is active. Any
// OTHER occurrence of a deck-mode slug literal would be a branch and is
// disallowed.
{
  const deckSlugLiteralRe = /["']pitch-(?:deck|funding|product|talk|general)["']/g;
  const matches = [...pageSrc.matchAll(deckSlugLiteralRe)];
  const nonKindMatches = matches.filter((m) => {
    const before = pageSrc.slice(Math.max(0, m.index! - 12), m.index!);

    return !/kind:\s*$/.test(before);
  });

  check(
    "page.tsx has no deck-mode slug literal outside the required InstanceConfig kind discriminator",
    nonKindMatches.length === 0,
    nonKindMatches.map((m) => m[0]).join(", "),
  );
}

// --- 2. Imports getDeckMode (or isDeckModeSlug) ----------------------------
check(
  "page.tsx imports getDeckMode (or isDeckModeSlug) from lib/pitch/deck-modes",
  /from\s+["']@\/lib\/pitch\/deck-modes["']/.test(pageSrc) &&
    (/\bgetDeckMode\b/.test(pageSrc) || /\bisDeckModeSlug\b/.test(pageSrc)),
);

// --- 3. Every declared step for every deck mode renders --------------------
{
  const modes = listDeckModes();
  const requiredStepIds = new Set<string>(["deck-upload", "session-length", "interviewer"]);

  for (const mode of modes) {
    const type = getEngineType(mode.slug);

    if (!type) {
      fail(`${mode.slug}: not registered on getEngineType`);
    }
    for (const step of type!.setupSteps) {
      requiredStepIds.add(step.id);
    }
  }

  for (const stepId of requiredStepIds) {
    const re = new RegExp(`stepId\\s*===\\s*["']${stepId}["']`);

    check(
      `page.tsx renders a case for declared step id "${stepId}"`,
      re.test(pageSrc),
    );
  }
}

// --- 3b. All five deck modes declare the shared avatar picker --------------
{
  for (const mode of listDeckModes()) {
    const type = getEngineType(mode.slug)!;
    const interviewerSteps = type.setupSteps.filter(
      (step) => step.id === "interviewer",
    );

    check(
      `${mode.slug}: declares exactly one "interviewer" step`,
      interviewerSteps.length === 1,
    );
    check(
      `${mode.slug}: "interviewer" step uses the shared InterviewerStep component`,
      interviewerSteps[0]?.customComponent === "InterviewerStep",
    );

    const parallelPickers = type.setupSteps.filter(
      (step) =>
        step.id !== "interviewer" &&
        /Interviewer|Avatar/.test(step.customComponent ?? ""),
    );

    check(
      `${mode.slug}: no parallel avatar/interviewer picker step`,
      parallelPickers.length === 0,
      parallelPickers.map((s) => s.customComponent).join(", "),
    );
  }
}

// --- 3c. Exactly one avatar-selection path live per type --------------------
{
  check(
    "page.tsx's auto-pick effect is gated by declaresInterviewerStep (or equivalent)",
    /declaresInterviewerStep/.test(pageSrc),
  );

  // The auto-pick effect's own guard must include the gate — not just the
  // name existing somewhere unrelated in the file.
  const autoPickGuardRe =
    /if\s*\(\s*!isPitch\s*\|\|\s*declaresInterviewerStep\s*\|\|\s*selectedInterviewer\s*\)\s*return;/;

  check(
    "the auto-pick effect's guard checks !isPitch || declaresInterviewerStep || selectedInterviewer",
    autoPickGuardRe.test(pageSrc),
  );

  const elevatorType = getEngineType("pitch-elevator")!;

  check(
    "pitch-elevator declares NO interviewer step (its auto-pick fallback stays reachable)",
    !elevatorType.setupSteps.some((step) => step.id === "interviewer"),
  );

  for (const mode of listDeckModes()) {
    const type = getEngineType(mode.slug)!;

    check(
      `${mode.slug}: declares an interviewer step (owns selection via InterviewerStep, not the auto-pick)`,
      type.setupSteps.some((step) => step.id === "interviewer"),
    );
  }
}

// --- 4. Exactly one camera-consent gate ------------------------------------
{
  const wizardSrc = stripComments(
    readFileSync(abs(...WIZARD_PATH.split("/")), "utf8"),
  );

  check(
    "SetupWizard.tsx references CameraConsentStep (the one consent gate)",
    /CameraConsentStep/.test(wizardSrc),
  );
  check(
    "page.tsx does NOT reference CameraConsentStep (no second consent gate)",
    !/CameraConsentStep/.test(pageSrc),
  );
}

// --- 5 & 6. Exactly one wizard route; no new page route added ---------------
{
  const allPageFiles = walkFiles(abs("app", "practice"))
    .filter((f) => f.endsWith("page.tsx"))
    .map((f) => rel(f))
    .sort();

  const expected = [
    "app/practice/[type]/[instanceId]/page.tsx",
    "app/practice/[type]/page.tsx",
    "app/practice/[type]/report/[reportId]/page.tsx",
    "app/practice/pitches/page.tsx",
  ].sort();

  check(
    "exactly one app/practice/[type]/page.tsx and no new page route under app/practice",
    JSON.stringify(allPageFiles) === JSON.stringify(expected),
    `found: ${allPageFiles.join(", ")}`,
  );

  const pitchModeDirs = walkFiles(abs("app", "practice")).filter((f) =>
    /app[\\/]practice[\\/]pitch-(deck|funding|product|talk|general|elevator)[\\/]/.test(
      f,
    ),
  );

  check(
    "no app/practice/pitch-*/page.tsx per-mode wizard route exists",
    pitchModeDirs.length === 0,
    pitchModeDirs.map((f) => rel(f)).join(", "),
  );
}

// --- 7. Negotiation data is conditional on the mode -------------------------
{
  const lines = pageSrcRaw.split("\n");
  const askPriceLineIdx = lines
    .map((l, i) => (/askPriceUsd:/.test(l) ? i : -1))
    .filter((i) => i >= 0);
  const WINDOW = 4;
  const unconditional = askPriceLineIdx.filter((i) => {
    const windowLines = lines
      .slice(Math.max(0, i - WINDOW), i + 1)
      .join("\n");

    return !/negotiates/.test(windowLines);
  });

  // askPriceUsd: appears on more than one assignment line (shell + launch
  // payload); every one of those must be inside a block that ALSO mentions
  // `negotiates` within a few lines above it, proving the field is gated on
  // the mode, never assigned unconditionally.
  check(
    "every askPriceUsd: assignment in page.tsx sits inside a `deckMode.negotiates`-gated block",
    askPriceLineIdx.length > 0 && unconditional.length === 0,
    unconditional.map((i) => `line ${i + 1}: ${lines[i].trim()}`).join(" | "),
  );
}

console.log(`\nverify-deck-wizard-generic: ALL PASS\n`);
