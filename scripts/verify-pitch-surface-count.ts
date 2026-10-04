/**
 * Phase 14 plan 14-15: prove pitch-elevator + pitch-deck shipped as engine
 * config + prompts on Phase 13's one engine — not as per-type surfaces — and
 * that CONTEXT.md prohibitions stay absent.
 *
 * Style mirrors scripts/verify-engine-surface-count.ts,
 * scripts/verify-networking-surface-count.ts, and
 * scripts/verify-dc-surface-count.ts.
 *
 * Adaptation (parallel Phases 15/16): do NOT hardcode ENGINE_TYPES.length === 7.
 * Assert the two pitch slugs are present and every registered type resolves.
 *
 * Run: npx tsx scripts/verify-pitch-surface-count.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import {
  ENGINE_TYPES,
  getEngineType,
} from "../lib/engine/registry";
import { resolveSessionConfig } from "../lib/engine/resolve";
import { buildRubricJsonSchema } from "../lib/engine/rubric";
import type {
  InstanceConfig,
  InteractionTypeConfig,
} from "../lib/engine/types";

const SYNTHETIC_CASE_STUDY: InstanceConfig = {
  kind: "case-study",
  caseId: "test-case-id",
  caseName: "Test Case",
  background: "A background long enough to pass the author minimum bar.",
  avatars: [
    { name: "Alex", role: "VP of Sales", additionalInfo: "secret briefing" },
  ],
  criteria: "Grade on whether the student stays calm.",
};

const SYNTHETIC_ELEVATOR: InstanceConfig = {
  kind: "pitch-elevator",
  pitchSubject: "A campus sustainability startup seeking a pilot partner.",
  listenerKnowledge: "full-profile",
};

const SYNTHETIC_DECK: InstanceConfig = {
  kind: "pitch-deck",
  deckId: "verify-surface-deck",
  slideCount: 5,
  slideTexts: ["S1", "S2", "S3", "S4", "S5"],
  askPriceUsd: 1_000_000,
  askEquityPct: 10,
  fairValueBand: {
    priceUsdMin: 800_000,
    priceUsdMax: 1_200_000,
    equityPctMin: 8,
    equityPctMax: 12,
  },
  proposedSeconds: 1500,
};

function instanceForType(type: InteractionTypeConfig): InstanceConfig | null {
  if (!type.instance.required) return null;
  if (type.slug === "pitch-elevator") return SYNTHETIC_ELEVATOR;
  if (type.slug === "pitch-deck") return SYNTHETIC_DECK;
  if (type.slug === "networking") {
    return {
      kind: "networking-persona",
      personaId: "test-persona",
      ownerId: "test-owner",
      displayName: "Test Person",
      persona: "A senior engineer who values concise asks.",
      source: "generated",
      avatarId: "avatar-test",
      voiceId: "voice-test",
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
  return SYNTHETIC_CASE_STUDY;
}

const ROOT = resolve(__dirname, "..");

let failures = 0;

function fail(msg: string): never {
  console.log(`  FAIL ${msg}`);
  failures += 1;
  console.log(
    `\nverify-pitch-surface-count: FAILED (${failures} failure(s))\n`,
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

function read(relPath: string): string {
  return readFileSync(abs(...relPath.split("/")), "utf8");
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function assertExactlyOneFile(label: string, expectedRel: string) {
  if (!existsSync(abs(...expectedRel.split("/")))) {
    fail(`${label}: expected file missing: ${expectedRel}`);
  }
  ok(`${label}: ${expectedRel}`);
}

function codeFilesUnder(...roots: string[]): string[] {
  const out: string[] = [];
  for (const root of roots) {
    if (!existsSync(abs(...root.split("/")))) continue;
    for (const f of walkFiles(abs(...root.split("/")))) {
      if (f.endsWith(".ts") || f.endsWith(".tsx")) out.push(f);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
console.log(
  "\n1. Seven+ types, one registry — pitch types included; every entry resolves",
);
{
  const slugs = ENGINE_TYPES.map((t) => t.slug);
  console.log(
    `  ENGINE_TYPES count=${slugs.length} slugs=[${slugs.join(", ")}]`,
  );
  // Parallel Phases 15/16 already registered types; assert membership, not === 7.
  check(
    'ENGINE_TYPES includes "pitch-elevator"',
    slugs.includes("pitch-elevator"),
  );
  check('ENGINE_TYPES includes "pitch-deck"', slugs.includes("pitch-deck"));
  check(
    `ENGINE_TYPES has at least 7 entries (found ${slugs.length})`,
    slugs.length >= 7,
  );

  for (const type of ENGINE_TYPES) {
    const looked = getEngineType(type.slug);
    check(`getEngineType("${type.slug}") hits registry`, looked === type);

    const resolved = resolveSessionConfig(type.slug, {
      instance: instanceForType(type),
    });
    if (!resolved.ok) {
      fail(`resolveSessionConfig("${type.slug}") failed: ${resolved.reason}`);
    }
    const dims = resolved.config.rubricDimensions.map((d) => d.key);
    check(
      `${type.slug}: resolves with visual + vocal`,
      dims.includes("visual") && dims.includes("vocal"),
      `dims=[${dims.join(", ")}]`,
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n2. One of each engine surface, still");
{
  const expected = [
    ["session-start", "app/api/practice/session/start/route.ts"],
    ["checkpoint", "app/api/practice/session/checkpoint/route.ts"],
    ["finish", "app/api/practice/session/finish/route.ts"],
    ["chat", "app/api/interaction/chat/route.ts"],
    ["report-GET", "app/api/practice/report/[reportId]/route.ts"],
    ["reports-list", "app/api/practice/reports/route.ts"],
    ["evaluator", "lib/engine/evaluation.ts"],
    ["evaluation runner", "lib/engine/evaluation-runner.ts"],
    ["session shell", "components/practice/PracticeSessionShell.tsx"],
    ["setup wizard", "components/practice/SetupWizard.tsx"],
    ["report page", "app/practice/[type]/report/[reportId]/page.tsx"],
  ] as const;

  for (const [label, path] of expected) {
    assertExactlyOneFile(label, path);
  }

  const sessionRoutes = walkFiles(abs("app/api")).filter((f) =>
    /[/\\]session[/\\](start|checkpoint|finish)[/\\]route\.ts$/.test(f),
  );
  check(
    `exactly 3 session lifecycle routes (found ${sessionRoutes.length})`,
    sessionRoutes.length === 3,
    sessionRoutes.map(rel).join(", "),
  );

  const shells = walkFiles(abs("components")).filter((f) =>
    /SessionShell\.tsx$/.test(f),
  );
  check(
    `exactly 1 SessionShell (found ${shells.length})`,
    shells.length === 1,
    shells.map(rel).join(", "),
  );

  const reportPages = walkFiles(abs("app")).filter((f) =>
    /[/\\]report[/\\]\[[^\]]+\][/\\]page\.tsx$/.test(f),
  );
  check(
    `exactly 1 report page (found ${reportPages.length})`,
    reportPages.length === 1,
    reportPages.map(rel).join(", "),
  );

  const wizards = walkFiles(abs("components")).filter((f) =>
    /SetupWizard\.tsx$/.test(f),
  );
  check(
    `exactly 1 SetupWizard (found ${wizards.length})`,
    wizards.length === 1,
    wizards.map(rel).join(", "),
  );

  const evaluators = walkFiles(abs("lib")).filter((f) =>
    /[/\\]evaluation\.ts$/.test(f),
  );
  check(
    `exactly 1 evaluation.ts under lib/ (found ${evaluators.length})`,
    evaluators.length === 1,
    evaluators.map(rel).join(", "),
  );

  const runners = walkFiles(abs("lib")).filter((f) =>
    f.endsWith("evaluation-runner.ts"),
  );
  check(
    `exactly 1 evaluation-runner.ts under lib/ (found ${runners.length})`,
    runners.length === 1,
    runners.map(rel).join(", "),
  );
}

// ---------------------------------------------------------------------------
console.log("\n3. No per-pitch-type surface");
{
  const forbiddenGlobs: Array<{
    label: string;
    test: (relPath: string) => boolean;
  }> = [
    {
      label: "app/practice/pitch-*/page.tsx",
      test: (p) => /^app\/practice\/pitch-[^/]+\/page\.tsx$/.test(p),
    },
    {
      label: "app/api/*/pitch*/ (non-deck)",
      test: (p) =>
        /^app\/api\/(?!practice\/deck\/)/.test(p) &&
        /\/pitch/i.test(p) &&
        /route\.ts$/.test(p),
    },
    {
      label: "lib/*/pitch-evaluation*",
      test: (p) => /^lib\/[^/]+\/pitch-evaluation/.test(p),
    },
    {
      label: "components/*/PitchSessionShell*",
      test: (p) => /components\/[^/]+\/PitchSessionShell/.test(p),
    },
    {
      label: "app/practice/*/report/*pitch*",
      test: (p) =>
        /^app\/practice\/[^/]+\/report\//.test(p) && /pitch/i.test(p),
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
}

// ---------------------------------------------------------------------------
console.log("\n4. Deck routes are the only new pitch API surface (exactly three)");
{
  const expected = new Set([
    "app/api/practice/deck/upload/route.ts",
    "app/api/practice/deck/[deckId]/route.ts",
    "app/api/practice/deck/[deckId]/slide/[index]/route.ts",
  ]);

  const found = walkFiles(abs("app/api/practice/deck"))
    .filter((f) => /[/\\]route\.ts$/.test(f))
    .map((f) => rel(f).replace(/\\/g, "/"));

  const foundSet = new Set(found);
  const missing = [...expected].filter((p) => !foundSet.has(p));
  const extra = found.filter((p) => !expected.has(p));

  check(
    `exactly 3 deck routes (found ${found.length})`,
    found.length === 3 && missing.length === 0 && extra.length === 0,
    `missing=[${missing.join(", ")}] extra=[${extra.join(", ")}]`,
  );
  for (const p of [...expected].sort()) ok(`route present: ${p}`);
}

// ---------------------------------------------------------------------------
console.log("\n5. No type-slug branching in the engine (pitch)");
{
  const scanDirs = [
    "lib/engine",
    "app/api/practice/session",
    "app/api/interaction",
  ];
  const pitchSlugBranchRe =
    /(?:typeSlug|slug)\s*===\s*["']pitch(?:-elevator|-deck)?["']|["']pitch(?:-elevator|-deck)?["']\s*===\s*(?:typeSlug|slug|\w+\.slug|\w+\.typeSlug)/;

  const hits: string[] = [];
  for (const dir of scanDirs) {
    if (!existsSync(abs(...dir.split("/")))) continue;
    for (const f of walkFiles(abs(...dir.split("/")))) {
      if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
      const r = rel(f).replace(/\\/g, "/");
      const src = stripComments(readFileSync(f, "utf8"));
      if (pitchSlugBranchRe.test(src)) hits.push(r);
    }
  }
  check(
    "no typeSlug/slug === pitch* under lib/engine or session/interaction APIs",
    hits.length === 0,
    hits.join(", "),
  );

  // Permitted type-aware .tsx surfaces for pitch registration / chrome / list filter.
  const typeAwareTsx = [
    ...walkFiles(abs("app")),
    ...walkFiles(abs("components")),
  ]
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({
      file: rel(f).replace(/\\/g, "/"),
      src: stripComments(readFileSync(f, "utf8")),
    }))
    .filter(
      ({ src }) =>
        /["']pitch-elevator["']/.test(src) || /["']pitch-deck["']/.test(src),
    )
    .map(({ file }) => file);

  const allowedPrefixes = [
    "lib/pitch/",
    "components/practice/steps/",
    "components/practice/panels/",
    "components/practice/report/",
  ];
  const permittedExact = new Set([
    "app/practice/[type]/page.tsx",
    "components/practice/ReportChrome.tsx",
    // Reports list groups the two pitch slugs under one filter tab — not a
    // second session/report surface. Parallel to networking/dc filter ids.
    "app/reports/page.tsx",
  ]);

  const unexpectedTsx = typeAwareTsx.filter(
    (f) =>
      !permittedExact.has(f) &&
      !allowedPrefixes.some((prefix) => f.startsWith(prefix)),
  );
  check(
    `only permitted .tsx files mention pitch slugs (found=${typeAwareTsx.join(", ") || "none"})`,
    unexpectedTsx.length === 0,
    `unexpected=${unexpectedTsx.join(", ")}`,
  );
  for (const p of permittedExact) {
    check(`permitted surface present: ${p}`, existsSync(abs(...p.split("/"))));
  }
}

// ---------------------------------------------------------------------------
console.log("\n6. One ratchet, one gating primitive (reassert 14-11 §11)");
{
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
  for (const root of roots) {
    if (existsSync(root)) walk(root, files);
  }

  const ratchetSig = /Math\.max\([\s\S]{0,120}stored\s*\?\?\s*-1/;
  const ratchetFiles = files.filter((f) =>
    ratchetSig.test(readFileSync(f, "utf8")),
  );
  check(
    "ratchet Math.max(stored ?? -1) only in slide-reveal.ts",
    ratchetFiles.length === 1 &&
      ratchetFiles[0]!.endsWith("lib/pitch/slide-reveal.ts"),
    JSON.stringify(ratchetFiles.map((f) => rel(f))),
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
  check(
    "no slides-channel filter outside visible-context.ts",
    leakFilter.length === 0,
    JSON.stringify(leakFilter.map((f) => rel(f))),
  );
}

// ---------------------------------------------------------------------------
console.log("\n7. No forbidden mechanism anywhere (excluding .planning/)");
{
  // Product code only — verify scripts name these identifiers when asserting absence
  // (same convention as verify-dc-surface-count.ts §7).
  const codeFiles = codeFilesUnder("lib", "app", "components");

  const patterns: Array<{ label: string; re: RegExp; allow?: (r: string) => boolean }> =
    [
      {
        label: "googleapis",
        re: /\bgoogleapis\b/,
      },
      {
        label: "drive.v3",
        re: /\bdrive\.v3\b/,
      },
      {
        label: "Drive OAuth scope string",
        re: /https:\/\/www\.googleapis\.com\/auth\/drive/,
      },
      {
        label: "engagementScore",
        re: /\bengagementScore\b/,
      },
      {
        label: "engagement_meter",
        re: /\bengagement_meter\b/,
      },
      {
        label: "engagement gauge component",
        re: /\bEngagement(?:Meter|Gauge)\b/,
      },
      {
        label: "hard turn cutoff onExpire",
        re: /\bonExpire\b/,
        allow: (r) =>
          // Soft timers / verify scripts assert absence of onExpire.
          /verify-/.test(r) || /PitchTimerPanel|DeckTimerPanel/.test(r),
      },
      {
        label: "forceFinish",
        re: /\bforceFinish\b/,
      },
      {
        label: "autoSubmitTurn",
        re: /\bautoSubmitTurn\b/,
      },
      {
        label: "skipDeck escape hatch",
        re: /\bskipDeck\b/,
      },
      {
        label: "start without a deck path",
        re: /start without a deck/i,
      },
    ];

  for (const p of patterns) {
    const hits: string[] = [];
    for (const f of codeFiles) {
      const r = rel(f).replace(/\\/g, "/");
      if (p.allow?.(r)) continue;
      const src = stripComments(readFileSync(f, "utf8"));
      if (p.re.test(src)) hits.push(r);
    }
    check(`no ${p.label}`, hits.length === 0, hits.join(", "));
  }
}

// ---------------------------------------------------------------------------
console.log("\n8. All ENGINE_TYPES schemas are valid (visual_score + vocal_score required)");
{
  for (const type of ENGINE_TYPES) {
    const resolved = resolveSessionConfig(type.slug, {
      instance: instanceForType(type),
    });
    if (!resolved.ok) {
      fail(`resolveSessionConfig("${type.slug}") failed: ${resolved.reason}`);
    }
    let schema: ReturnType<typeof buildRubricJsonSchema>;
    try {
      schema = buildRubricJsonSchema(resolved.config);
    } catch (err) {
      fail(
        `buildRubricJsonSchema("${type.slug}") threw: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    const required = Array.isArray(schema.schema.required)
      ? schema.schema.required
      : [];
    check(
      `${type.slug}: visual_score + vocal_score in required[]`,
      required.includes("visual_score") && required.includes("vocal_score"),
      `required=[${required.join(", ")}]`,
    );
  }
}

console.log("\nverify-pitch-surface-count: ALL CHECKS PASSED\n");
process.exit(0);
