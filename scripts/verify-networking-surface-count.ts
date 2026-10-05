/**
 * Phase 16 plan 16-11: prove networking shipped as config + prompts on Phase
 * 13's one engine — not as per-type surfaces — and that the never-publishable
 * / never-stored-paste absences stay absent.
 *
 * Style mirrors scripts/verify-engine-surface-count.ts. Do not hardcode a
 * global ENGINE_TYPES count (Phases 13–16 each add types in execution order).
 *
 * Run: npx tsx scripts/verify-networking-surface-count.ts
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

/** Same stub pattern as scripts/verify-engine-config.ts — kind is not checked. */
const SYNTHETIC_REQUIRED_INSTANCE: InstanceConfig = {
  kind: "case-study",
  caseId: "test-case-id",
  caseName: "Test Case",
  background: "A background long enough to pass the author minimum bar.",
  avatars: [
    { name: "Alex", role: "VP of Sales", additionalInfo: "secret briefing" },
  ],
  criteria: "Grade on whether the student stays calm.",
};

function instanceForType(type: InteractionTypeConfig): InstanceConfig | null {
  return type.instance.required ? SYNTHETIC_REQUIRED_INSTANCE : null;
}

const ROOT = resolve(__dirname, "..");

let failures = 0;

function fail(msg: string): never {
  console.log(`  FAIL ${msg}`);
  failures += 1;
  console.log(
    `\nverify-networking-surface-count: FAILED (${failures} failure(s))\n`,
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
      name === "coverage"
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
  // Strip block comments then line comments — good enough for absence greps.
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

// ---------------------------------------------------------------------------
console.log(
  "\n1. One registry, networking included — every ENGINE_TYPES entry resolves",
);
{
  const slugs = ENGINE_TYPES.map((t) => t.slug);
  console.log(`  ENGINE_TYPES count=${slugs.length} slugs=[${slugs.join(", ")}]`);
  check('ENGINE_TYPES includes "networking"', slugs.includes("networking"));

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
}

// ---------------------------------------------------------------------------
console.log("\n3. No per-networking surface");
{
  const forbiddenGlobs: Array<{ label: string; test: (relPath: string) => boolean }> = [
    {
      label: "app/practice/networking*/page.tsx",
      test: (p) => /^app\/practice\/networking[^/]*\/page\.tsx$/.test(p),
    },
    {
      label: "lib/*/networking-evaluation*",
      test: (p) => /^lib\/[^/]+\/networking-evaluation/.test(p),
    },
    {
      label: "components/*/NetworkingSessionShell*",
      test: (p) => /components\/[^/]+\/NetworkingSessionShell/.test(p),
    },
    {
      label: "app/practice/*/report/*networking*",
      test: (p) =>
        /^app\/practice\/[^/]+\/report\//.test(p) && /networking/i.test(p),
    },
  ];

  const all = [
    ...walkFiles(abs("app")),
    ...walkFiles(abs("lib")),
    ...walkFiles(abs("components")),
  ].map(rel);

  for (const g of forbiddenGlobs) {
    const hits = all.filter((p) => g.test(p.replace(/\\/g, "/")));
    check(`no ${g.label}`, hits.length === 0, hits.join(", "));
  }
}

// ---------------------------------------------------------------------------
console.log("\n4. Networking API surface is exactly five routes");
{
  const expected = new Set([
    "app/api/networking/persona/generate/route.ts",
    "app/api/networking/attestation/route.ts",
    "app/api/networking/persona/distill/route.ts",
    "app/api/networking/persona/route.ts",
    "app/api/networking/persona/[personaId]/route.ts",
  ]);

  const found = walkFiles(abs("app/api/networking"))
    .filter((f) => /[/\\]route\.ts$/.test(f))
    .map((f) => rel(f).replace(/\\/g, "/"));

  const foundSet = new Set(found);
  const missing = [...expected].filter((p) => !foundSet.has(p));
  const extra = found.filter((p) => !expected.has(p));

  check(
    `exactly 5 networking routes (found ${found.length})`,
    found.length === 5 && missing.length === 0 && extra.length === 0,
    `missing=[${missing.join(", ")}] extra=[${extra.join(", ")}]`,
  );
  for (const p of [...expected].sort()) ok(`route present: ${p}`);
}

// ---------------------------------------------------------------------------
console.log("\n5. NEVER-PUBLISHABLE GUARD");
console.log(
  '  16-CONTEXT.md decision 7: "Never publishable... The publish affordance must be absent, not merely off"',
);
console.log(
  "  ADDRESSED TO REVIEWERS: this record describes a real person; the absence",
);
console.log(
  "  is deliberate and load-bearing. Do not add parity with CaseStudy.",
);
{
  // Path names containing both networking and publish (exclude .planning).
  const pathHits = [
    ...walkFiles(abs("app")),
    ...walkFiles(abs("lib")),
    ...walkFiles(abs("components")),
    ...walkFiles(abs("scripts")),
  ]
    .map((f) => rel(f).replace(/\\/g, "/"))
    .filter(
      (p) =>
        /networking/i.test(p) &&
        /publish/i.test(p) &&
        !p.startsWith(".planning/"),
    );
  check(
    "no file path contains both networking and publish",
    pathHits.length === 0,
    pathHits.join(", "),
  );

  const publishFieldRe =
    /\b(published|visibility|isPublic|sharedWith)\b/;
  const commentOnlyDirs = [
    "lib/networking",
    "app/api/networking",
    "components/practice/steps",
  ];
  const fieldHits: string[] = [];
  for (const dir of commentOnlyDirs) {
    const files = walkFiles(abs(...dir.split("/"))).filter(
      (f) =>
        (f.endsWith(".ts") || f.endsWith(".tsx")) &&
        (dir !== "components/practice/steps" ||
          /Networking/i.test(rel(f))),
    );
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const code = stripComments(src);
      if (publishFieldRe.test(code)) {
        fieldHits.push(rel(f));
      }
    }
  }
  check(
    "publish/visibility/isPublic/sharedWith only in comments (or absent) under networking surfaces",
    fieldHits.length === 0,
    fieldHits.join(", "),
  );

  const typesSrc = read("lib/engine/types.ts");
  const memberMatch = typesSrc.match(
    /kind:\s*"networking-persona"[\s\S]*?(?=\n\s*\| \{|\n\s*\| \{ kind: "none")/,
  );
  check(
    'networking-persona member present in lib/engine/types.ts',
    !!memberMatch,
  );
  if (memberMatch) {
    const member = memberMatch[0];
    check(
      "networking-persona member declares no published/visibility/isPublic/sharedWith field",
      !publishFieldRe.test(member),
    );
  }

  const scenarioHits = walkFiles(abs("app/api/scenario"))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .filter((f) => /\bnetworking\b/i.test(readFileSync(f, "utf8")))
    .map(rel);
  check(
    "app/api/scenario/ has no networking awareness",
    scenarioHits.length === 0,
    scenarioHits.join(", "),
  );
}

// ---------------------------------------------------------------------------
console.log("\n6. The raw paste is stored nowhere");
console.log(
  "  Retention contract (app/api/interview/persona/distill/route.ts):",
);
console.log(
  '  "used for exactly one non-streaming model call and is never written to',
);
console.log(
  '   Prisma, S3, or any cache, and never logged — only lengths are logged."',
);
{
  const allowedRel = new Set([
    // Distill module parameter
    "lib/interview/persona-distill.ts",
    // Two distill routes' request parsing
    "app/api/interview/persona/distill/route.ts",
    "app/api/networking/persona/distill/route.ts",
    // 16-04's explicit 400 tripwire
    "app/api/networking/persona/route.ts",
    // Ephemeral clients that POST profileText into a distill route (never persist it)
    "lib/networking/wizard-client.ts",
    "components/practice/steps/NetworkingPersonStep.tsx",
    // Phase 8 interview paste UI — same ephemeral contract, pre-Phase-16
    "components/interview/CustomizePanel.tsx",
  ]);

  // Also allow verify/spike scripts — they are not product persistence.
  const codeRoots = ["lib", "app", "components"];
  const hits: Array<{ file: string; line: string }> = [];
  for (const root of codeRoots) {
    for (const f of walkFiles(abs(root))) {
      if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
      const r = rel(f).replace(/\\/g, "/");
      const lines = readFileSync(f, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (/\b(profileText|rawPaste|pastedText)\b/.test(line)) {
          hits.push({ file: `${r}:${i + 1}`, line: line.trim() });
        }
      });
    }
  }

  const unexpected = hits.filter((h) => {
    const file = h.file.split(":")[0];
    return !allowedRel.has(file);
  });

  // None of the unexpected hits may sit in a file that writes to S3 or Prisma.
  const persistenceWriters = unexpected.filter((h) => {
    const file = h.file.split(":")[0];
    let src = "";
    try {
      src = read(file);
    } catch {
      return true;
    }
    return (
      /\b(prisma|s3Storage|PutObject|putObject|writeFile)\b/.test(src) &&
      // persona-store writes distilled persona only — must not match raw fields
      // (asserted separately); if a hit landed there it is a real failure.
      true
    );
  });

  check(
    `profileText/rawPaste/pastedText only in distill path + 400 tripwire + ephemeral client (hits=${hits.length}, unexpected=${unexpected.length})`,
    unexpected.length === 0,
    unexpected.map((h) => `${h.file}: ${h.line}`).join("\n         "),
  );
  check(
    "no unexpected match sits in an S3/Prisma writer",
    persistenceWriters.length === 0,
    persistenceWriters.map((h) => h.file).join(", "),
  );

  // Hard-fail if persona-store or S3 helpers mention raw paste fields.
  for (const mustBeClean of [
    "lib/networking/persona-store.ts",
    "lib/report/snapshot.ts",
  ]) {
    const src = read(mustBeClean);
    check(
      `${mustBeClean} has no profileText/rawPaste/pastedText`,
      !/\b(profileText|rawPaste|pastedText)\b/.test(src),
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n7. No type-slug branching in the engine (networking)");
{
  // 16-09 added ONE deliberate startSession branch in lib/engine/session.ts
  // that delegates snapshot assembly to lib/networking/start-snapshot.ts.
  // That is a recorded Phase 13 extension (VALIDATION §4), not a silent fork.
  // Any additional networking slug branch under these trees is a regression.
  const ALLOWED = new Map<string, number>([
    ["lib/engine/session.ts", 1],
  ]);

  const scanDirs = [
    "lib/engine",
    "app/api/practice/session",
    "app/api/interaction",
  ];
  const networkingBranchRe =
    /(?:typeSlug|slug)\s*===\s*["']networking["']|["']networking["']\s*===\s*(?:typeSlug|slug|\w+\.slug|\w+\.typeSlug)/;

  const hits: Array<{ file: string; count: number }> = [];
  for (const dir of scanDirs) {
    if (!existsSync(abs(...dir.split("/")))) continue;
    for (const f of walkFiles(abs(...dir.split("/")))) {
      if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
      const r = rel(f).replace(/\\/g, "/");
      const src = stripComments(readFileSync(f, "utf8"));
      const matches = src.match(new RegExp(networkingBranchRe, "g")) ?? [];
      if (matches.length === 0) continue;
      hits.push({ file: r, count: matches.length });
    }
  }

  for (const h of hits) {
    const allowed = ALLOWED.get(h.file) ?? 0;
    check(
      `${h.file}: networking slug branch count=${h.count} (allowed=${allowed})`,
      h.count === allowed,
    );
  }
  for (const [file, count] of ALLOWED) {
    const hit = hits.find((h) => h.file === file);
    check(
      `known 16-09 start path still present: ${file}`,
      !!hit && hit.count === count,
    );
  }

  // Permitted type-aware .tsx surfaces for networking registration.
  const typeAwareTsx = [
    ...walkFiles(abs("app")),
    ...walkFiles(abs("components")),
  ]
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({ file: rel(f).replace(/\\/g, "/"), src: readFileSync(f, "utf8") }))
    .filter(
      ({ src }) =>
        /slug\s*===\s*["']networking["']/.test(stripComments(src)) ||
        /["']networking["']\s*===\s*slug/.test(stripComments(src)) ||
        /\.slug\s*===\s*["']networking["']/.test(stripComments(src)),
    )
    .map(({ file }) => file);

  const permittedTsx = new Set([
    "app/practice/[type]/page.tsx",
    "components/practice/ReportChrome.tsx",
  ]);
  const unexpectedTsx = typeAwareTsx.filter((f) => !permittedTsx.has(f));
  check(
    `only permitted type-aware .tsx files branch on networking (found=${typeAwareTsx.join(", ") || "none"})`,
    unexpectedTsx.length === 0,
    `unexpected=${unexpectedTsx.join(", ")}`,
  );
  for (const p of permittedTsx) {
    check(`permitted surface present: ${p}`, existsSync(abs(...p.split("/"))));
  }
}

// ---------------------------------------------------------------------------
console.log("\n8. No networking vocabulary in generic primitives");
{
  const primitives = [
    "lib/engine/visible-context.ts",
    "lib/engine/termination.ts",
    "lib/engine/time-budget.ts",
    "lib/engine/outcome.ts",
    "lib/engine/rubric.ts",
  ];
  for (const p of primitives) {
    const src = read(p);
    const hit = /networking|rapport|\bgoal\b/i.test(src);
    check(`${p}: no networking|rapport|goal`, !hit);
  }
}

// ---------------------------------------------------------------------------
console.log("\n9. No forbidden mechanism anywhere");
{
  // Exactly one PERSONA_DISTILL_SYSTEM_PROMPT declaration.
  const distillDefs: string[] = [];
  const cameraDefs: string[] = [];
  const codeFiles = [
    ...walkFiles(abs("app")),
    ...walkFiles(abs("components")),
    ...walkFiles(abs("lib")),
  ].filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

  const distillDefRe = /^\s*(?:export\s+)?const\s+PERSONA_DISTILL_SYSTEM_PROMPT\b/m;
  const cameraDefRe = /^\s*(?:export\s+)?const\s+CAMERA_BLOCK_COPY\b/m;

  for (const f of codeFiles) {
    const src = readFileSync(f, "utf8");
    if (distillDefRe.test(src)) distillDefs.push(rel(f));
    if (cameraDefRe.test(src)) cameraDefs.push(rel(f));
  }
  check(
    `PERSONA_DISTILL_SYSTEM_PROMPT declared exactly once (found ${distillDefs.length})`,
    distillDefs.length === 1,
    distillDefs.join(", "),
  );
  check(
    `CAMERA_BLOCK_COPY declared exactly once (found ${cameraDefs.length})`,
    cameraDefs.length === 1,
    cameraDefs.join(", "),
  );

  // No second avatar picker under networking components.
  // Look for a fetch of the interviewers catalog or a dedicated picker
  // component — not a comment that mentions InterviewerStep (the shared one).
  const networkingPicker = walkFiles(abs("components"))
    .filter((f) => /Networking/i.test(rel(f)))
    .filter((f) => {
      const src = stripComments(readFileSync(f, "utf8"));
      return (
        /\/api\/interview\/interviewers/.test(src) ||
        /\bAvatarPicker\b/.test(src) ||
        /\bfetchInterviewers\b/.test(src)
      );
    })
    .map(rel);
  check(
    "no second avatar picker in Networking* components",
    networkingPicker.length === 0,
    networkingPicker.join(", "),
  );

  // No setting/venue field on networking type or characters.
  const networkingType = getEngineType("networking");
  check("networking type resolves", !!networkingType);
  if (networkingType) {
    const typeKeys = Object.keys(networkingType);
    check(
      "networking type has no setting/venue field",
      !typeKeys.includes("setting") && !typeKeys.includes("venue"),
    );
  }

  const charactersSrc = read("lib/networking/characters.ts");
  // Field declarations — not comments explaining the prohibition.
  const characterCode = stripComments(charactersSrc);
  check(
    "characters have no difficulty/setting/venue field declaration",
    !/\b(difficulty|setting|venue)\s*[?:]/.test(characterCode),
  );

  // No localStorage/sessionStorage in networking components.
  const storageHits = walkFiles(abs("components/practice/steps"))
    .filter((f) => /Networking/i.test(rel(f)))
    .filter((f) => {
      const src = stripComments(readFileSync(f, "utf8"));
      return /\b(localStorage|sessionStorage)\b/.test(src);
    })
    .map(rel);
  const wizardClient = stripComments(read("lib/networking/wizard-client.ts"));
  check(
    "no localStorage/sessionStorage in Networking* components",
    storageHits.length === 0,
    storageHits.join(", "),
  );
  check(
    "no localStorage/sessionStorage in wizard-client",
    !/\b(localStorage|sessionStorage)\b/.test(wizardClient),
  );

  // No leftover NETWORKING_LEAK_DUMP.
  const dumpHits = codeFiles
    .filter((f) => /NETWORKING_LEAK_DUMP/.test(readFileSync(f, "utf8")))
    .map(rel);
  check(
    "no NETWORKING_LEAK_DUMP residue",
    dumpHits.length === 0,
    dumpHits.join(", "),
  );
}

// ---------------------------------------------------------------------------
console.log("\n10. All types' schemas are valid");
{
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
      if (type.slug === "networking") {
        // scorePropertyName keeps hyphens from dimension keys (16-07).
        check(
          "networking schema required includes rapport_score, self-introduction_score, goal-progress_score",
          required.includes("rapport_score") &&
            required.includes("self-introduction_score") &&
            required.includes("goal-progress_score"),
          `required=[${required.join(", ")}]`,
        );
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

console.log("\nverify-networking-surface-count: ALL TEN SECTIONS PASSED\n");
process.exit(0);
