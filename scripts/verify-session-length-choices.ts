/**
 * Customize's length group always offers a choice, and never a length shorter
 * than a problem interview's own target.
 *
 * Problem interviews hide named presets below their target, because one problem
 * needs the full time. For a type whose target exceeds every preset
 * (system-design, 35m vs Extended 30m) that filter is correctly EMPTY, and the
 * only tile is withPreset's "Interview default", which carries the type's own
 * target. Both halves matter:
 *
 *   - adding the longest preset as a "floor" would offer a 35-minute interview
 *     a 30-minute length — the very thing the filter exists to prevent;
 *   - but if `defaults.length` ever resolved to a real preset for such a type,
 *     the default tile would disappear and the group WOULD be empty, which is
 *     what made e2e/interview-picker.spec.ts hang for 4 minutes.
 *
 * So this asserts the combination: named presets are never too short, and the
 * default tile is present exactly when the named list cannot cover the target.
 *
 * Run: npx tsx scripts/verify-session-length-choices.ts
 */

import {
  SESSION_LENGTH_PRESETS,
  sessionLengthChoices,
} from "../lib/interview/customization-options";
import { INTERVIEW_TYPES, getInterviewType } from "../lib/interview/types";
import { getEngineType } from "../lib/engine/registry";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Mirrors InterviewCustomizePage: the "Interview default" tile is prepended
 * whenever the type's own target does not match a named preset exactly.
 */
function hasDefaultTile(targetMinutes: number, targetQuestionCount: number): boolean {
  return !SESSION_LENGTH_PRESETS.some(
    (p) => p.targetMinutes === targetMinutes && p.targetQuestionCount === targetQuestionCount,
  );
}

console.log("1. every interview type offers at least one length tile");
for (const slug of Object.keys(INTERVIEW_TYPES)) {
  const type = getInterviewType(slug);
  if (!type) continue;
  const isProblem = Boolean(getEngineType(slug)?.problemInterview);
  const named = sessionLengthChoices(type.targetMinutes, isProblem);
  const withDefault = named.length + (hasDefaultTile(type.targetMinutes, type.targetQuestionCount) ? 1 : 0);
  check(
    `${slug} (target ${type.targetMinutes}m, problem=${isProblem ? "yes" : "no"}) tiles=${withDefault} named=${named.length}`,
    withDefault > 0,
    "the length group would render EMPTY — Customize has no length to pick",
  );
  if (isProblem) {
    check(
      `${slug} offers no named length below its ${type.targetMinutes}m target`,
      named.every((p) => p.targetMinutes >= type.targetMinutes),
      named.map((p) => `${p.slug}=${p.targetMinutes}m`).join(", "),
    );
  }
}

console.log("\n2. system-design is the case that exposed this");
{
  const sd = getInterviewType("system-design");
  if (!sd) {
    check("system-design resolves", false);
  } else {
    const named = sessionLengthChoices(sd.targetMinutes, true);
    check("its target is longer than every named preset", named.length === 0, `named=${named.length}`);
    check(
      "so the Interview default tile must carry it",
      hasDefaultTile(sd.targetMinutes, sd.targetQuestionCount),
      "no default tile AND no named preset = empty group",
    );
  }
}

console.log("\n3. the filter still filters when it can");
{
  const at30 = sessionLengthChoices(30, true);
  check(
    "a 30m problem interview gets only the 30m+ presets",
    at30.length > 0 && at30.every((p) => p.targetMinutes >= 30),
    at30.map((p) => p.slug).join(", "),
  );
  const behavioral = sessionLengthChoices(30, false);
  check(
    "a non-problem interview keeps every preset",
    behavioral.length === SESSION_LENGTH_PRESETS.length,
    `got ${behavioral.length} of ${SESSION_LENGTH_PRESETS.length}`,
  );
  // Bite-proof: a floor that ignores the target would break rule 1.
  const floored = [
    SESSION_LENGTH_PRESETS.reduce((a, b) => (b.targetMinutes > a.targetMinutes ? b : a), SESSION_LENGTH_PRESETS[0]!),
  ];
  check(
    "bite-proof: a longest-preset floor would offer a 35m interview a shorter length",
    floored.some((p) => p.targetMinutes < 35),
    "the floor idea looked safe but violates the target rule",
  );
}

console.log(
  failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`,
);
process.exitCode = failures === 0 ? 0 : 1;
