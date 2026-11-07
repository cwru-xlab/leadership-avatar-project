/**
 * Rubric JSON-schema ORDER proof — deterministic, no network, no database.
 *
 * `buildRubricJsonSchema` emits `outcome` FIRST for problem interviews and
 * LAST for every other type. With OpenAI's strict `json_schema` the model
 * generates keys in schema order, so outcome-first makes the evaluator decide
 * every process step before it commits to any `*_score` (system-design
 * grading study: 11/14 → 14/14, docs/interviews/system-design-validity.md).
 *
 * Reordering a strict schema is exactly the change that silently drops,
 * renames or duplicates a property, so this script does not eyeball it:
 *
 *   - `scripts/fixtures/rubric-schema-order.json` records, per type, the
 *     ordered property names, the ordered `required` list and a SHA-256 of
 *     `JSON.stringify(schema)`, taken from the engine BEFORE outcome-first
 *     (`lib/engine/rubric.ts` at b168d09, where every type put outcome last);
 *   - a non-problem type must still hash to its recorded digest —
 *     byte-identical, not merely equivalent;
 *   - a problem interview must hash to its recorded digest AFTER `outcome` is
 *     moved back to last in both `properties` and `required`. That is the
 *     proof the engine change is a pure reorder: same property names, same
 *     required entries, same subschemas, same schema `name`.
 *
 * Every failure message names the offending type slug.
 *
 * Regenerate the snapshot only against an engine whose order you trust
 * (it is a frozen record of the pre-change bytes, not a convenience):
 *   npx tsx scripts/verify-rubric-schema-order.ts --write
 *
 * Run: npx tsx scripts/verify-rubric-schema-order.ts
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ENGINE_TYPES } from "../lib/engine/registry";
import { resolveSessionConfig } from "../lib/engine/resolve";
import { buildRubricJsonSchema, type RubricJsonSchema } from "../lib/engine/rubric";
import type { InstanceConfig } from "../lib/engine/types";
import { isProblemInterviewSlug } from "../lib/problem-interview/problem-slugs";
import { PROBLEM_OUTCOME_FIELD_KEYS } from "../lib/problem-interview/types";

const SNAPSHOT_PATH = join(__dirname, "fixtures", "rubric-schema-order.json");

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

/**
 * The minimum instance each instance-requiring type needs to resolve. Values
 * are arbitrary but FIXED — the digests below are computed from them, so
 * editing one invalidates the snapshot for that type only.
 */
function instanceFor(slug: string): InstanceConfig {
  switch (slug) {
    case "case-study":
      return {
        kind: "case-study",
        caseId: "verify-case",
        caseName: "Verify",
        background: "bg",
        avatars: [{ name: "A", role: "R" }],
        criteria: null,
      };
    case "pitch-elevator":
      return {
        kind: "pitch-elevator",
        pitchSubject: "verify subject",
        listenerKnowledge: "blind",
      };
    case "pitch-deck":
      return {
        kind: "pitch-deck",
        deckId: "verify-deck",
        slideCount: 2,
        slideTexts: ["s1", "s2"],
        askPriceUsd: 1_000_000,
        askEquityPct: 10,
        fairValueBand: {
          priceUsdMin: 800_000,
          priceUsdMax: 1_200_000,
          equityPctMin: 8,
          equityPctMax: 12,
        },
        proposedSeconds: 1200,
      };
    case "pitch-funding":
      return {
        kind: "pitch-deck",
        deckId: "verify-funding-id",
        slideCount: 5,
        slideTexts: ["s1", "s2", "s3", "s4", "s5"],
        proposedSeconds: 900,
        modeInputs: {
          mode: "pitch-funding",
          requestedAmountUsd: 50_000,
          useOfFunds: "Six months of runway for a pilot cohort.",
        },
      };
    case "pitch-product":
      return {
        kind: "pitch-deck",
        deckId: "verify-product-id",
        slideCount: 5,
        slideTexts: ["s1", "s2", "s3", "s4", "s5"],
        proposedSeconds: 600,
        modeInputs: {
          mode: "pitch-product",
          buyerProfile: "VP of Ops at a mid-market SaaS co",
        },
      };
    case "pitch-talk":
      return {
        kind: "pitch-deck",
        deckId: "verify-talk-id",
        slideCount: 5,
        slideTexts: ["s1", "s2", "s3", "s4", "s5"],
        proposedSeconds: 600,
        modeInputs: {
          mode: "pitch-talk",
          talkAudience: "A campus sustainability conference",
          talkTakeaway: "Reuse beats recycling for carbon payback.",
        },
      };
    case "pitch-general":
      return {
        kind: "pitch-deck",
        deckId: "verify-general-id",
        slideCount: 5,
        slideTexts: ["s1", "s2", "s3", "s4", "s5"],
        proposedSeconds: 600,
      };
    case "difficult-conversation":
      return {
        kind: "difficult-conversation",
        conversationId: "verify-dc",
        source: "seeded",
        role: "Dana",
        studentRole: "manager",
        situation: "A performance conversation.",
        sharedBackstory: "Prior check-ins documented gaps.",
        hiddenPosition: "They will not own the slip.",
        studentObjective: "Get a written commitment.",
        stakes: "Release slips.",
        difficulty: "guarded",
        avatarId: "avatar-test",
        voiceId: "voice-test",
      };
    default:
      return { kind: "none" };
  }
}

function digest(schema: RubricJsonSchema): string {
  return createHash("sha256").update(JSON.stringify(schema)).digest("hex");
}

/**
 * The same schema with `outcome` moved back to LAST in `properties` and in
 * `required` — i.e. the pre-outcome-first bytes, if nothing else changed.
 */
function withOutcomeLast(schema: RubricJsonSchema): RubricJsonSchema {
  const { outcome, ...rest } = schema.schema.properties;
  return {
    ...schema,
    schema: {
      ...schema.schema,
      required: [...schema.schema.required.filter((key) => key !== "outcome"), "outcome"],
      properties: { ...rest, outcome },
    },
  };
}

interface TypeSnapshot {
  /** Recorded so flipping a type into (or out of) problem-interview fails loudly. */
  problemInterview: boolean;
  /** The strict `json_schema` envelope name — `interview_evaluation` / `scenario_evaluation`. */
  name: string;
  /** Property names in schema order, as the model will generate them. */
  properties: string[];
  required: string[];
  /** SHA-256 of `JSON.stringify(schema)`, outcome LAST. */
  digest: string;
}

interface Snapshot {
  recordedFrom: string;
  note: string;
  types: Record<string, TypeSnapshot>;
}

function built() {
  return ENGINE_TYPES.map((type) => {
    const resolved = resolveSessionConfig(type.slug, { instance: instanceFor(type.slug) });
    if (!resolved.ok) {
      failures += 1;
      console.log(`  FAIL resolve "${type.slug}": ${resolved.reason}`);
      return null;
    }
    return {
      slug: type.slug,
      // The TYPE record, not the engine's own predicate — so the predicate
      // itself is something this script can cross-check rather than assume.
      problemInterview: Boolean(type.problemInterview),
      schema: buildRubricJsonSchema(resolved.config),
    };
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

if (process.argv.includes("--write")) {
  const types: Record<string, TypeSnapshot> = {};
  for (const { slug, problemInterview, schema } of built()) {
    const canonical = "outcome" in schema.schema.properties ? withOutcomeLast(schema) : schema;
    types[slug] = {
      problemInterview,
      name: canonical.name,
      properties: Object.keys(canonical.schema.properties),
      required: canonical.schema.required,
      digest: digest(canonical),
    };
  }
  const snapshot: Snapshot = {
    recordedFrom:
      "lib/engine/rubric.ts with outcome LAST for every type (pre-outcome-first, b168d09)",
    note:
      "digest = sha256 of JSON.stringify(buildRubricJsonSchema(config)) with outcome last. " +
      "Instances come from instanceFor() in scripts/verify-rubric-schema-order.ts.",
    types,
  };
  writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`wrote ${Object.keys(types).length} type(s) to ${SNAPSHOT_PATH}`);
  process.exit(0);
}

const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Snapshot;

console.log(`\nrubric schema order — ${ENGINE_TYPES.length} engine type(s)`);
console.log(`expected bytes recorded from: ${expected.recordedFrom}\n`);

const seen = new Set<string>();

for (const { slug, problemInterview, schema } of built()) {
  seen.add(slug);
  const snap = expected.types[slug];
  if (!snap) {
    failures += 1;
    console.log(
      `  FAIL "${slug}" has no recorded schema snapshot` +
        `\n         add it with: npx tsx scripts/verify-rubric-schema-order.ts --write (on an engine whose order you trust)`,
    );
    continue;
  }

  const properties = Object.keys(schema.schema.properties);
  const required = schema.schema.required;
  const sorted = (keys: readonly string[]) => [...keys].sort().join(",");

  // The engine's own predicate must agree with the TYPE record and with the
  // frozen snapshot — outcome-first is chosen by that predicate.
  check(
    `"${slug}": problem-interview classification agrees (type record / isProblemInterviewSlug / snapshot)`,
    problemInterview === isProblemInterviewSlug(slug) && problemInterview === snap.problemInterview,
    `type record=${problemInterview} predicate=${isProblemInterviewSlug(slug)} snapshot=${snap.problemInterview}`,
  );

  // Order-independent: nothing was added, dropped or renamed.
  check(
    `"${slug}": property-name set unchanged`,
    sorted(properties) === sorted(snap.properties),
    `only here: ${properties.filter((k) => !snap.properties.includes(k)).join(",") || "—"}; ` +
      `only in snapshot: ${snap.properties.filter((k) => !properties.includes(k)).join(",") || "—"}`,
  );
  check(
    `"${slug}": required set unchanged`,
    sorted(required) === sorted(snap.required),
    `only here: ${required.filter((k) => !snap.required.includes(k)).join(",") || "—"}; ` +
      `only in snapshot: ${snap.required.filter((k) => !required.includes(k)).join(",") || "—"}`,
  );
  check(`"${slug}": schema name unchanged`, schema.name === snap.name, `${schema.name} vs ${snap.name}`);

  if (!("outcome" in schema.schema.properties)) {
    // Types that declare no outcome fields (general, technical, early-career,
    // case-study, technical-coding) must stay exactly as they were.
    check(
      `"${slug}": declares no outcome fields, so the schema has no outcome property`,
      !snap.properties.includes("outcome") && !required.includes("outcome"),
      `properties=${properties.join(",")}`,
    );
    check(
      `"${slug}": schema is byte-identical to the recorded bytes`,
      digest(schema) === snap.digest,
      `${digest(schema)} vs ${snap.digest}`,
    );
    continue;
  }

  if (problemInterview) {
    check(
      `"${slug}": outcome is the FIRST property (model grades the steps before any score)`,
      properties[0] === "outcome",
      `properties=${properties.join(",")}`,
    );
    check(
      `"${slug}": outcome is the FIRST required entry`,
      required[0] === "outcome",
      `required=${required.join(",")}`,
    );
    const outcome = schema.schema.properties.outcome as { required?: string[] };
    check(
      `"${slug}": outcome still carries processSteps`,
      (outcome.required ?? []).includes(PROBLEM_OUTCOME_FIELD_KEYS.processSteps),
      `outcome.required=${(outcome.required ?? []).join(",")}`,
    );
    // The reorder proof: put outcome back last and the bytes must be the
    // pre-change bytes, to the byte.
    check(
      `"${slug}": outcome-first is a PURE REORDER of the recorded bytes`,
      digest(withOutcomeLast(schema)) === snap.digest,
      `with outcome moved last: ${digest(withOutcomeLast(schema))} vs recorded ${snap.digest}`,
    );
    // And the recorded order is reproduced exactly, minus outcome's position.
    check(
      `"${slug}": every other property keeps its recorded position`,
      properties.slice(1).join(",") === snap.properties.filter((k) => k !== "outcome").join(",") &&
        required.slice(1).join(",") === snap.required.filter((k) => k !== "outcome").join(","),
      `properties=${properties.join(",")}\n         required=${required.join(",")}`,
    );
    continue;
  }

  // Every non-problem type with an outcome (networking, the pitch family,
  // difficult-conversation) keeps outcome LAST, byte-identical.
  check(
    `"${slug}": outcome is the LAST property, exactly as before`,
    properties[properties.length - 1] === "outcome",
    `properties=${properties.join(",")}`,
  );
  check(
    `"${slug}": outcome is the LAST required entry, exactly as before`,
    required[required.length - 1] === "outcome",
    `required=${required.join(",")}`,
  );
  check(
    `"${slug}": schema is byte-identical to the recorded bytes`,
    digest(schema) === snap.digest,
    `${digest(schema)} vs ${snap.digest}`,
  );
}

for (const slug of Object.keys(expected.types)) {
  check(
    `"${slug}": recorded type is still in ENGINE_TYPES`,
    seen.has(slug),
    "a snapshot entry with no live type — delete it deliberately, do not let it rot",
  );
}

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
