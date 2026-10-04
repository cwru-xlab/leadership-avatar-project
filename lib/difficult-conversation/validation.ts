/**
 * Single validator for difficult-conversation authored input.
 *
 * Imported by `/api/difficult-conversation/*` server routes and by the
 * builder UI so client and server can never disagree about field limits.
 * Pure — no S3, no session — safe to import from a client component.
 */

import {
  DC_LIMITS,
  DIFFICULTY_BANDS,
  type DifficultyBand,
} from "@/lib/difficult-conversation/types";

export interface DifficultConversationFieldError {
  field: string;
  message: string;
}

/** Keys a client may submit. Everything else is rejected as unknown. */
const ALLOWED_KEYS = new Set([
  "title",
  "avatarRole",
  "studentRole",
  "situation",
  "sharedBackstory",
  "hiddenPosition",
  "studentObjective",
  "stakes",
  "difficulty",
  "avatarId",
  "voiceId",
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function checkLength(
  field: string,
  value: string,
  min: number,
  max: number,
  missingMessage: string,
  shortFix: string,
  longFix: string,
  errors: DifficultConversationFieldError[]
): void {
  if (!value) {
    errors.push({ field, message: missingMessage });
    return;
  }
  if (value.length < min) {
    errors.push({
      field,
      message: `${fieldLabel(field)} is too short (${value.length} characters). ${shortFix}`,
    });
    return;
  }
  if (value.length > max) {
    errors.push({
      field,
      message: `${fieldLabel(field)} is too long (${value.length} characters). ${longFix}`,
    });
  }
}

function fieldLabel(field: string): string {
  switch (field) {
    case "title":
      return "Title";
    case "avatarRole":
      return "Avatar role";
    case "studentRole":
      return "Student role";
    case "situation":
      return "Situation";
    case "sharedBackstory":
      return "Shared backstory";
    case "hiddenPosition":
      return "Hidden position";
    case "studentObjective":
      return "Student objective";
    case "stakes":
      return "Stakes";
    default:
      return field;
  }
}

/**
 * Validates an unknown request body for difficult-conversation authorship.
 *
 * Returns ALL failing fields at once — never short-circuits on the first —
 * so the builder UI can point at every incomplete field in one pass. Returns
 * `[]` when valid. Does not normalize or return a value; callers re-read
 * trimmed fields after a clean validation.
 */
export function validateDifficultConversationInput(
  input: unknown
): DifficultConversationFieldError[] {
  const errors: DifficultConversationFieldError[] = [];

  if (typeof input !== "object" || input === null) {
    return [
      {
        field: "root",
        message:
          "Request body must be an object. Send the conversation fields as JSON.",
      },
    ];
  }

  const body = input as Record<string, unknown>;

  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) {
      errors.push({
        field: key,
        message: `Unknown field "${key}". Remove it — only the authored conversation fields are accepted.`,
      });
    }
  }

  const title = isNonEmptyString(body.title) ? body.title.trim() : "";
  checkLength(
    "title",
    title,
    DC_LIMITS.TITLE_MIN,
    DC_LIMITS.TITLE_MAX,
    "Give the conversation a title (at least 4 characters).",
    `Give it a short descriptive name of at least ${DC_LIMITS.TITLE_MIN} characters (up to ${DC_LIMITS.TITLE_MAX}).`,
    `Shorten the title to ${DC_LIMITS.TITLE_MAX} characters or fewer.`,
    errors
  );

  const avatarRole = isNonEmptyString(body.avatarRole)
    ? body.avatarRole.trim()
    : "";
  checkLength(
    "avatarRole",
    avatarRole,
    DC_LIMITS.AVATAR_ROLE_MIN,
    DC_LIMITS.AVATAR_ROLE_MAX,
    "Add the avatar's role (who they are in this conversation).",
    `Add a role label of at least ${DC_LIMITS.AVATAR_ROLE_MIN} characters (up to ${DC_LIMITS.AVATAR_ROLE_MAX}).`,
    `Shorten the avatar role to ${DC_LIMITS.AVATAR_ROLE_MAX} characters or fewer.`,
    errors
  );

  const studentRole = isNonEmptyString(body.studentRole)
    ? body.studentRole.trim()
    : "";
  checkLength(
    "studentRole",
    studentRole,
    DC_LIMITS.STUDENT_ROLE_MIN,
    DC_LIMITS.STUDENT_ROLE_MAX,
    "Add the student's role (who the learner is playing).",
    `Add a role label of at least ${DC_LIMITS.STUDENT_ROLE_MIN} characters (up to ${DC_LIMITS.STUDENT_ROLE_MAX}).`,
    `Shorten the student role to ${DC_LIMITS.STUDENT_ROLE_MAX} characters or fewer.`,
    errors
  );

  const situation = isNonEmptyString(body.situation)
    ? body.situation.trim()
    : "";
  checkLength(
    "situation",
    situation,
    DC_LIMITS.SITUATION_MIN,
    DC_LIMITS.SITUATION_MAX,
    "Describe the situation before saving. Give enough context for both sides to act.",
    `Give a concrete setup of at least ${DC_LIMITS.SITUATION_MIN} characters — who, what conflict, and why it matters (up to ${DC_LIMITS.SITUATION_MAX}).`,
    `Shorten the situation to ${DC_LIMITS.SITUATION_MAX} characters or fewer.`,
    errors
  );

  const sharedBackstory = isNonEmptyString(body.sharedBackstory)
    ? body.sharedBackstory.trim()
    : "";
  checkLength(
    "sharedBackstory",
    sharedBackstory,
    DC_LIMITS.SHARED_BACKSTORY_MIN,
    DC_LIMITS.SHARED_BACKSTORY_MAX,
    "Add the shared backstory — facts both sides already know.",
    `Give both sides at least a couple of concrete facts — performance history, prior conversations, dates — up to ${DC_LIMITS.SHARED_BACKSTORY_MAX} characters.`,
    `Shorten the shared backstory to ${DC_LIMITS.SHARED_BACKSTORY_MAX} characters or fewer.`,
    errors
  );

  const hiddenPosition = isNonEmptyString(body.hiddenPosition)
    ? body.hiddenPosition.trim()
    : "";
  checkLength(
    "hiddenPosition",
    hiddenPosition,
    DC_LIMITS.HIDDEN_POSITION_MIN,
    DC_LIMITS.HIDDEN_POSITION_MAX,
    "Add the avatar's hidden position — what they privately believe and will not volunteer.",
    `Give the character's private stance, excuse, or bottom line in at least ${DC_LIMITS.HIDDEN_POSITION_MIN} characters (up to ${DC_LIMITS.HIDDEN_POSITION_MAX}).`,
    `Shorten the hidden position to ${DC_LIMITS.HIDDEN_POSITION_MAX} characters or fewer.`,
    errors
  );

  const studentObjective = isNonEmptyString(body.studentObjective)
    ? body.studentObjective.trim()
    : "";
  checkLength(
    "studentObjective",
    studentObjective,
    DC_LIMITS.STUDENT_OBJECTIVE_MIN,
    DC_LIMITS.STUDENT_OBJECTIVE_MAX,
    "Add the student's objective — the explicit goal they are pursuing.",
    `Give a clear goal of at least ${DC_LIMITS.STUDENT_OBJECTIVE_MIN} characters (up to ${DC_LIMITS.STUDENT_OBJECTIVE_MAX}), e.g. get a written commitment.`,
    `Shorten the student objective to ${DC_LIMITS.STUDENT_OBJECTIVE_MAX} characters or fewer.`,
    errors
  );

  const stakes = isNonEmptyString(body.stakes) ? body.stakes.trim() : "";
  checkLength(
    "stakes",
    stakes,
    DC_LIMITS.STAKES_MIN,
    DC_LIMITS.STAKES_MAX,
    "Add the stakes — what happens if the conversation goes badly.",
    `Give concrete consequences of at least ${DC_LIMITS.STAKES_MIN} characters (up to ${DC_LIMITS.STAKES_MAX}), e.g. escalation to HR.`,
    `Shorten the stakes to ${DC_LIMITS.STAKES_MAX} characters or fewer.`,
    errors
  );

  const difficultyRaw = body.difficulty;
  if (typeof difficultyRaw !== "string" || !difficultyRaw.trim()) {
    errors.push({
      field: "difficulty",
      message: `Choose a difficulty band: ${DIFFICULTY_BANDS.join(", ")}.`,
    });
  } else if (
    !DIFFICULTY_BANDS.includes(difficultyRaw.trim() as DifficultyBand)
  ) {
    errors.push({
      field: "difficulty",
      message: `Difficulty "${difficultyRaw}" is not valid. Choose one of: ${DIFFICULTY_BANDS.join(", ")}.`,
    });
  }

  const avatarId =
    typeof body.avatarId === "string" ? body.avatarId.trim() : "";
  const voiceId = typeof body.voiceId === "string" ? body.voiceId.trim() : "";
  const hasAvatar = avatarId.length > 0;
  const hasVoice = voiceId.length > 0;

  if (hasAvatar !== hasVoice) {
    if (hasAvatar && !hasVoice) {
      errors.push({
        field: "voiceId",
        message:
          "Avatar and voice must be set together. Add the avatar's own default voiceId, or remove avatarId.",
      });
    } else {
      errors.push({
        field: "avatarId",
        message:
          "Avatar and voice must be set together. Add an avatarId paired with this voice, or remove voiceId.",
      });
    }
  }

  return errors;
}
