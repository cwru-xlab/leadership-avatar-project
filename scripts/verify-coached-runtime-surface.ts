/**
 * Plan 21-24: proves the coached session SHELL — not the runtime 21-23
 * already verified — cannot locally skip the replay leg, renders only
 * server-gated tips with no client-side composition, stays separate from
 * normal practice in both directions, and satisfies the fixed link
 * contract 21-19's PathPanel depends on.
 *
 * All four sections are source-and-build assertions. No database is
 * needed, so there is no SKIP path on these sections and nothing can
 * silently pass — the one conditional SKIP (Section 4's PathPanel check)
 * is explicit and logged, never silent.
 *
 * Run: npx tsx scripts/verify-coached-runtime-surface.ts
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

let failures = 0;

function ok(msg: string) {
  console.log(`  ok   ${msg}`);
}
function fail(msg: string) {
  console.log(`  FAIL ${msg}`);
  failures += 1;
}
function skip(msg: string) {
  console.log(`  SKIP ${msg}`);
}
function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    ok(name);
  } else {
    fail(`${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

function abs(...parts: string[]) {
  return join(ROOT, ...parts);
}
function rel(p: string) {
  return relative(ROOT, p).replace(/\\/g, "/");
}

function walkFiles(dir: string, exts: string[], out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git" || name === ".planning") {
      continue;
    }
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(full, exts, out);
    else if (exts.some((ext) => full.endsWith(ext))) out.push(full);
  }
  return out;
}

/**
 * Strips `//` line comments, `/* ... *\/` block comments, and string/
 * template literals — a single-pass state machine, same technique
 * scripts/verify-levels-goals.ts (21-17) uses for its own forbidden-term
 * scan, written fresh here rather than imported (these are standalone
 * verification scripts, not a shared library).
 */
function stripCommentsAndStrings(source: string): string {
  let result = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const twoChars = source.slice(i, i + 2);
    if (twoChars === "//") {
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    if (twoChars === "/*") {
      i += 2;
      while (i < n && source.slice(i, i + 2) !== "*/") i += 1;
      i += 2;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        i += 1;
      }
      i += 1;
      continue;
    }
    result += ch;
    i += 1;
  }
  return result;
}

const SHELL_PATH = "components/study-plan/CoachedSessionShell.tsx";
const PAGE_PATH = "app/study-plans/[planId]/coached/[stepId]/page.tsx";

const shellSource = readFileSync(abs(...SHELL_PATH.split("/")), "utf8");
const pageSource = readFileSync(abs(...PAGE_PATH.split("/")), "utf8");

// ---------------------------------------------------------------------------
console.log("\n1. LEG GATING IN THE VIEW — no local advance without a server response");
{
  // Any state-setter call whose argument is the literal "FRESH" or
  // "COMPLETE" is the one bug class that would make REQ-114 false while the
  // screen looked correct — print every candidate for review, then assert
  // each one's surrounding 400 characters name a fetch/await/response.
  const literalAdvanceRe = /\b[A-Za-z_]+\(\s*["'](FRESH|COMPLETE)["']/g;
  const candidates: Array<{ index: number; match: string; context: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = literalAdvanceRe.exec(shellSource)) !== null) {
    const start = Math.max(0, m.index - 200);
    const end = Math.min(shellSource.length, m.index + 200);
    candidates.push({ index: m.index, match: m[0], context: shellSource.slice(start, end) });
  }

  console.log(`  candidate literal-leg-setter call(s) found: ${candidates.length}`);
  for (const c of candidates) {
    console.log(`    at offset ${c.index}: ${c.match}`);
    console.log(`      context: ...${c.context.replace(/\s+/g, " ")}...`);
  }

  const allHaveServerContext = candidates.every((c) => /fetch|await|response/i.test(c.context));
  check(
    "every literal FRESH/COMPLETE state-setter call (if any) has a fetch/await/response identifier nearby",
    allHaveServerContext,
    JSON.stringify(candidates.map((c) => c.match)),
  );
  check(
    "there are ZERO such literal calls — the leg is set only from the full server-returned object, never a local string",
    candidates.length === 0,
    `found ${candidates.length}`,
  );

  // Exactly one "advance" and one "complete" as a PATCH action value — two
  // forward controls per action would mean one of them is a way to skip
  // the replay leg.
  const advanceActionMatches = shellSource.match(/action:\s*"advance"/g) ?? [];
  const completeActionMatches = shellSource.match(/action:\s*"complete"/g) ?? [];
  console.log(`  action: "advance" occurrences: ${advanceActionMatches.length}`);
  console.log(`  action: "complete" occurrences: ${completeActionMatches.length}`);
  check('exactly one `action: "advance"` PATCH value', advanceActionMatches.length === 1, `count=${advanceActionMatches.length}`);
  check('exactly one `action: "complete"` PATCH value', completeActionMatches.length === 1, `count=${completeActionMatches.length}`);

  // No REPLAY -> FRESH transition expressed as a local conditional on
  // anything other than the server-returned leg: look for the literal
  // string "REPLAY" appearing shortly before a literal FRESH-setting call.
  // Since Section 1's first check already proved there are zero literal
  // FRESH-setting calls at all, there is necessarily no such conditional —
  // this check makes that conclusion explicit rather than merely implied.
  const replayThenFreshLiteral = candidates.some(
    (c) => c.match.includes("FRESH") && /REPLAY/.test(c.context),
  );
  check(
    "no REPLAY->FRESH transition is expressed as a local conditional outside the server response",
    !replayThenFreshLiteral,
  );
}

// ---------------------------------------------------------------------------
console.log("\n2. NO TIP COMPOSITION IN THE VIEW (REQ-115)");
{
  const reminderRe = /\breminder\b/g;
  const occurrences: Array<{ index: number; line: string; classification: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = reminderRe.exec(shellSource)) !== null) {
    const lineStart = shellSource.lastIndexOf("\n", m.index) + 1;
    const lineEnd = shellSource.indexOf("\n", m.index);
    const line = shellSource.slice(lineStart, lineEnd === -1 ? shellSource.length : lineEnd).trim();

    let classification: string;
    if (/reminder\s*:\s*string/.test(line)) {
      classification = "TYPE_DECLARATION";
    } else if (/\.reminder\b/.test(line)) {
      classification = "MEMBER_READ";
    } else {
      classification = "OTHER";
    }
    occurrences.push({ index: m.index, line, classification });
  }

  console.log(`  "reminder" occurrences found: ${occurrences.length}`);
  for (const occ of occurrences) {
    console.log(`    [${occ.classification}] ${occ.line}`);
  }

  const otherOccurrences = occurrences.filter((o) => o.classification === "OTHER");
  check(
    '"reminder" is only ever a type declaration or a `.reminder` read, never assigned or templated',
    otherOccurrences.length === 0,
    JSON.stringify(otherOccurrences),
  );
  check(
    "at least one `.reminder` read exists (the tip rail actually renders the field)",
    occurrences.some((o) => o.classification === "MEMBER_READ"),
  );

  check(
    "no `reminder ??` or `reminder ||` default/fallback",
    !/reminder\s*(\?\?|\|\|)/.test(shellSource),
  );

  // Exactly one explanatory literal over 40 characters inside the TipRail
  // component specifically — the standing "these name a technique" contract
  // line — and it must mention "technique".
  const tipRailMatch = shellSource.match(/function TipRail\([^)]*\)\s*\{[\s\S]*?\n\}/);
  check("TipRail function body located", Boolean(tipRailMatch));
  const tipRailBody = tipRailMatch ? tipRailMatch[0] : "";

  const jsxTextLiterals = [...tipRailBody.matchAll(/>\s*([^<>{}\n][^<>{}]{0,400})\s*</g)]
    .map((mm) => mm[1].trim())
    .filter((text) => text.length > 40);

  console.log(`  JSX text literal(s) over 40 chars inside TipRail: ${JSON.stringify(jsxTextLiterals)}`);
  check(
    "exactly one explanatory literal over 40 chars inside the tip rail",
    jsxTextLiterals.length === 1,
    JSON.stringify(jsxTextLiterals),
  );
  check(
    "that one literal mentions \"technique\"",
    jsxTextLiterals.length === 1 && /technique/i.test(jsxTextLiterals[0]),
  );

  check(
    "the shell does not import from lib/study-plan/coached/tips",
    !/from\s+["'](?:@\/lib\/study-plan\/coached\/tips|(?:\.\.\/)+study-plan\/coached\/tips)["']/.test(shellSource),
  );
}

// ---------------------------------------------------------------------------
console.log("\n3. SEPARATION FROM NORMAL PRACTICE");
{
  const practiceRoots = ["components/practice", "app/practice"];
  const practiceFiles = practiceRoots
    .flatMap((root) => walkFiles(abs(...root.split("/")), [".ts", ".tsx"]))
    .map((f) => rel(f));

  check("practice-tree walk is non-vacuous (greater than 5 files)", practiceFiles.length > 5, `walked=${practiceFiles.length}`);

  const forbiddenIdentifierRe =
    /\b(CoachedSession|coachTip|techniqueReminder|COACHED_PHASES)\b|@\/lib\/study-plan\/coached/;
  const leaking = practiceFiles.filter((f) => forbiddenIdentifierRe.test(readFileSync(abs(...f.split("/")), "utf8")));
  console.log(`  practice-tree files leaking a coached identifier: ${JSON.stringify(leaking)}`);
  check("zero components/practice or app/practice files mention a coached identifier", leaking.length === 0, JSON.stringify(leaking));

  // Converse: the shell must not import from components/practice — if any
  // transport logic were genuinely reused, it would have to be lifted into
  // a shared module instead, and this assertion is what proves that.
  const importsPractice = /from\s+["']@\/components\/practice\//.test(shellSource);
  check("the shell does not import from @/components/practice/", !importsPractice);

  const importLines = [...shellSource.matchAll(/^import[^\n]*$/gm)].map((mm) => mm[0]);
  console.log(`  shell's full import list (${importLines.length} line(s)):`);
  for (const line of importLines) console.log(`    ${line}`);

  let practiceDiffOutput = "";
  try {
    practiceDiffOutput = execSync("git diff --name-only -- components/practice/", {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch (err) {
    practiceDiffOutput = `<git diff failed: ${err instanceof Error ? err.message : String(err)}>`;
  }
  console.log(`  git diff --name-only -- components/practice/ => "${practiceDiffOutput}"`);
  check("components/practice/ is unmodified relative to the working tree's committed state", practiceDiffOutput === "");
}

// ---------------------------------------------------------------------------
console.log("\n4. LINK CONTRACT AND NO FORBIDDEN MECHANICS");
{
  check(
    "the page exists at exactly app/study-plans/[planId]/coached/[stepId]/page.tsx",
    existsSync(abs(...PAGE_PATH.split("/"))),
  );

  const pathPanelPath = abs("components", "study-plan", "PathPanel.tsx");
  if (existsSync(pathPanelPath)) {
    const pathPanelSource = readFileSync(pathPanelPath, "utf8");
    check("PathPanel.tsx links to /coached/ (REQ-122's coached half)", pathPanelSource.includes("/coached/"));
  } else {
    skip("components/study-plan/PathPanel.tsx does not exist yet — 21-19 (wave 7) has not run");
  }

  // Re-run 21-17's forbidden-identifier scan, comment-stripped, over both
  // of this plan's new files — 21-17's own walk predated these files, the
  // same reason 21-19's section 5 re-runs it.
  const FORBIDDEN_TERMS = ["streak", "consecutive", "locked", "unlock"];
  for (const file of [SHELL_PATH, PAGE_PATH]) {
    const source = readFileSync(abs(...file.split("/")), "utf8");
    const stripped = stripCommentsAndStrings(source).toLowerCase();
    const matches = FORBIDDEN_TERMS.filter((term) => stripped.includes(term));
    check(`${file}: no streak/consecutive/locked/unlock term outside a comment or string`, matches.length === 0, JSON.stringify(matches));
  }

  check("the shell contains aria-live", shellSource.includes("aria-live"));
  check("the shell contains at least one <section", /<section/.test(shellSource));
  check("the shell contains at least one <aside", /<aside/.test(shellSource));
}

// ---------------------------------------------------------------------------
// Sections 5-10 (Plan 22-15): presentation decisions, as pure functions over
// source text so each can be re-run against an in-memory mutated copy.
// ---------------------------------------------------------------------------

function noCounterpartTransportProblems(src: string): string[] {
  const forbidden = [
    "/api/practice/session/start",
    "/api/interaction/chat",
    "/api/practice/session/finish",
    "typeSlug:",
  ];
  return forbidden.filter((needle) => src.includes(needle)).map((n) => `references ${n}`);
}

function functionBody(src: string, name: string): string | null {
  const start = src.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  if (start === -1) return null;
  const end = src.indexOf("\n  }\n", start);
  return end === -1 ? src.slice(start) : src.slice(start, end + 5);
}

function openingProblems(src: string): string[] {
  const problems: string[] = [];

  // (a) the stage is rendered only after the consent gate has returned.
  const gate = src.search(/if\s*\(\s*!consented\s*\)\s*\{/);
  const stageAt = src.indexOf("<CoachAvatarStage");
  if (gate === -1) problems.push("no `if (!consented)` gate");
  else {
    const gateEnd = src.indexOf("\n  }\n", gate);
    if (!/return\s*\(/.test(src.slice(gate, gateEnd))) problems.push("consent gate does not return");
    if (stageAt === -1 || stageAt < gateEnd) problems.push("<CoachAvatarStage is not behind the consent gate");
  }

  // (b) the no-utterance turn PATCH lives only in requestOpeningTurn, behind a ref guard.
  const body = functionBody(src, "requestOpeningTurn");
  if (!body) {
    problems.push("requestOpeningTurn not found");
    return problems;
  }
  const noUtterance = /action:\s*"turn"\s*\}/g;
  const all = [...src.matchAll(noUtterance)].length;
  const inBody = [...body.matchAll(noUtterance)].length;
  if (inBody < 1) problems.push("no-utterance turn PATCH missing from requestOpeningTurn");
  if (all !== inBody) problems.push("a no-utterance turn PATCH exists outside requestOpeningTurn");
  const fetchAt = body.indexOf("fetch(");
  const checkAt = body.search(/if\s*\(\s*openingRequestedRef\.current\s*\)\s*return/);
  const setAt = body.search(/openingRequestedRef\.current\s*=\s*true/);
  if (checkAt === -1 || fetchAt === -1 || checkAt > fetchAt) problems.push("ref guard check missing before fetch");
  if (setAt === -1 || setAt > fetchAt) problems.push("ref guard set missing before fetch");

  // (c) call sites.
  const allowedFns = new Set(["handleStageReady", "handleStageError", "handleAdvance", "handleConsent"]);
  const callRe = /requestOpeningTurn\(/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(src)) !== null) {
    const before = src.slice(0, m.index);
    if (/function\s+$/.test(before)) continue; // the definition
    const fnMatches = [...before.matchAll(/\n  (?:async\s+)?function\s+(\w+)/g)];
    const fnMatch = fnMatches[fnMatches.length - 1];
    const effectAt = before.lastIndexOf("useEffect(");
    const fnAt = fnMatch ? (fnMatch.index ?? -1) : -1;
    if (effectAt > fnAt) {
      const rest = src.slice(effectAt);
      const endRel = rest.indexOf("\n  }, [");
      const seg = endRel === -1 ? rest : rest.slice(0, rest.indexOf("\n", endRel + 6));
      const timerOk = /setTimeout\s*\(/.test(src.slice(effectAt, m.index));
      if (!/consent/i.test(seg)) problems.push(`call at ${m.index} is in an effect not conditioned on consent`);
      else if (!timerOk) problems.push(`call at ${m.index} is in a consent effect but not in a setTimeout callback`);
      continue;
    }
    const name = fnMatch ? fnMatch[1] : "<top level>";
    if (!allowedFns.has(name)) {
      problems.push(`call at ${m.index} is in ${name}, not an allowed call site`);
    } else if (name === "handleConsent" && !/setTimeout\s*\(/.test(src.slice(fnAt, m.index))) {
      problems.push(`call at ${m.index} in handleConsent is not inside a setTimeout callback`);
    }
  }
  return problems;
}

function tipRailBodyOf(src: string): string {
  const mm = src.match(/function TipRail\([^)]*\)\s*\{[\s\S]*?\n\}/);
  return mm ? mm[0] : "";
}

function disclosureProblems(src: string): string[] {
  const problems: string[] = [];
  const rail = tipRailBodyOf(src);
  if (!rail) problems.push("TipRail body not found");
  const outside = rail ? src.replace(rail, "") : src;
  if (!/separate thing from the technique tips/.test(outside)) {
    problems.push("disclosure literal missing outside TipRail");
  }
  if (/demonstration/i.test(rail)) problems.push("TipRail references demonstration");
  return problems;
}

const MOMENT_PATH = "components/study-plan/coached/CoachedMomentPanel.tsx";
const momentSource = readFileSync(abs(...MOMENT_PATH.split("/")), "utf8");

function verbatimProblems(src: string): string[] {
  const problems: string[] = [];
  for (const field of ["studentLine", "counterpartLine"]) {
    if (!new RegExp(`whitespace-pre-wrap[^>]*>\\s*\\{${field}\\}`).test(src)) {
      problems.push(`${field} is not rendered directly in a whitespace-pre-wrap element`);
    }
  }
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const bad = stripped.match(/\.(trim|slice|substring|toLowerCase|replace)\s*\(/g);
  if (bad) problems.push(`transforming call(s): ${bad.join(", ")}`);
  return problems;
}

console.log("\n5. NO COUNTERPART TRANSPORT");
{
  const p = noCounterpartTransportProblems(shellSource);
  check("the shell references no practice/interaction transport and no `typeSlug:`", p.length === 0, JSON.stringify(p));
  const mutated = shellSource.replace(
    "const coachedUrl",
    'void fetch("/api/interaction/chat", {});\n  const coachedUrl',
  );
  check(
    "bite-proof: an inserted fetch(\"/api/interaction/chat\" is caught",
    mutated !== shellSource && noCounterpartTransportProblems(mutated).length > 0,
  );
}

console.log("\n6. CONSENT-GATED, GUARDED OPENING");
{
  const p = openingProblems(shellSource);
  check("avatar stage behind consent; opening PATCH only in the ref-guarded requestOpeningTurn; call sites allowed", p.length === 0, JSON.stringify(p));
  const callCount = (shellSource.match(/requestOpeningTurn\(/g) ?? []).length;
  console.log(`  requestOpeningTurn( occurrences (incl. definition): ${callCount}`);

  const unconditioned = shellSource.replace(
    "  // Keep the latest caption in view",
    "  useEffect(() => {\n    void requestOpeningTurn();\n  }, []);\n\n  // Keep the latest caption in view",
  );
  check(
    "bite-proof: requestOpeningTurn() in an unconditioned useEffect is caught",
    unconditioned !== shellSource && openingProblems(unconditioned).length > 0,
  );
  const noGuard = shellSource.replace("if (openingRequestedRef.current) return;", "");
  check(
    "bite-proof: removing the ref guard is caught",
    noGuard !== shellSource && openingProblems(noGuard).length > 0,
  );
  const stray = shellSource.replace(
    "  function handleConsent(): void {",
    "  function strayCaller(): void {\n    void requestOpeningTurn();\n  }\n\n  function handleConsent(): void {",
  );
  check(
    "bite-proof: a call from an unlisted function is caught",
    stray !== shellSource && openingProblems(stray).length > 0,
  );
}

console.log("\n7. VERBATIM MOMENT");
{
  const p = verbatimProblems(momentSource);
  check("CoachedMomentPanel renders studentLine/counterpartLine in whitespace-pre-wrap with no transform", p.length === 0, JSON.stringify(p));
  const mutated = momentSource.replace("{studentLine}", "{studentLine.trim()}");
  check("bite-proof: .trim() on a moment line is caught", mutated !== momentSource && verbatimProblems(mutated).length > 0);
}

console.log("\n8. DEMONSTRATION DISCLOSURE");
{
  const p = disclosureProblems(shellSource);
  check("disclosure literal sits outside TipRail and TipRail never references demonstration", p.length === 0, JSON.stringify(p));
  const mutated = shellSource.replace("function TipRail(", "function TipRail(/* demonstration */ ");
  check("bite-proof: a demonstration reference in TipRail is caught", mutated !== shellSource && disclosureProblems(mutated).length > 0);
}

console.log("\n9. SCROLL");
{
  const pageHas = /overflow-y-auto/.test(pageSource);
  check("the page contains overflow-y-auto", pageHas);
  check(
    "the shell has no overflow-hidden wrapper around session content",
    !/overflow-hidden/.test(shellSource),
  );
}

console.log("\n10. NO TYPED ANSWER");
{
  const coachedDir = abs("components", "study-plan", "coached");
  const files = [SHELL_PATH, ...walkFiles(coachedDir, [".ts", ".tsx"]).map(rel)];
  const typedRe = /Textarea|<textarea|<input/;
  const offenders = files.filter((f) => typedRe.test(readFileSync(abs(...f.split("/")), "utf8")));
  console.log(`  scanned ${files.length} file(s)`);
  check("no Textarea / <textarea / <input in the shell or components/study-plan/coached/", offenders.length === 0, JSON.stringify(offenders));
}

// ---------------------------------------------------------------------------
if (failures === 0) {
  console.log("\nverify-coached-runtime-surface: ALL SECTIONS PASSED\n");
  process.exit(0);
} else {
  console.log(`\nverify-coached-runtime-surface: FAILED (${failures} failure(s))\n`);
  process.exit(1);
}

// Keep `pageSource` referenced for any future section that inspects page
// text beyond the forbidden-term scan above — unused-variable guard.
void pageSource;
