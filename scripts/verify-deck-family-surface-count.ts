/**
 * Phase 19 plan 19-10: prove the four new deck-led pitch modes
 * (pitch-funding / pitch-product / pitch-talk / pitch-general) shipped as
 * config + prompts riding Phase 14's ONE deck capability — not as per-mode
 * engine modules, routes, evaluators or report pages — and that the
 * investor `pitch-deck` joins them with no surviving per-type surface
 * either (REQ-93, REQ-87, REQ-88, REQ-91, REQ-92, P19-SC5).
 *
 * Style mirrors scripts/verify-pitch-surface-count.ts (Phase 14),
 * scripts/verify-dc-surface-count.ts (Phase 17) and
 * scripts/verify-networking-surface-count.ts (Phase 16).
 *
 * HONESTY REQUIREMENT (19-CONTEXT.md / this plan's objective): Phase 19 did
 * NOT touch zero production surfaces. It made one deliberate, mode-agnostic
 * WIDENING of shared plumbing (plan 19-02) and added four entries to
 * `ENGINE_TYPES` (plans 19-04/19-05). The widened files are:
 *
 *   - lib/engine/types.ts        (pitch-deck InstanceConfig member's
 *                                  negotiation fields made optional; new
 *                                  optional `modeInputs?: DeckModeInputs`)
 *   - lib/engine/session.ts       (mode-aware band injection / stripping;
 *                                  pitchSnapshotFromInstance exported)
 *   - lib/engine/evaluation-runner.ts (instanceFromPitchSnapshot exported,
 *                                  reconstructs without an ask)
 *   - lib/engine/registry.ts      (ENGINE_TYPES gains four array entries)
 *   - app/api/interaction/chat/route.ts (resolveDeckFairValueBand call-site
 *                                  signature follow-up, plan 19-02)
 *
 * This script does NOT pretend those edits did not happen. It asserts the
 * STRONGER, checkable claim the plan actually requires: no engine module,
 * route, evaluator or report page contains any NEW mode's literal slug or a
 * mode-specific branch (`typeSlug === "pitch-..."` / `slug === "pitch-..."`)
 * for ANY of the five deck modes — the widening above is mode-AGNOSTIC
 * plumbing, not a per-mode branch. `lib/engine/registry.ts` is the ONE
 * sanctioned exception (an array entry, not a branch — REQ-60) and is
 * itself asserted to contain no `===` comparison against any deck slug.
 *
 * Adding a mode is DATA: a TYPE record under lib/pitch/ plus one registry
 * array entry. Nothing else in the repo may need to change for a sixth
 * mode, and this script is the mechanical proof that nothing else did.
 *
 * Run: npx tsx scripts/verify-deck-family-surface-count.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { ENGINE_TYPES, getEngineType } from "../lib/engine/registry";
import { resolveSessionConfig } from "../lib/engine/resolve";
import {
  DECK_MODES,
  listDeckModes,
  type DeckModeSlug,
} from "../lib/pitch/deck-modes";
import { DECK_VISIBLE_CONTEXT } from "../lib/pitch/slides-channel";
import type { InstanceConfig, InteractionTypeConfig } from "../lib/engine/types";

const ROOT = resolve(__dirname, "..");

let failures = 0;

function fail(msg: string): never {
  console.log(`  FAIL ${msg}`);
  failures += 1;
  console.log(
    `\nverify-deck-family-surface-count: FAILED (${failures} failure(s))\n`,
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
  return relative(ROOT, p);
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

/** Synthetic instance factory, one per deck mode, mirroring the shapes
 * verify-pitch-types.ts / verify-report-structure.ts already fixture. */
function syntheticDeckInstance(slug: DeckModeSlug): InstanceConfig {
  const base = {
    kind: "pitch-deck" as const,
    deckId: `verify-family-${slug}`,
    slideCount: 5,
    slideTexts: ["S1", "S2", "S3", "S4", "S5"],
    proposedSeconds: 900,
  };
  switch (slug) {
    case "pitch-deck":
      return {
        ...base,
        askPriceUsd: 1_000_000,
        askEquityPct: 10,
        fairValueBand: {
          priceUsdMin: 800_000,
          priceUsdMax: 1_200_000,
          equityPctMin: 8,
          equityPctMax: 12,
        },
      };
    case "pitch-funding":
      return {
        ...base,
        modeInputs: {
          mode: "pitch-funding",
          requestedAmountUsd: 50_000,
          useOfFunds: "Six months of runway for a pilot cohort.",
        },
      };
    case "pitch-product":
      return {
        ...base,
        modeInputs: {
          mode: "pitch-product",
          buyerProfile: "VP of Ops at a mid-market SaaS co",
        },
      };
    case "pitch-talk":
      return {
        ...base,
        modeInputs: {
          mode: "pitch-talk",
          talkAudience: "A campus sustainability conference",
          talkTakeaway: "Reuse beats recycling for carbon payback.",
        },
      };
    case "pitch-general":
      return { ...base };
  }
}

function instanceForType(type: InteractionTypeConfig): InstanceConfig | null {
  if (!type.instance.required) return null;
  const deckSlugs: DeckModeSlug[] = [
    "pitch-deck",
    "pitch-funding",
    "pitch-product",
    "pitch-talk",
    "pitch-general",
  ];
  if ((deckSlugs as string[]).includes(type.slug)) {
    return syntheticDeckInstance(type.slug as DeckModeSlug);
  }
  if (type.slug === "pitch-elevator") {
    return {
      kind: "pitch-elevator",
      pitchSubject: "A campus sustainability startup seeking a pilot partner.",
      listenerKnowledge: "full-profile",
    };
  }
  if (type.slug === "difficult-conversation") {
    return {
      kind: "difficult-conversation",
      conversationId: "confront-low-performer",
      source: "seeded",
      role: "Dana, your direct report",
      studentRole: "their manager",
      situation:
        "A performance conversation about missed deadlines and unclear ownership.",
      sharedBackstory:
        "Two prior check-ins documented the same delivery gaps; the project is at risk.",
      hiddenPosition:
        "They believe the handoff process is broken and will not own the whole slip.",
      studentObjective: "Get a written commitment to a checkpoint plan this week.",
      stakes: "If this fails, the work escalates to HR and the release slips again.",
      difficulty: "guarded",
      avatarId: "avatar-test",
      voiceId: "voice-test",
    };
  }
  // Fallback: case-study.
  return {
    kind: "case-study",
    caseId: "test-case-id",
    caseName: "Test Case",
    background: "A background long enough to pass the author minimum bar.",
    avatars: [
      { name: "Alex", role: "VP of Sales", additionalInfo: "secret briefing" },
    ],
    criteria: "Grade on whether the student stays calm.",
  };
}

const ALL_DECK_SLUGS: DeckModeSlug[] = [
  "pitch-deck",
  "pitch-funding",
  "pitch-product",
  "pitch-talk",
  "pitch-general",
];
const NEW_DECK_SLUGS: DeckModeSlug[] = [
  "pitch-funding",
  "pitch-product",
  "pitch-talk",
  "pitch-general",
];

// ---------------------------------------------------------------------------
console.log(
  "\n1. Every deck mode is a registered config record; nothing else broke",
);
{
  const slugs = ENGINE_TYPES.map((t) => t.slug);
  console.log(`  ENGINE_TYPES count=${slugs.length} slugs=[${slugs.join(", ")}]`);

  for (const slug of ALL_DECK_SLUGS) {
    check(`ENGINE_TYPES includes "${slug}"`, slugs.includes(slug));
    const type = getEngineType(slug);
    const arrayEntry = ENGINE_TYPES.find((t) => t.slug === slug);
    check(
      `getEngineType("${slug}") === the ENGINE_TYPES array entry (same identity)`,
      !!type && type === arrayEntry,
    );
  }
  // Do NOT hardcode ENGINE_TYPES.length (parallel phases add types).
  check(
    `ENGINE_TYPES has at least ${ALL_DECK_SLUGS.length + 1} entries (found ${slugs.length})`,
    slugs.length >= ALL_DECK_SLUGS.length + 1,
  );

  for (const slug of ALL_DECK_SLUGS) {
    const resolved = resolveSessionConfig(slug, {
      instance: syntheticDeckInstance(slug),
    });
    check(
      `resolveSessionConfig("${slug}") with one synthetic pitch-deck instance succeeds`,
      resolved.ok === true,
      !resolved.ok ? resolved.reason : undefined,
    );
  }

  // Adding four modes broke nothing else — every registered type resolves.
  for (const type of ENGINE_TYPES) {
    const resolved = resolveSessionConfig(type.slug, {
      instance: instanceForType(type),
    });
    check(
      `${type.slug}: still resolves after the four deck modes were added`,
      resolved.ok === true,
      !resolved.ok ? resolved.reason : undefined,
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n2. One deck capability, not five copies (REQ-88)");
{
  const resolvedBySlug = new Map<
    DeckModeSlug,
    ReturnType<typeof resolveSessionConfig>
  >();
  for (const slug of ALL_DECK_SLUGS) {
    resolvedBySlug.set(
      slug,
      resolveSessionConfig(slug, { instance: syntheticDeckInstance(slug) }),
    );
  }

  // 2.1 — same visibleContext object identity for all five.
  const identities = ALL_DECK_SLUGS.map((slug) => {
    const r = resolvedBySlug.get(slug)!;
    if (!r.ok) fail(`resolve ${slug} failed: ${r.reason}`);
    return r.ok ? r.config.visibleContext : null;
  });
  check(
    "all five resolved configs share DECK_VISIBLE_CONTEXT identity",
    identities.every((v) => v === DECK_VISIBLE_CONTEXT),
  );

  // 2.2 — one InstanceConfig kind for all five; no second deck-ish kind
  // literal in lib/engine/types.ts.
  const typesSrc = readFileSync(abs("lib/engine/types.ts"), "utf8");
  const deckKindMatches = typesSrc.match(/kind:\s*["']pitch-deck["']/g) ?? [];
  check(
    'lib/engine/types.ts declares exactly one `kind: "pitch-deck"` InstanceConfig member',
    deckKindMatches.length === 1,
    `found ${deckKindMatches.length}`,
  );
  const secondDeckKind = /kind:\s*["']pitch-deck-[^"']*["']/.test(typesSrc);
  check(
    "lib/engine/types.ts declares no second deck-ish kind literal",
    !secondDeckKind,
  );

  // 2.3 — exactly one slide-reveal ratchet, one visible-context gating
  // primitive (Phase 14 §11, reasserted now that four more modes existed).
  const roots = [
    abs("lib/pitch"),
    abs("lib/engine"),
    abs("app/api/interaction/chat/route.ts"),
  ];
  function walk(path: string, out: string[]) {
    const st = statSync(path);
    if (st.isFile()) {
      if (path.endsWith(".ts") || path.endsWith(".tsx")) out.push(path);
      return;
    }
    for (const name of readdirSync(path)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(join(path, name), out);
    }
  }
  const files: string[] = [];
  for (const root of roots) if (existsSync(root)) walk(root, files);

  const ratchetSig = /Math\.max\([\s\S]{0,120}stored\s*\?\?\s*-1/;
  const ratchetFiles = files.filter((f) => ratchetSig.test(readFileSync(f, "utf8")));
  check(
    "ratchet Math.max(stored ?? -1) only in slide-reveal.ts",
    ratchetFiles.length === 1 && ratchetFiles[0]!.endsWith("lib/pitch/slide-reveal.ts"),
    JSON.stringify(ratchetFiles.map(rel)),
  );

  const leakFilter = files.filter((f) => {
    if (f.endsWith("lib/engine/visible-context.ts")) return false;
    const text = readFileSync(f, "utf8");
    if (
      /SLIDES_CHANNEL_KEY[\s\S]{0,200}\.slice\s*\(/.test(text) ||
      /buildSlidesChannel[\s\S]{0,200}\.slice\s*\(/.test(text)
    ) {
      return true;
    }
    if (/slideTexts\s*\.\s*(slice|filter)\s*\(/.test(text)) return true;
    return false;
  });
  check("no slides-channel filter outside visible-context.ts", leakFilter.length === 0);

  // 2.4 — exactly THREE deck API routes, the same three Phase 14 shipped.
  const expectedRoutes = new Set([
    "app/api/practice/deck/upload/route.ts",
    "app/api/practice/deck/[deckId]/route.ts",
    "app/api/practice/deck/[deckId]/slide/[index]/route.ts",
  ]);
  const foundRoutes = walkFiles(abs("app/api/practice/deck"))
    .filter((f) => /[/\\]route\.ts$/.test(f))
    .map((f) => rel(f).replace(/\\/g, "/"));
  const foundSet = new Set(foundRoutes);
  const missing = [...expectedRoutes].filter((p) => !foundSet.has(p));
  const extra = foundRoutes.filter((p) => !expectedRoutes.has(p));
  check(
    `exactly 3 deck API routes, unchanged by adding four modes (found ${foundRoutes.length})`,
    foundRoutes.length === 3 && missing.length === 0 && extra.length === 0,
    `missing=[${missing.join(", ")}] extra=[${extra.join(", ")}]`,
  );

  // 2.5 — one evaluator runner, one evaluation-prompt-assembly path for all
  // five modes: each mode's prompts.evaluatorPrompt is its own string, and
  // no per-mode evaluator module file exists.
  for (const slug of ALL_DECK_SLUGS) {
    const type = getEngineType(slug);
    check(
      `${slug}: prompts.evaluatorPrompt is a string on its own type record`,
      typeof type?.prompts.evaluatorPrompt === "string" &&
        type.prompts.evaluatorPrompt.length > 0,
    );
  }
  const allFiles = [...walkFiles(abs("lib"))].map((f) => rel(f).replace(/\\/g, "/"));
  const perModeEvaluatorModules = allFiles.filter(
    (p) => /\/pitch-evaluation/i.test(p) || /\/deck-evaluation/i.test(p),
  );
  check(
    "no lib/*/pitch-evaluation* or lib/*/deck-evaluation* module file exists",
    perModeEvaluatorModules.length === 0,
    perModeEvaluatorModules.join(", "),
  );

  const runners = allFiles.filter((f) => f.endsWith("evaluation-runner.ts"));
  check(
    `exactly 1 evaluation-runner.ts under lib/ (found ${runners.length})`,
    runners.length === 1,
    runners.join(", "),
  );

  // 2.6 — every non-investor mode's buildEvaluationImages resolves to the
  // SAME function identity as the investor mode's.
  const investorType = getEngineType("pitch-deck");
  const investorImages = investorType?.prompts.buildEvaluationImages;
  check(
    "pitch-deck declares buildEvaluationImages",
    typeof investorImages === "function",
  );
  for (const slug of NEW_DECK_SLUGS) {
    const type = getEngineType(slug);
    check(
      `${slug}: buildEvaluationImages is the SAME function identity as pitch-deck's (reused, not cloned)`,
      !!type && type.prompts.buildEvaluationImages === investorImages,
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n3. No per-mode surface exists (REQ-91, REQ-93)");
{
  const forbiddenGlobs: Array<{
    label: string;
    test: (relPath: string) => boolean;
  }> = [
    {
      label: "app/practice/(pitch-funding|pitch-product|pitch-talk|pitch-general)/page.tsx",
      test: (p) =>
        /^app\/practice\/pitch-(funding|product|talk|general)\/page\.tsx$/.test(p),
    },
    {
      label: "app/practice/*/report/* containing a new mode name",
      test: (p) =>
        /^app\/practice\/[^/]+\/report\//.test(p) &&
        /(funding|product|talk|general)/i.test(p),
    },
    {
      label: "app/api/**/route.ts whose path mentions a new mode name",
      test: (p) =>
        /^app\/api\//.test(p) &&
        /route\.ts$/.test(p) &&
        /(pitch-funding|pitch-product|pitch-talk|pitch-general)/i.test(p),
    },
    {
      label: "lib/*/funding-evaluation* (per-mode evaluator module)",
      test: (p) => /^lib\/[^/]+\/funding-evaluation/.test(p),
    },
    {
      label: "lib/*/talk-evaluation* (per-mode evaluator module)",
      test: (p) => /^lib\/[^/]+\/talk-evaluation/.test(p),
    },
    {
      label: "lib/*/*-evaluator.ts for any new mode",
      test: (p) =>
        /^lib\/[^/]+\/(funding|product|talk|general)-evaluator\.ts$/.test(p),
    },
    {
      label: "components/**/*(Funding|Product|Talk|GeneralDeck)SessionShell*",
      test: (p) =>
        /components\/.*(Funding|Product|Talk|GeneralDeck)SessionShell/.test(p),
    },
  ];

  const all = [
    ...walkFiles(abs("app")),
    ...walkFiles(abs("lib")),
    ...walkFiles(abs("components")),
  ].map((f) => rel(f).replace(/\\/g, "/"));

  for (const g of forbiddenGlobs) {
    const hits = all.filter((p) => g.test(p));
    check(`no ${g.label}`, hits.length === 0, hits.join(", "));
  }

  // REQ-91: one wizard, one gate — no second SetupWizard, no second
  // CameraConsentStep, no component whose name has both a mode name and
  // "Consent".
  const wizards = all.filter((p) => /SetupWizard\.tsx$/.test(p));
  check(`exactly 1 SetupWizard (found ${wizards.length})`, wizards.length === 1, wizards.join(", "));

  const consentSteps = all.filter((p) => /CameraConsentStep\.tsx$/.test(p));
  check(
    `exactly 1 CameraConsentStep (found ${consentSteps.length})`,
    consentSteps.length === 1,
    consentSteps.join(", "),
  );

  const modeConsentComponents = all.filter((p) => {
    const base = p.split("/").pop() ?? "";
    return (
      /Consent/.test(base) &&
      /(Deck|Funding|Product|Talk|General|Elevator|Pitch)/i.test(base) &&
      base !== "CameraConsentStep.tsx"
    );
  });
  check(
    "no component name contains both a mode name and Consent",
    modeConsentComponents.length === 0,
    modeConsentComponents.join(", "),
  );
}

// ---------------------------------------------------------------------------
console.log(
  "\n4. No mode-specific branch in the engine, the routes, or the report page (REQ-93)",
);
{
  const scanDirs = ["lib/engine", "app/api", "app/practice/[type]/report"];
  const deckSlugPattern = "pitch-(?:deck|funding|product|talk|general)";
  const branchRe = new RegExp(
    `(?:typeSlug|slug)\\s*===\\s*["']${deckSlugPattern}["']|["']${deckSlugPattern}["']\\s*===\\s*(?:typeSlug|slug|\\w+\\.slug|\\w+\\.typeSlug)`,
  );
  const literalRe = new RegExp(`["']${deckSlugPattern}["']`);

  const hitsBranch: string[] = [];
  const hitsLiteral: string[] = [];
  for (const dir of scanDirs) {
    if (!existsSync(abs(...dir.split("/")))) continue;
    for (const f of walkFiles(abs(...dir.split("/")))) {
      if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
      const r = rel(f).replace(/\\/g, "/");
      const isRegistry = r === "lib/engine/registry.ts";
      const src = stripComments(readFileSync(f, "utf8"));
      if (branchRe.test(src)) hitsBranch.push(r);
      // The four NEW slugs may never appear anywhere in these dirs, not
      // even in registry.ts (which only imports the TYPE records — it
      // never writes the slug string literal itself). pitch-deck is
      // pre-existing (14-xx) and exempt from the literal scan outside
      // registry.ts's own array-entry mechanism check below.
      const newSlugLiteral =
        /["']pitch-(?:funding|product|talk|general)["']/.test(src);
      if (newSlugLiteral && !isRegistry) hitsLiteral.push(r);
    }
  }
  check(
    "no typeSlug/slug === pitch-<deck-mode> comparison under lib/engine, app/api or the report page",
    hitsBranch.length === 0,
    hitsBranch.join(", "),
  );
  check(
    "no NEW deck-mode slug literal anywhere under lib/engine, app/api or the report page (registry.ts exempted below)",
    hitsLiteral.length === 0,
    hitsLiteral.join(", "),
  );

  // registry.ts: the ONE permitted exception. It may contain the slugs
  // only via its imported TYPE records (array entries), never via a `===`
  // comparison against any deck slug.
  const registrySrc = stripComments(
    readFileSync(abs("lib/engine/registry.ts"), "utf8"),
  );
  const registryHasEquality = ALL_DECK_SLUGS.some((slug) =>
    new RegExp(
      `["']${slug}["']\\s*===|===\\s*["']${slug}["']`,
    ).test(registrySrc),
  );
  check(
    "lib/engine/registry.ts contains no === comparison against any deck slug (array entry only, REQ-60)",
    !registryHasEquality,
  );
}

// ---------------------------------------------------------------------------
console.log("\n5. The permitted .tsx surface list is exact");
{
  // "pitch-deck" is a DOUBLE-DUTY literal (19-02's deliberate widening):
  // it is both the investor mode's ENGINE_TYPES slug AND the ONE shared
  // InstanceConfig `kind` discriminant for ALL FIVE deck modes (REQ-88) —
  // a session running pitch-funding still constructs `{ kind: "pitch-deck",
  // ... }` because there is deliberately no second kind. Using the kind
  // discriminant is not "naming a mode" (it names the SAME value no matter
  // which of the five modes is active) and must not be confused with a
  // per-mode slug branch, which Section 4 already proves absent. Strip the
  // kind-discriminant usages before scanning for genuine slug mentions.
  const kindDiscriminantRe =
    /\bkind\s*[:=!]{1,3}\s*["']pitch-deck["']|["']pitch-deck["']\s*[:=!]{1,3}\s*[\w.]*\.kind\b/g;

  const typeAwareTsx = [...walkFiles(abs("app")), ...walkFiles(abs("components"))]
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({
      file: rel(f).replace(/\\/g, "/"),
      src: stripComments(readFileSync(f, "utf8")).replace(kindDiscriminantRe, ""),
    }))
    .filter(({ src }) =>
      ALL_DECK_SLUGS.some((slug) => new RegExp(`["']${slug}["']`).test(src)),
    )
    .map(({ file }) => file);

  const allowedPrefixes = [
    "lib/pitch/",
    "components/practice/steps/",
    "components/practice/panels/",
    "components/practice/report/",
  ];
  const permittedExact = new Set([
    "components/practice/ReportChrome.tsx",
    "app/reports/page.tsx",
  ]);

  const unexpectedTsx = typeAwareTsx.filter(
    (f) =>
      !permittedExact.has(f) && !allowedPrefixes.some((prefix) => f.startsWith(prefix)),
  );
  check(
    `only the permitted .tsx files mention a deck-mode slug (found=${typeAwareTsx.join(", ") || "none"})`,
    unexpectedTsx.length === 0,
    `unexpected=${unexpectedTsx.join(", ")}`,
  );
  for (const p of permittedExact) {
    check(`permitted surface present: ${p}`, existsSync(abs(...p.split("/"))));
  }

  // Strictly stronger than Phase 14: after 19-07/19-08 these two files read
  // the mode table instead of naming any mode and must NOT be in the set.
  check(
    "app/practice/[type]/page.tsx is NO LONGER in the mode-slug-mentioning set",
    !typeAwareTsx.includes("app/practice/[type]/page.tsx"),
  );
  check(
    "app/practice/pitches/page.tsx is NO LONGER in the mode-slug-mentioning set",
    !typeAwareTsx.includes("app/practice/pitches/page.tsx"),
  );
  check(
    "app/practice/[type]/page.tsx still exists",
    existsSync(abs("app/practice/[type]/page.tsx")),
  );
  check(
    "app/practice/pitches/page.tsx still exists",
    existsSync(abs("app/practice/pitches/page.tsx")),
  );
}

// ---------------------------------------------------------------------------
console.log("\n6. Adding a mode is data");
{
  const libFiles = walkFiles(abs("lib")).map((f) => rel(f).replace(/\\/g, "/"));
  const nameWordFor: Record<string, string> = {
    "pitch-funding": "funding",
    "pitch-product": "product",
    "pitch-talk": "talk",
    "pitch-general": "general",
  };

  for (const slug of NEW_DECK_SLUGS) {
    const word = nameWordFor[slug]!;
    const expectedType = `lib/pitch/${word === "general" ? "general-deck" : word}-type.ts`;
    const expectedPrompts = `lib/pitch/${word === "general" ? "general-deck" : word}-prompts.ts`;
    check(`${slug}: owns ${expectedType}`, existsSync(abs(...expectedType.split("/"))));
    check(
      `${slug}: owns ${expectedPrompts}`,
      existsSync(abs(...expectedPrompts.split("/"))),
    );

    const bearingName = libFiles.filter(
      (f) =>
        f.toLowerCase().includes(word) &&
        f !== expectedType &&
        f !== expectedPrompts,
    );
    check(
      `${slug}: nothing else under lib/ bears "${word}" in its path`,
      bearingName.length === 0,
      bearingName.join(", "),
    );

    const mode = DECK_MODES[slug];
    const owned = [expectedType, expectedPrompts];
    console.log(
      `  -> ${slug} owns: ${owned.join(", ")} (card: "${mode.cardTitle}")`,
    );
  }

  const modeRows = Object.keys(DECK_MODES);
  check(`lib/pitch/deck-modes.ts's DECK_MODES has exactly 5 rows (found ${modeRows.length})`, modeRows.length === 5, modeRows.join(", "));
  check(
    "listDeckModes() returns exactly 5 modes",
    listDeckModes().length === 5,
  );
}

// ---------------------------------------------------------------------------
console.log(
  "\n7. Walk-out stays off for every deck mode (independent of verify-disengagement-termination.ts)",
);
{
  for (const slug of ALL_DECK_SLUGS) {
    const type = getEngineType(slug);
    check(
      `${slug}: terminationPolicy.disengagementThreshold == null`,
      !!type && type.terminationPolicy.disengagementThreshold == null,
    );
    check(
      `${slug}: terminationPolicy.avatarMayEnd === false`,
      !!type && type.terminationPolicy.avatarMayEnd === false,
    );
  }

  const elevator = getEngineType("pitch-elevator");
  check(
    "pitch-elevator's disengagementThreshold is still a finite number",
    !!elevator &&
      typeof elevator.terminationPolicy.disengagementThreshold === "number" &&
      Number.isFinite(elevator.terminationPolicy.disengagementThreshold),
  );
}

console.log("\nverify-deck-family-surface-count: ALL CHECKS PASSED\n");
process.exit(0);
