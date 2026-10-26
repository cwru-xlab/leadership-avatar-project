/**
 * Guards the SHARED SESSION SHELL decision (22-SHARED-SHELL-DECISION.md,
 * Phase 22 G4), which supersedes the second-avatar-mount decision this script
 * originally guarded (22-AVATAR-MOUNT-DECISION.md, plan 22-06).
 *
 * The coached shell and the practice shell mount the SAME session chrome from
 * components/session/: the avatar stage + keep-alive, the push-to-talk
 * recorder with vocal capture (tap-to-send), and the camera
 * self-view with visual capture. The retired coached duplicates
 * (CoachAvatarStage.tsx, useCoachedPushToTalk.ts) must stay gone, and the key
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
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  FaceDetectionBanner,
  PRACTICE_FACE_BANNER_DETAIL,
} from "../components/session/FaceDetectionBanner";
import { formatMomentDate } from "../components/study-plan/coached/format-moment-date";
import CoachedBriefCard from "../components/study-plan/coached/CoachedBriefCard";

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
const visualSrc = read("components/session/useVisualCapture.ts");
const coachedSrc = read("components/study-plan/CoachedSessionShell.tsx");
const practiceSrc = read("components/practice/PracticeSessionShell.tsx");

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

console.log("\nSection 2: tap-to-send only (dev #37), one shared recorder");
check(
  "the hold-Space key hook is retired",
  !existsSync(resolve(ROOT, "components/session/useHoldToTalkKey.ts")) &&
    !existsSync(resolve(ROOT, "lib/practice/push-to-talk-key.ts")),
);
for (const [name, src] of [["usePushToTalkRecorder", recorderSrc], ["CoachedSessionShell", coachedSrc], ["PracticeSessionShell", practiceSrc]] as const) {
  check(`${name}: no window keydown listener (no hold-Space)`, !/addEventListener\(\s*["']keydown["']/.test(src));
}
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
  for (const mod of ["usePushToTalkRecorder", "useVisualCapture", "SessionRoom", "SelfViewThumbnail", "FaceDetectionBanner"]) {
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
const mutated = `${coachedSrc}\nwindow.addEventListener("keydown", onKey);`;
check(
  "re-adding a keydown (hold-Space) listener is caught by the section-2 check",
  /addEventListener\(\s*["']keydown["']/.test(mutated),
);
const practiceImportInCoached = `import X from "@/components/practice/PracticeSessionShell";\n${coachedSrc}`;
check(
  "an import from components/practice in the coached shell is caught by section 3",
  /from\s*["']@\/components\/practice\//.test(practiceImportInCoached),
);

console.log("\nSection 6: coached copy fixes (23 L3 brief date, L4 face banner)");
{
  // L4. The practice banner's rendered markup is exactly what it was before
  // the `detail` prop existed (the consequence span, byte for byte).
  const PRACTICE_SPAN =
    '<span class="text-xs text-amber-800">Move back into frame — this affects your Visual score.</span>';
  const practiceHtml = renderToStaticMarkup(createElement(FaceDetectionBanner, { visible: true }));
  check("L4: the practice banner (no detail) renders the Visual-score line byte-identically", practiceHtml.includes(PRACTICE_SPAN));
  check(
    "L4: PRACTICE_FACE_BANNER_DETAIL is the original wording",
    PRACTICE_FACE_BANNER_DETAIL === "Move back into frame — this affects your Visual score.",
  );
  const bannerCall = (src: string) => /<FaceDetectionBanner\b[^>]*\/>/.exec(src)?.[0] ?? "";
  const practiceCallsBare = (src: string) => !/\bdetail=/.test(bannerCall(src));
  check("L4: PracticeSessionShell passes no detail override", practiceCallsBare(practiceSrc));
  check(
    "L4: CaseStudySessionView passes no detail override",
    practiceCallsBare(read("components/practice/CaseStudySessionView.tsx")),
  );
  const coachedCopy = /const COACHED_FACE_BANNER_DETAIL =\s*"([^"]+)"/.exec(coachedSrc)?.[1] ?? "";
  const coachedPassesCopy = (src: string) => /\bdetail=\{COACHED_FACE_BANNER_DETAIL\}/.test(bannerCall(src));
  check("L4: the coached shell passes its own banner copy", coachedPassesCopy(coachedSrc));
  const coachedHtml = renderToStaticMarkup(createElement(FaceDetectionBanner, { visible: true, detail: coachedCopy }));
  check(
    "L4: the coached banner names end-of-session feedback and never a live Visual score",
    /end-of-session/.test(coachedHtml) && !/Visual score/.test(coachedHtml) && !coachedHtml.includes(PRACTICE_SPAN),
  );
  check(
    "L4 bite-proof: a coached shell that drops the override is caught",
    !coachedPassesCopy(coachedSrc.replace(/\s*detail=\{COACHED_FACE_BANNER_DETAIL\}/, "")),
  );
  check(
    "L4 bite-proof: a practice shell that adds an override is caught",
    !practiceCallsBare(practiceSrc.replace("<FaceDetectionBanner ", '<FaceDetectionBanner detail="x" ')),
  );

  // L3. The brief formats the moment date like the rest of the app.
  const iso = "2026-10-02T19:13:31.042Z";
  const shown = formatMomentDate(iso, "UTC");
  const expected = new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  check(`L3: formatMomentDate(${iso}) is the short app date ("${shown}")`, shown === expected && !shown.includes("T19") && shown.length <= 8);
  check("L3: an unparseable date yields an empty string, not Invalid Date", formatMomentDate("not-a-date") === "");
  const briefSrc = read("components/study-plan/coached/CoachedBriefCard.tsx");
  const briefFormats = (src: string) => /formatMomentDate\(moment\.sessionDate\)/.test(src) && !/\{moment\.sessionDate\}/.test(src);
  check("L3: the brief renders formatMomentDate(moment.sessionDate), never the raw value", briefFormats(briefSrc));
  check(
    "L3 bite-proof: a brief that renders {moment.sessionDate} raw is caught",
    !briefFormats(briefSrc.replace("${momentDate}", "${momentDate}{moment.sessionDate}")),
  );
}

console.log("\nSection 7: resumed brief shows part progress (23 L5)");
{
  const props = {
    coachName: "Ann",
    competencyLabel: "Structure & clarity",
    competencyDescription: "d",
    moment: { counterpartLine: "q", studentLine: "a", sessionDate: "2026-10-02T19:13:31.042Z" },
    momentFraming: "REWORK" as const,
    legCount: 2 as const,
    worth: { coachedWeight: 0.5, unaidedWeight: 1 },
    onStart: () => {},
    starting: false,
    resuming: true,
  };
  const done = renderToStaticMarkup(createElement(CoachedBriefCard, { ...props, progress: { partDone: 1, next: "SECOND_MOMENT" } }));
  check("L5: a brief resumed after part 1 closed says 'Part 1 done — next: your second moment'", done.includes("Part 1 done — next: your second moment"));
  const fresh = renderToStaticMarkup(createElement(CoachedBriefCard, props));
  check("L5 bite-proof: a brief with no closed part shows no progress note", !fresh.includes("done — next"));
  const last = renderToStaticMarkup(createElement(CoachedBriefCard, { ...props, progress: { partDone: 2, next: "SUMMARY" } }));
  check("L5: after the last part it points at the graded summary", last.includes("Part 2 done — next: your graded summary"));
  const shellPasses = (src: string) => /progress=\{\s*legView\.legReady/.test(src);
  check("L5: the coached shell passes progress from legView.legReady", shellPasses(coachedSrc));
  check("L5 bite-proof: a shell without the progress prop is caught", !shellPasses(coachedSrc.replace(/progress=\{/, "progressX={")));
}

console.log("\nSection 8: off-topic tries are labelled in the end summary (23 Q4)");
{
  const runtimeSrc = read("lib/study-plan/coached/runtime.ts");
  const maps = (src: string) => /offTopic:\s*isOffTopicRow\(r\)/.test(src);
  const labels = (src: string) => /attempt\.offTopic\s*\?\s*`Off-topic/.test(src);
  check("Q4: the summary marks each attempt offTopic from its stored grade", maps(runtimeSrc));
  check("Q4: the summary renders an 'Off-topic' label for those tries", labels(coachedSrc));
  check("Q4 bite-proof: a summary without the mapping is caught", !maps(runtimeSrc.replace("offTopic: isOffTopicRow(r)", "offTopic: false")));
  check("Q4 bite-proof: a shell without the label is caught", !labels(coachedSrc.replace("`Off-topic", "`Other")));
}

if (failures === 0) {
  console.log("\nverify-coached-avatar-mount: ALL SECTIONS PASSED\n");
  process.exit(0);
}
console.log(`\nverify-coached-avatar-mount: FAILED (${failures} failure(s))\n`);
process.exit(1);
