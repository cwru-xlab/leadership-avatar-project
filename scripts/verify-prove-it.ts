/**
 * Proves the Phase 23 pre-filled prove-it step's pure contracts:
 * source-session choice, snapshot -> wizard prefill per practice type, the
 * href shape (existing practice routes + two optional params), the brief, the
 * link gate, and that the practice pages are INERT without the params.
 * Every rule has a bite-proof.
 *
 * Run: npx tsx scripts/verify-prove-it.ts   (no DATABASE_URL needed)
 */
import * as fs from "fs";
import * as path from "path";

import {
  chooseProveItSource,
  prefillFromSnapshot,
  proveItHref,
  proveItBrief,
  linkRejection,
  type ProveItSourceReport,
} from "../lib/study-plan/prove-it";
import { readPlanPrefillParams } from "../components/study-plan/prove-it/usePlanPrefill";
import { resolveInterviewType } from "../lib/interview/customization";
import { getInterviewType } from "../lib/interview/types";
import { PERSONALITY_DIALS } from "../lib/interview/customization-options";

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  if (pass) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

const ROOT = path.resolve(__dirname, "..");
const day = (d: number) => new Date(Date.UTC(2026, 9, d));
const report = (id: string, d: number, scores: unknown, snap: unknown = null, typeSlug = "general"): ProveItSourceReport => ({
  id,
  typeSlug,
  createdAt: day(d),
  scores,
  inputSnapshot: snap,
});

console.log("1. SOURCE SESSION CHOICE");
{
  const reports = [
    report("old-low", 1, { content: 1 }),
    report("new-high", 9, { content: 5 }),
    report("mid-low", 5, { content: 1 }),
    report("unscored", 10, { vocal: 3 }),
  ];
  const chosen = chooseProveItSource(reports, "structure_and_clarity");
  check("lowest score for the target skill wins; tie -> most recent", chosen?.id === "mid-low", chosen?.id);
  check(
    "no report scored the skill -> most recent report",
    chooseProveItSource(reports, "outcome_achievement")?.id === "unscored"
  );
  check("no reports -> null", chooseProveItSource([], "structure_and_clarity") === null);
  // Bite-proof: picking by recency alone would choose a different session.
  const byRecency = reports.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  check("bite-proof: recency-only would differ (the score rule is load-bearing)", byRecency.id !== chosen?.id);
}

console.log("\n2. SNAPSHOT -> PREFILL");
{
  const base = getInterviewType("general")!;
  const pressure = PERSONALITY_DIALS.find((d) => d.slug === "pressure")!;
  const resolved = resolveInterviewType("general", {
    industrySlug: "finance",
    roleSlug: "team-lead",
    difficulty: "Advanced",
    lengthSlug: "quick",
    personalitySlug: "pressure",
  })!;
  const interviewSnap = {
    kind: "interview",
    interviewerAvatarId: "a",
    interviewerName: "Sam",
    resumeId: null,
    resumeText: null,
    industry: resolved.defaultIndustry,
    roleTitle: resolved.defaultRoleTitle,
    difficulty: resolved.difficulty,
    targetMinutes: resolved.targetMinutes,
    targetQuestionCount: resolved.targetQuestionCount,
    interviewerPersona: resolved.interviewerPersona,
  };
  const p = prefillFromSnapshot("general", interviewSnap);
  check(
    "interview: resolved record inverts back to the wizard slugs",
    p.kind === "interview" &&
      JSON.stringify(p.customization) ===
        JSON.stringify({ industrySlug: "finance", roleSlug: "team-lead", difficulty: "Advanced", lengthSlug: "quick", personalitySlug: "pressure" }),
    JSON.stringify(p)
  );
  check(
    "interview round-trip: the prefill resolves to the SAME session config",
    p.kind === "interview" &&
      JSON.stringify(resolveInterviewType("general", p.customization)) === JSON.stringify(resolved)
  );
  check(
    "interview: a distilled persona is not reused (no personalitySlug invented)",
    (() => {
      const q = prefillFromSnapshot("general", { ...interviewSnap, interviewerPersona: "You are Jane Doe, a VP." });
      return q.kind === "interview" && q.customization.personalitySlug === undefined;
    })()
  );
  void base;
  void pressure;

  const net = prefillFromSnapshot("networking", {
    kind: "networking", personaSource: "character", characterId: "c-1", personaId: null, displayName: "Ava",
    goal: "Get a referral", interviewerAvatarId: null, interviewerVoice: null, budgetSeconds: null,
  });
  check("networking: character + goal", net.kind === "networking" && net.characterId === "c-1" && net.personaId === null && net.goal === "Get a referral");

  const elevator = prefillFromSnapshot("pitch-elevator", {
    kind: "pitch", pitchKind: "elevator", pitchSubject: "My startup", listenerKnowledge: "blind", deckId: null,
    slideCount: null, askPriceUsd: null, askEquityPct: null, fairValueBand: null, firstTurnWindowSeconds: null,
    budgetSeconds: null, listenerPersona: null,
  });
  check("pitch-elevator: subject + listener", elevator.kind === "pitch-elevator" && elevator.pitchSubject === "My startup");

  const deck = prefillFromSnapshot("pitch-deck", {
    kind: "pitch", pitchKind: "deck", pitchSubject: null, listenerKnowledge: null, deckId: "d1",
    slideCount: 4, askPriceUsd: 1, askEquityPct: 1, fairValueBand: null, firstTurnWindowSeconds: null,
    budgetSeconds: 600, listenerPersona: null,
  });
  check("deck mode: no reusable setup -> none (brief only)", deck.kind === "none");

  const scenario = prefillFromSnapshot("case-study", { kind: "scenario", caseId: "case-9", caseName: "X", background: "", avatars: [], criteria: null });
  check("case-study: the instance is the setup", scenario.kind === "instance" && scenario.instanceId === "case-9");
  check("garbage snapshot -> none", prefillFromSnapshot("general", { kind: "nope" }).kind === "none");
}

console.log("\n3. HREF, BRIEF, LINK GATE");
{
  const href = proveItHref("plan-1", "step-1", "general", { kind: "interview", customization: {} });
  check("href = existing practice route + fromPlan/step only", href === "/practice/general?fromPlan=plan-1&step=step-1", href);
  const instanceHref = proveItHref("plan-1", "step-1", "case-study", { kind: "instance", instanceId: "case-9" });
  check("instance href uses the existing /practice/{type}/{instanceId} route", instanceHref === "/practice/case-study/case-9?fromPlan=plan-1&step=step-1", instanceHref);
  check(
    "the instance route file exists on disk",
    fs.existsSync(path.join(ROOT, "app", "practice", "[type]", "[instanceId]", "page.tsx"))
  );
  const brief = proveItBrief("structure_and_clarity", "Interview", true);
  check("brief names the target skill and says it is graded like a live session", brief.includes("Structure & clarity") && brief.includes("graded like any live session"));

  const gen = day(10);
  check("link: own same-type report after generation is accepted", linkRejection({ report: { typeSlug: "general", createdAt: day(11), status: "IN_PROGRESS" }, expectedTypeSlug: "general", pathGeneratedAt: gen }) === null);
  check("bite-proof: a different practice type is rejected", linkRejection({ report: { typeSlug: "networking", createdAt: day(11), status: "READY" }, expectedTypeSlug: "general", pathGeneratedAt: gen }) !== null);
  check("bite-proof: a report from before the path is rejected", linkRejection({ report: { typeSlug: "general", createdAt: day(9), status: "READY" }, expectedTypeSlug: "general", pathGeneratedAt: gen }) !== null);
  check("missing report rejected", linkRejection({ report: null, expectedTypeSlug: "general", pathGeneratedAt: gen }) !== null);
}

console.log("\n4. PRACTICE PAGES ARE INERT WITHOUT THE PARAMS");
{
  check("no params -> null", readPlanPrefillParams("") === null);
  check("only fromPlan -> null", readPlanPrefillParams("?fromPlan=p") === null);
  check("only step -> null", readPlanPrefillParams("?step=s") === null);
  check("unrelated params -> null", readPlanPrefillParams("?foo=1&bar=2") === null);
  check("both -> parsed", JSON.stringify(readPlanPrefillParams("?fromPlan=p&step=s")) === JSON.stringify({ planId: "p", stepId: "s" }));

  const hook = fs.readFileSync(path.join(ROOT, "components", "study-plan", "prove-it", "usePlanPrefill.ts"), "utf-8");
  // The fetch must sit AFTER the early return on absent params.
  const earlyReturn = hook.indexOf("if (!parsed)");
  const firstFetch = hook.indexOf("fetch(");
  const inertOk = (src: string) => {
    const r = src.indexOf("if (!parsed)");
    const f = src.indexOf("fetch(");
    return r >= 0 && f > r;
  };
  check("the hook returns before any fetch when params are absent", earlyReturn >= 0 && firstFetch > earlyReturn && inertOk(hook));
  check("linkReport is a no-op without prove-it info", /if \(!info \|\| !stepId \|\| !reportId\) return;/.test(hook));
  check("bite-proof: a hook that fetches before the guard is FLAGGED", !inertOk(`fetch("/x");\n${hook}`));

  const shellUntouched = !fs
    .readFileSync(path.join(ROOT, "components", "practice", "PracticeSessionShell.tsx"), "utf-8")
    .includes("fromPlan");
  check("PracticeSessionShell.tsx is untouched by the prefill", shellUntouched);
  for (const page of [["app", "practice", "[type]", "page.tsx"], ["app", "practice", "[type]", "[instanceId]", "page.tsx"]]) {
    const src = fs.readFileSync(path.join(ROOT, ...page), "utf-8");
    const prefillLines = src.split("\n").filter((l) => /planPrefill|ProveItBrief/.test(l));
    check(
      `${page.join("/")}: every prefill touch goes through planPrefill (no other new reads)`,
      prefillLines.length > 0 && !/searchParams|URLSearchParams|get\("fromPlan"\)/.test(src),
      `${prefillLines.length} lines`
    );
  }
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
