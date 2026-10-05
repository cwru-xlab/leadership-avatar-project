/**
 * Client-side call sequence for the networking bring-someone-in wizard branch.
 *
 * REQUIRED ORDER (load-bearing):
 *   1. recordAttestationTick  — creates a fresh unspent attestation
 *   2. distillWithAttestation — consumeAttestation spends the tick BEFORE distill
 *   3. saveBroughtInPersona   — requires an already-spent attestationId
 *
 * A client that reorders these gets a 403 from the server. That is the design
 * working, not a bug. The disabled "Use this person" button is only a courtesy;
 * consumeAttestation server-side is the real gate (16-05).
 *
 * Ephemeral contract: the student's hint, pasted text, and generated description
 * exist only in React state for the life of the step. This module never writes
 * them to browser storage APIs, URL params, or any other client-side persistent
 * store — and never logs their contents.
 */

export type GateReason =
  | "not-found"
  | "already-consumed"
  | "expired"
  | "stale-wording"
  | "unauthorized"
  | "network"
  | "unknown";

export type WizardClientError = {
  kind: "wizard-client-error";
  status: number;
  message: string;
  reason?: GateReason;
};

export type PersonaSource = "pasted" | "written" | "generated";

export type SavedPersonaListItem = {
  personaId: string;
  displayName: string;
  source: PersonaSource;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asError(
  status: number,
  message: string,
  reason?: GateReason,
): WizardClientError {
  return { kind: "wizard-client-error", status, message, reason };
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await response.json();

    return isRecord(data) ? data : {};
  } catch {
    return {};
  }
}

function mapGateReason(raw: unknown): GateReason {
  if (
    raw === "not-found" ||
    raw === "already-consumed" ||
    raw === "expired" ||
    raw === "stale-wording"
  ) {
    return raw;
  }

  return "unknown";
}

/**
 * POST /api/networking/persona/generate
 * Hint → editable fictional person description (not a persona sentence).
 */
export async function generateDescription(
  hint: string,
): Promise<{ description: string } | WizardClientError> {
  try {
    const response = await fetch("/api/networking/persona/generate", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hint }),
    });
    const data = await parseJson(response);

    if (response.status === 401) {
      return asError(401, "Unauthorized", "unauthorized");
    }
    if (!response.ok || typeof data.description !== "string") {
      return asError(
        response.status,
        typeof data.error === "string"
          ? data.error
          : "We could not generate a description. Please try again.",
      );
    }

    return { description: data.description };
  } catch {
    return asError(0, "Network error. Please try again.", "network");
  }
}

/**
 * GET /api/networking/attestation
 * Always display the server's wording — never hardcode a client fallback.
 */
export async function fetchAttestationWording(): Promise<
  { wording: string; wordingVersion: string } | WizardClientError
> {
  try {
    const response = await fetch("/api/networking/attestation", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await parseJson(response);

    if (response.status === 401) {
      return asError(401, "Unauthorized", "unauthorized");
    }
    if (
      !response.ok ||
      typeof data.wording !== "string" ||
      typeof data.wordingVersion !== "string"
    ) {
      return asError(
        response.status,
        typeof data.error === "string"
          ? data.error
          : "Unable to load the agreement.",
      );
    }

    return { wording: data.wording, wordingVersion: data.wordingVersion };
  } catch {
    return asError(0, "Network error. Please try again.", "network");
  }
}

/**
 * POST /api/networking/attestation
 * 409 maps to staleWording so the UI can re-fetch and re-display.
 */
export async function recordAttestationTick(
  wordingVersion: string,
): Promise<
  | { attestationId: string }
  | { staleWording: true; wordingVersion: string }
  | WizardClientError
> {
  try {
    const response = await fetch("/api/networking/attestation", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordingVersion }),
    });
    const data = await parseJson(response);

    if (response.status === 401) {
      return asError(401, "Unauthorized", "unauthorized");
    }

    if (response.status === 409) {
      return {
        staleWording: true,
        wordingVersion:
          typeof data.wordingVersion === "string"
            ? data.wordingVersion
            : wordingVersion,
      };
    }

    if (!response.ok || typeof data.attestationId !== "string") {
      return asError(
        response.status,
        typeof data.error === "string"
          ? data.error
          : "Unable to record the agreement.",
      );
    }

    return { attestationId: data.attestationId };
  } catch {
    return asError(0, "Network error. Please try again.", "network");
  }
}

/**
 * POST /api/networking/persona/distill
 * Maps 403 machine codes from 16-05 into GateReason for the UI.
 */
export async function distillWithAttestation(args: {
  profileText: string;
  attestationId: string;
}): Promise<
  | {
      ok: true;
      persona: string;
      displayName: string;
      attestationId: string;
    }
  | { ok: false; reason: GateReason; message: string }
  | WizardClientError
> {
  try {
    const response = await fetch("/api/networking/persona/distill", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileText: args.profileText,
        attestationId: args.attestationId,
      }),
    });
    const data = await parseJson(response);

    if (response.status === 401) {
      return asError(401, "Unauthorized", "unauthorized");
    }

    if (response.status === 403) {
      return {
        ok: false,
        reason: mapGateReason(data.reason),
        message:
          typeof data.error === "string"
            ? data.error
            : "Please confirm the agreement before continuing.",
      };
    }

    if (
      !response.ok ||
      typeof data.persona !== "string" ||
      typeof data.displayName !== "string"
    ) {
      return asError(
        response.status,
        typeof data.error === "string"
          ? data.error
          : "We could not process that description. Please try again.",
      );
    }

    return {
      ok: true,
      persona: data.persona,
      displayName: data.displayName,
      attestationId:
        typeof data.attestationId === "string"
          ? data.attestationId
          : args.attestationId,
    };
  } catch {
    return asError(0, "Network error. Please try again.", "network");
  }
}

/**
 * POST /api/networking/persona
 * Saves an already-distilled persona; attestationId must already be spent.
 */
export async function saveBroughtInPersona(args: {
  persona: string;
  displayName: string;
  source: PersonaSource;
  attestationId: string;
}): Promise<{ personaId: string } | WizardClientError> {
  try {
    const response = await fetch("/api/networking/persona", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        persona: args.persona,
        displayName: args.displayName,
        source: args.source,
        attestationId: args.attestationId,
      }),
    });
    const data = await parseJson(response);

    if (response.status === 401) {
      return asError(401, "Unauthorized", "unauthorized");
    }
    if (!response.ok || typeof data.personaId !== "string") {
      return asError(
        response.status,
        typeof data.error === "string"
          ? data.error
          : "Unable to save that person.",
      );
    }

    return { personaId: data.personaId };
  } catch {
    return asError(0, "Network error. Please try again.", "network");
  }
}

/**
 * GET /api/networking/persona
 * Owner-scoped list for one-click relaunch (no re-paste, no new attestation).
 */
export async function listSavedPersonas(): Promise<
  SavedPersonaListItem[] | WizardClientError
> {
  try {
    const response = await fetch("/api/networking/persona", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await parseJson(response);

    if (response.status === 401) {
      return asError(401, "Unauthorized", "unauthorized");
    }
    if (!response.ok || !Array.isArray(data.personas)) {
      return asError(
        response.status,
        typeof data.error === "string"
          ? data.error
          : "Unable to list personas.",
      );
    }

    const items: SavedPersonaListItem[] = [];

    for (const raw of data.personas) {
      if (!isRecord(raw)) continue;
      if (
        typeof raw.personaId !== "string" ||
        typeof raw.displayName !== "string" ||
        typeof raw.source !== "string" ||
        typeof raw.createdAt !== "string"
      ) {
        continue;
      }
      if (
        raw.source !== "pasted" &&
        raw.source !== "written" &&
        raw.source !== "generated"
      ) {
        continue;
      }
      items.push({
        personaId: raw.personaId,
        displayName: raw.displayName,
        source: raw.source,
        createdAt: raw.createdAt,
      });
    }

    return items;
  } catch {
    return asError(0, "Network error. Please try again.", "network");
  }
}

export function isWizardClientError(
  value: unknown,
): value is WizardClientError {
  return (
    isRecord(value) &&
    value.kind === "wizard-client-error" &&
    typeof value.status === "number" &&
    typeof value.message === "string"
  );
}
