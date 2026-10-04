/**
 * Phase 15 plan 15-11: prove difficult-conversation shipped as config +
 * prompts on Phase 13's one engine — not as per-type session/report surfaces —
 * and that CONTEXT.md deferred items stay absent.
 *
 * Style mirrors scripts/verify-engine-surface-count.ts and
 * scripts/verify-networking-surface-count.ts. Do not hardcode a global
 * ENGINE_TYPES count (Phases 13–16 each add types in execution order).
 *
 * Run: npx tsx scripts/verify-dc-surface-count.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { SEEDED_CONVERSATIONS } from "../lib/difficult-conversation/seeded";
import {
  ENGINE_TYPES,
  getEngineType,
} from "../lib/engine/registry";
import { resolveSessionConfig } from "../lib/engine/resolve";
import { buildRubricJsonSchema } from "../lib/engine/rubric";
import type {
  DifficultConversationInstance,
  InstanceConfig,
  InteractionTypeConfig,
} from "../lib/engine/types";

/** Same stub pattern as scripts/verify-engine-config.ts — kind is not checked. */
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

const SYNTHETIC_DC: DifficultConversationInstance = {
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

function instanceForType(type: InteractionTypeConfig): InstanceConfig | null {
  if (!type.instance.required) return null;
  if (type.slug === "difficult-conversation") return SYNTHETIC_DC;
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
  if (type.slug === "pitch-elevator" || type.slug === "pitch-deck") {
    return {
      kind: "pitch-elevator",
      pitchSubject: "A campus sustainability startup seeking a pilot partner.",
      listenerKnowledge: "name-role",
    };
  }
  return SYNTHETIC_CASE_STUDY;
}

/** Exact seeded id list recorded in 15-04-SUMMARY.md — rename would orphan reports. */
const EXPECTED_SEEDED_IDS = [
  "confront-low-performer",
  "fire-team-member",
  "ask-for-raise",
  "challenge-grade",
  "deliver-bad-news-client",
  "peer-conflict",
  "decline-senior-request",
] as const;

const ROOT = resolve(__dirname, "..");

let failures = 0;

function fail(msg: string): never {
  console.log(`  FAIL ${msg}`);
  failures += 1;
  console.log(`\nverify-dc-surface-count: FAILED (${failures} failure(s))\n`);
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
    for (const f of walkFiles(abs(...root.split("/")))) {
      if (f.endsWith(".ts") || f.endsWith(".tsx")) out.push(f);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
console.log(
  "\n1. One registry, difficult-conversation included — every ENGINE_TYPES entry resolves",
);
{
  const slugs = ENGINE_TYPES.map((t) => t.slug);
  console.log(`  ENGINE_TYPES count=${slugs.length} slugs=[${slugs.join(", ")}]`);
  check(
    'ENGINE_TYPES includes "difficult-conversation"',
    slugs.includes("difficult-conversation"),
  );

  for (const type of ENGINE_TYPES) {
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
console.log("\n3. No per-type engine surface for difficult-conversation");
{
  const forbiddenGlobs: Array<{ label: string; test: (relPath: string) => boolean }> =
    [
      {
        label: "app/practice/difficult-conversation*/page.tsx",
        test: (p) =>
          /^app\/practice\/difficult-conversation[^/]*\/page\.tsx$/.test(p),
      },
      {
        label: "app/api/*/difficult-conversation*/session*",
        test: (p) =>
          /^app\/api\/[^/]+\/difficult-conversation/.test(p) &&
          /session/i.test(p),
      },
      {
        label: "lib/*/dc-evaluation*",
        test: (p) => /^lib\/[^/]+\/dc-evaluation/.test(p),
      },
      {
        label: "components/*/ConversationSessionShell*",
        test: (p) => /components\/[^/]+\/ConversationSessionShell/.test(p),
      },
      {
        label: "app/practice/*/report/*conversation*",
        test: (p) =>
          /^app\/practice\/[^/]+\/report\//.test(p) && /conversation/i.test(p),
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
console.log(
  "\n4. Authoring surface — five 15-05 routes + play resolve (15-08); three /conversations pages",
);
{
  // 15-05 scoped five authoring routes. 15-08 added GET play as the instance
  // resolve endpoint (case-get analogue) — not a session lifecycle surface.
  const expectedRoutes = new Set([
    "app/api/difficult-conversation/add/route.ts",
    "app/api/difficult-conversation/edit/route.ts",
    "app/api/difficult-conversation/delete/route.ts",
    "app/api/difficult-conversation/publish/route.ts",
    "app/api/difficult-conversation/list/route.ts",
    "app/api/difficult-conversation/play/route.ts",
  ]);

  const foundRoutes = walkFiles(abs("app/api/difficult-conversation"))
    .filter((f) => /[/\\]route\.ts$/.test(f))
    .map((f) => rel(f).replace(/\\/g, "/"));

  const foundSet = new Set(foundRoutes);
  const missing = [...expectedRoutes].filter((p) => !foundSet.has(p));
  const extra = foundRoutes.filter((p) => !expectedRoutes.has(p));

  check(
    `exactly 6 DC API routes (5 authoring + play; found ${foundRoutes.length})`,
    foundRoutes.length === 6 && missing.length === 0 && extra.length === 0,
    `missing=[${missing.join(", ")}] extra=[${extra.join(", ")}]`,
  );
  for (const p of [...expectedRoutes].sort()) ok(`route present: ${p}`);

  const expectedPages = new Set([
    "app/conversations/page.tsx",
    "app/conversations/new/page.tsx",
    "app/conversations/[id]/page.tsx",
  ]);
  const foundPages = walkFiles(abs("app/conversations"))
    .filter((f) => /[/\\]page\.tsx$/.test(f))
    .map((f) => rel(f).replace(/\\/g, "/"));
  const pageMissing = [...expectedPages].filter((p) => !foundPages.includes(p));
  const pageExtra = foundPages.filter((p) => !expectedPages.has(p));
  check(
    `exactly 3 /conversations pages (found ${foundPages.length})`,
    foundPages.length === 3 && pageMissing.length === 0 && pageExtra.length === 0,
    `missing=[${pageMissing.join(", ")}] extra=[${pageExtra.join(", ")}]`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n5. No type-slug branching in the engine (difficult-conversation)");
{
  // 15-08 added ONE deliberate startSession branch in lib/engine/session.ts
  // (seeded-first resolve). That is a recorded Phase 13 extension (VALIDATION
  // §4), not a silent fork. Any additional DC slug branch under these trees
  // is a regression.
  const ALLOWED = new Map<string, number>([["lib/engine/session.ts", 1]]);

  const scanDirs = [
    "lib/engine",
    "app/api/practice/session",
    "app/api/interaction",
  ];
  const dcBranchRe =
    /(?:typeSlug|slug)\s*===\s*["']difficult-conversation["']|["']difficult-conversation["']\s*===\s*(?:typeSlug|slug|\w+\.slug|\w+\.typeSlug)/;

  const hits: Array<{ file: string; count: number }> = [];
  for (const dir of scanDirs) {
    if (!existsSync(abs(...dir.split("/")))) continue;
    for (const f of walkFiles(abs(...dir.split("/")))) {
      if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
      const r = rel(f).replace(/\\/g, "/");
      const src = stripComments(readFileSync(f, "utf8"));
      const matches = src.match(new RegExp(dcBranchRe, "g")) ?? [];
      if (matches.length === 0) continue;
      hits.push({ file: r, count: matches.length });
    }
  }

  for (const h of hits) {
    const allowed = ALLOWED.get(h.file) ?? 0;
    check(
      `${h.file}: difficult-conversation slug branch count=${h.count} (allowed=${allowed})`,
      h.count === allowed,
    );
  }
  for (const [file, count] of ALLOWED) {
    const hit = hits.find((h) => h.file === file);
    check(
      `known 15-08 start path still present: ${file}`,
      !!hit && hit.count === count,
    );
  }

  // Permitted type-aware .tsx registration maps (plus steps/panels/report
  // and difficult-conversation component trees, which may mention the slug).
  const typeAwareTsx = [
    ...walkFiles(abs("app")),
    ...walkFiles(abs("components")),
  ]
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({
      file: rel(f).replace(/\\/g, "/"),
      src: readFileSync(f, "utf8"),
    }))
    .filter(({ file, src }) => {
      if (file.startsWith("lib/difficult-conversation/")) return false;
      if (file.startsWith("components/difficult-conversation/")) return false;
      if (file.startsWith("components/practice/steps/")) return false;
      if (file.startsWith("components/practice/panels/")) return false;
      if (file.startsWith("components/practice/report/")) return false;
      // Authoring pages talk to /api/difficult-conversation — not type branches.
      if (file.startsWith("app/conversations/")) return false;
      const code = stripComments(src);
      return (
        /(?:typeSlug|slug)\s*===\s*["']difficult-conversation["']/.test(code) ||
        /["']difficult-conversation["']\s*===\s*(?:typeSlug|slug)/.test(code) ||
        /\.slug\s*===\s*["']difficult-conversation["']/.test(code)
      );
    })
    .map(({ file }) => file);

  const permittedTsx = new Set([
    "app/practice/[type]/[instanceId]/page.tsx",
    "components/practice/ReportChrome.tsx",
  ]);
  const unexpectedTsx = typeAwareTsx.filter((f) => !permittedTsx.has(f));
  check(
    `only permitted type-aware .tsx files branch on difficult-conversation (found=${typeAwareTsx.join(", ") || "none"})`,
    unexpectedTsx.length === 0,
    `unexpected=${unexpectedTsx.join(", ")}`,
  );
  for (const p of permittedTsx) {
    check(`permitted surface present: ${p}`, existsSync(abs(...p.split("/"))));
  }
}

// ---------------------------------------------------------------------------
console.log(
  "\n6. One floor declaration, one extras slot, one session panel, one authored-text path",
);
{
  // Exactly one TYPE-FIELD declaration of avatarEndFloor (on TerminationPolicyConfig).
  const typesSrc = read("lib/engine/types.ts");
  const floorDecls = typesSrc.match(/\bavatarEndFloor\s*\??\s*:/g) ?? [];
  check(
    `exactly one avatarEndFloor declaration in types.ts (found ${floorDecls.length})`,
    floorDecls.length === 1,
  );

  // ReportChrome extras slot — one map shape, one render helper.
  const chromeSrc = read("components/practice/ReportChrome.tsx");
  const extrasProp =
    chromeSrc.match(/\bextras\?\s*:\s*Partial<Record<ReportExtrasSlot/g) ?? [];
  check(
    `exactly one ReportChrome extras slot prop (found ${extrasProp.length})`,
    extrasProp.length === 1,
  );
  check(
    "renderReportExtras helper exported once",
    /^\s*export\s+function\s+renderReportExtras\b/m.test(chromeSrc),
  );

  // Session panel slot — one prop on the one shell.
  const shellSrc = read("components/practice/PracticeSessionShell.tsx");
  const panelDecls = shellSrc.match(/\bsessionPanel\?\s*:/g) ?? [];
  check(
    `exactly one sessionPanel prop on PracticeSessionShell (found ${panelDecls.length})`,
    panelDecls.length === 1,
  );

  // buildAuthoredTextBlock defined in exactly one file.
  const defRe = /^\s*export\s+function\s+buildAuthoredTextBlock\b/m;
  const defs: string[] = [];
  for (const f of codeFilesUnder("lib", "app", "components")) {
    if (defRe.test(readFileSync(f, "utf8"))) defs.push(rel(f).replace(/\\/g, "/"));
  }
  check(
    `buildAuthoredTextBlock defined in exactly one file (found ${defs.length})`,
    defs.length === 1 && defs[0] === "lib/difficult-conversation/authored-text.ts",
    defs.join(", "),
  );

  // Authored-field interpolation into prompts goes through buildAuthoredTextBlock*
  // only — no raw ${instance.hiddenPosition} / situation / etc in engine or DC prompts.
  const authoredInterpRe =
    /\$\{[^}]*(?:hiddenPosition|sharedBackstory|studentObjective|stakes|situation)[^}]*\}/;
  const interpHits: string[] = [];
  for (const f of [
    ...walkFiles(abs("lib/engine")),
    ...walkFiles(abs("lib/difficult-conversation")),
  ]) {
    if (!f.endsWith(".ts")) continue;
    const r = rel(f).replace(/\\/g, "/");
    if (r === "lib/difficult-conversation/authored-text.ts") continue;
    const src = stripComments(readFileSync(f, "utf8"));
    if (authoredInterpRe.test(src)) interpHits.push(r);
  }
  check(
    "no raw authored-field template interpolation outside authored-text.ts",
    interpHits.length === 0,
    interpHits.join(", "),
  );
}

// ---------------------------------------------------------------------------
console.log("\n7. No forbidden mechanism anywhere (excluding .planning/)");
{
  const forbiddenIdents = [
    "detectCoachVoice",
    "isOutOfCharacter",
    "regenerateTurn",
    "driftScore",
    "engagementScore",
    "resistanceMeter",
    "difficultyBadge",
  ];
  // Product code only — verify scripts name these identifiers when asserting absence.
  const codeFiles = codeFilesUnder("lib", "app", "components");

  for (const ident of forbiddenIdents) {
    const hits = codeFiles
      .filter((f) =>
        new RegExp(`\\b${ident}\\b`).test(stripComments(readFileSync(f, "utf8"))),
      )
      .map((f) => rel(f));
    check(`no ${ident}`, hits.length === 0, hits.join(", "));
  }

  // postProcessScores must not be assigned on the DC type record.
  const dcTypeForForbidden = getEngineType("difficult-conversation");
  check("difficult-conversation type resolves", !!dcTypeForForbidden);
  if (dcTypeForForbidden) {
    check(
      "difficult-conversation has no postProcessScores",
      !("postProcessScores" in dcTypeForForbidden) ||
        (dcTypeForForbidden as { postProcessScores?: unknown })
          .postProcessScores == null,
    );
  }
  const dcTypeSrc = read("lib/difficult-conversation/conversation-type.ts");
  check(
    "conversation-type.ts does not define postProcessScores",
    !/^\s*postProcessScores\s*:/m.test(stripComments(dcTypeSrc)),
  );

  // Engine may offer an optional postProcessScores hook (Phase 14 pitch cap).
  // DC must not wire it — already asserted above on the type record. Also
  // assert no DC-local objectiveStatus→score mutation helpers.
  const dcWiringHits = codeFilesUnder("lib/difficult-conversation")
    .filter((f) => {
      const src = stripComments(readFileSync(f, "utf8"));
      return (
        /\bpostProcessScores\s*[=:(]/.test(src) ||
        /\b(capScore|liftScore|clampScore|applyOutcomeCap|earlyEndCap)\b/.test(
          src,
        )
      );
    })
    .map((f) => rel(f));
  check(
    "no DC-local outcome-to-score / postProcessScores wiring",
    dcWiringHits.length === 0,
    dcWiringHits.join(", "),
  );
}

// ---------------------------------------------------------------------------
console.log("\n8. Nothing from CONTEXT.md deferred list exists");
{
  const productRoots = ["lib", "app", "components", "scripts"];
  const productFiles = productRoots.flatMap((d) => walkFiles(abs(d)));

  // Mirrored "both sides" / confront-vs-confronted variant naming.
  const bothSidesHits = productFiles
    .map((f) => rel(f).replace(/\\/g, "/"))
    .filter(
      (p) =>
        /both[-_]?sides/i.test(p) ||
        /confronted-variant/i.test(p) ||
        /you-are-confronted/i.test(p),
    );
  check(
    "no mirrored both-sides variant path",
    bothSidesHits.length === 0,
    bothSidesHits.join(", "),
  );

  const absentIdents = [
    "reportScenario",
    "flagContent",
    "hideScenario",
    "reviewQueue",
    "requestReview",
  ];
  for (const ident of absentIdents) {
    const hits = productFiles
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .filter((f) => {
        const r = rel(f).replace(/\\/g, "/");
        if (r === "scripts/verify-dc-surface-count.ts") return false;
        return new RegExp(`\\b${ident}\\b`).test(
          stripComments(readFileSync(f, "utf8")),
        );
      })
      .map((f) => rel(f));
    check(`no ${ident}`, hits.length === 0, hits.join(", "));
  }

  // "appeal" alone is too broad (e.g. "appealing"); require appeal path idioms.
  const appealHits = productFiles
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .filter((f) => {
      const r = rel(f).replace(/\\/g, "/");
      if (r === "scripts/verify-dc-surface-count.ts") return false;
      if (!/difficult-conversation|conversations\//.test(r)) return false;
      const src = stripComments(readFileSync(f, "utf8"));
      return (
        /\bappeal(Queue|Path|Request)?\b/i.test(src) ||
        /\bsubmitAppeal\b/.test(src)
      );
    })
    .map((f) => rel(f));
  check(`no appeal path under DC surfaces`, appealHits.length === 0, appealHits.join(", "));

  // Industry/role reframing fields on DC type or instance.
  const dcType = getEngineType("difficult-conversation");
  if (dcType) {
    const keys = Object.keys(dcType);
    check(
      "DC type has no industry/role reframing field",
      !keys.includes("industry") && !keys.includes("roleReframe"),
    );
  }
  const instanceKeys = Object.keys(SYNTHETIC_DC);
  check(
    "DC instance shape has no industry/roleReframe",
    !instanceKeys.includes("industry") && !instanceKeys.includes("roleReframe"),
  );

  // Pre-publish screens exactly two things — no real-people / off-purpose screening.
  const prepub = read("lib/difficult-conversation/prepublish-check.ts");
  check(
    "prepublish prompt does not screen real identifiable people",
    !/identifiable\s+people|named\s+real\s+(person|professor)|real\s+person\s+screen/i.test(
      prepub,
    ),
  );
  check(
    "prepublish prompt does not screen off-purpose content as a reject class",
    !/off[- ]purpose|off[- ]topic\s+scenarios?\s+must\s+be\s+rejected/i.test(prepub),
  );

  // No post-session out-of-character avatar debrief.
  const debriefHits = productFiles
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .filter((f) => {
      const r = rel(f).replace(/\\/g, "/");
      if (r === "scripts/verify-dc-surface-count.ts") return false;
      if (!/difficult-conversation|Conversation/.test(r)) return false;
      const src = stripComments(readFileSync(f, "utf8"));
      return (
        /\boutOfCharacterDebrief\b/.test(src) ||
        /\bavatarDebrief\b/.test(src) ||
        /\bpostSessionDebrief\b/.test(src)
      );
    })
    .map((f) => rel(f));
  check(
    "no out-of-character avatar debrief path",
    debriefHits.length === 0,
    debriefHits.join(", "),
  );
}

// ---------------------------------------------------------------------------
console.log("\n9. Schema validity — every type builds; DC has four extras + outcome");
{
  const dcExtras = [
    "clarity_score",
    "empathy_score",
    "holding_the_line_score",
    "objective_achieved_score",
  ];

  for (const type of ENGINE_TYPES) {
    const resolved = resolveSessionConfig(type.slug, {
      instance: instanceForType(type),
    });
    if (!resolved.ok) {
      fail(
        `resolveSessionConfig("${type.slug}") failed for schema build: ${resolved.reason}`,
      );
    }
    try {
      const built = buildRubricJsonSchema(resolved.config);
      const required = (built.schema.required as string[] | undefined) ?? [];
      check(
        `${type.slug}: schema builds; required has visual_score + vocal_score`,
        required.includes("visual_score") && required.includes("vocal_score"),
        `required=[${required.join(", ")}]`,
      );
      if (type.slug === "difficult-conversation") {
        check(
          "DC schema required includes four extras",
          dcExtras.every((k) => required.includes(k)),
          `required=[${required.join(", ")}]`,
        );
        const props = (built.schema.properties ?? {}) as Record<
          string,
          Record<string, unknown>
        >;
        // Outcome is a sibling of scores in the evaluation payload, not inside scores.
        // buildRubricJsonSchema only shapes the scores object — assert type.outcome
        // exists and that no outcome key was folded into required score keys.
        check(
          "DC type declares outcome object (not scored)",
          !!type.outcome && Array.isArray(type.outcome.fields),
        );
        const outcomeKeys = (type.outcome?.fields ?? []).map((f) => f.key);
        check(
          "outcome field keys are NOT inside rubric required[]",
          outcomeKeys.every((k) => !required.includes(k) && !required.includes(`${k}_score`)),
          `outcomeKeys=[${outcomeKeys.join(", ")}] required=[${required.join(", ")}]`,
        );
        void props;
      }
    } catch (e) {
      fail(
        `buildRubricJsonSchema("${type.slug}") threw: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
console.log("\n10. The seven seeded ids are stable (15-04-SUMMARY.md)");
{
  const ids = SEEDED_CONVERSATIONS.map((c) => c.id);
  check(`exactly seven seeded conversations (found ${ids.length})`, ids.length === 7);
  check(
    "seeded id list matches 15-04-SUMMARY exactly",
    ids.length === EXPECTED_SEEDED_IDS.length &&
      EXPECTED_SEEDED_IDS.every((id, i) => ids[i] === id),
    `actual=[${ids.join(", ")}] expected=[${EXPECTED_SEEDED_IDS.join(", ")}]`,
  );
  for (const id of EXPECTED_SEEDED_IDS) ok(`seeded id stable: ${id}`);
}

console.log("\nverify-dc-surface-count: ALL TEN SECTIONS PASSED\n");
process.exit(0);
