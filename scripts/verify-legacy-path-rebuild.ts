/**
 * Verifies the "Rebuild this path" rule (lib/study-plan/legacy-path.ts):
 * only pre-Phase-23-shaped paths qualify, and the DELETE route re-checks the
 * full rule server-side rather than trusting the client's `rebuildable` flag.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-legacy-path-rebuild.ts
 */
import fs from "node:fs";
import path from "node:path";

import { isLegacyPathShape } from "../lib/study-plan/legacy-path";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

console.log("1. isLegacyPathShape");
const current = ["KNOWLEDGE_CHECK", "VOICE_DRILL", "COACHED_SESSION", "UNAIDED_SESSION"];
check("current learn→drill→rework→prove shape is NOT legacy", !isLegacyPathShape(current));
check("seven UNAIDED_SESSION steps are legacy", isLegacyPathShape(Array(7).fill("UNAIDED_SESSION")));
check("no VOICE_DRILL is legacy", isLegacyPathShape(["KNOWLEDGE_CHECK", "COACHED_SESSION", "UNAIDED_SESSION"]));
check(
  "a drill path with two UNAIDED_SESSIONs is legacy",
  isLegacyPathShape([...current, "UNAIDED_SESSION"]),
);

console.log("\n2. DELETE route re-checks the full rule");
const route = fs.readFileSync(
  path.join(process.cwd(), "app/api/study-plans/[planId]/path/route.ts"),
  "utf-8",
);
const del = route.slice(route.indexOf("export async function DELETE"));
check("DELETE handler exists", route.includes("export async function DELETE"));
check("DELETE calls isRebuildablePath before deleting", /isRebuildablePath\([\s\S]*studyPlanPath\.delete/.test(del));
check("DELETE refuses with 409 otherwise", del.includes("409"));
check("DELETE scopes the path to the requesting user", /userId:\s*currentUser\.id/.test(del));

console.log("\n3. bite-proof");
const bitten = del.replace(/if \(!\(await isRebuildablePath[\s\S]*?\n    \}\n/, "");
check(
  "the guard predicate FAILS when the re-check is removed",
  !/isRebuildablePath\([\s\S]*studyPlanPath\.delete/.test(bitten),
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
