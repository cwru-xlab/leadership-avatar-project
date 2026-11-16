/**
 * An interview that names its own job keeps it: the role and industry a
 * customize page never offered must never reach the assembled prompt.
 *
 * WHY THIS EXISTS. The customize page used to offer Role tiles on every preset,
 * and they were not inert. `resolveInterviewType` overwrites `defaultRoleTitle`
 * with whatever curated role slug it is handed, and `defaultRoleTitle` is what
 * `buildInterviewSystemPrompt` interpolates as "- Target role:" and what it
 * tells the model to tailor the role/industry-specific stage to. So picking
 * "Sales / client-facing" on the engineering behavioral interview really did
 * brief the interviewer for a sales role, contradicting the interview the
 * student had chosen, with no visible sign that it had happened.
 *
 * The fix has two halves and this guard covers the SERVER half, which is the
 * durable one: the page withholds `roleSlug`/`industrySlug` on the
 * industry-specific path, and the resolver's fallback is what turns an absent
 * field into "the preset's own value". Both have to hold. If the fallback ever
 * became a hardcoded default — a very plausible "tidy-up", since every other
 * branch of that function returns a concrete value — withholding the field
 * would stop protecting anything and the browser spec would be the only thing
 * left standing between a student and a contradicted prompt.
 *
 * Three things are asserted, because each fails differently:
 *
 *  - THE OVERWRITE IS REAL. Asserted, not assumed. A guard that only checked
 *    the fallback would still pass if roles quietly stopped working at all, and
 *    the general interview is supposed to keep that control.
 *  - AN ABSENT OR EMPTY ROLE PRESERVES THE PRESET'S OWN. `undefined` and `""`
 *    are both reachable from the page (a withheld field and the "Interview
 *    default" tile), so both are checked, on every preset rather than on a
 *    sampled one.
 *  - THE CLASSIFICATION IS DERIVED. `isIndustrySpecificInterview` is what the
 *    page keys off, and it has to keep agreeing with the tab it was taken
 *    from — otherwise a new preset could land on the industry tab while the
 *    customize page still asked it for a job.
 *
 * Run: npx tsx scripts/verify-implied-role.ts
 * (also picked up automatically by `npm run verify:fast`)
 */

import {
  isIndustrySpecificInterview,
  listSpecializedInterviews,
} from "../components/interview/interviewPicker";
import { CURATED_INDUSTRIES, CURATED_ROLES } from "../lib/interview/customization-options";
import { resolveInterviewType } from "../lib/interview/customization";
import {
  DEFAULT_INTERVIEW_TYPE,
  INTERVIEW_TYPES,
  getInterviewType,
  listInterviewTypes,
} from "../lib/interview/types";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
}

/** A curated role that matches no preset's own role, so an overwrite is visible. */
const SALES = CURATED_ROLES.find((o) => o.slug === "sales-client-facing")!;
const HEALTHCARE = CURATED_INDUSTRIES.find((o) => o.slug === "healthcare")!;

console.log("1. the overwrite this guard exists for is real");
{
  check("the curated sales role still exists", Boolean(SALES), "the fixture below is meaningless without it");
  const base = getInterviewType("technical")!;
  const clobbered = resolveInterviewType("technical", { roleSlug: SALES.slug })!;
  check(
    `a submitted role replaces the preset's own (${JSON.stringify(base.defaultRoleTitle)} -> ${JSON.stringify(clobbered.defaultRoleTitle)})`,
    clobbered.defaultRoleTitle === SALES.promptValue &&
      clobbered.defaultRoleTitle !== base.defaultRoleTitle,
    "roles no longer reach the prompt at all — the general interview's control is dead",
  );
  const reIndustried = resolveInterviewType("technical", { industrySlug: HEALTHCARE.slug })!;
  check(
    "a submitted industry replaces the preset's own",
    reIndustried.defaultIndustry === HEALTHCARE.promptValue,
    "industries no longer reach the prompt at all",
  );
}

console.log("\n2. a withheld role or industry leaves every preset's own in place");
for (const slug of Object.keys(INTERVIEW_TYPES)) {
  const base = getInterviewType(slug);
  if (!base) continue;
  // The two shapes the customize page can actually produce for a field it did
  // not offer: omitted entirely, and present-but-empty (the "Interview
  // default" tile's value).
  for (const [label, payload] of [
    ["omitted", {}],
    ["empty string", { roleSlug: "", industrySlug: "" }],
    ["explicitly undefined", { roleSlug: undefined, industrySlug: undefined }],
  ] as const) {
    const resolved = resolveInterviewType(slug, payload)!;
    check(
      `${slug} keeps ${JSON.stringify(base.defaultRoleTitle)} when the role is ${label}`,
      resolved.defaultRoleTitle === base.defaultRoleTitle,
      `got ${JSON.stringify(resolved.defaultRoleTitle)}`,
    );
    check(
      `${slug} keeps ${JSON.stringify(base.defaultIndustry)} when the industry is ${label}`,
      resolved.defaultIndustry === base.defaultIndustry,
      `got ${JSON.stringify(resolved.defaultIndustry)}`,
    );
  }
}

console.log("\n3. an unknown or hostile role still falls back, never throws");
for (const roleSlug of ["not-a-role", "../../etc/passwd", "a sales or client-facing role"]) {
  const base = getInterviewType("finance")!;
  const resolved = resolveInterviewType("finance", { roleSlug });
  check(
    `roleSlug=${JSON.stringify(roleSlug)} falls back to the preset's own role`,
    resolved?.defaultRoleTitle === base.defaultRoleTitle,
    `got ${JSON.stringify(resolved?.defaultRoleTitle)}`,
  );
}
// The third case above is the promptValue rather than the slug: membership is
// tested against `slug`, so a value copied out of the prompt must NOT resolve.

console.log("\n4. the industry-specific classification still matches its tab");
{
  const tab = listSpecializedInterviews()
    .map((item) => item.key)
    // The coding room is on the tab but is not an InterviewType and has no
    // customize page, so it is outside this predicate's domain by construction.
    .filter((key) => Boolean(getInterviewType(key)));
  const predicate = listInterviewTypes().filter(isIndustrySpecificInterview).map((t) => t.slug);
  check(
    `the predicate names exactly the tab's presets (${predicate.join(", ")})`,
    tab.length > 0 && tab.length === predicate.length && tab.every((k) => predicate.includes(k)),
    `tab=[${tab.join(", ")}] predicate=[${predicate.join(", ")}]`,
  );
  check(
    "the general interview is NOT industry-specific, so it keeps The job",
    !isIndustrySpecificInterview(DEFAULT_INTERVIEW_TYPE),
    "hiding The job on the general interview would remove the only place a role can be set",
  );
  const earlyCareer = getInterviewType("early-career");
  if (earlyCareer) {
    check(
      "early-career is unlisted, so it is not industry-specific either",
      !isIndustrySpecificInterview(earlyCareer),
      "an unlisted preset is reachable by slug but is not on the tab",
    );
  }
  // Every preset the page WILL hide the section for must carry a role of its
  // own, or hiding it would leave the prompt with nothing specific to say.
  for (const type of listInterviewTypes().filter(isIndustrySpecificInterview)) {
    check(
      `${type.slug} names its own role, so the hidden section loses nothing`,
      type.defaultRoleTitle.trim().length > 0 && type.defaultIndustry.trim().length > 0,
      `role=${JSON.stringify(type.defaultRoleTitle)} industry=${JSON.stringify(type.defaultIndustry)}`,
    );
  }
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
