/**
 * Plan 21-12: prove coached mode's isolation from normal practice, and the
 * invariants its engine-relationship decision depends on.
 *
 * Style mirrors scripts/verify-dc-surface-count.ts and
 * scripts/verify-path-model.ts. Sections 1-3 are pure and run with no
 * DATABASE_URL. Section 4 needs a live database and prints an explicit SKIP
 * line when DATABASE_URL is unset.
 *
 * Run:         npx tsx scripts/verify-coached-mode-isolation.ts
 * Run with DB: DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" \
 *                npx tsx scripts/verify-coached-mode-isolation.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { COACHED_PHASES } from "../lib/study-plan/coached/instance";
import { ENGINE_TYPES } from "../lib/engine/registry";

const ROOT = resolve(__dirname, "..");

let failures = 0;

function fail(msg: string) {
  console.log(`  FAIL ${msg}`);
  failures += 1;
}

function ok(msg: string) {
  console.log(`  ok   ${msg}`);
}

function skip(msg: string) {
  console.log(`  SKIP ${msg}`);
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

function read(relPath: string): string {
  return readFileSync(abs(...relPath.split("/")), "utf8");
}

// ---------------------------------------------------------------------------
console.log("\n1. SIGNATURE GUARD — pathStepId required, REPLAY-first order, no standalone variant");
{
  const src = read("lib/study-plan/coached/instance.ts");

  check(
    "pathStepId never appears as pathStepId? (optional)",
    !/pathStepId\?/.test(src),
  );
  check(
    'pathStepId never appears typed as "string | null"',
    !/pathStepId\s*:\s*string\s*\|\s*null/.test(src),
  );
  check(
    "pathStepId appears as a required parameter",
    /pathStepId\s*:\s*string;/.test(src),
  );

  for (const forbidden of ["standalone", "adHoc", "withoutPath"]) {
    const re = new RegExp(forbidden, "i");
    check(`no "${forbidden}" identifier in instance.ts`, !re.test(src));
  }

  check(
    'COACHED_PHASES[0] === "REPLAY" (locked ordering)',
    COACHED_PHASES[0] === "REPLAY",
    `COACHED_PHASES=${JSON.stringify(COACHED_PHASES)}`,
  );
  check(
    'COACHED_PHASES[1] === "FRESH" (locked ordering)',
    COACHED_PHASES[1] === "FRESH",
    `COACHED_PHASES=${JSON.stringify(COACHED_PHASES)}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n2. REGISTRY GUARD — coached mode is not, and has never become, an ENGINE_TYPES entry");
{
  const slugs = ENGINE_TYPES.map((t) => t.slug.toLowerCase());
  const labels = ENGINE_TYPES.map((t) => t.name.toLowerCase());
  console.log(`  ENGINE_TYPES count=${ENGINE_TYPES.length} slugs=[${slugs.join(", ")}]`);

  check(
    "no ENGINE_TYPES slug contains \"coach\"",
    slugs.every((s) => !s.includes("coach")),
    slugs.filter((s) => s.includes("coach")).join(", "),
  );
  check(
    "no ENGINE_TYPES label/name contains \"coach\"",
    labels.every((l) => !l.includes("coach")),
    labels.filter((l) => l.includes("coach")).join(", "),
  );

  // The authoritative declared count lives in
  // scripts/verify-knowledge-check-surface.ts's EXPECTED_ENGINE_TYPES_COUNT
  // (13, as of 2026-10-20, per 21-COACHED-ENGINE-DECISION.md's own
  // investigation). This assertion is the one that fails the moment someone
  // registers a coached-practice type — the exact alternative Task 1's
  // document rejected.
  const EXPECTED_ENGINE_TYPES_COUNT = 13;
  check(
    `ENGINE_TYPES.length is unchanged at ${EXPECTED_ENGINE_TYPES_COUNT} (bump deliberately, in lockstep with verify-knowledge-check-surface.ts, if it ever grows for a real reason)`,
    ENGINE_TYPES.length === EXPECTED_ENGINE_TYPES_COUNT,
    `actual: ${ENGINE_TYPES.length}`,
  );
}

// ---------------------------------------------------------------------------
const forbiddenIdentReForBite = /\b(CoachedSession|coachTip|techniqueReminder|COACHED_PHASES)\b/;

console.log("\n3. NO COACHING IN NORMAL PRACTICE — walked, non-vacuously");
{
  const practiceRoots = ["components/practice", "app/practice"];
  const walked = practiceRoots
    .flatMap((root) => walkFiles(abs(...root.split("/"))))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => rel(f));

  console.log(`  walked ${walked.length} file(s) under components/practice/ and app/practice/:`);
  for (const f of walked) console.log(`    - ${f}`);

  check(
    "walked file count is greater than 5 (the guard is provably non-vacuous)",
    walked.length > 5,
    `walked=${walked.length}`,
  );

  check(
    "components/practice/PracticeSessionShell.tsx exists and was walked",
    walked.includes("components/practice/PracticeSessionShell.tsx"),
    `walked=[${walked.join(", ")}]`,
  );

  const forbiddenImportRe = /from\s+["'](?:@\/lib\/study-plan\/coached(?:\/[^"']*)?|(?:\.\.\/)+study-plan\/coached(?:\/[^"']*)?)["']/;
  const forbiddenIdentRe = /\b(CoachedSession|coachTip|techniqueReminder|COACHED_PHASES)\b/;

  for (const f of walked) {
    const src = readFileSync(abs(...f.split("/")), "utf8");
    check(`no coached-mode import: ${f}`, !forbiddenImportRe.test(src));
    check(`no coached-mode identifier: ${f}`, !forbiddenIdentRe.test(src));
  }
}

// ---------------------------------------------------------------------------
// AMENDED DELIBERATELY (Phase 22 G4, 22-SHARED-SHELL-DECISION.md, user
// decision 2026-10-23): coached sessions reuse the interview/practice session
// chrome. That chrome now lives in the neutral components/session/, which
// BOTH trees may import. Section 3 above is unchanged — components/practice/
// and app/practice/ still may not name or import anything coached. Section 3b
// keeps the shared location neutral, so it can never become a back door.
console.log("\n3b. SHARED SESSION CHROME — permitted to both trees, and neutral");
{
  const sharedFiles = walkFiles(abs("components", "session"))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => rel(f));
  console.log(`  walked ${sharedFiles.length} file(s) under components/session/:`);
  for (const f of sharedFiles) console.log(`    - ${f}`);
  check(
    "components/session/ walk is non-vacuous (at least 5 files)",
    sharedFiles.length >= 5,
    `walked=${sharedFiles.length}`,
  );

  const sharedForbiddenImportRe =
    /from\s+["'](?:@\/(?:components\/practice|components\/study-plan|lib\/study-plan)(?:\/[^"']*)?|(?:\.\.\/)+(?:practice|study-plan)(?:\/[^"']*)?)["']/;
  const sharedForbiddenIdentRe =
    /\b(CoachedSession|coachTip|techniqueReminder|COACHED_PHASES|coachedSessionId|COACH_LAYER_MARKER)\b/;
  for (const f of sharedFiles) {
    const src = readFileSync(abs(...f.split("/")), "utf8");
    check(
      `shared chrome imports nothing from components/practice, components/study-plan or lib/study-plan: ${f}`,
      !sharedForbiddenImportRe.test(src),
    );
    check(`shared chrome names no coached identifier: ${f}`, !sharedForbiddenIdentRe.test(src));
  }

  // Both trees actually use it (the permission is exercised, not theoretical).
  const practiceShell = read("components/practice/PracticeSessionShell.tsx");
  const coachedShell = read("components/study-plan/CoachedSessionShell.tsx");
  const sharedImportRe = /from\s+["']@\/components\/session\//;
  check("PracticeSessionShell imports from components/session/ (permitted)", sharedImportRe.test(practiceShell));
  check("CoachedSessionShell imports from components/session/ (permitted)", sharedImportRe.test(coachedShell));
  check(
    "CoachedSessionShell imports nothing from components/practice/ (the shared pieces come from components/session/)",
    !/from\s+["']@\/components\/practice\//.test(coachedShell),
  );

  // Bite-proofs: a coached import or identifier dropped into the shared
  // location, and a coached identifier dropped into the practice shell, are
  // both caught by the regexes above.
  check(
    "bite-proof: an @/lib/study-plan/coached import in shared chrome is caught",
    sharedForbiddenImportRe.test('import { x } from "@/lib/study-plan/coached/coach";'),
  );
  check(
    "bite-proof: a CoachedSession identifier in shared chrome is caught",
    sharedForbiddenIdentRe.test("const s: CoachedSession = null;"),
  );
  check(
    "bite-proof: a coached identifier in the practice shell is still caught by section 3",
    forbiddenIdentReForBite.test(practiceShell + "\nconst x = COACHED_PHASES;"),
  );
}

// ---------------------------------------------------------------------------
console.log("\n4. ENTRY ENFORCEMENT — requires a database");
async function runDatabaseSection() {
  if (!process.env.DATABASE_URL) {
    skip("4. ENTRY ENFORCEMENT (no DATABASE_URL set)");
    return;
  }

  const { prisma } = await import("../lib/prisma");
  const { createPath } = await import("../lib/study-plan/path");
  const {
    createCoachedSession,
    finishCoachedSession,
    markReplayLegComplete,
    retargetLegacyCoachedSession,
    NotReachableOutsideAPathError,
    InvalidReplayTargetError,
    InvalidFreshMomentError,
  } = await import("../lib/study-plan/coached/instance");

  const COMPETENCY_KEY = "delivery_presence" as const;

  function makeSteps() {
    return [
      {
        position: 1,
        kind: "KNOWLEDGE_CHECK" as const,
        competencyKey: COMPETENCY_KEY,
        selectionReason: "verify-coached-mode-isolation: knowledge check step",
        knowledgeCheckId: "kc-stub-id",
        coachedSessionId: null,
      },
      {
        position: 2,
        kind: "COACHED_SESSION" as const,
        competencyKey: COMPETENCY_KEY,
        selectionReason: "verify-coached-mode-isolation: coached session step",
        knowledgeCheckId: null,
        coachedSessionId: null,
      },
      {
        position: 3,
        kind: "UNAIDED_SESSION" as const,
        competencyKey: COMPETENCY_KEY,
        selectionReason: "verify-coached-mode-isolation: unaided step",
        knowledgeCheckId: null,
        coachedSessionId: null,
      },
      {
        position: 4,
        kind: "UNAIDED_SESSION" as const,
        competencyKey: COMPETENCY_KEY,
        selectionReason: "verify-coached-mode-isolation: unaided step",
        knowledgeCheckId: null,
        coachedSessionId: null,
      },
      {
        position: 5,
        kind: "UNAIDED_SESSION" as const,
        competencyKey: COMPETENCY_KEY,
        selectionReason: "verify-coached-mode-isolation: unaided step",
        knowledgeCheckId: null,
        coachedSessionId: null,
      },
    ];
  }

  const testId = randomUUID();
  const email = `coached-isolation-verify-${testId}@example.com`;
  const otherEmail = `coached-isolation-verify-other-${testId}@example.com`;
  let userId = "";
  let otherUserId = "";
  const studyPlanIds: string[] = [];
  const reportIds: string[] = [];

  async function makeStudyPlan(owner: string, title: string) {
    const row = await prisma.studyPlan.create({
      data: {
        userId: owner,
        title,
        content: { priorityThemes: [] } as unknown as object,
        sourceReportIds: [] as unknown as object,
        sourceReportCount: 0,
        generationModel: "verify-coached-mode-isolation-stub",
        draftTokenId: randomUUID(),
      },
    });
    studyPlanIds.push(row.id);
    return row;
  }

  async function makeReport(owner: string, turnCount: number) {
    const row = await prisma.interactionReport.create({
      data: {
        userId: owner,
        typeSlug: "general",
        turnCount,
      },
    });
    reportIds.push(row.id);
    return row;
  }

  try {
    const user = await prisma.user.create({
      data: { email, name: "Coached Isolation Verify", role: "STUDENT" },
    });
    userId = user.id;
    const otherUser = await prisma.user.create({
      data: { email: otherEmail, name: "Coached Isolation Verify Other", role: "STUDENT" },
    });
    otherUserId = otherUser.id;

    const plan = await makeStudyPlan(userId, "Coached Isolation Verify Plan");
    const path = await createPath({
      userId,
      studyPlanId: plan.id,
      steps: makeSteps(),
      selectionSnapshot: { note: "coached-isolation-verify" },
    });
    const knowledgeCheckStep = path.steps.find((s) => s.kind === "KNOWLEDGE_CHECK")!;
    const coachedStep = path.steps.find((s) => s.kind === "COACHED_SESSION")!;

    const report = await makeReport(userId, 10);
    const otherReport = await makeReport(otherUserId, 10);

    // createCoachedSession on a KNOWLEDGE_CHECK step throws.
    let threwOnWrongKind = false;
    try {
      await createCoachedSession({
        userId,
        pathStepId: knowledgeCheckStep.id,
        replaySourceReportId: report.id,
        replayTurnIndex: 0,
        freshSourceReportId: null,
        freshTurnIndex: null,
        selectionBasis: "PER_TURN_SCORE" as const,
        replayMomentScore: 2,
        freshMomentScore: null,
      });
    } catch (err) {
      threwOnWrongKind = err instanceof NotReachableOutsideAPathError;
    }
    check(
      "createCoachedSession on a KNOWLEDGE_CHECK step throws NotReachableOutsideAPathError",
      threwOnWrongKind,
    );

    // createCoachedSession on another user's COACHED_SESSION step throws.
    let threwOnForeignStep = false;
    try {
      await createCoachedSession({
        userId: otherUserId,
        pathStepId: coachedStep.id,
        replaySourceReportId: otherReport.id,
        replayTurnIndex: 0,
        freshSourceReportId: null,
        freshTurnIndex: null,
        selectionBasis: "PER_TURN_SCORE" as const,
        replayMomentScore: 2,
        freshMomentScore: null,
      });
    } catch (err) {
      threwOnForeignStep = err instanceof NotReachableOutsideAPathError;
    }
    check(
      "createCoachedSession on another user's COACHED_SESSION step throws NotReachableOutsideAPathError",
      threwOnForeignStep,
    );

    // replayTurnIndex beyond turnCount throws.
    let threwOnBadTurnIndex = false;
    try {
      await createCoachedSession({
        userId,
        pathStepId: coachedStep.id,
        replaySourceReportId: report.id,
        replayTurnIndex: 999,
        freshSourceReportId: null,
        freshTurnIndex: null,
        selectionBasis: "PER_TURN_SCORE" as const,
        replayMomentScore: 2,
        freshMomentScore: null,
      });
    } catch (err) {
      threwOnBadTurnIndex = err instanceof InvalidReplayTargetError;
    }
    check(
      "createCoachedSession with replayTurnIndex beyond turnCount throws InvalidReplayTargetError",
      threwOnBadTurnIndex,
    );

    // replaySourceReportId owned by a different user throws.
    let threwOnForeignReport = false;
    try {
      await createCoachedSession({
        userId,
        pathStepId: coachedStep.id,
        replaySourceReportId: otherReport.id,
        replayTurnIndex: 0,
        freshSourceReportId: null,
        freshTurnIndex: null,
        selectionBasis: "PER_TURN_SCORE" as const,
        replayMomentScore: 2,
        freshMomentScore: null,
      });
    } catch (err) {
      threwOnForeignReport = err instanceof InvalidReplayTargetError;
    }
    check(
      "createCoachedSession with another user's replaySourceReportId throws InvalidReplayTargetError",
      threwOnForeignReport,
    );

    // Half-set fresh moment throws.
    let threwOnEmptyFresh = false;
    try {
      await createCoachedSession({
        userId,
        pathStepId: coachedStep.id,
        replaySourceReportId: report.id,
        replayTurnIndex: 0,
        freshSourceReportId: report.id,
        freshTurnIndex: null,
        selectionBasis: "PER_TURN_SCORE" as const,
        replayMomentScore: 2,
        freshMomentScore: 2,
      });
    } catch (err) {
      threwOnEmptyFresh = err instanceof InvalidFreshMomentError;
    }
    check(
      "createCoachedSession with a half-set fresh moment throws InvalidFreshMomentError",
      threwOnEmptyFresh,
    );

    // Fresh equal to replay throws.
    let threwOnSameMoment = false;
    try {
      await createCoachedSession({
        userId,
        pathStepId: coachedStep.id,
        replaySourceReportId: report.id,
        replayTurnIndex: 1,
        freshSourceReportId: report.id,
        freshTurnIndex: 1,
        selectionBasis: "PER_TURN_SCORE",
        replayMomentScore: 2,
        freshMomentScore: 2,
      });
    } catch (err) {
      threwOnSameMoment = err instanceof InvalidFreshMomentError;
    }
    check("fresh moment equal to replay moment throws InvalidFreshMomentError", threwOnSameMoment);

    // Foreign fresh report throws.
    let threwOnForeignFresh = false;
    try {
      await createCoachedSession({
        userId,
        pathStepId: coachedStep.id,
        replaySourceReportId: report.id,
        replayTurnIndex: 1,
        freshSourceReportId: otherReport.id,
        freshTurnIndex: 2,
        selectionBasis: "PER_TURN_SCORE",
        replayMomentScore: 2,
        freshMomentScore: 2,
      });
    } catch (err) {
      threwOnForeignFresh = err instanceof InvalidFreshMomentError;
    }
    check("another user's fresh report throws InvalidFreshMomentError", threwOnForeignFresh);

    // A valid create succeeds, writes coachedSessionId back, and a second
    // identical create returns the SAME session rather than erroring or
    // creating a second row.
    const createdSession = await createCoachedSession({
      userId,
      pathStepId: coachedStep.id,
      replaySourceReportId: report.id,
      replayTurnIndex: 0,
      freshSourceReportId: report.id,
      freshTurnIndex: 3,
      selectionBasis: "PER_TURN_SCORE",
      replayMomentScore: 2,
      freshMomentScore: 3,
    });
    check("valid createCoachedSession succeeds", !!createdSession.id);
    check("created session has phase REPLAY", createdSession.phase === "REPLAY");
    check("two-moment session has legCount 2", createdSession.legCount === 2);

    const stepAfterCreate = await prisma.studyPlanPathStep.findUnique({
      where: { id: coachedStep.id },
    });
    check(
      "coachedSessionId was written back onto the step",
      stepAfterCreate?.coachedSessionId === createdSession.id,
    );

    const secondCreate = await createCoachedSession({
      userId,
      pathStepId: coachedStep.id,
      replaySourceReportId: report.id,
      replayTurnIndex: 0,
      freshSourceReportId: report.id,
      freshTurnIndex: 3,
      selectionBasis: "PER_TURN_SCORE",
      replayMomentScore: 2,
      freshMomentScore: 3,
    });
    check(
      "a second identical create returns the SAME session id (resumes, does not duplicate)",
      secondCreate.id === createdSession.id,
    );
    const sessionCountForStep = await prisma.coachedSession.count({
      where: { pathStepId: coachedStep.id },
    });
    check(
      "exactly one CoachedSession row exists for the step after the duplicate call",
      sessionCountForStep === 1,
      `count=${sessionCountForStep}`,
    );

    // finishCoachedSession marks the step COMPLETE and writes no
    // MasteryContribution row.
    const contributionCountBefore = await prisma.masteryContribution.count({
      where: { userId },
    });

    // Phase derivation: REPLAY -> FRESH (after markReplayLegComplete) -> COMPLETE.
    await markReplayLegComplete(userId, createdSession.id);
    const { readCoachedSession } = await import("../lib/study-plan/coached/instance");
    const midSession = await readCoachedSession(userId, createdSession.id);
    check("phase reads FRESH after markReplayLegComplete", midSession?.phase === "FRESH");
    let threwOnSecondMark = false;
    try {
      await markReplayLegComplete(userId, createdSession.id);
    } catch {
      threwOnSecondMark = true;
    }
    check("markReplayLegComplete twice throws", threwOnSecondMark);

    // A completed or Phase 22 session must not be re-targeted.
    let threwOnRetargetNew = false;
    try {
      await retargetLegacyCoachedSession(userId, createdSession.id, {
        replaySourceReportId: report.id,
        replayTurnIndex: 1,
        freshSourceReportId: null,
        freshTurnIndex: null,
        selectionBasis: "PER_TURN_SCORE",
        replayMomentScore: 2,
        freshMomentScore: null,
      });
    } catch {
      threwOnRetargetNew = true;
    }
    check("retargetLegacyCoachedSession refuses a row with a selectionBasis", threwOnRetargetNew);

    await finishCoachedSession(userId, createdSession.id);
    const doneSession = await readCoachedSession(userId, createdSession.id);
    check("phase reads COMPLETE after finishCoachedSession (no reportId needed)", doneSession?.phase === "COMPLETE");

    const stepAfterFinish = await prisma.studyPlanPathStep.findUnique({
      where: { id: coachedStep.id },
    });
    check(
      "finishCoachedSession marks the owning step COMPLETE",
      stepAfterFinish?.status === "COMPLETE",
      `status=${stepAfterFinish?.status}`,
    );

    const finishedSession = await prisma.coachedSession.findUnique({
      where: { id: createdSession.id },
    });
    check(
      "finishCoachedSession writes completedAt and no reportId",
      finishedSession?.reportId === null && finishedSession?.completedAt != null,
    );

    const contributionCountAfter = await prisma.masteryContribution.count({
      where: { userId },
    });
    check(
      "finishCoachedSession writes NO MasteryContribution row (21-16 is the single writer)",
      contributionCountAfter === contributionCountBefore,
      `before=${contributionCountBefore} after=${contributionCountAfter}`,
    );

    // Legacy (selectionBasis null, incomplete) row may be re-targeted; a thin
    // session (both fresh null) is accepted on a second path.
    const plan2 = await makeStudyPlan(userId, "Coached Isolation Verify Plan 2");
    const path2 = await createPath({
      userId,
      studyPlanId: plan2.id,
      steps: makeSteps(),
      selectionSnapshot: { note: "coached-isolation-verify-2" },
    });
    const coachedStep2 = path2.steps.find((s) => s.kind === "COACHED_SESSION")!;
    const thin = await createCoachedSession({
      userId,
      pathStepId: coachedStep2.id,
      replaySourceReportId: report.id,
      replayTurnIndex: 2,
      freshSourceReportId: null,
      freshTurnIndex: null,
      selectionBasis: "GROWTH_AREA_FALLBACK",
      replayMomentScore: null,
      freshMomentScore: null,
    });
    check("thin evidence (both fresh null) is accepted with legCount 1", thin.legCount === 1);
    await prisma.coachedSession.update({
      where: { id: thin.id },
      data: { selectionBasis: null },
    });
    const retargeted = await retargetLegacyCoachedSession(userId, thin.id, {
      replaySourceReportId: report.id,
      replayTurnIndex: 4,
      freshSourceReportId: report.id,
      freshTurnIndex: 5,
      selectionBasis: "PER_TURN_SCORE",
      replayMomentScore: 2,
      freshMomentScore: 3,
    });
    check(
      "retargetLegacyCoachedSession rewrites a legacy incomplete row",
      retargeted.replayTurnIndex === 4 && retargeted.freshTurnIndex === 5 && retargeted.selectionBasis === "PER_TURN_SCORE",
    );
  } finally {
    if (reportIds.length > 0) {
      await prisma.coachedSession.deleteMany({ where: { replaySourceReportId: { in: reportIds } } });
      await prisma.interactionReport.deleteMany({ where: { id: { in: reportIds } } });
    }
    if (studyPlanIds.length > 0) {
      await prisma.studyPlanPath.deleteMany({ where: { studyPlanId: { in: studyPlanIds } } });
      await prisma.studyPlan.deleteMany({ where: { id: { in: studyPlanIds } } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (otherUserId) await prisma.user.deleteMany({ where: { id: otherUserId } });
    await prisma.$disconnect();
  }
}

runDatabaseSection()
  .then(() => {
    if (failures === 0) {
      console.log("\nverify-coached-mode-isolation: ALL SECTIONS PASSED\n");
      process.exit(0);
    } else {
      console.log(`\nverify-coached-mode-isolation: FAILED (${failures} failure(s))\n`);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
