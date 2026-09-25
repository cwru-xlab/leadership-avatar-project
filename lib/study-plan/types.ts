export interface StudyPlanStrength {
  theme: string;
  explanation: string;
  supportingReportCount: number;
}

export interface StudyPlanExercise {
  title: string;
  instructions: string;
  estimatedMinutes: number;
  successCriteria: string;
}

export interface StudyPlanPriorityTheme {
  priority: number;
  theme: string;
  whyItMatters: string;
  supportingReportCount: number;
  practiceExercises: StudyPlanExercise[];
  readinessChecks: string[];
}

export interface StudyPlanResource {
  title: string;
  description: string;
  url: string | null;
}

export interface StudyPlanContent {
  title: string;
  summary: string;
  strengthsToLeverage: StudyPlanStrength[];
  priorityThemes: StudyPlanPriorityTheme[];
  resources: StudyPlanResource[];
  nextPracticeFocus: string;
}

const LIMITS = {
  title: 140,
  theme: 180,
  explanation: 1_200,
  summary: 2_000,
  instructions: 2_000,
  successCriteria: 800,
  readinessCheck: 500,
  resourceDescription: 800,
  nextPracticeFocus: 800,
  strengths: 5,
  priorityThemes: 5,
  exercises: 3,
  readinessChecks: 4,
  resources: 8,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, maxLength: number, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be text`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} cannot be empty`);
  if (normalized.length > maxLength) throw new Error(`${label} is too long`);
  return normalized;
}

function readPositiveInteger(value: unknown, label: string, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${label} must be a whole number between 1 and ${max}`);
  }
  return value;
}

function readArray(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    throw new Error(`${label} must contain between 1 and ${max} items`);
  }
  return value;
}

function normalizeResourceUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 2_000) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function validateStrength(value: unknown, reportCount: number): StudyPlanStrength {
  if (!isRecord(value)) throw new Error("A strength must be an object");
  return {
    theme: readString(value.theme, LIMITS.theme, "Strength theme"),
    explanation: readString(value.explanation, LIMITS.explanation, "Strength explanation"),
    supportingReportCount: readPositiveInteger(
      value.supportingReportCount,
      "Strength report count",
      reportCount
    ),
  };
}

function validateExercise(value: unknown): StudyPlanExercise {
  if (!isRecord(value)) throw new Error("A practice exercise must be an object");
  return {
    title: readString(value.title, LIMITS.theme, "Exercise title"),
    instructions: readString(value.instructions, LIMITS.instructions, "Exercise instructions"),
    estimatedMinutes: readPositiveInteger(value.estimatedMinutes, "Exercise duration", 240),
    successCriteria: readString(value.successCriteria, LIMITS.successCriteria, "Exercise success criteria"),
  };
}

function validatePriorityTheme(value: unknown, reportCount: number): StudyPlanPriorityTheme {
  if (!isRecord(value)) throw new Error("A priority theme must be an object");
  return {
    priority: readPositiveInteger(value.priority, "Theme priority", LIMITS.priorityThemes),
    theme: readString(value.theme, LIMITS.theme, "Priority theme"),
    whyItMatters: readString(value.whyItMatters, LIMITS.explanation, "Theme rationale"),
    supportingReportCount: readPositiveInteger(
      value.supportingReportCount,
      "Theme report count",
      reportCount
    ),
    practiceExercises: readArray(value.practiceExercises, "Practice exercises", LIMITS.exercises).map(
      validateExercise
    ),
    readinessChecks: readArray(value.readinessChecks, "Readiness checks", LIMITS.readinessChecks).map(
      (item) => readString(item, LIMITS.readinessCheck, "Readiness check")
    ),
  };
}

function validateResource(value: unknown): StudyPlanResource {
  if (!isRecord(value)) throw new Error("A resource must be an object");
  return {
    title: readString(value.title, LIMITS.theme, "Resource title"),
    description: readString(value.description, LIMITS.resourceDescription, "Resource description"),
    url: normalizeResourceUrl(value.url),
  };
}

/**
 * The JSON schema is an API-level guard, not the trust boundary. This function
 * re-validates and bounds every model field before it reaches the browser or DB.
 */
export function validateStudyPlanContent(raw: unknown, reportCount: number): StudyPlanContent {
  if (!isRecord(raw)) throw new Error("Study plan must be an object");
  if (!Number.isInteger(reportCount) || reportCount < 1) {
    throw new Error("Study plan requires at least one source report");
  }

  const priorityThemes = readArray(
    raw.priorityThemes,
    "Priority themes",
    LIMITS.priorityThemes
  ).map((item) => validatePriorityTheme(item, reportCount));

  const priorities = priorityThemes.map((theme) => theme.priority).sort((a, b) => a - b);
  if (!priorities.every((priority, index) => priority === index + 1)) {
    throw new Error("Theme priorities must be unique and sequential");
  }

  return {
    title: readString(raw.title, LIMITS.title, "Plan title"),
    summary: readString(raw.summary, LIMITS.summary, "Plan summary"),
    strengthsToLeverage: readArray(raw.strengthsToLeverage, "Strengths", LIMITS.strengths).map(
      (item) => validateStrength(item, reportCount)
    ),
    priorityThemes,
    resources: readArray(raw.resources, "Resources", LIMITS.resources).map(validateResource),
    nextPracticeFocus: readString(raw.nextPracticeFocus, LIMITS.nextPracticeFocus, "Next practice focus"),
  };
}

export const STUDY_PLAN_JSON_SCHEMA = {
  name: "student_study_plan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "summary",
      "strengthsToLeverage",
      "priorityThemes",
      "resources",
      "nextPracticeFocus",
    ],
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      strengthsToLeverage: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["theme", "explanation", "supportingReportCount"],
          properties: {
            theme: { type: "string" },
            explanation: { type: "string" },
            supportingReportCount: { type: "integer" },
          },
        },
      },
      priorityThemes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "priority",
            "theme",
            "whyItMatters",
            "supportingReportCount",
            "practiceExercises",
            "readinessChecks",
          ],
          properties: {
            priority: { type: "integer" },
            theme: { type: "string" },
            whyItMatters: { type: "string" },
            supportingReportCount: { type: "integer" },
            practiceExercises: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "instructions", "estimatedMinutes", "successCriteria"],
                properties: {
                  title: { type: "string" },
                  instructions: { type: "string" },
                  estimatedMinutes: { type: "integer" },
                  successCriteria: { type: "string" },
                },
              },
            },
            readinessChecks: { type: "array", items: { type: "string" } },
          },
        },
      },
      resources: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description", "url"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            url: { type: ["string", "null"] },
          },
        },
      },
      nextPracticeFocus: { type: "string" },
    },
  },
} as const;
