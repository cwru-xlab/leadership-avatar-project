import {
  STUDY_PLAN_JSON_SCHEMA,
  validateStudyPlanContent,
  type StudyPlanContent,
} from "./types";

/**
 * Local privacy filter for the study-plan workflow.
 *
 * It deliberately keeps only closed-vocabulary rubric labels and qualitative
 * ratings from report markdown. Narrative examples are discarded before any
 * model call, preventing names, employers, resume details, answers, or other
 * personal information from leaving this application.
 */
const SAFE_RUBRIC_LABELS = new Map([
  ["organization", "Organization"],
  ["completeness", "Completeness"],
  ["conciseness", "Conciseness"],
  ["clarification", "Clarification"],
  ["listening", "Listening"],
  ["ownership", "Ownership"],
  ["credit sharing", "Credit Sharing"],
  ["reflection & coachability", "Reflection & Coachability"],
  ["emotional regulation", "Emotional Regulation"],
  ["adaptability", "Adaptability"],
  ["curiosity & preparation", "Curiosity & Preparation"],
  ["professional language", "Professional Language"],
  ["self-awareness", "Self-Awareness"],
  ["humility", "Humility"],
  ["resilience", "Resilience"],
  ["collaboration & accountability", "Collaboration & Accountability"],
  ["judgment", "Judgment"],
  ["empathy", "Empathy"],
  ["confidence", "Confidence"],
]);

// Emit only these canonical values. The report model's prose is untrusted and
// must never cross the OpenAI boundary, even if it happens to contain only
// letters and spaces.
const SAFE_RATINGS = new Map([
  ["strong", "Strong"],
  ["solid", "Solid"],
  ["adequate", "Adequate"],
  ["developing", "Developing"],
  ["emerging", "Emerging"],
  ["mixed", "Mixed"],
  ["limited", "Limited"],
  ["needs work", "Needs Work"],
  ["needs improvement", "Needs Improvement"],
  ["needs development", "Needs Development"],
  ["not observed", "Not Observed"],
  ["n/a", "N/A"],
]);

const STUDY_PLAN_SYSTEM_PROMPT = `You create self-paced interview-practice study plans.

You receive only anonymous score aggregates and closed-vocabulary behavioral rubric signals. Never infer, request, or mention a student's identity, employer, work history, resume, interview answers, transcript, dates, timelines, or any personal detail.

Ground each theme only in the provided signals. A theme can be described as recurring only when supported by at least two reports; with one report, call it an observed development area. Be constructive and specific. Include strengths to leverage, ranked development themes, targeted exercises, verifiable readiness checks, and useful resources.

Do not include dates, deadlines, schedules, calendar language, day-by-day or week-by-week sequencing, or time-to-complete claims. Exercises may include an estimated duration in minutes, but the plan must remain self-paced.`;

export interface AnonymousBehavioralReport {
  reportNumber: number;
  contentScore: number | null;
  behavioralScore: number | null;
  behavioralFeedbackSignals: string[];
}

export interface StudyPlanGenerationSuccess {
  ok: true;
  content: StudyPlanContent;
  model: string;
}

export interface StudyPlanGenerationFailure {
  ok: false;
  reason: string;
  model: string;
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns only strings like "Ownership: Strong". The detailed narrative after
 * a dash is intentionally discarded, even when it would be useful feedback.
 */
export function extractBehavioralFeedback(reportMarkdown: string): string[] {
  const output = new Set<string>();

  for (const line of reportMarkdown.split(/\r?\n/)) {
    // Only a markdown bullet with a label/rating pair is eligible. The rating
    // capture stops at common narrative separators; both captures are then
    // mapped to our own fixed vocabulary below.
    const match = line.match(/^\s*[-*]\s+(.+?)\s*:\s*([^—–-]+)/);
    if (!match) continue;

    const label = SAFE_RUBRIC_LABELS.get(normalizeLabel(match[1]));
    const rating = SAFE_RATINGS.get(normalizeLabel(match[2]));
    if (!label || !rating) continue;

    output.add(`${label}: ${rating}`);
  }

  return [...output].slice(0, SAFE_RUBRIC_LABELS.size);
}

function buildUserMessage(reports: AnonymousBehavioralReport[]): string {
  return JSON.stringify({
    source_report_count: reports.length,
    reports,
  });
}

async function attemptGeneration(
  reports: AnonymousBehavioralReport[],
  model: string,
  timeoutMs: number
): Promise<StudyPlanContent> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: timeoutMs,
    maxRetries: 0,
  });

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: STUDY_PLAN_SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(reports) },
    ],
    max_tokens: 4_000,
    response_format: {
      type: "json_schema",
      json_schema: STUDY_PLAN_JSON_SCHEMA,
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Study-plan generator returned no content");

  return validateStudyPlanContent(JSON.parse(content) as unknown, reports.length);
}

/**
 * Generates a plan from anonymous behavioral signals only. It has a bounded
 * total timeout and one application-owned retry, matching interview evaluation.
 */
export async function generateStudyPlan(
  reports: AnonymousBehavioralReport[]
): Promise<StudyPlanGenerationSuccess | StudyPlanGenerationFailure> {
  const model = process.env.STUDY_PLAN_MODEL || "gpt-4.1";
  const BUDGET_MS = 50_000;
  const RETRIES = 1;
  const PER_ATTEMPT_TIMEOUT = Math.floor(BUDGET_MS / (RETRIES + 1));

  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRIES + 1; attempt++) {
    try {
      const content = await attemptGeneration(reports, model, PER_ATTEMPT_TIMEOUT);
      console.info("Study plan generated", {
        model,
        reportCount: reports.length,
        priorityThemeCount: content.priorityThemes.length,
      });
      return { ok: true, content, model };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt <= RETRIES) {
        console.warn(`Study-plan generation attempt ${attempt} failed, retrying: ${message}`);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  return {
    ok: false,
    model,
    reason: `Study-plan generation failed after ${RETRIES + 1} attempts: ${message}`.slice(0, 500),
  };
}
