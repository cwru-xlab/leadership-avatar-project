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

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
if (failures > 0) process.exit(1);
