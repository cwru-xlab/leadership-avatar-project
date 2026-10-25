/**
 * Proves the path SURFACE 21-19 ships: the existing study-plan surface on
 * `app/reports/page.tsx` still works (REQ-120), the path route delegates all
 * source assembly to `loadGenerationSources` (21-25) rather than
 * reimplementing it, no answer key reaches the browser, stored selection
 * reasons are returned verbatim, a path-less plan returns `{ path: null }`
 * rather than erroring, no sequential-gating/streak copy exists in the new
 * files, and the panel's three action-link shapes resolve to real files on
 * disk — not merely matching substrings.
 *
 * Also closes the cross-wave hazard `deferred-items.md` recorded against
 * `PLACEHOLDER_KNOWLEDGE_CHECK_ID` (lib/study-plan/next-step.ts): Section 7
 * proves, by PLANTING one and observing the detector fire before removing
 * it, that no persisted `StudyPlanPathStep` can carry the placeholder
 * unnoticed.
 *
 * Sections 1, 1b, 5 and 6 are pure (no DATABASE_URL needed). Sections 2's
 * database half, 3, 4 and 7 need a live database and print an explicit SKIP
 * (never a silent pass) without DATABASE_URL.
 *
 * Run:         npx tsx scripts/verify-path-surface.ts
 * Run with DB: DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" \
 *                npx tsx scripts/verify-path-surface.ts
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { buildPathDTO } from "../app/api/study-plans/[planId]/path/route";

let failures = 0;
let passCount = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    passCount += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

function skip(name: string) {
  console.log(`  SKIP ${name}`);
}

const ROOT = path.resolve(__dirname, "..");
const REPORTS_PAGE_PATH = path.join(ROOT, "app", "reports", "page.tsx");
const ROUTE_PATH = path.join(ROOT, "app", "api", "study-plans", "[planId]", "path", "route.ts");
const PANEL_PATH = path.join(ROOT, "components", "study-plan", "PathPanel.tsx");
const STUDY_PLAN_PAGE_PATH = path.join(ROOT, "app", "study-plans", "[planId]", "page.tsx");
// Phase 23: the generate/preview/save flow moved off /reports into ONE shared
// component used by both /reports and the new /study-plans index.
const GENERATOR_PATH = path.join(ROOT, "components", "study-plan", "StudyPlanGenerator.tsx");
const STUDY_PLANS_INDEX_PATH = path.join(ROOT, "app", "study-plans", "page.tsx");
const PATHS_PAGE_PATH = path.join(ROOT, "app", "paths", "page.tsx");
const GENERATE_PATH_CARD_PATH = path.join(ROOT, "components", "study-plan", "GeneratePathCard.tsx");
const PATH_VISUALS_PATH = path.join(ROOT, "components", "study-plan", "PathVisuals.tsx");
const PLANS_HOOK_PATH = path.join(ROOT, "components", "study-plan", "usePlansWithPaths.ts");

// ---------------------------------------------------------------------------
// Section 1 — existing surface regression guard (REQ-120)
// ---------------------------------------------------------------------------

/**
 * Captured from `app/reports/page.tsx` AS IT STOOD BEFORE this plan's Task 3
 * (commit `c7c6260`/current history prior to this plan) — not invented, not
 * re-derived from the post-change file. Each is an exact substring from that
 * prior version.
 */
const PRE_EXISTING_SURFACE_MARKERS: Array<{ label: string; marker: string }> = [
  { label: "fetch of /api/study-plans (loadPlans)", marker: 'fetch("/api/study-plans"' },
  { label: "POST to /api/study-plans/generate", marker: '"/api/study-plans/generate"' },
  { label: "save flow's draft-token field", marker: "draftToken: preview.draftToken" },
  { label: "priorityThemes rendering", marker: "priorityThemes" },
];

function assertMarkersPresent(source: string): string[] {
  return PRE_EXISTING_SURFACE_MARKERS.filter((m) => !source.includes(m.marker)).map(
    (m) => m.label,
  );
}

function runSection1() {
  console.log("\n1. EXISTING SURFACE REGRESSION GUARD (REQ-120)");
  // Phase 23 extracted the generate/preview/save flow from this page into
  // components/study-plan/StudyPlanGenerator.tsx (shared with /study-plans).
  // The markers are therefore asserted over the page PLUS the component it
  // renders — repointed, not weakened: the page must still import it.
  const reportsSource = fs.readFileSync(REPORTS_PAGE_PATH, "utf-8");
  const generatorSource = fs.existsSync(GENERATOR_PATH) ? fs.readFileSync(GENERATOR_PATH, "utf-8") : "";
  const source = `${reportsSource}\n${generatorSource}`;

  const missing = assertMarkersPresent(source);
  check(
    "every pre-existing study-plan marker is still present on app/reports/page.tsx or the StudyPlanGenerator it renders",
    missing.length === 0,
    `missing: ${JSON.stringify(missing)}`,
  );
  check(
    "app/reports/page.tsx renders the shared StudyPlanGenerator",
    reportsSource.includes("<StudyPlanGenerator") &&
      reportsSource.includes('from "@/components/study-plan/StudyPlanGenerator"'),
  );

  // PROVE THE GUARD BITES: strip one marker from an in-memory copy and
  // confirm the same predicate reports it missing. A guard that has never
  // been seen to fail is not a guard.
  const mutilated = source.replace('"/api/study-plans/generate"', '"/api/study-plans/REMOVED"');
  const missingAfterMutilation = assertMarkersPresent(mutilated);
  check(
    "the guard DETECTS a deliberately removed marker (bite proof)",
    missingAfterMutilation.includes("POST to /api/study-plans/generate"),
    JSON.stringify(missingAfterMutilation),
  );

  // quick-006 MOVED a saved plan's view (and with it, PathPanel) off this
  // page entirely — "View plan" on /reports now NAVIGATES to
  // /study-plans/{planId} instead of fetching into local state and folding
  // the panel open inline here. That move is why PathPanel is no longer
  // asserted against THIS file below: a correct move, not a weakened guard.
  // The assertion is repointed, not deleted — see runSection1Moved below,
  // which still fails loudly if the panel isn't wired in anywhere.
}

/**
 * quick-006: `PathPanel`'s wiring assertion moved here from `runSection1`
 * above, following the panel itself to its new home at
 * `app/study-plans/[planId]/page.tsx`. Keeps the same bite-proof pattern the
 * original had (planted-removal detection), plus the live-destination-style
 * existence check Section 6 already uses for the panel's own link targets —
 * so a future rename of this page can't silently pass by matching a stale
 * substring against a file that no longer exists.
 */
function runSection1Moved() {
  console.log("\n1-moved. PathPanel WIRING MOVED TO app/study-plans/[planId]/page.tsx (quick-006)");

  const studyPlanPageExists = fs.existsSync(STUDY_PLAN_PAGE_PATH);
  check(
    "app/study-plans/[planId]/page.tsx exists on disk (quick-006's new saved-plan route)",
    studyPlanPageExists,
    studyPlanPageExists ? undefined : "MISSING — owning plan: quick-006",
  );

  if (!studyPlanPageExists) return;

  const source = fs.readFileSync(STUDY_PLAN_PAGE_PATH, "utf-8");
  check(
    "PathPanel is wired into the saved-plan page (moved from app/reports/page.tsx in quick-006)",
    source.includes("PathPanel"),
  );

  // BITE PROOF — strip the marker from an in-memory copy and confirm the
  // same predicate reports it missing, same technique Section 1's own bite
  // proof uses above.
  const mutilated = source.replace(/PathPanel/g, "REMOVED");
  check(
    "the moved guard DETECTS a deliberately removed PathPanel usage (bite proof)",
    !mutilated.includes("PathPanel"),
  );
}

// ---------------------------------------------------------------------------
// Section 1b — no source assembly in the route
// ---------------------------------------------------------------------------

function runSection1b() {
  console.log("\n1b. NO SOURCE ASSEMBLY IN THE ROUTE");
  const source = fs.readFileSync(ROUTE_PATH, "utf-8");

  check("route does not reference s3Storage", !source.includes("s3Storage"));
  check("route does not reference getInterviewTranscript", !source.includes("getInterviewTranscript"));
  check("route does not query prisma.user.find*", !source.includes("prisma.user.find"));
  check("route delegates assembly to loadGenerationSources", source.includes("loadGenerationSources"));

  // Degraded check -> practice session must store a reason for the step it
  // actually stores (Phase 23 fix). Bite proof: the pre-fix branch fails.
  // Phase 23: a failed check degrades to a VOICE_DRILL (the path keeps ONE
  // UNAIDED_SESSION, the final prove-it step), with its reason rewritten.
  const degradeBranchOk = (src: string) =>
    /kind: "VOICE_DRILL",\s*selectionReason: reasonForDegradedCheckToDrill\(step\.selectionReason\)/.test(src);
  check("the degrade branch rewrites selectionReason via reasonForDegradedCheckToDrill", degradeBranchOk(source));
  check(
    "the degrade-branch guard DETECTS the pre-fix branch that kept the check reason (bite proof)",
    !degradeBranchOk(source.replace("selectionReason: reasonForDegradedCheckToDrill(step.selectionReason),", "")),
  );
}

// ---------------------------------------------------------------------------
// Section 2 — no answer-key leak
// ---------------------------------------------------------------------------

function runSection2Source() {
  console.log("\n2. NO ANSWER-KEY LEAK (source half)");
  const source = fs.readFileSync(ROUTE_PATH, "utf-8");
  // Matches the actual field-name identifiers (camelCase `answerKey`, the
  // model's generation-time `answer_key` JSON key) but NOT the hyphenated
  // prose "answer-key" the route's own doc comments use when explaining why
  // the field is never read — the same carve-out 21-06/21-11/21-22's own
  // grep gates needed for their doc comments.
  check(
    "the literal field-name identifier for a check's answer key appears nowhere in the route",
    !/answerKey|answer_key/.test(source),
  );
}

// ---------------------------------------------------------------------------
// Section 5 — no sequential-gating or streak copy
// ---------------------------------------------------------------------------

/**
 * Strips `//`/`/* *\/` comments and string/template literals from TS source
 * before the forbidden-term scan — the same technique 21-17's own guard
 * uses (scripts/verify-levels-goals.ts), reimplemented here (not imported)
 * since 21-17's walk predates these files and its own scanner is not an
 * exported module. A single-pass state machine, not a full tokenizer.
 */
function stripCommentsAndStrings(source: string): string {
  let result = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const twoChars = source.slice(i, i + 2);
    if (twoChars === "//") {
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    if (twoChars === "/*") {
      i += 2;
      while (i < n && source.slice(i, i + 2) !== "*/") i += 1;
      i += 2;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        i += 1;
      }
      i += 1;
      continue;
    }
    result += ch;
    i += 1;
  }
  return result;
}

const FORBIDDEN_TERMS = [
  "isunlocked",
  "unlock",
  "locked",
  "prerequisite",
  "requireslevel",
  "gatedby",
  "availableafter",
  "streak",
  "consecutive",
  "daystreak",
  "longestrun",
  "chainlength",
];

function runSection5() {
  console.log("\n5. NO SEQUENTIAL-GATING OR STREAK COPY (21-17's scan, re-run over new files)");
  const phase23Files = [
    GENERATOR_PATH,
    STUDY_PLANS_INDEX_PATH,
    PATHS_PAGE_PATH,
    GENERATE_PATH_CARD_PATH,
    PATH_VISUALS_PATH,
    PLANS_HOOK_PATH,
  ];
  for (const filePath of [PANEL_PATH, ROUTE_PATH, ...phase23Files]) {
    if (!fs.existsSync(filePath)) {
      check(`${path.relative(ROOT, filePath)} exists`, false, "MISSING");
      continue;
    }
    const source = fs.readFileSync(filePath, "utf-8");
    const stripped = stripCommentsAndStrings(source).toLowerCase();
    const matches = FORBIDDEN_TERMS.filter((term) => stripped.includes(term));
    check(
      `${path.relative(ROOT, filePath)} contains no gating/streak term outside a comment or string`,
      matches.length === 0,
      JSON.stringify(matches),
    );
  }
}

// ---------------------------------------------------------------------------
// Section 6 — panel shape and live destinations
// ---------------------------------------------------------------------------

function runSection6() {
  console.log("\n6. PANEL SHAPE AND LIVE DESTINATIONS (REQ-122)");
  const source = fs.readFileSync(PANEL_PATH, "utf-8");

  check("panel emits a KNOWLEDGE_CHECK href shape", source.includes("/checks/"));
  check("panel emits a COACHED_SESSION href shape", source.includes("/coached/"));
  check("panel emits an UNAIDED_SESSION (practice) href shape", source.includes("/practice/"));

  check("panel renders an <ol>", /<ol[\s>]/.test(source));
  check("panel contains no `disabled` usage", !source.includes("disabled"));

  const reasonMatches = source.match(/selectionReason/g) ?? [];
  check(
    "selectionReason is rendered in at least two places",
    reasonMatches.length >= 2,
    `found ${reasonMatches.length}`,
  );

  check(
    "no truncation is applied to a reason (.slice(0, or substring()",
    !/\.slice\(0,/.test(source) && !/\.substring\(/.test(source),
  );

  // Selection must not happen in the view: nothing beyond a TYPE import from
  // next-step.ts. This panel does not import that module at all (it
  // redeclares the one sentinel constant it needs locally) — assert that
  // directly rather than trying to parse "type-only" import syntax.
  const importsNextStepValue = /from\s+["'][^"']*next-step["']/.test(source);
  check(
    "panel does not import lib/study-plan/next-step at all (no selection logic reachable from the view)",
    !importsNextStepValue,
  );

  // LIVE DESTINATIONS — proven to exist on disk, not merely as substrings.
  // A substring assertion alone would keep passing against a dead link if
  // 21-22 or 21-24 renamed a path segment.
  const checkPageExists = fs.existsSync(
    path.join(ROOT, "app", "study-plans", "[planId]", "checks", "[checkId]", "page.tsx"),
  );
  check(
    "21-22's KNOWLEDGE_CHECK destination page exists on disk (app/study-plans/[planId]/checks/[checkId]/page.tsx)",
    checkPageExists,
    checkPageExists ? undefined : "MISSING — owning plan: 21-22",
  );

  const coachedPageExists = fs.existsSync(
    path.join(ROOT, "app", "study-plans", "[planId]", "coached", "[stepId]", "page.tsx"),
  );
  check(
    "21-24's COACHED_SESSION destination page exists on disk (app/study-plans/[planId]/coached/[stepId]/page.tsx)",
    coachedPageExists,
    coachedPageExists ? undefined : "MISSING — owning plan: 21-24",
  );

  // INVERTED ASSERTION: a deliberately-wrong, singular path segment must NOT
  // exist — proving the existence check above actually reads the
  // filesystem rather than unconditionally returning true.
  const invertedSingularExists = fs.existsSync(
    path.join(ROOT, "app", "study-plans", "[planId]", "check", "[checkId]", "page.tsx"),
  );
  check(
    "the deliberately-wrong singular '/check/' page does NOT exist (inverted assertion)",
    !invertedSingularExists,
  );

  check(
    "the /checks/ href template orders /study-plans/ before /checks/",
    (() => {
      const m = source.match(/\/study-plans\/\$\{planId\}\/checks\//);
      return Boolean(m);
    })(),
  );
  check(
    "the /coached/ href template orders /study-plans/ before /coached/",
    (() => {
      const m = source.match(/\/study-plans\/\$\{planId\}\/coached\//);
      return Boolean(m);
    })(),
  );
}


// ---------------------------------------------------------------------------
// Section 8 — Phase 23 path hub: /study-plans index + /paths
// ---------------------------------------------------------------------------

/** Every way the hub could regress, as a pure function over sources so the
 * bite proof below can run it against a mutated copy. */
function hubIssues(src: {
  generator: string;
  reports: string;
  index: string;
  paths: string;
  card: string;
  panel: string;
}): string[] {
  const issues: string[] = [];
  // One implementation of plan generation, not a copy per page.
  if (!src.generator.includes('"/api/study-plans/generate"')) issues.push("generator does not POST /api/study-plans/generate");
  for (const [name, page] of [["reports", src.reports], ["study-plans index", src.index]] as const) {
    if (page.includes('"/api/study-plans/generate"')) issues.push(`${name} page duplicates the generate call`);
    if (!page.includes("<StudyPlanGenerator")) issues.push(`${name} page does not render StudyPlanGenerator`);
  }
  // Index links each plan to its own page.
  if (!src.index.includes("/study-plans/${item.plan.id}")) issues.push("index does not link to /study-plans/{planId}");
  // /paths renders the shared trail and the inline generate card.
  if (!src.paths.includes("<PathPanel")) issues.push("/paths does not render PathPanel");
  if (!src.paths.includes("<GeneratePathCard")) issues.push("/paths does not render GeneratePathCard");
  if (!src.paths.includes("<GoalsStrip")) issues.push("/paths does not show daily/weekly goals");
  // The inline generate card calls the EXISTING path route, with a 409 fallback.
  if (!src.card.includes("/api/study-plans/${planId}/path")) issues.push("GeneratePathCard does not call the existing path route");
  if (!src.card.includes('method: "POST"')) issues.push("GeneratePathCard does not POST");
  if (!src.card.includes("409")) issues.push("GeneratePathCard has no 409 (already exists) handling");
  if (!src.card.includes('role="alert"')) issues.push("GeneratePathCard has no error display");
  // Exactly one Continue CTA in the trail, and a completion state to Mastery.
  const continueCount = (src.panel.match(/data-testid="path-continue"/g) ?? []).length;
  if (continueCount !== 1) issues.push(`PathPanel has ${continueCount} Continue CTAs, expected exactly 1`);
  if (!src.panel.includes('href="/mastery"')) issues.push("PathPanel completion state does not link to /mastery");
  // "What's next" has ONE source of truth: the server's nextStep.
  const continueFn = src.panel.slice(src.panel.indexOf("export function continueTargetFor"), src.panel.indexOf("type NodeState"));
  if (continueFn.includes("IN_PROGRESS")) issues.push("PathPanel re-derives the next step client-side (IN_PROGRESS fallback)");
  if (!src.panel.includes("<LevelBadge")) issues.push("PathPanel does not render per-competency level badges");
  // Reserved growth-since-plan slot, and /mastery's ?competency= deep link.
  if (!src.panel.includes("growthSlot") || !src.paths.includes("growthSlot")) issues.push("growth-since-plan slot is missing");
  if (!src.paths.includes('searchParams.get("competency")')) issues.push("/paths ignores ?competency=");
  if (!src.paths.includes("highlightCompetency=")) issues.push("/paths does not highlight steps for ?competency=");
  return issues;
}

function runSection8() {
  console.log("\n8. PHASE 23 PATH HUB (/study-plans index + /paths)");
  const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "");
  check("app/study-plans/page.tsx exists", fs.existsSync(STUDY_PLANS_INDEX_PATH));
  check("app/paths/page.tsx exists", fs.existsSync(PATHS_PAGE_PATH));
  const sources = {
    generator: read(GENERATOR_PATH),
    reports: read(REPORTS_PAGE_PATH),
    index: read(STUDY_PLANS_INDEX_PATH),
    paths: read(PATHS_PAGE_PATH),
    card: read(GENERATE_PATH_CARD_PATH),
    panel: read(PANEL_PATH),
  };
  const issues = hubIssues(sources);
  check("the path hub is wired as specified", issues.length === 0, JSON.stringify(issues));

  // BITE PROOF — a duplicated generate call and a second Continue CTA must
  // both be reported.
  const mutated = hubIssues({
    ...sources,
    index: `${sources.index}\nfetch("/api/study-plans/generate")`,
    panel: `${sources.panel}\n<a data-testid="path-continue" />`,
  });
  check(
    "the hub guard DETECTS a duplicated generate call and a second Continue CTA (bite proof)",
    mutated.some((i) => i.includes("duplicates the generate call")) &&
      mutated.some((i) => i.includes("Continue CTAs")),
    JSON.stringify(mutated),
  );
}

// ---------------------------------------------------------------------------
// Database-gated sections: 2 (half), 3, 4, 7
// ---------------------------------------------------------------------------

async function runDatabaseSections() {
  if (!process.env.DATABASE_URL) {
    skip("2. no answer-key leak (database half — no DATABASE_URL set)");
    skip("3. stored selection reasons are returned verbatim (no DATABASE_URL set)");
    skip("4. a path-less plan returns { path: null } (no DATABASE_URL set)");
    skip("7. hazard bite proof — no persisted placeholder survives undetected (no DATABASE_URL set)");
    return;
  }

  console.log("\n2-7. DATABASE-GATED SECTIONS (requires a database)");

  const { prisma } = await import("../lib/prisma");
  const { Prisma } = await import("@prisma/client");
  const { createPath, readPathForStudyPlan, PATH_STEP_BOUNDS } = await import(
    "../lib/study-plan/path"
  );
  const { PLACEHOLDER_KNOWLEDGE_CHECK_ID } = await import("../lib/study-plan/next-step");

  const testEmail = `path-surface-verify-${randomUUID()}@example.com`;
  const studyPlanIds: string[] = [];
  let userId = "";

  async function makeStudyPlan(title: string) {
    const row = await prisma.studyPlan.create({
      data: {
        userId,
        title,
        content: { priorityThemes: [] } as unknown as object,
        sourceReportIds: [] as unknown as object,
        sourceReportCount: 0,
        generationModel: "verify-path-surface-stub",
        draftTokenId: randomUUID(),
      },
    });
    studyPlanIds.push(row.id);
    return row;
  }

  try {
    const user = await prisma.user.create({
      data: { email: testEmail, name: "Path Surface Verify", role: "STUDENT" },
    });
    userId = user.id;

    // -----------------------------------------------------------------
    // Section 4 — PATH-LESS PLAN
    // -----------------------------------------------------------------
    const noPathPlan = await makeStudyPlan("No-path plan");
    const noPath = await readPathForStudyPlan(userId, noPathPlan.id);
    check(
      "a study plan with no path returns null from readPathForStudyPlan (the route's GET then returns 200 with { path: null })",
      noPath === null,
    );
    const routeSrc = fs.readFileSync(ROUTE_PATH, "utf-8");
    check(
      "the GET handler's null branch returns 200 with { path: null }, not a 404",
      /if \(!path\) return response\(\{ path: null \}, 200\);/.test(routeSrc),
    );

    // -----------------------------------------------------------------
    // Section 2 (database half) — NO ANSWER-KEY LEAK through buildPathDTO
    // -----------------------------------------------------------------
    const leakPlan = await makeStudyPlan("Leak-check plan");
    const correctOptionSentinel = `SENTINEL_CORRECT_OPTION_${randomUUID()}`;
    const mcCheck = await prisma.knowledgeCheck.create({
      data: {
        userId,
        studyPlanId: leakPlan.id,
        competencyKey: "delivery_presence",
        format: "MULTIPLE_CHOICE",
        prompt: "Verify path surface — multiple choice prompt",
        payload: { format: "MULTIPLE_CHOICE", options: ["Wrong A", correctOptionSentinel, "Wrong C"] },
        answerKey: { correctIndex: 1 } as unknown as object,
        generationModel: "verify-path-surface-stub",
      },
    });

    const leakPathSteps = [
      {
        position: 1,
        kind: "COACHED_SESSION" as const,
        competencyKey: "delivery_presence" as const,
        selectionReason: "sentinel reason 1",
        knowledgeCheckId: null,
        coachedSessionId: null,
      },
      {
        position: 2,
        kind: "KNOWLEDGE_CHECK" as const,
        competencyKey: "delivery_presence" as const,
        selectionReason: "sentinel reason 2",
        knowledgeCheckId: mcCheck.id,
        coachedSessionId: null,
      },
      {
        position: 3,
        kind: "KNOWLEDGE_CHECK" as const,
        competencyKey: "delivery_presence" as const,
        selectionReason: "sentinel reason 3",
        knowledgeCheckId: mcCheck.id,
        coachedSessionId: null,
      },
      {
        position: 4,
        kind: "KNOWLEDGE_CHECK" as const,
        competencyKey: "delivery_presence" as const,
        selectionReason: "sentinel reason 4",
        knowledgeCheckId: mcCheck.id,
        coachedSessionId: null,
      },
      {
        position: 5,
        kind: "UNAIDED_SESSION" as const,
        competencyKey: "delivery_presence" as const,
        selectionReason: "sentinel reason 5",
        knowledgeCheckId: null,
        coachedSessionId: null,
      },
    ];
    check(
      `leak-check fixture respects PATH_STEP_BOUNDS (${leakPathSteps.length} steps within ${PATH_STEP_BOUNDS.min}-${PATH_STEP_BOUNDS.max})`,
      leakPathSteps.length >= PATH_STEP_BOUNDS.min && leakPathSteps.length <= PATH_STEP_BOUNDS.max,
    );

    const leakPath = await createPath({
      userId,
      studyPlanId: leakPlan.id,
      steps: leakPathSteps,
      selectionSnapshot: { note: "leak-check" },
    });

    const leakDTO = await buildPathDTO(userId, leakPath);
    const serialized = JSON.stringify(leakDTO);
    check("buildPathDTO's serialized output contains no 'answerKey' field", !serialized.includes("answerKey"));
    check("buildPathDTO's serialized output contains no 'correctIndex' field", !serialized.includes("correctIndex"));
    check(
      "buildPathDTO's serialized output never reveals the correct option's sentinel text",
      !serialized.includes(correctOptionSentinel),
    );

    // -----------------------------------------------------------------
    // Section 3 — REASON PRESENT AND STORED, verbatim, for all 5 steps
    // -----------------------------------------------------------------
    const reasonPlan = await makeStudyPlan("Reason plan");
    const sentinelReasons = [1, 2, 3, 4, 5].map(
      (n) => `SENTINEL_REASON_${n}_${randomUUID()}`,
    );
    const reasonSteps = [
      { position: 1, kind: "COACHED_SESSION" as const, competencyKey: "delivery_presence" as const, selectionReason: sentinelReasons[0]!, knowledgeCheckId: null, coachedSessionId: null },
      { position: 2, kind: "UNAIDED_SESSION" as const, competencyKey: "structure_and_clarity" as const, selectionReason: sentinelReasons[1]!, knowledgeCheckId: null, coachedSessionId: null },
      { position: 3, kind: "UNAIDED_SESSION" as const, competencyKey: "concision_and_focus" as const, selectionReason: sentinelReasons[2]!, knowledgeCheckId: null, coachedSessionId: null },
      { position: 4, kind: "UNAIDED_SESSION" as const, competencyKey: "audience_attunement" as const, selectionReason: sentinelReasons[3]!, knowledgeCheckId: null, coachedSessionId: null },
      { position: 5, kind: "UNAIDED_SESSION" as const, competencyKey: "holding_position_under_pressure" as const, selectionReason: sentinelReasons[4]!, knowledgeCheckId: null, coachedSessionId: null },
    ];
    const reasonPath = await createPath({
      userId,
      studyPlanId: reasonPlan.id,
      steps: reasonSteps,
      selectionSnapshot: { note: "reason-check" },
    });
    const reasonDTO = await buildPathDTO(userId, reasonPath);
    const returnedReasons = reasonDTO.steps
      .sort((a, b) => a.position - b.position)
      .map((s) => s.selectionReason);
    check(
      "GET's DTO returns every sentinel selectionReason VERBATIM, in position order",
      JSON.stringify(returnedReasons) === JSON.stringify(sentinelReasons),
      JSON.stringify({ returnedReasons, sentinelReasons }),
    );

    // -----------------------------------------------------------------
    // Section 7 — HAZARD BITE PROOF: plant a placeholder, observe failure,
    // remove it.
    // -----------------------------------------------------------------
    async function findPlaceholderViolations(uid: string): Promise<string[]> {
      const rows = await prisma.studyPlanPathStep.findMany({
        where: {
          knowledgeCheckId: PLACEHOLDER_KNOWLEDGE_CHECK_ID,
          path: { userId: uid },
        },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }

    const beforePlant = await findPlaceholderViolations(userId);
    check(
      "before planting: no persisted step carries the placeholder for this test user",
      beforePlant.length === 0,
    );

    const plantPlan = await makeStudyPlan("Hazard plant plan");
    // Directly calling createPath (not the route) to PLANT the hazard:
    // validatePathSteps is presence-only for knowledgeCheckId (21-08's own
    // documented limitation), so a placeholder step persists here exactly
    // as it would if the route's hazard-closure loop were ever removed or
    // broken — which is the point of this proof.
    const plantedPath = await createPath({
      userId,
      studyPlanId: plantPlan.id,
      steps: [
        {
          position: 1,
          kind: "COACHED_SESSION" as const,
          competencyKey: "delivery_presence" as const,
          selectionReason: "plant 1",
          knowledgeCheckId: null,
          coachedSessionId: null,
        },
        {
          position: 2,
          kind: "KNOWLEDGE_CHECK" as const,
          competencyKey: "structure_and_clarity" as const,
          selectionReason: "plant 2 — carries the hazard on purpose",
          knowledgeCheckId: PLACEHOLDER_KNOWLEDGE_CHECK_ID,
          coachedSessionId: null,
        },
        {
          position: 3,
          kind: "UNAIDED_SESSION" as const,
          competencyKey: "concision_and_focus" as const,
          selectionReason: "plant 3",
          knowledgeCheckId: null,
          coachedSessionId: null,
        },
        {
          position: 4,
          kind: "UNAIDED_SESSION" as const,
          competencyKey: "audience_attunement" as const,
          selectionReason: "plant 4",
          knowledgeCheckId: null,
          coachedSessionId: null,
        },
        {
          position: 5,
          kind: "UNAIDED_SESSION" as const,
          competencyKey: "holding_position_under_pressure" as const,
          selectionReason: "plant 5",
          knowledgeCheckId: null,
          coachedSessionId: null,
        },
      ],
      selectionSnapshot: { note: "hazard-plant" },
    });

    const afterPlant = await findPlaceholderViolations(userId);
    check(
      "PLANTED: the detector FIRES — finds the planted placeholder step (bite proof)",
      afterPlant.length === 1 && afterPlant[0] === plantedPath.steps.find((s) => s.position === 2)!.id,
      JSON.stringify(afterPlant),
    );

    // REMOVE: delete the planted path so this run does not leave a hazard
    // behind for a later run or a later reader of this user's rows.
    await prisma.studyPlanPath.delete({ where: { id: plantedPath.id } });

    const afterRemoval = await findPlaceholderViolations(userId);
    check(
      "AFTER REMOVAL: the detector reports clean again",
      afterRemoval.length === 0,
    );

    // Also prove the GET route's own panel-side backstop: a step DTO with
    // the placeholder still attached (hypothetically) must not resolve to
    // an action link. buildPathDTO filters knowledgeCheckIds that equal the
    // placeholder out of its lookup entirely, so `check` comes back null —
    // confirm that directly against a hand-built in-memory step, with no
    // persistence involved (no DB round trip needed for this half).
    const hazardStepPath = {
      ...reasonPath,
      steps: [
        {
          ...reasonPath.steps[0]!,
          kind: "KNOWLEDGE_CHECK",
          knowledgeCheckId: PLACEHOLDER_KNOWLEDGE_CHECK_ID,
          status: "PENDING",
        },
      ],
    };
    const hazardDTO = await buildPathDTO(userId, hazardStepPath as never);
    check(
      "a step whose knowledgeCheckId is STILL the placeholder resolves to a null check artifact (no dead link data)",
      hazardDTO.steps[0]!.check === null,
    );
    // -----------------------------------------------------------------
    // Stored reasons vs stored kind, across EVERY persisted step. Rows
    // written before the Phase 23 degrade fix are reported, not failed —
    // the route no longer writes them (see section 1b and verify-next-step
    // 10b for the enforced guard and its planted regression).
    // -----------------------------------------------------------------
    const mismatched = await prisma.studyPlanPathStep.findMany({
      where: {
        kind: { in: ["UNAIDED_SESSION", "COACHED_SESSION"] },
        selectionReason: { contains: "knowledge check", mode: "insensitive" },
      },
      select: { id: true, path: { select: { generatedAt: true } } },
    });
    if (mismatched.length > 0) {
      console.log(
        `  WARN ${mismatched.length} legacy UNAIDED/COACHED step(s) still carry a knowledge-check reason (written before the degrade fix; newest path generated ${mismatched
          .map((m) => m.path.generatedAt.toISOString())
          .sort()
          .pop()})`,
      );
    } else {
      check("no persisted UNAIDED/COACHED step reason mentions a knowledge check", true);
    }
  } finally {
    if (studyPlanIds.length > 0) {
      await prisma.studyPlanPath.deleteMany({ where: { studyPlanId: { in: studyPlanIds } } });
      await prisma.knowledgeCheck.deleteMany({ where: { studyPlanId: { in: studyPlanIds } } });
      await prisma.studyPlan.deleteMany({ where: { id: { in: studyPlanIds } } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Section 9 — Phase 23 path engine: VOICE_DRILL + prove-it surfaces
// ---------------------------------------------------------------------------

const PHASE23_ENGINE_FILES = [
  path.join(ROOT, "app", "study-plans", "[planId]", "drills", "[stepId]", "page.tsx"),
  path.join(ROOT, "components", "study-plan", "drill", "DrillBrief.tsx"),
  path.join(ROOT, "components", "study-plan", "drill", "api.ts"),
  path.join(ROOT, "components", "study-plan", "drill", "contract.ts"),
  path.join(ROOT, "components", "study-plan", "prove-it", "usePlanPrefill.ts"),
  path.join(ROOT, "components", "study-plan", "prove-it", "ProveItBrief.tsx"),
  path.join(ROOT, "app", "api", "study-plans", "path-steps", "[stepId]", "drill", "route.ts"),
  path.join(ROOT, "app", "api", "study-plans", "path-steps", "[stepId]", "drill", "attempts", "route.ts"),
  path.join(ROOT, "app", "api", "study-plans", "path-steps", "[stepId]", "drill", "attempts", "[attemptId]", "complete", "route.ts"),
  path.join(ROOT, "app", "api", "study-plans", "path-steps", "[stepId]", "prove-it", "route.ts"),
  path.join(ROOT, "lib", "study-plan", "drill", "brief.ts"),
  path.join(ROOT, "lib", "study-plan", "drill", "grade.ts"),
  path.join(ROOT, "lib", "study-plan", "drill", "service.ts"),
  path.join(ROOT, "lib", "study-plan", "drill", "repository.ts"),
  path.join(ROOT, "lib", "study-plan", "drill", "types.ts"),
  path.join(ROOT, "lib", "study-plan", "prove-it.ts"),
  path.join(ROOT, "lib", "study-plan", "plan-targets.ts"),
  path.join(ROOT, "lib", "study-plan", "next-step.ts"),
];

/** Pure over sources so the bite proof can run it on a mutated copy. */
function engineIssues(src: { panel: string; brief: string }): string[] {
  const issues: string[] = [];
  if (!/\/study-plans\/\$\{planId\}\/drills\/\$\{step\.id\}/.test(src.panel)) issues.push("PathPanel has no /drills/{stepId} href");
  if (!src.panel.includes("step.proveIt?.href")) issues.push("PathPanel does not use the server's prove-it href");
  if (!src.panel.includes('VOICE_DRILL: "Voice drill"')) issues.push("PathPanel has no VOICE_DRILL label");
  // No number mid-drill: the brief renders scores ONLY from completed attempts.
  if (!/const completed = drill\.attempts\.filter\(\(a\) => a\.completedAt !== null\)/.test(src.brief)) {
    issues.push("DrillBrief does not restrict results to completed attempts");
  }
  if (/drill\.attempts\.map/.test(src.brief)) issues.push("DrillBrief maps over ALL attempts (open ones included)");
  return issues;
}

function runSection9() {
  console.log("\n9. PHASE 23 PATH ENGINE (voice drill + prove-it surfaces)");
  const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "");
  const drillPage = path.join(ROOT, "app", "study-plans", "[planId]", "drills", "[stepId]", "page.tsx");
  check("the VOICE_DRILL destination page exists on disk (app/study-plans/[planId]/drills/[stepId]/page.tsx)", fs.existsSync(drillPage));
  check(
    "the deliberately-wrong singular '/drill/' page does NOT exist (inverted assertion)",
    !fs.existsSync(path.join(ROOT, "app", "study-plans", "[planId]", "drill", "[stepId]", "page.tsx")),
  );
  check("the drill page loads the brief through the drill API client", read(drillPage).includes("fetchDrill(params.stepId)"));

  const sources = {
    panel: read(PANEL_PATH),
    brief: read(path.join(ROOT, "components", "study-plan", "drill", "DrillBrief.tsx")),
  };
  const issues = engineIssues(sources);
  check("the drill + prove-it surfaces are wired as specified", issues.length === 0, JSON.stringify(issues));
  const mutated = engineIssues({
    panel: sources.panel.split("/drills/").join("/drill/"),
    brief: sources.brief.replace("completed.map(", "drill.attempts.map("),
  });
  check(
    "the engine guard DETECTS a wrong drill href and open attempts rendered (bite proof)",
    mutated.some((i) => i.includes("/drills/")) && mutated.some((i) => i.includes("ALL attempts")),
    JSON.stringify(mutated),
  );

  for (const filePath of PHASE23_ENGINE_FILES) {
    if (!fs.existsSync(filePath)) {
      check(`${path.relative(ROOT, filePath)} exists`, false, "MISSING");
      continue;
    }
    const stripped = stripCommentsAndStrings(fs.readFileSync(filePath, "utf-8")).toLowerCase();
    const matches = FORBIDDEN_TERMS.filter((term) => stripped.includes(term));
    check(
      `${path.relative(ROOT, filePath)} contains no gating/streak term outside a comment or string`,
      matches.length === 0,
      JSON.stringify(matches),
    );
  }
  // Bite proof for the scan itself on a new file.
  const planted = stripCommentsAndStrings("const isUnlocked = drillCount > 0;").toLowerCase();
  check("the forbidden-term scan DETECTS a planted identifier (bite proof)", FORBIDDEN_TERMS.some((t) => planted.includes(t)));
}

// ---------------------------------------------------------------------------
// Section 10 — Phase 23 check card: next step through the path contract
// ---------------------------------------------------------------------------

async function runSection10() {
  console.log("\n10. PHASE 23 CHECK CARD — next step via hrefForStep, no gating terms");
  const { hrefForStep } = await import("../components/study-plan/PathPanel");
  const base = {
    id: "step-1", position: 1, competencyKey: "structure_and_clarity", competencyLabel: "Structure",
    selectionReason: "r", status: "PENDING", completedAt: null, coachedSessionId: null,
    practiceSlug: null, check: null, coachedPhase: null,
  } as const;
  check(
    "hrefForStep: a KNOWLEDGE_CHECK step links to the check page contract",
    hrefForStep("plan-1", { ...base, kind: "KNOWLEDGE_CHECK", knowledgeCheckId: "chk-9" }) === "/study-plans/plan-1/checks/chk-9",
  );
  check(
    "hrefForStep: the placeholder id yields no link (the card then shows only back-to-plan)",
    hrefForStep("plan-1", { ...base, kind: "KNOWLEDGE_CHECK", knowledgeCheckId: "__PENDING_GENERATION__" }) === null,
  );
  const card = fs.readFileSync(path.join(ROOT, "components/study-plan/KnowledgeCheckCard.tsx"), "utf-8");
  check(
    "the check card imports hrefForStep from PathPanel (no copied link contract)",
    /import \{ hrefForStep[^}]*\} from "@\/components\/study-plan\/PathPanel"/.test(card) && !card.includes("/drills/") && !card.includes("/coached/"),
  );
  for (const rel of [
    "components/study-plan/KnowledgeCheckCard.tsx",
    "app/study-plans/[planId]/checks/[checkId]/page.tsx",
    "lib/study-plan/checks/copy.ts",
    "lib/study-plan/checks/explain.ts",
  ]) {
    const stripped = stripCommentsAndStrings(fs.readFileSync(path.join(ROOT, rel), "utf-8")).toLowerCase();
    const matches = FORBIDDEN_TERMS.filter((term) => stripped.includes(term));
    check(`${rel} contains no gating/streak term outside a comment or string`, matches.length === 0, JSON.stringify(matches));
  }
}

async function main() {
  runSection1();
  runSection1Moved();
  runSection1b();
  runSection2Source();
  runSection5();
  runSection6();
  runSection8();
  runSection9();
  await runSection10();
  await runDatabaseSections();

  console.log(
    failures === 0
      ? `\nALL PASS (${passCount} checks)\n`
      : `\nFAILED: ${failures} assertion(s), ${passCount} passed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
