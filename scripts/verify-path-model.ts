/**
 * Proves plan 21-08's four path invariants:
 *   1. BOUND — 5-10 steps, enforced in code (the schema does not enforce it).
 *   2. POSITIONS — 1-based, contiguous, no duplicates.
 *   3. KIND/REFERENCE CONSISTENCY — including BOTH halves of the
 *      state-dependent COACHED_SESSION rule (PENDING-null accept,
 *      non-PENDING-null reject).
 *   4. A path is a child of its study plan: one per plan, a new plan gets a
 *      new path, and an older path is neither discarded nor carried forward.
 *
 * Sections 1, 2, 3 and 5 are pure and run with no DATABASE_URL. Section 4
 * needs a live database and prints an explicit SKIP line when DATABASE_URL
 * is unset.
 *
 * Run: npx tsx scripts/verify-path-model.ts
 * Run with DB: DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" \
 *   npx tsx scripts/verify-path-model.ts
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import {
  PATH_STEP_BOUNDS,
  PathAlreadyExistsError,
  validatePathSteps,
  type PathStepInput,
} from "../lib/study-plan/path";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

function skip(name: string) {
  console.log(`  SKIP ${name}`);
}

const COMPETENCY_KEY = "delivery_presence" as const;
const OTHER_COMPETENCY_KEY = "structure_and_clarity" as const;

function makeSteps(count: number, overrides?: Partial<PathStepInput>[]): PathStepInput[] {
  return Array.from({ length: count }, (_, i) => {
    const base: PathStepInput = {
      position: i + 1,
      kind: "UNAIDED_SESSION",
      competencyKey: COMPETENCY_KEY,
      selectionReason: `step ${i + 1} targets the weakest competency`,
      knowledgeCheckId: null,
      coachedSessionId: null,
    };
    return { ...base, ...(overrides?.[i] ?? {}) };
  });
}

console.log("\n1. BOUND — 5-10 steps enforced in code");
{
  const four = validatePathSteps(makeSteps(4));
  check("4 steps rejected", four.length > 0);
  check(
    "4-step rejection names both 5 and 10",
    four.some((m) => m.includes("5") && m.includes("10")),
    JSON.stringify(four),
  );

  const zero = validatePathSteps(makeSteps(0));
  check("0 steps rejected", zero.length > 0);

  const five = validatePathSteps(makeSteps(5));
  check("5 steps accepted", five.length === 0, JSON.stringify(five));

  const ten = validatePathSteps(makeSteps(10));
  check("10 steps accepted", ten.length === 0, JSON.stringify(ten));

  const eleven = validatePathSteps(makeSteps(11));
  check("11 steps rejected", eleven.length > 0);
  check(
    "11-step rejection names both 5 and 10",
    eleven.some((m) => m.includes("5") && m.includes("10")),
    JSON.stringify(eleven),
  );

  check(
    "PATH_STEP_BOUNDS is {min:5,max:10}",
    PATH_STEP_BOUNDS.min === 5 && PATH_STEP_BOUNDS.max === 10,
  );
}

console.log("\n2. POSITIONS — contiguous, 1-based, no duplicates");
{
  const dup = makeSteps(5);
  dup[1]!.position = 1; // duplicate of step 0
  check("duplicate position rejected", validatePathSteps(dup).length > 0);

  const cleanGap = [1, 2, 4, 5, 6].map((position, i) => ({
    position,
    kind: "UNAIDED_SESSION" as const,
    competencyKey: COMPETENCY_KEY,
    selectionReason: `step ${i}`,
    knowledgeCheckId: null,
    coachedSessionId: null,
  }));
  check("gap (1,2,4,5,6) rejected", validatePathSteps(cleanGap).length > 0);

  const zeroBased = [0, 1, 2, 3, 4].map((position, i) => ({
    position,
    kind: "UNAIDED_SESSION" as const,
    competencyKey: COMPETENCY_KEY,
    selectionReason: `step ${i}`,
    knowledgeCheckId: null,
    coachedSessionId: null,
  }));
  check("0-based (0..4) rejected", validatePathSteps(zeroBased).length > 0);

  const ordered = makeSteps(5);
  const shuffled = [ordered[3]!, ordered[0]!, ordered[4]!, ordered[1]!, ordered[2]!];
  check(
    "shuffled-but-contiguous array ACCEPTED (array order is not the invariant)",
    validatePathSteps(shuffled).length === 0,
    JSON.stringify(validatePathSteps(shuffled)),
  );
}

console.log("\n3. KIND/REFERENCE CONSISTENCY, including both coached halves");
{
  // KNOWLEDGE_CHECK
  {
    const withId = makeSteps(5, [{ kind: "KNOWLEDGE_CHECK", knowledgeCheckId: "kc-1" }]);
    check(
      "KNOWLEDGE_CHECK with its own id accepted",
      validatePathSteps(withId).length === 0,
      JSON.stringify(validatePathSteps(withId)),
    );

    const noId = makeSteps(5, [{ kind: "KNOWLEDGE_CHECK", knowledgeCheckId: null }]);
    check("KNOWLEDGE_CHECK with no id rejected", validatePathSteps(noId).length > 0);

    const withCoached = makeSteps(5, [
      { kind: "KNOWLEDGE_CHECK", knowledgeCheckId: "kc-1", coachedSessionId: "cs-1" },
    ]);
    check(
      "KNOWLEDGE_CHECK carrying a coachedSessionId rejected",
      validatePathSteps(withCoached).length > 0,
    );
  }

  // UNAIDED_SESSION
  {
    const neither = makeSteps(5, [{ kind: "UNAIDED_SESSION" }]);
    check(
      "UNAIDED_SESSION with neither id accepted",
      validatePathSteps(neither).length === 0,
      JSON.stringify(validatePathSteps(neither)),
    );

    const withKc = makeSteps(5, [{ kind: "UNAIDED_SESSION", knowledgeCheckId: "kc-1" }]);
    check("UNAIDED_SESSION carrying knowledgeCheckId rejected", validatePathSteps(withKc).length > 0);

    const withCs = makeSteps(5, [{ kind: "UNAIDED_SESSION", coachedSessionId: "cs-1" }]);
    check("UNAIDED_SESSION carrying coachedSessionId rejected", validatePathSteps(withCs).length > 0);
  }

  // COACHED_SESSION — the amendment, both halves.
  {
    const pendingNull = makeSteps(5, [
      { kind: "COACHED_SESSION", status: "PENDING", coachedSessionId: null },
    ]);
    // AMENDMENT ACCEPT CASE: a PENDING coached step with a null
    // coachedSessionId is valid — this is what makes 21-19's POST and
    // 21-23's step-entry route constructible at all. A later "tightening"
    // that re-requires the id at creation must fail HERE, loudly, rather
    // than break the coached entry route at runtime.
    check(
      "COACHED_SESSION status=PENDING coachedSessionId=null ACCEPTED (amendment accept case)",
      validatePathSteps(pendingNull).length === 0,
      JSON.stringify(validatePathSteps(pendingNull)),
    );

    const pendingWithId = makeSteps(5, [
      { kind: "COACHED_SESSION", status: "PENDING", coachedSessionId: "cs-1" },
    ]);
    check(
      "COACHED_SESSION status=PENDING coachedSessionId set accepted (post-entry state)",
      validatePathSteps(pendingWithId).length === 0,
      JSON.stringify(validatePathSteps(pendingWithId)),
    );

    const completeNull = makeSteps(5, [
      { kind: "COACHED_SESSION", status: "COMPLETE", coachedSessionId: null },
    ]);
    // AMENDMENT REJECT CASE (other half): status !== PENDING with a null id.
    check(
      "COACHED_SESSION status=COMPLETE coachedSessionId=null REJECTED, naming the status",
      validatePathSteps(completeNull).some((m) => m.includes("COMPLETE")),
      JSON.stringify(validatePathSteps(completeNull)),
    );

    const inProgressNull = makeSteps(5, [
      { kind: "COACHED_SESSION", status: "IN_PROGRESS", coachedSessionId: null },
    ]);
    check(
      "COACHED_SESSION status=IN_PROGRESS coachedSessionId=null REJECTED, naming the status",
      validatePathSteps(inProgressNull).some((m) => m.includes("IN_PROGRESS")),
      JSON.stringify(validatePathSteps(inProgressNull)),
    );

    const coachedWithKc = makeSteps(5, [
      {
        kind: "COACHED_SESSION",
        status: "PENDING",
        coachedSessionId: null,
        knowledgeCheckId: "kc-1",
      },
    ]);
    check(
      "COACHED_SESSION carrying a knowledgeCheckId rejected regardless of status",
      validatePathSteps(coachedWithKc).length > 0,
    );
  }

  // Unknown competency
  {
    const badCompetency = makeSteps(5, [
      { competencyKey: "not_a_real_competency" as unknown as PathStepInput["competencyKey"] },
    ]);
    check("unknown competencyKey rejected", validatePathSteps(badCompetency).length > 0);
  }
}

console.log("\n5. NO ACTIVE/IS-LATEST FLAG — absence asserted, not just untested");
{
  const src = readFileSync("lib/study-plan/path.ts", "utf8");
  check("no isActive identifier", !src.includes("isActive"));
  check("no isCurrent identifier", !src.includes("isCurrent"));
  check("no supersededAt identifier", !src.includes("supersededAt"));
  check(
    "no studyPlanPath.delete call anywhere",
    !/studyPlanPath\.delete/.test(src),
  );
}

async function runDatabaseSection() {
  if (!process.env.DATABASE_URL) {
    skip("4. OLD PATHS SURVIVE (no DATABASE_URL set)");
    skip("4b. markStepComplete throws/succeeds on coached id transition (no DATABASE_URL set)");
    return;
  }

  console.log("\n4. OLD PATHS SURVIVE — requires a database");

  const { prisma } = await import("../lib/prisma");
  const { createPath, readPathForStudyPlan, markStepComplete, listPathsForUser } = await import(
    "../lib/study-plan/path"
  );

  const testEmail = `path-model-verify-${randomUUID()}@example.com`;
  let userId = "";
  let otherUserId = "";
  const studyPlanIds: string[] = [];

  async function makeStudyPlan(owner: string, title: string) {
    const row = await prisma.studyPlan.create({
      data: {
        userId: owner,
        title,
        content: { priorityThemes: [] } as unknown as object,
        sourceReportIds: [] as unknown as object,
        sourceReportCount: 0,
        generationModel: "verify-path-model-stub",
        draftTokenId: randomUUID(),
      },
    });
    studyPlanIds.push(row.id);
    return row;
  }

  try {
    const user = await prisma.user.create({
      data: { email: testEmail, name: "Path Model Verify", role: "STUDENT" },
    });
    userId = user.id;

    const otherEmail = `path-model-verify-other-${randomUUID()}@example.com`;
    const otherUser = await prisma.user.create({
      data: { email: otherEmail, name: "Path Model Verify Other", role: "STUDENT" },
    });
    otherUserId = otherUser.id;

    const planA = await makeStudyPlan(userId, "Plan A");
    const pathA = await createPath({
      userId,
      studyPlanId: planA.id,
      steps: makeSteps(5),
      selectionSnapshot: { note: "A" },
    });
    check("path A created with 5 steps", pathA.steps.length === 5);

    const planB = await makeStudyPlan(userId, "Plan B");
    const pathB = await createPath({
      userId,
      studyPlanId: planB.id,
      steps: makeSteps(6),
      selectionSnapshot: { note: "B" },
    });
    check("path B created with 6 steps", pathB.steps.length === 6);

    const readA = await readPathForStudyPlan(userId, planA.id);
    check(
      "readPathForStudyPlan(A) still returns A's original path",
      readA?.id === pathA.id &&
        readA.generatedAt.getTime() === pathA.generatedAt.getTime() &&
        readA.steps.map((s) => s.id).join(",") === pathA.steps.map((s) => s.id).join(","),
      JSON.stringify({ readA, pathA }),
    );

    check(
      "A's steps are all still PENDING after B's path was created",
      readA!.steps.every((s) => s.status === "PENDING"),
    );

    const listed = await listPathsForUser(userId);
    check(
      "listPathsForUser returns BOTH paths, B first (generatedAt desc)",
      listed.length === 2 && listed[0]!.pathId === pathB.id && listed[1]!.pathId === pathA.id,
      JSON.stringify(listed),
    );

    // markStepComplete: out-of-order completion on A, then prove C does not
    // inherit it and A keeps it.
    const stepToComplete = pathA.steps[2]!; // out of order: third step, not first
    await markStepComplete(userId, stepToComplete.id);

    const planC = await makeStudyPlan(userId, "Plan C");
    const pathC = await createPath({
      userId,
      studyPlanId: planC.id,
      steps: makeSteps(5),
      selectionSnapshot: { note: "C" },
    });

    const readAAfterC = await readPathForStudyPlan(userId, planA.id);
    check(
      "A's out-of-order-completed step is STILL complete after C's path was created",
      readAAfterC!.steps.find((s) => s.id === stepToComplete.id)?.status === "COMPLETE",
    );
    check(
      "C has no step referencing A's completed step id (nothing carried forward)",
      pathC.steps.every((s) => s.id !== stepToComplete.id),
    );
    check(
      "C's steps are all PENDING (a fresh path starts PENDING, inheriting nothing)",
      pathC.steps.every((s) => s.status === "PENDING"),
    );

    // Second createPath for A throws PathAlreadyExistsError and does not
    // mutate A.
    let threw: unknown = null;
    try {
      await createPath({
        userId,
        studyPlanId: planA.id,
        steps: makeSteps(5),
        selectionSnapshot: { note: "A-again" },
      });
    } catch (err) {
      threw = err;
    }
    check(
      "second createPath for A throws PathAlreadyExistsError",
      threw instanceof PathAlreadyExistsError,
      String(threw),
    );
    if (threw instanceof PathAlreadyExistsError) {
      check("PathAlreadyExistsError names A's existing path id", threw.existingPathId === pathA.id);
    }

    const readAFinal = await readPathForStudyPlan(userId, planA.id);
    check(
      "A's path is byte-identical (same id, same step ids, same statuses) after the collision",
      readAFinal!.id === pathA.id &&
        readAFinal!.steps.map((s) => `${s.id}:${s.status}`).join(",") ===
          readAAfterC!.steps.map((s) => `${s.id}:${s.status}`).join(","),
    );

    // Cross-user ownership check.
    const foreignPlan = await makeStudyPlan(otherUserId, "Other user's plan");
    let crossUserThrew = false;
    try {
      await createPath({
        userId,
        studyPlanId: foreignPlan.id,
        steps: makeSteps(5),
        selectionSnapshot: {},
      });
    } catch {
      crossUserThrew = true;
    }
    check("createPath with another user's studyPlanId throws", crossUserThrew);

    console.log(
      "\n4b. markStepComplete enforces the coached-reference reject half at runtime",
    );
    {
      const planD = await makeStudyPlan(userId, "Plan D");
      const pathD = await createPath({
        userId,
        studyPlanId: planD.id,
        steps: makeSteps(5, [{ kind: "COACHED_SESSION", status: "PENDING", coachedSessionId: null }]),
        selectionSnapshot: {},
      });
      const coachedStep = pathD.steps.find((s) => s.kind === "COACHED_SESSION")!;

      let rejectThrew = false;
      try {
        await markStepComplete(userId, coachedStep.id);
      } catch {
        rejectThrew = true;
      }
      check(
        "markStepComplete THROWS for a COACHED_SESSION step with null coachedSessionId",
        rejectThrew,
      );

      // 21-12 writes the id back; simulate that, then completion must succeed.
      await prisma.studyPlanPathStep.update({
        where: { id: coachedStep.id },
        data: { coachedSessionId: randomUUID() },
      });
      let succeeded = false;
      try {
        await markStepComplete(userId, coachedStep.id);
        succeeded = true;
      } catch (err) {
        console.error("unexpected throw:", err);
      }
      check(
        "markStepComplete SUCCEEDS once the coachedSessionId has been written back",
        succeeded,
      );
    }
  } finally {
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
    console.log(failures === 0 ? "\nALL PASS\n" : `\nFAILED: ${failures} assertion(s)\n`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
