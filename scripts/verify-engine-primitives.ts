/**
 * Proves the four engine primitives built in plan 13-03: avatar-initiated
 * termination with a recorded reason, the per-turn visible-context slice,
 * type-declared outcome validation, and an explicit time budget whose
 * remaining time rides the tail block only.
 *
 * Run: npx tsx scripts/verify-engine-primitives.ts
 */
import { parseTerminationMarker, resolveTermination } from "../lib/engine/termination";
import { applyVisibleContext } from "../lib/engine/visible-context";
import { validateOutcome } from "../lib/engine/outcome";
import { computeTimeBudgetState, buildTimeBudgetFragment } from "../lib/engine/time-budget";
import { ENGINE_TYPES } from "../lib/engine/registry";
import type { TerminationPolicyConfig } from "../lib/engine/types";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

console.log("\n1. parseTerminationMarker");
{
  const withMarker = 'All set, good luck! <engine-end reason="student_declined" />';
  const parsed = parseTerminationMarker(withMarker);
  check(
    "strips the marker from the student-visible text",
    parsed.cleanedText === "All set, good luck!",
    parsed.cleanedText
  );
  check(
    "extracts the reason",
    parsed.termination?.reason === "student_declined",
    JSON.stringify(parsed.termination)
  );

  const noMarker = "Tell me about a time you led a project.";
  const parsedPlain = parseTerminationMarker(noMarker);
  check(
    "text with no marker round-trips byte-identically",
    parsedPlain.cleanedText === noMarker && parsedPlain.termination === null,
    JSON.stringify(parsedPlain)
  );
}

console.log("\n2. Every built-in type rejects an undeclared avatar-end reason");
for (const type of ENGINE_TYPES) {
  const result = resolveTermination({
    policy: type.terminationPolicy,
    source: "avatar",
    reason: "looks_plausible",
  });
  check(
    `"${type.slug}" rejects an avatar termination (avatarMayEnd: ${type.terminationPolicy.avatarMayEnd})`,
    result.ok === false && result.recordedReason === null,
    JSON.stringify(result)
  );
}

console.log("\n3. A hypothetical avatarMayEnd: true policy — declared reason accepted, undeclared reason rejected");
{
  const policy: TerminationPolicyConfig = {
    studentMayEnd: true,
    avatarMayEnd: true,
    avatarEndReasons: ["tedious_pitch", "hostile_student"],
  };

  const accepted = resolveTermination({ policy, source: "avatar", reason: "tedious_pitch" });
  check(
    "a reason inside avatarEndReasons is accepted and recorded",
    accepted.ok === true && accepted.recordedReason === "tedious_pitch",
    JSON.stringify(accepted)
  );

  const rejected = resolveTermination({ policy, source: "avatar", reason: "made_up_reason" });
  check(
    "a reason outside avatarEndReasons is rejected and recordedReason is null",
    rejected.ok === false && rejected.recordedReason === null,
    JSON.stringify(rejected)
  );
}

console.log("\n4. applyVisibleContext");
{
  const sessionState = {
    transcriptWindow: ["hello", "how are you"],
    instanceBackground: "A background string.",
    studentArtifacts: ["item-0", "item-1", "item-2"],
  };

  const permissive = applyVisibleContext({ visibleChannels: "*" }, sessionState);
  check(
    "permissive default returns state deeply equal to the input",
    JSON.stringify(permissive) === JSON.stringify(sessionState),
    JSON.stringify(permissive)
  );

  const restricted = applyVisibleContext(
    { visibleChannels: ["transcriptWindow", "instanceBackground"] },
    sessionState
  );
  check(
    "a per-channel restriction omits the non-listed channel",
    !("studentArtifacts" in restricted) &&
      "transcriptWindow" in restricted &&
      "instanceBackground" in restricted,
    JSON.stringify(restricted)
  );

  const cursored = applyVisibleContext(
    { visibleChannels: "*" },
    sessionState,
    { cursors: { studentArtifacts: 1 } }
  );
  check(
    "a cursor admits entries up to it and withholds entries past it",
    JSON.stringify(cursored.studentArtifacts) === JSON.stringify(["item-0", "item-1"]),
    JSON.stringify(cursored.studentArtifacts)
  );
}

console.log("\n5. validateOutcome");
{
  const config = {
    fields: [
      { key: "negotiatedPrice", label: "Negotiated price", kind: "number" as const },
      { key: "dealClosed", label: "Deal closed", kind: "boolean" as const },
    ],
  };

  const conforming = validateOutcome(config, { negotiatedPrice: 42000, dealClosed: true });
  check("accepts a conforming record", conforming.ok === true, JSON.stringify(conforming));

  const unknownKey = validateOutcome(config, { negotiatedPrice: 42000, extraField: "nope" });
  check("rejects an unknown key", unknownKey.ok === false, JSON.stringify(unknownKey));

  const kindMismatch = validateOutcome(config, { negotiatedPrice: "not a number" });
  check("rejects a kind mismatch", kindMismatch.ok === false, JSON.stringify(kindMismatch));

  const noFieldsConfig = { fields: [] };
  const emptyAccepted = validateOutcome(noFieldsConfig, {});
  check(
    "a type declaring no fields accepts an empty record",
    emptyAccepted.ok === true,
    JSON.stringify(emptyAccepted)
  );
  const noFieldsRejected = validateOutcome(noFieldsConfig, { anything: 1 });
  check(
    "a type declaring no fields rejects a non-empty record",
    noFieldsRejected.ok === false,
    JSON.stringify(noFieldsRejected)
  );
}

console.log("\n6. computeTimeBudgetState");
{
  const startedAt = new Date("2026-01-01T00:00:00Z");

  const unbudgeted = computeTimeBudgetState({
    config: { totalSeconds: null, warnAtRemainingSeconds: null },
    startedAt,
    now: new Date("2026-01-01T00:10:00Z"),
  });
  check(
    "remainingSeconds is null for a type with no declared total",
    unbudgeted.remainingSeconds === null,
    JSON.stringify(unbudgeted)
  );

  const budgetedConfig = { totalSeconds: 600, warnAtRemainingSeconds: 60 };
  const now = new Date("2026-01-01T00:09:30Z"); // 570s elapsed, 30s remaining
  const budgeted = computeTimeBudgetState({ config: budgetedConfig, startedAt, now });
  check(
    "a declared total produces a correct remaining/warn/expired triple",
    budgeted.elapsedSeconds === 570 &&
      budgeted.remainingSeconds === 30 &&
      budgeted.warn === true &&
      budgeted.expired === false,
    JSON.stringify(budgeted)
  );

  const again = computeTimeBudgetState({ config: budgetedConfig, startedAt, now });
  check(
    "is pure — same inputs twice produce deeply equal output",
    JSON.stringify(budgeted) === JSON.stringify(again)
  );
}

console.log("\n7. buildTimeBudgetFragment");
{
  const budgetedFragment = buildTimeBudgetFragment({
    elapsedSeconds: 570,
    remainingSeconds: 30,
    warn: true,
    expired: false,
  });
  check(
    "non-empty for a budgeted session",
    budgetedFragment.length > 0,
    budgetedFragment
  );

  const unbudgetedFragment = buildTimeBudgetFragment({
    elapsedSeconds: 600,
    remainingSeconds: null,
    warn: false,
    expired: false,
  });
  check(
    "empty for an unbudgeted session",
    unbudgetedFragment === "",
    JSON.stringify(unbudgetedFragment)
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
