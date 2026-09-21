import { randomUUID } from "crypto";

import type { CaseAvatar } from "@/types";

/**
 * REQ-26 minimum-bar validation for a student-authored scenario.
 *
 * This is the SINGLE definition of "cannot save without a situation, at
 * least one character, and criteria." It is imported by the `/api/scenario/*`
 * server routes (so the bar is enforced even if a client is bypassed
 * entirely) and re-used by the builder UI (plan 09-05) so the client and
 * server can never disagree about what counts as a complete scenario.
 */

export interface ScenarioInput {
  name: string;
  backgroundInfo: string;
  evaluationPrompt: string;
  avatars: CaseAvatar[];
  coverImage?: string;
}

export interface ScenarioFieldError {
  field: string;
  message: string;
}

export type ScenarioValidationResult =
  | { ok: true; value: ScenarioInput }
  | { ok: false; errors: ScenarioFieldError[] };

/**
 * Numeric bounds backing the rules below, exported so the builder UI can
 * render the same numbers (character counters, inline hints) instead of
 * hardcoding a second copy that could drift out of sync with the server.
 */
export const SCENARIO_LIMITS = {
  NAME_MIN: 3,
  NAME_MAX: 120,
  // The "situation." Long enough that a one-word placeholder cannot pass,
  // short enough that a real short scenario still clears the bar.
  BACKGROUND_MIN: 80,
  BACKGROUND_MAX: 20000,
  // The "criteria" — the author's rubric layered on top of the standard
  // behind-the-scenes EQ/conversational-adequacy prompt.
  EVALUATION_MIN: 40,
  EVALUATION_MAX: 8000,
} as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateAvatar(
  raw: unknown,
  index: number,
  errors: ScenarioFieldError[]
): CaseAvatar | null {
  if (typeof raw !== "object" || raw === null) {
    errors.push({
      field: `avatars[${index}]`,
      message: "Each character must be an object.",
    });
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const role = typeof candidate.role === "string" ? candidate.role.trim() : "";
  const profileId =
    typeof candidate.profileId === "string" ? candidate.profileId.trim() : "";
  const additionalInfo =
    typeof candidate.additionalInfo === "string"
      ? candidate.additionalInfo.trim()
      : "";

  let hasError = false;

  if (!name) {
    errors.push({
      field: `avatars[${index}].name`,
      message: "Every character needs a name.",
    });
    hasError = true;
  }

  if (!role) {
    errors.push({
      field: `avatars[${index}].role`,
      message: "Every character needs a role.",
    });
    hasError = true;
  }

  if (!profileId) {
    errors.push({
      field: `avatars[${index}].profileId`,
      message: "Every character must have a chosen avatar.",
    });
    hasError = true;
  }

  if (hasError) return null;

  const id =
    typeof candidate.id === "string" && candidate.id.trim()
      ? candidate.id.trim()
      : randomUUID();

  return {
    id,
    name,
    role,
    additionalInfo,
    profileId,
  };
}

/**
 * Validates and normalizes an unknown request body into a `ScenarioInput`.
 *
 * Returns ALL failing fields at once — never a single generic message — so
 * the builder UI can point at every incomplete field in one pass. Every
 * string in the returned `value` is trimmed. Any property not part of
 * `ScenarioInput` is stripped from the output (most importantly `id`,
 * `ownerId`, `published`, `createdBy`, `cohortIds`): the routes derive those
 * themselves, and a client must never be able to smuggle them in.
 */
export function validateScenarioInput(input: unknown): ScenarioValidationResult {
  const errors: ScenarioFieldError[] = [];

  if (typeof input !== "object" || input === null) {
    return {
      ok: false,
      errors: [{ field: "root", message: "Request body must be an object." }],
    };
  }

  const body = input as Record<string, unknown>;

  const name = isNonEmptyString(body.name) ? body.name.trim() : "";
  if (!name) {
    errors.push({ field: "name", message: "Give the scenario a name." });
  } else if (name.length < SCENARIO_LIMITS.NAME_MIN) {
    errors.push({
      field: "name",
      message: `Name must be at least ${SCENARIO_LIMITS.NAME_MIN} characters.`,
    });
  } else if (name.length > SCENARIO_LIMITS.NAME_MAX) {
    errors.push({
      field: "name",
      message: `Name must be ${SCENARIO_LIMITS.NAME_MAX} characters or fewer.`,
    });
  }

  const backgroundInfo = isNonEmptyString(body.backgroundInfo)
    ? body.backgroundInfo.trim()
    : "";
  if (!backgroundInfo) {
    errors.push({
      field: "backgroundInfo",
      message: "Describe the situation before saving.",
    });
  } else if (backgroundInfo.length < SCENARIO_LIMITS.BACKGROUND_MIN) {
    errors.push({
      field: "backgroundInfo",
      message: `Situation must be at least ${SCENARIO_LIMITS.BACKGROUND_MIN} characters.`,
    });
  } else if (backgroundInfo.length > SCENARIO_LIMITS.BACKGROUND_MAX) {
    errors.push({
      field: "backgroundInfo",
      message: `Situation must be ${SCENARIO_LIMITS.BACKGROUND_MAX} characters or fewer.`,
    });
  }

  const evaluationPrompt = isNonEmptyString(body.evaluationPrompt)
    ? body.evaluationPrompt.trim()
    : "";
  if (!evaluationPrompt) {
    errors.push({
      field: "evaluationPrompt",
      message: "Add at least one criterion before saving.",
    });
  } else if (evaluationPrompt.length < SCENARIO_LIMITS.EVALUATION_MIN) {
    errors.push({
      field: "evaluationPrompt",
      message: `Criteria must be at least ${SCENARIO_LIMITS.EVALUATION_MIN} characters.`,
    });
  } else if (evaluationPrompt.length > SCENARIO_LIMITS.EVALUATION_MAX) {
    errors.push({
      field: "evaluationPrompt",
      message: `Criteria must be ${SCENARIO_LIMITS.EVALUATION_MAX} characters or fewer.`,
    });
  }

  let avatars: CaseAvatar[] = [];
  if (!Array.isArray(body.avatars) || body.avatars.length === 0) {
    errors.push({
      field: "avatars",
      message: "Add at least one character before saving.",
    });
  } else {
    const validated: CaseAvatar[] = [];
    body.avatars.forEach((raw, index) => {
      const avatar = validateAvatar(raw, index, errors);
      if (avatar) validated.push(avatar);
    });
    avatars = validated;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const coverImage =
    typeof body.coverImage === "string" && body.coverImage.trim()
      ? body.coverImage.trim()
      : undefined;

  return {
    ok: true,
    value: {
      name,
      backgroundInfo,
      evaluationPrompt,
      avatars,
      ...(coverImage ? { coverImage } : {}),
    },
  };
}
