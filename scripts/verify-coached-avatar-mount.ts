/**
 * Guards the SHARED SESSION SHELL decision (22-SHARED-SHELL-DECISION.md,
 * Phase 22 G4), which supersedes the second-avatar-mount decision this script
 * originally guarded (22-AVATAR-MOUNT-DECISION.md, plan 22-06).
 *
 * The coached shell and the practice shell mount the SAME session chrome from
 * components/session/: the avatar stage + keep-alive, the push-to-talk
 * recorder with vocal capture, the hold-Space listener, and the camera
 * self-view with visual capture. The retired coached duplicates
 * (CoachAvatarStage.tsx, useCoachedPushToTalk.ts) must stay gone, and the key
 * rules still come from lib/practice/push-to-talk-key, never re-implemented.
 *
 * Section 4 used to assert components/practice/ was untouched since 59f6166;
 * the user's G4 decision deliberately invalidated that (the chrome was lifted
 * out of the practice shell). It now asserts both shells actually use the
 * shared pieces.
 *
 * Credential-free source assertions. Run: npx tsx scripts/verify-coached-avatar-mount.ts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

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

const avatarSrc = read("components/session/SessionAvatar.tsx");
const recorderSrc = read("components/session/usePushToTalkRecorder.ts");
const keySrc = read("components/session/useHoldToTalkKey.ts");
const visualSrc = read("components/session/useVisualCapture.ts");
const coachedSrc = read("components/study-plan/CoachedSessionShell.tsx");
const practiceSrc = read("components/practice/PracticeSessionShell.tsx");

const SHARED_FNS = [
  "isPushToTalkKey",
  "isPushToTalkBlockingTarget",
  "describeKeyTarget",
  "shouldAbortPendingStart",
];

/** Names of the shared key functions NOT imported (across the given sources). */
function missingSharedImports(...srcs: string[]): string[] {
  const imported = new Set<string>();
  for (const src of srcs) {
    const m = src.match(
      /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/practice\/push-to-talk-key["']/,
    );
    for (const name of m ? m[1].split(",").map((s) => s.trim()) : []) imported.add(name);
  }
  return SHARED_FNS.filter((f) => !imported.has(f));
}

console.log("\nSection 1: the shared avatar stage reuses the HeyGen primitive");
check(
  "SessionAvatar imports InteractiveAvatarWrapper from the shared HeyGenAvatar module",
  /import\s+InteractiveAvatarWrapper[\s\S]*?from\s*["']@\/components\/HeyGenAvatar\/InteractiveAvatar["']/.test(avatarSrc),
);
check("SessionAvatar's keep-alive calls keepAlive", /\.keepAlive\(/.test(avatarSrc));
for (const [name, src] of [["CoachedSessionShell", coachedSrc], ["PracticeSessionShell", practiceSrc]] as const) {
  check(`${name} mounts <SessionAvatar`, /<SessionAvatar\b/.test(src));
  check(`${name} uses useAvatarKeepAlive`, /useAvatarKeepAlive\(/.test(src));
  check(
    `${name} calls stopSession in an unmount cleanup`,
    /return\s*\(\)\s*=>\s*\{[\s\S]*?stopSession\(/.test(src),
  );
}

console.log("\nSection 2: the shared recorder reuses the shared push-to-talk rules");
check(
  "the recorder + key hook import all four push-to-talk-key functions",
  missingSharedImports(recorderSrc, keySrc).length === 0,
  `missing: ${missingSharedImports(recorderSrc, keySrc).join(", ")}`,
);
const redefined = SHARED_FNS.filter((f) =>
  new RegExp(`(function\\s+${f}\\b|(const|let|var)\\s+${f}\\s*=)`).test(recorderSrc + keySrc),
);
check("neither re-implements any of them", redefined.length === 0, redefined.join(", "));
check(
  "the recorder imports createVocalCapture",
  /import\s*\{[^}]*createVocalCapture[^}]*\}\s*from\s*["']@\/lib\/metrics\/vocal-capture["']/.test(recorderSrc),
);
check("the recorder references /api/audio/transcribe", recorderSrc.includes("/api/audio/transcribe"));
check(
  "the visual hook imports createVisualCapture + requestCameraStream",
  /createVisualCapture/.test(visualSrc) && /requestCameraStream/.test(visualSrc),
);
check("no typed fallback in the coached shell (no textarea or input element)", !/<textarea|Textarea|<input/i.test(coachedSrc));

console.log("\nSection 3: no forbidden imports, duplicates retired");
const sessionDir = resolve(ROOT, "components", "session");
const sessionFiles = existsSync(sessionDir)
  ? readdirSync(sessionDir).filter((n) => n.endsWith(".ts") || n.endsWith(".tsx"))
  : [];
check("components/session/ exists and is non-empty", sessionFiles.length > 0);
for (const name of sessionFiles) {
  const src = readFileSync(join(sessionDir, name), "utf8");
  const bad = src
    .split("\n")
    .filter((l) => /from\s*["']@\/(components\/practice|components\/study-plan|lib\/study-plan)\//.test(l));
  check(`components/session/${name}: no import from the practice or coached trees`, bad.length === 0, bad.join(" | "));
}
check(
  "CoachedSessionShell: no import from components/practice",
  !/from\s*["']@\/components\/practice\//.test(coachedSrc),
);
check(
  "retired duplicate CoachAvatarStage.tsx is gone",
  !existsSync(resolve(ROOT, "components/study-plan/coached/CoachAvatarStage.tsx")),
);
check(
  "retired duplicate useCoachedPushToTalk.ts is gone",
  !existsSync(resolve(ROOT, "components/study-plan/coached/useCoachedPushToTalk.ts")),
);

console.log("\nSection 4: both shells use the shared session chrome");
for (const [name, src] of [["CoachedSessionShell", coachedSrc], ["PracticeSessionShell", practiceSrc]] as const) {
  for (const mod of ["usePushToTalkRecorder", "useHoldToTalkKey", "useVisualCapture", "SessionRoom", "SelfViewThumbnail", "FaceDetectionBanner"]) {
    check(
      `${name} imports @/components/session/${mod}`,
      new RegExp(`from\\s*["']@\\/components\\/session\\/${mod}["']`).test(src),
    );
  }
}
check(
  "CoachedSessionShell uses the shared CameraConsentStep",
  /from\s*["']@\/components\/session\/CameraConsentStep["']/.test(coachedSrc) && /<CameraConsentStep\b/.test(coachedSrc),
);
check(
  "the practice wizard uses the same shared CameraConsentStep",
  /from\s*["']@\/components\/session\/CameraConsentStep["']/.test(read("components/practice/SetupWizard.tsx")),
);

{
  const consentSrc = read("components/session/CameraConsentStep.tsx");
  check(
    "practice consent wording is the default, byte-identical (camera-on line)",
    consentSrc.includes('cameraOnDescription = "Visual and Vocal will be scored."'),
  );
  check(
    "practice consent wording is the default, byte-identical (camera-off line)",
    consentSrc.includes("I&apos;ll practice without being measured. Visual and Vocal\n      won&apos;t be scored this time."),
  );
  check(
    "the practice wizard passes no consent-wording override",
    !/cameraOnDescription|cameraOffDescription/.test(read("components/practice/SetupWizard.tsx")),
  );
  check(
    "the coached shell passes its own summary-oriented consent wording",
    /cameraOnDescription="Your camera and voice are analysed/.test(coachedSrc),
  );
}

console.log("\nSection 5: bite-proof");
const mutated = recorderSrc.replace(/\bshouldAbortPendingStart\b/g, "");
check(
  "removing the shouldAbortPendingStart import is caught by the section-2 check",
  missingSharedImports(mutated, keySrc).includes("shouldAbortPendingStart"),
);
const practiceImportInCoached = `import X from "@/components/practice/PracticeSessionShell";\n${coachedSrc}`;
check(
  "an import from components/practice in the coached shell is caught by section 3",
  /from\s*["']@\/components\/practice\//.test(practiceImportInCoached),
);

if (failures === 0) {
  console.log("\nverify-coached-avatar-mount: ALL SECTIONS PASSED\n");
  process.exit(0);
}
console.log(`\nverify-coached-avatar-mount: FAILED (${failures} failure(s))\n`);
process.exit(1);
