/**
 * Regression coverage for #67 — live interviewer resume attribution.
 *
 * Run: npx tsx scripts/verify-live-resume-attribution.ts
 *
 * Covers the two live-prompt construction paths: a supplied resume must teach
 * natural first-introduction attribution, while a skipped resume must neither
 * expose that rule nor invite invented resume references. The engine delegation
 * check ensures the chat route's builder sees the same prompt.
 */
import { resolveAttemptLanguage } from "../lib/languages";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveSessionConfig } from "../lib/engine/resolve";
import { assembleSystemPrompt } from "../lib/engine/prompts";
import { buildInterviewSystemPrompt } from "../lib/interview/prompts";
import { getInterviewType } from "../lib/interview/types";

const LANGUAGE = resolveAttemptLanguage("en");
const RESUME = "Jordan Lee\nProduct Manager at Acme\nLed a cross-functional launch.";

let failures = 0;

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`);
  }
}

console.log("\n=== verify-live-resume-attribution ===");

const interviewType = getInterviewType("general");
const resolved = resolveSessionConfig("general");

if (!interviewType || !resolved.ok) {
  console.error("FATAL: unable to resolve the general interview prompt");
  process.exit(1);
}

console.log("\n1. Prompt with a supplied resume");
{
  const prompt = buildInterviewSystemPrompt(interviewType, {
    resumeText: RESUME,
    language: LANGUAGE,
  });

  check(
    "adds the resume-attribution rule",
    prompt.includes("## RESUME ATTRIBUTION"),
  );
  check(
    "requires attribution for a first-introduced resume detail",
    prompt.includes("has not already stated in this conversation"),
  );
  check(
    "gives a natural spoken attribution example",
    prompt.includes('"On your resume, I saw..."'),
  );
  check(
    "preserves natural handling of candidate-provided details",
    prompt.includes("do not force a resume reference"),
  );
  check(
    "forbids invented resume references",
    prompt.includes("Never invent a resume detail or imply that you saw one there."),
  );
  check("includes the supplied resume text", prompt.includes(RESUME));

  const enginePrompt = assembleSystemPrompt(resolved.config, {
    language: LANGUAGE,
    resumeText: RESUME,
  });
  check(
    "engine assembly delegates the same with-resume prompt",
    enginePrompt === prompt,
  );
}

console.log("\n2. Prompt without a resume");
{
  const prompt = buildInterviewSystemPrompt(interviewType, {
    resumeText: "   ",
    language: LANGUAGE,
  });

  check(
    "keeps the no-resume safety instruction",
    prompt.includes("(No resume provided. Skip the resume-grounded stage"),
  );
  check(
    "does not add an unusable resume-attribution rule",
    !prompt.includes("## RESUME ATTRIBUTION"),
  );
  check(
    "does not provide a resume-reference example",
    !prompt.includes('"On your resume, I saw..."'),
  );
  check(
    "forbids inventing background details",
    prompt.includes("Do not invent details about the candidate's background."),
  );

  const enginePrompt = assembleSystemPrompt(resolved.config, {
    language: LANGUAGE,
    resumeText: "",
  });
  check(
    "engine assembly delegates the same no-resume prompt",
    enginePrompt === buildInterviewSystemPrompt(interviewType, {
      resumeText: "",
      language: LANGUAGE,
    }),
  );
}

/**
 * 4. The in-session privacy line is a claim, so it may only appear when it is
 *    true.
 *
 * `PracticeTypePage` passes `resumeText=""` for pitches and networking, and
 * the instance launcher (courageous conversations) passes none at all. The
 * sentence "Your resume is used only to personalize this practice interview"
 * was nevertheless rendered unconditionally, telling students a file was in
 * use in sessions that never collect one (U3).
 *
 * Guarded at source because the sentence lives in JSX with no prompt or DTO
 * behind it: nothing else in this suite would notice it going ungated again.
 */
console.log("\n4. The resume privacy line only renders with a resume");
{
  const shell = readFileSync(
    join(__dirname, "..", "components", "practice", "PracticeSessionShell.tsx"),
    "utf8",
  );
  const claim = "Your resume is used only to personalize this practice interview.";
  const claimIndex = shell.indexOf(claim);

  check("the shell still carries the privacy line", claimIndex !== -1);

  if (claimIndex !== -1) {
    // The gate must be the resume itself, in the 400 characters before the
    // sentence — close enough to be the condition that renders it.
    const preceding = shell.slice(Math.max(0, claimIndex - 400), claimIndex);

    check(
      "the line is gated on resumeText rather than rendered unconditionally",
      /resumeText\.trim\(\)\s*\?/.test(preceding),
      "expected a `resumeText.trim() ?` gate immediately before the sentence",
    );
  }

  // Bite proof: the gate check must fail on the pre-fix, ungated markup.
  const ungated = `{answerControlsSupplement}\n<p className="mt-3">${claim}</p>`;
  const ungatedIndex = ungated.indexOf(claim);
  check(
    "bite-proof: the ungated original would be caught",
    !/resumeText\.trim\(\)\s*\?/.test(
      ungated.slice(Math.max(0, ungatedIndex - 400), ungatedIndex),
    ),
  );
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
if (failures > 0) process.exit(1);