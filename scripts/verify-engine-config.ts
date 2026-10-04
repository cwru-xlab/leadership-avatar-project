/**
 * Proves the engine's configuration layer: every built-in TYPE resolves,
 * visual/vocal/content/behavioral can never be removed or duplicated, an
 * unknown slug and a missing required instance are handled rather than
 * thrown, resolution is deterministic, and the four interview presets'
 * limits have not drifted from `lib/interview/types.ts`.
 *
 * Run: npx tsx scripts/verify-engine-config.ts
 */
import { ENGINE_TYPES, getEngineType } from "../lib/engine/registry";
import { resolveSessionConfig, resolveFromTypeConfig } from "../lib/engine/resolve";
import type { InteractionTypeConfig, InstanceConfig } from "../lib/engine/types";
import { INTERVIEW_TYPES } from "../lib/interview/types";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const SYNTHETIC_CASE_STUDY_INSTANCE: InstanceConfig = {
  kind: "case-study",
  caseId: "test-case-id",
  caseName: "Test Case",
  background: "A background long enough to pass the author minimum bar.",
  avatars: [{ name: "Alex", role: "VP of Sales", additionalInfo: "secret briefing" }],
  criteria: "Grade on whether the student stays calm.",
};

function instanceForType(type: InteractionTypeConfig): InstanceConfig | null {
  return type.instance.required ? SYNTHETIC_CASE_STUDY_INSTANCE : null;
}

console.log("\n1. Every built-in type resolves");
for (const type of ENGINE_TYPES) {
  const result = resolveSessionConfig(type.slug, { instance: instanceForType(type) });
  check(`"${type.slug}" resolves ok:true`, result.ok === true, JSON.stringify(result));
}

console.log("\n2. Every resolved rubric list begins with the four shared dimensions");
for (const type of ENGINE_TYPES) {
  const result = resolveSessionConfig(type.slug, { instance: instanceForType(type) });
  const keys = result.ok ? result.config.rubricDimensions.map((d) => d.key) : [];
  check(
    `"${type.slug}" rubric starts with visual,vocal,content,behavioral`,
    JSON.stringify(keys.slice(0, 4)) === JSON.stringify(["visual", "vocal", "content", "behavioral"]),
    `actual: ${JSON.stringify(keys)}`
  );
}

console.log("\n3. A type cannot remove or shadow a shared dimension");
{
  const emptyExtras: InteractionTypeConfig = {
    ...ENGINE_TYPES[0],
    extraRubricDimensions: [],
  };
  const resultEmpty = resolveFromTypeConfig(emptyExtras, {});
  const keysEmpty = resultEmpty.ok ? resultEmpty.config.rubricDimensions.map((d) => d.key) : [];
  check(
    "empty extras still carries all four shared dimensions",
    ["visual", "vocal", "content", "behavioral"].every((k) => keysEmpty.includes(k)),
    `actual: ${JSON.stringify(keysEmpty)}`
  );

  const duplicateVisual: InteractionTypeConfig = {
    ...ENGINE_TYPES[0],
    extraRubricDimensions: [{ key: "visual", label: "Visual (duplicate)", description: "x" }],
  };
  const resultDup = resolveFromTypeConfig(duplicateVisual, {});
  check(
    "an extra reusing the key \"visual\" is REJECTED, not silently shadowed",
    resultDup.ok === false,
    JSON.stringify(resultDup)
  );
}

console.log("\n4. An unknown slug is handled, not thrown");
{
  let threw = false;
  let result: ReturnType<typeof resolveSessionConfig> | null = null;
  try {
    result = resolveSessionConfig("not-a-type", {});
  } catch {
    threw = true;
  }
  check("resolveSessionConfig(\"not-a-type\") does not throw", !threw);
  check("resolveSessionConfig(\"not-a-type\") returns ok:false", result?.ok === false);
  check("getEngineType(\"not-a-type\") returns null, not undefined/throw", getEngineType("not-a-type") === null);
}

console.log("\n5. case-study requires an instance, and carries it through unmodified");
{
  const noInstance = resolveSessionConfig("case-study", {});
  check("case-study with no instance returns ok:false", noInstance.ok === false);

  const withInstance = resolveSessionConfig("case-study", {
    instance: SYNTHETIC_CASE_STUDY_INSTANCE,
  });
  check("case-study with an instance returns ok:true", withInstance.ok === true);
  if (withInstance.ok) {
    const instance = withInstance.config.instance;
    check(
      "the resolved instance is the case-study instance, unmodified",
      instance.kind === "case-study" &&
        JSON.stringify(instance) === JSON.stringify(SYNTHETIC_CASE_STUDY_INSTANCE),
      JSON.stringify(instance)
    );
  }
}

console.log("\n6. Determinism — same inputs resolve to deeply equal configs");
for (const type of ENGINE_TYPES) {
  const instance = instanceForType(type);
  const a = resolveSessionConfig(type.slug, { instance });
  const b = resolveSessionConfig(type.slug, { instance });
  check(
    `"${type.slug}" resolves identically twice`,
    JSON.stringify(a) === JSON.stringify(b)
  );
}

console.log("\n7. Interview presets' limits match lib/interview/types.ts");
for (const slug of ["general", "technical", "consulting", "early-career"]) {
  const legacy = INTERVIEW_TYPES[slug];
  const result = resolveSessionConfig(slug, {});
  check(
    `"${slug}" targetMinutes/targetQuestionCount match the legacy preset`,
    result.ok === true &&
      result.config.limits.targetMinutes === legacy.targetMinutes &&
      result.config.limits.targetQuestionCount === legacy.targetQuestionCount,
    result.ok
      ? `engine: ${JSON.stringify(result.config.limits)} legacy: targetMinutes=${legacy.targetMinutes} targetQuestionCount=${legacy.targetQuestionCount}`
      : JSON.stringify(result)
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
