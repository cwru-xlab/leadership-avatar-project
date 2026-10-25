/**
 * Grader consistency calibration (REAL model calls).
 *
 * Grades the same 3 fixed answers (strong / middling / weak) 5 times each
 * through the VOICE_DRILL grader and the coached attempt grader, and reports
 * the spread. Targets: max - min <= 1 for every answer, and the medians keep
 * the strong > middling > weak ordering. Exits 1 when a target is missed.
 *
 * Needs OPENAI_API_KEY. Run:
 *   npx tsx --env-file=<.env.local> scripts/calibrate-graders.ts
 */
import { COMPETENCIES } from "../lib/mastery/competencies";
import { gradeDrillAttempt } from "../lib/study-plan/drill/grade";
import { gradeCoachedAttempt } from "../lib/study-plan/coached/grade-attempt";
import { techniquesForCompetency } from "../lib/study-plan/coached/tips";

const RUNS = 5;
const KEY = "structure_and_clarity" as const;
const competency = COMPETENCIES.find((c) => c.key === KEY)!;
const QUESTION = "Walk me through how you rebuilt the team's dataset after the old web app was abandoned.";
const ORIGINAL =
  "So yeah, um, there was this app and nobody owned it and the data was kind of everywhere, and I sort of looked at it and then we fixed some of it I think.";

const ANSWERS: Array<{ label: "strong" | "middling" | "weak"; text: string }> = [
  {
    label: "strong",
    text:
      "I rebuilt the dataset in three steps, and the result was data the team could trust again. First, I found the abandoned app's backups and listed exactly what was missing. Second, I wrote recovery scripts and checked every table against the last good reports. Third, I documented the new pipeline so anyone on the team can maintain it. So: three steps, and a dataset we rely on today.",
  },
  {
    label: "middling",
    text:
      "So the app was abandoned and the data was a mess. I looked for backups and found some of them and also there were scripts I wrote to recover records and I checked the tables against old reports, which took a while. Then I wrote some documentation. In the end most of the data came back and the team uses it now, I think it worked out pretty well overall.",
  },
  {
    label: "weak",
    text:
      "Um, yeah, so there was this app, and, like, nobody really owned it, and the data was kind of all over the place, and I was an intern so I just sort of looked around and tried stuff and talked to people and eventually some of it was fixed, I guess, but it was a long time ago so I don't fully remember all the details of what happened.",
  },
];

const delivery = { wordsPerMinute: null, fillerWordCount: null, pauseCount: null, eyeContactPct: null, spokenSeconds: 40 };
const tip = techniquesForCompetency(KEY).find((t) => t.name === "Headline first") ?? techniquesForCompetency(KEY)[0];

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required (real model calls).");
    process.exit(2);
  }
  const rows: Array<{ grader: string; label: string; scores: number[] }> = [];
  for (const answer of ANSWERS) {
    const drill: number[] = [];
    const coached: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const d = await gradeDrillAttempt({
        competencyKey: KEY,
        scenarioPrompt: QUESTION,
        tipText: tip.reminder,
        techniqueId: tip.id,
        transcript: answer.text,
        delivery,
      });
      drill.push(d.score);
      const c = await gradeCoachedAttempt({
        competency: { key: competency.key, label: competency.label, description: competency.description },
        rubricDimensions: [{ key: "content", label: "Content" }],
        counterpartLine: QUESTION,
        originalLine: ORIGINAL,
        attempt: answer.text,
        spokenDurationMs: 40_000,
        demonstration: null,
      });
      coached.push(c.score);
    }
    rows.push({ grader: "drill", label: answer.label, scores: drill });
    rows.push({ grader: "coached", label: answer.label, scores: coached });
  }

  let failed = false;
  console.log("\n| grader  | answer   | scores (x5)   | min | max | spread | median | spread<=1 |");
  console.log("|---------|----------|---------------|-----|-----|--------|--------|-----------|");
  for (const r of rows) {
    const min = Math.min(...r.scores);
    const max = Math.max(...r.scores);
    const ok = max - min <= 1;
    if (!ok) failed = true;
    console.log(
      `| ${r.grader.padEnd(7)} | ${r.label.padEnd(8)} | ${r.scores.join(", ").padEnd(13)} | ${min}   | ${max}   | ${max - min}      | ${median(r.scores)}      | ${ok ? "yes" : "NO"}       |`,
    );
  }
  for (const grader of ["drill", "coached"]) {
    const m = (label: string) => median(rows.find((r) => r.grader === grader && r.label === label)!.scores);
    const ordered = m("strong") > m("middling") && m("middling") > m("weak");
    if (!ordered) failed = true;
    console.log(`${grader}: medians strong ${m("strong")} > middling ${m("middling")} > weak ${m("weak")} — ${ordered ? "ordering holds" : "ORDERING BROKEN"}`);
  }
  console.log(failed ? "\nCALIBRATION TARGET MISSED\n" : "\nCALIBRATION TARGETS MET\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
