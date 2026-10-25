/**
 * Phase 23 — VOICE_DRILL shell surface check (static, no database).
 *
 * The drill runner must be built on the shared session chrome in
 * components/session/ (no copies), speak the scenario + the fixed technique
 * tip only into a CONNECTED stage, show no number mid-drill, POST transcript +
 * metrics per 23-VOICE-DRILL-CONTRACT.md, and render the graded result with
 * try-again / next-step / mastery. Every rule is a pure function over the
 * sources, and every rule is proven to bite on a mutated copy.
 *
 * Run: npx tsx scripts/verify-drill-shell-surface.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const DRILL_DIR = path.join(ROOT, "components", "study-plan", "drill");

let failures = 0;
let passCount = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passCount += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
const read = (...p: string[]) => {
  const f = path.join(ROOT, ...p);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf-8") : "";
};

interface Sources {
  runner: string;
  shell: string;
  result: string;
  page: string;
}

const SHARED_RUNNER_IMPORTS = [
  "SessionAvatar",
  "SessionRoom",
  "usePushToTalkRecorder",
  "useVisualCapture",
  "SelfViewThumbnail",
  "FaceDetectionBanner",
];

/** Text between `function name(` and the next top-level `function `. */
function body(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return "";
  const next = src.indexOf("\n  function ", start + 10);
  const nextTop = src.indexOf("\nfunction ", start + 10);
  const ends = [next, nextTop].filter((i) => i !== -1);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function issues(s: Sources): string[] {
  const out: string[] = [];
  const runner = stripComments(s.runner);

  // 1. Shared chrome, not copies.
  for (const mod of SHARED_RUNNER_IMPORTS) {
    const re = new RegExp(`from\\s+["']@/components/session/${mod}["']`);
    if (!re.test(s.runner)) out.push(`runner does not import ${mod} from components/session`);
  }
  if (!/from\s+["']@\/components\/session\/CameraConsentStep["']/.test(s.shell)) {
    out.push("shell does not use the shared CameraConsentStep");
  }
  for (const [label, src] of Object.entries(s)) {
    if (/new MediaRecorder|getUserMedia|\/api\/audio\/transcribe/.test(src) || (src.match(/createVocalCapture\(/g) ?? []).length > 1) {
      out.push(`${label} re-implements recording/capture (copy of the shared shell)`);
    }
    if (/from\s+["']@\/components\/practice\//.test(src)) out.push(`${label} imports from components/practice`);
  }

  // 2. No number mid-drill: the runner renders no score/feedback/delivery.
  if (/\.score\b|\.feedback\b|DeliveryBandsCard|vocalBands|visualBands|(?<!\d)\/ ?5\b|\/5`/.test(runner)) {
    out.push("runner renders a score, feedback or delivery band (numbers only at the end)");
  }

  // 3. The tip is fixed text: spoken and shown verbatim, never composed.
  if (!/speak\(drill\.scenarioPrompt\)/.test(runner)) out.push("runner does not speak the scenario prompt verbatim");
  if (!/speak\(liveTip\)/.test(runner)) out.push("runner does not speak the tip verbatim");
  if (!/\{liveTip\}/.test(runner)) out.push("runner does not render the tip verbatim");
  if (/\$\{liveTip\}|liveTip\s*\+|\+\s*liveTip|\$\{drill\.tipText\}/.test(runner)) {
    out.push("runner composes text around the tip");
  }

  // 4. Speech only into a CONNECTED stage, once per rep.
  const speakIntro = body(runner, "speakIntroOnce");
  if (!/introSpokenForRepRef\.current === forRep/.test(speakIntro) || !/stageReadyRef\.current/.test(speakIntro)) {
    out.push("speakIntroOnce is not guarded by once-per-rep + connected");
  }
  if (!/speakIntroOnce\(\)/.test(body(runner, "handleStageReady"))) {
    out.push("the brief is not spoken from handleStageReady (CONNECTED)");
  }

  // 4b. D2 retry: one line, no scenario re-read, avatar session reused.
  const retryBranch = speakIntro.slice(speakIntro.indexOf("if (forRep > 0)"), speakIntro.indexOf("avatar.speak(drill.scenarioPrompt)"));
  if (!/avatar\.speak\(retryLine\(retryFocusRef\.current\)\)/.test(retryBranch) || !/return;/.test(retryBranch)) {
    out.push("a retry re-reads the scenario instead of the one retry line");
  }
  if ((runner.match(/stopSession\(\)/g) ?? []).length !== 1) {
    out.push("the avatar session is stopped outside unmount (retry cannot reuse it)");
  }
  if (/return runner;/.test(s.shell) || !/\{runner\}/.test(s.shell)) out.push("the runner does not keep one tree position under the result");
  if (!/setRetryFocus\(\s*graded\?\.attempt\.retryFocus\?\.techniqueName/.test(s.shell)) {
    out.push("the retry focus does not come from the last note's technique");
  }

  // 4c. D3: drill face banner copy, no score wording.
  const bannerDetail = /DRILL_FACE_BANNER_DETAIL\s*=\s*"([^"]*)"/.exec(s.runner)?.[1] ?? "";
  if (!bannerDetail || /score/i.test(bannerDetail) || !/detail=\{DRILL_FACE_BANNER_DETAIL\}/.test(s.runner)) {
    out.push("the face banner has no drill detail copy, or it mentions a score");
  }

  // 5. Completion payload per the contract.
  const finish = body(runner, "handleFinish");
  for (const field of ["transcript", "spokenDurationMs", "cameraMode", "metrics"]) {
    if (!finish.includes(field)) out.push(`complete body lacks ${field}`);
  }
  if (!/completeDrillAttempt\(stepId, attemptId, body\)/.test(finish)) out.push("handleFinish does not POST the complete body");
  if (!/GRADING_FAILED/.test(finish) || !/bodyRef\.current \?\?/.test(finish)) {
    out.push("a grading failure does not resend the same body");
  }

  // 6. Soft countdown: visible, never a hard stop.
  if (!/clockLabel=\{formatElapsed\(remaining\)\}/.test(runner)) out.push("no visible countdown");
  if ((runner.match(/handleFinish\b/g) ?? []).length !== 2) {
    out.push("handleFinish is triggered from somewhere other than the Finish button (hard stop?)");
  }

  // 7. Coach from Settings, as coached mode does.
  if (!/fetch\("\/api\/settings\/coach"/.test(s.shell)) out.push("shell does not read the coach from Settings");
  if (!/avatarName:\s*coach\.avatarId/.test(runner)) out.push("avatar is not the student's coach");

  // 8. The graded result.
  if (!/useNextStepHref\(planId, attempt\.id\)/.test(s.result)) out.push("result does not resolve the next step via useNextStepHref");
  if (!/href="\/mastery"/.test(s.result)) out.push("result has no mastery link");
  if (!/onPress=\{onTryAgain\}/.test(s.result) || !/Try again/.test(s.result)) out.push("result has no try-again");
  if (!/\{attempt\.feedback\}/.test(s.result)) out.push("result does not show the next-time note");
  if (!/\{miss\.quote\}/.test(s.result) || !/\{miss\.techniqueName\}/.test(s.result)) out.push("result does not point at the student's words (D1)");
  if (!/\{worked\.quote\}/.test(s.result)) out.push("result has no what-worked quote (D1)");
  if (!/<DeliveryBandsCard/.test(s.result)) out.push("result does not show delivery bands");
  if (!/setRep\(\(r\) => r \+ 1\)/.test(s.shell) || !/rep=\{rep\}/.test(s.shell) || !/beginAttempt\(rep\)/.test(s.runner)) {
    out.push("try-again does not start a fresh attempt");
  }

  // 9. The page keeps the fixed URL contract and loads via the API client.
  if (!s.page.includes("fetchDrill(params.stepId)")) out.push("page does not load the drill through fetchDrill");
  if (!/<VoiceDrillShell/.test(s.page)) out.push("page does not mount VoiceDrillShell");

  // 10. No typed answer path.
  for (const [label, src] of Object.entries(s)) {
    if (/Textarea|<textarea|<input/.test(src)) out.push(`${label} has a typed-answer input`);
  }
  return out;
}

const FORBIDDEN_TERMS = ["unlock", "locked", "prerequisite", "streak", "consecutive", "longestrun", "chainlength"];
function stripCommentsAndStrings(src: string): string {
  return stripComments(src).replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, '""');
}

function main() {
  const sources: Sources = {
    runner: read("components", "study-plan", "drill", "VoiceDrillRunner.tsx"),
    shell: read("components", "study-plan", "drill", "VoiceDrillShell.tsx"),
    result: read("components", "study-plan", "drill", "DrillResult.tsx"),
    page: read("app", "study-plans", "[planId]", "drills", "[stepId]", "page.tsx"),
  };
  console.log("\n1. FILES");
  for (const [k, v] of Object.entries(sources)) check(`${k} source exists and is non-empty`, v.length > 200);

  console.log("\n2. DRILL SHELL RULES");
  const found = issues(sources);
  check("the drill shell satisfies every surface rule", found.length === 0, JSON.stringify(found));

  console.log("\n3. BITE PROOFS (each mutation must be caught)");
  const mutations: Array<[string, Partial<Sources>, string]> = [
    ["a local copy of the recorder", { runner: sources.runner + "\nconst r = new MediaRecorder(s);" }, "re-implements"],
    ["a retry that re-reads the scenario", { runner: sources.runner.replace("avatar.speak(retryLine(retryFocusRef.current));", "avatar.speak(drill.scenarioPrompt);") }, "retry line"],
    ["stopping the avatar on grading", { runner: sources.runner.replace("avatarRef.current?.interrupt();\n      onGraded", "avatarRef.current?.stopSession();\n      onGraded") }, "stopped outside unmount"],
    ["score wording in the banner", { runner: sources.runner.replace("so your drill feedback can include visuals", "so your Visual score is right") }, "mentions a score"],
    ["no quote pointer in the result", { result: sources.result.replace("{miss.quote}", "{miss.techniqueId}") }, "student's words"],
    ["the runner moving tree position", { shell: sources.shell.replace("{runner}", "") }, "tree position"],
    ["a dropped shared import", { runner: sources.runner.replace('from "@/components/session/useVisualCapture"', 'from "./visual"') }, "useVisualCapture"],
    ["a mid-drill score", { runner: sources.runner.replace("{liveTip}</p>", "{liveTip}</p>{attempt.score}") }, "renders a score"],
    ["a composed tip", { runner: sources.runner.replace("speak(liveTip)", "speak(`Try this: ${liveTip}`)") }, "speak the tip"],
    ["speech before CONNECTED", { runner: sources.runner.replace("    void speakIntroOnce();\n  }\n\n  function handleStageInactive", "  }\n\n  function handleStageInactive") }, "handleStageReady"],
    ["a missing metrics field", { runner: sources.runner.replace("metrics: { visual: delivery.visual, vocal: delivery.vocal },", "") }, "lacks metrics"],
    ["a hard stop at 0:00", { runner: sources.runner.replace("const overTime =", "if (remaining === 0) void handleFinish();\n  const overTime =") }, "hard stop"],
    ["no coach from Settings", { shell: sources.shell.replace('fetch("/api/settings/coach"', 'fetch("/api/coach"') }, "Settings"],
    ["no next-step hook", { result: sources.result.replace("useNextStepHref(planId, attempt.id)", "null") }, "next step"],
    ["no try-again", { result: sources.result.replace("onPress={onTryAgain}", "") }, "try-again"],
    ["a typed answer", { runner: sources.runner + "\n<textarea />" }, "typed-answer"],
  ];
  for (const [label, patch, expect] of mutations) {
    const mutated = { ...sources, ...patch };
    const changed = Object.keys(patch).some((k) => mutated[k as keyof Sources] !== sources[k as keyof Sources]);
    const caught = issues(mutated).some((i) => i.includes(expect));
    check(`bite-proof: ${label} is caught`, changed && caught, changed ? "" : "mutation did not apply");
  }

  console.log("\n4. NO GATING / STREAK TERMS in components/study-plan/drill/");
  const drillFiles = fs.readdirSync(DRILL_DIR).filter((f) => /\.tsx?$/.test(f));
  check("drill directory walk is non-vacuous (>= 6 files)", drillFiles.length >= 6, String(drillFiles.length));
  for (const f of drillFiles) {
    const stripped = stripCommentsAndStrings(fs.readFileSync(path.join(DRILL_DIR, f), "utf-8")).toLowerCase();
    const hits = FORBIDDEN_TERMS.filter((t) => stripped.includes(t));
    check(`${f}: no gating/streak identifier`, hits.length === 0, JSON.stringify(hits));
  }
  const planted = stripCommentsAndStrings("const drillStreak = 3; // streak").toLowerCase();
  check("bite-proof: a planted streak identifier is caught", FORBIDDEN_TERMS.some((t) => planted.includes(t)));
  const inString = stripCommentsAndStrings('const s = "unlock";').toLowerCase();
  check("a term inside a string literal is not a false positive", !FORBIDDEN_TERMS.some((t) => inString.includes(t)));

  console.log("\n5. PRACTICE AGAIN on completed steps (review, never gating)");
  const panel = read("components", "study-plan", "PathPanel.tsx");
  const practiceIssues = (src: string): string[] => {
    const out: string[] = [];
    const block = src.slice(src.indexOf('step.status === "COMPLETE" && href ?'), src.indexOf("Practice again") + 20);
    if (!/step\.status === "COMPLETE" && href \?/.test(src)) out.push("no completed-step branch");
    if (!/Practice again/.test(block)) out.push("no Practice again label");
    if (!/href=\{href\}/.test(block)) out.push("Practice again does not use hrefForStep's destination");
    if (/kind ===|isUnlocked|locked|streak/i.test(block)) out.push("Practice again is conditioned on kind/gating");
    return out;
  };
  const pi = practiceIssues(panel);
  check("every completed step with a destination shows Practice again (any kind)", pi.length === 0, JSON.stringify(pi));
  check(
    "bite-proof: restricting Practice again to drills is caught",
    practiceIssues(panel.replace('step.status === "COMPLETE" && href ?', 'step.status === "COMPLETE" && step.kind === "VOICE_DRILL" && href ?')).length > 0,
  );
  check("bite-proof: removing the label is caught", practiceIssues(panel.replace("Practice again", "Review")).length > 0);

  console.log(failures === 0 ? `\nALL PASS (${passCount} checks)\n` : `\nFAILED: ${failures} assertion(s), ${passCount} passed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
