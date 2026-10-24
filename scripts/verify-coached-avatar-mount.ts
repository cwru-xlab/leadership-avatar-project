/**
 * Plan 22-06: guards the SECOND avatar mount decision recorded in
 * 22-AVATAR-MOUNT-DECISION.md. The coach video + spoken-answer path live under
 * components/study-plan/coached/, reuse shared primitives, and the practice
 * component tree stays untouched for the whole phase.
 *
 * Credential-free source assertions. Run: npx tsx scripts/verify-coached-avatar-mount.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const PHASE_BASE = "59f6166";

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  if (pass) console.log(`  ok   ${name}`);
  else {
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
    failures += 1;
  }
}
function read(rel: string) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const stageSrc = read("components/study-plan/coached/CoachAvatarStage.tsx");
const hookSrc = read("components/study-plan/coached/useCoachedPushToTalk.ts");

const SHARED_FNS = [
  "isPushToTalkKey",
  "isPushToTalkBlockingTarget",
  "describeKeyTarget",
  "shouldAbortPendingStart",
];

/** Returns the names of required shared functions NOT imported from the shared module. */
function missingSharedImports(src: string): string[] {
  const m = src.match(
    /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/practice\/push-to-talk-key["']/,
  );
  const imported = m ? m[1].split(",").map((s) => s.trim()) : [];
  return SHARED_FNS.filter((f) => !imported.includes(f));
}

console.log("\nSection 1: CoachAvatarStage reuses the shared avatar");
check(
  "imports InteractiveAvatarWrapper from the shared HeyGenAvatar module",
  /import\s+InteractiveAvatarWrapper[\s\S]*?from\s*["']@\/components\/HeyGenAvatar\/InteractiveAvatar["']/.test(stageSrc),
);
check("calls keepAlive", /\.keepAlive\(/.test(stageSrc));
check("calls stopSession in a cleanup", /return\s*\(\)\s*=>\s*\{[\s\S]*?stopSession\(/.test(stageSrc));

console.log("\nSection 2: hook reuses shared push-to-talk rules");
check(
  "imports all four push-to-talk-key functions",
  missingSharedImports(hookSrc).length === 0,
  `missing: ${missingSharedImports(hookSrc).join(", ")}`,
);
const redefined = SHARED_FNS.filter((f) =>
  new RegExp(`(function\\s+${f}\\b|(const|let|var)\\s+${f}\\s*=)`).test(hookSrc),
);
check("does not re-implement any of them", redefined.length === 0, redefined.join(", "));
check("imports createVocalCapture", /import\s*\{[^}]*createVocalCapture[^}]*\}\s*from\s*["']@\/lib\/metrics\/vocal-capture["']/.test(hookSrc));
check("references /api/audio/transcribe", hookSrc.includes("/api/audio/transcribe"));
check("no typed fallback (no textarea or input element)", !/<textarea|Textarea|<input/i.test(hookSrc + stageSrc));

console.log("\nSection 3: no forbidden imports");
for (const [name, src] of [["CoachAvatarStage.tsx", stageSrc], ["useCoachedPushToTalk.ts", hookSrc]] as const) {
  const bad = src
    .split("\n")
    .filter((l) => /^\s*(import|export)\b.*from\s*["']@\/(components\/practice\/|lib\/study-plan\/coached\/)/.test(l) || /from\s*["']@\/(components\/practice|lib\/study-plan\/coached)\//.test(l));
  check(`${name}: no import from components/practice or lib/study-plan/coached`, bad.length === 0, bad.join(" | "));
}

console.log("\nSection 4: components/practice untouched since the phase base");
let diff = "";
try {
  diff = execSync(`git diff --name-only ${PHASE_BASE} -- components/practice/`, { cwd: ROOT, encoding: "utf8" }).trim();
} catch (e) {
  diff = `git failed: ${(e as Error).message}`;
}
check("git diff of components/practice/ against 59f6166 is empty", diff === "", diff);

console.log("\nSection 5: bite-proof");
const mutated = hookSrc.replace(/\bshouldAbortPendingStart\b/g, "");
check(
  "removing the shouldAbortPendingStart import is caught by the section-2 check",
  missingSharedImports(mutated).includes("shouldAbortPendingStart"),
);

if (failures === 0) {
  console.log("\nverify-coached-avatar-mount: ALL SECTIONS PASSED\n");
  process.exit(0);
}
console.log(`\nverify-coached-avatar-mount: FAILED (${failures} failure(s))\n`);
process.exit(1);
