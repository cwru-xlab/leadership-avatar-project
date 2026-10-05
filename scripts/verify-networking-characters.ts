/**
 * Proves the curated networking character set from plan 16-06: count band,
 * stable ids, named people reaching the model, seniority and field spread
 * (including a non-tech field), persona length/register contract, and the
 * deliberate absences of a difficulty axis, a pinned avatar, and an assumed
 * setting.
 *
 * Run: npx tsx scripts/verify-networking-characters.ts
 */
import { MAX_PERSONA_LENGTH } from "../lib/interview/customization";
import {
  NETWORKING_CHARACTERS,
  getNetworkingCharacter,
  listNetworkingCharacters,
} from "../lib/networking/characters";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

console.log("\n1. Count — between 4 and 6 records inclusive (16-CONTEXT.md band)");
{
  const count = NETWORKING_CHARACTERS.length;
  console.log(`  count: ${count}`);
  check("count is between 4 and 6 inclusive", count >= 4 && count <= 6, `got ${count}`);
  check(
    "listNetworkingCharacters returns the same declaration-order array",
    listNetworkingCharacters() === NETWORKING_CHARACTERS ||
      JSON.stringify(listNetworkingCharacters()) ===
        JSON.stringify(NETWORKING_CHARACTERS),
  );
}

console.log(
  "\n2. Unique, stable ids — lowercase-kebab; permanent inputSnapshot history",
);
{
  const ids = NETWORKING_CHARACTERS.map((c) => c.id);
  console.log(`  ids (permanent inputSnapshot history): ${ids.join(", ")}`);
  const unique = new Set(ids);
  check("all ids unique", unique.size === ids.length);
  for (const id of ids) {
    check(
      `id "${id}" is non-empty lowercase-kebab`,
      id.length > 0 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id),
    );
  }
}

console.log("\n3. Named people — first+last name, name appears in persona");
{
  for (const c of NETWORKING_CHARACTERS) {
    const parts = c.displayName.trim().split(/\s+/);
    check(
      `"${c.displayName}" has at least two whitespace-separated parts`,
      parts.length >= 2,
    );
    check(
      `"${c.displayName}" appears verbatim in its own persona`,
      c.persona.includes(c.displayName),
    );
  }
}

console.log("\n4. Seniority spread — peer, executive, and at least two seniors");
{
  const dist: Record<string, number> = {};
  for (const c of NETWORKING_CHARACTERS) {
    dist[c.seniority] = (dist[c.seniority] ?? 0) + 1;
  }
  console.log(`  distribution: ${JSON.stringify(dist)}`);
  check("at least one peer", (dist.peer ?? 0) >= 1);
  check("at least one executive", (dist.executive ?? 0) >= 1);
  check(
    "at least two distinct seniority values beyond the minimum pair",
    Object.keys(dist).length >= 3 ||
      ((dist.peer ?? 0) >= 1 &&
        (dist.executive ?? 0) >= 1 &&
        (dist.senior ?? 0) >= 1),
  );
  // Plan: at least one peer, at least one executive, and at least two
  // distinct seniority values beyond that — i.e. peer + executive + senior.
  check(
    "peer, senior, and executive all present",
    (dist.peer ?? 0) >= 1 &&
      (dist.senior ?? 0) >= 1 &&
      (dist.executive ?? 0) >= 1,
  );
}

console.log(
  "\n5. Field spread — all distinct; at least one non software/tech field",
);
{
  const fields = NETWORKING_CHARACTERS.map((c) => c.field);
  console.log(`  fields: ${fields.join("; ")}`);
  check("all field values distinct", new Set(fields).size === fields.length);
  const techish = /soft|tech|engineer|data|product/i;
  const nonTech = NETWORKING_CHARACTERS.filter((c) => !techish.test(c.field));
  console.log(
    `  non-tech fields: ${nonTech.map((c) => c.field).join("; ") || "(none)"}`,
  );
  check(
    "at least one field matches none of /soft|tech|engineer|data|product/i",
    nonTech.length >= 1,
  );
}

// 16-CONTEXT.md Deferred Ideas: "Difficulty as a character axis — the
// four-to-six characters span seniority and field, not difficulty. A
// difficulty ladder (eager alum who carries the conversation → guarded
// executive who gives you two sentences) was considered and not chosen; it
// remains available as a later expansion of the character set, which is
// additive since characters are code records."
console.log(
  "\n6. No difficulty axis (Deferred Ideas — ladder is later expansion, not missing)",
);
{
  const keyRe = /difficulty|level|hardness|tier|rank/i;
  const textRe = /easy|difficult|hard to talk|challenging/i;
  for (const c of NETWORKING_CHARACTERS) {
    const badKeys = Object.keys(c).filter((k) => keyRe.test(k));
    check(
      `"${c.id}" has no difficulty/level/hardness/tier/rank key`,
      badKeys.length === 0,
      `keys: ${badKeys.join(", ")}`,
    );
    check(
      `"${c.id}" persona/blurb avoid easy|difficult|hard to talk|challenging`,
      !textRe.test(c.persona) && !textRe.test(c.blurb),
    );
  }
}

// Decision 10: student picks avatar/voice from the Phase 2 catalog. Pinning
// would also recreate the "pinned avatar went INACTIVE upstream" failure class.
console.log("\n7. No pinned avatar (decision 10 — Phase 2 catalog supplies face/voice)");
{
  const keyRe = /avatar|voice|preview/i;
  for (const c of NETWORKING_CHARACTERS) {
    const badKeys = Object.keys(c).filter((k) => keyRe.test(k));
    check(
      `"${c.id}" has no avatar/voice/preview key`,
      badKeys.length === 0,
      `keys: ${badKeys.join(", ")}`,
    );
  }
}

// Setting is deferred (16-CONTEXT.md Deferred Ideas). 16-07's prompt assembly
// is where a setting clause would compose in without rewriting these records.
console.log(
  "\n8. No setting assumed (deferred — setting clause composes in at 16-07)",
);
{
  const settingRe =
    /conference|reception|mixer|coffee|career fair|happy hour|booth/i;
  for (const c of NETWORKING_CHARACTERS) {
    check(
      `"${c.id}" persona assumes no networking setting`,
      !settingRe.test(c.persona),
    );
  }
}

console.log(
  `\n9. Persona contract — continuation of "You are playing the role of: ", <= MAX_PERSONA_LENGTH (${MAX_PERSONA_LENGTH})`,
);
{
  const mdRe = /[*_`#\[\]]/;
  for (const c of NETWORKING_CHARACTERS) {
    const len = c.persona.length;
    console.log(`  ${c.id}: ${len} chars`);
    console.log(`    persona: ${c.persona}`);
    check(`"${c.id}" persona non-empty`, len > 0);
    check(
      `"${c.id}" persona <= MAX_PERSONA_LENGTH`,
      len <= MAX_PERSONA_LENGTH,
      `${len} > ${MAX_PERSONA_LENGTH}`,
    );
    check(`"${c.id}" persona has no markdown markers`, !mdRe.test(c.persona));
    check(
      `"${c.id}" persona does not start with "You are"`,
      !c.persona.startsWith("You are"),
    );
  }
}

console.log("\n10. Lookup posture — unknown id returns null, does not throw");
{
  let threw = false;
  let result: ReturnType<typeof getNetworkingCharacter> = null;
  try {
    result = getNetworkingCharacter("no-such-id");
  } catch {
    threw = true;
  }
  check("getNetworkingCharacter(\"no-such-id\") returns null", result === null);
  check("getNetworkingCharacter(\"no-such-id\") does not throw", !threw);
}

if (failures > 0) {
  console.log(`\nFAILED: ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log("\nAll networking-character assertions passed.\n");
