import type { TechnicalAssignmentPrivate } from "./types";

export const MAX_TECHNICAL_SOURCE_BYTES = 50_000;
export const MAX_REQUESTED_PUBLIC_TESTS = 12;

export type TechnicalExecutionErrorCategory =
  | "syntax_error"
  | "runtime_error"
  | "timeout"
  | "resource_limit"
  | "unavailable";

export interface TechnicalExecutionRequest {
  source: string;
  requestedTestIds: string[];
  idempotencyKey: string;
}

export interface TechnicalExecutionLimits {
  timeoutMs: number;
  memoryMb: number;
  maxOutputBytes: number;
}

/**
 * A server-built harness. Candidate source is written as a separate file by
 * the sandbox adapter; it must never be interpolated into this program.
 */
export interface ServerOnlyHarness {
  assignmentId: string;
  assignmentVersion: string;
  publicTests: ReadonlyArray<{ id: string; input: unknown; expected: unknown }>;
}

export interface TechnicalExecutionResult {
  status: "completed" | "failed";
  errorCategory?: TechnicalExecutionErrorCategory;
  durationMs?: number;
  output?: string;
  publicResults?: Array<{ id: string; passed: boolean; message?: string }>;
}

export type TechnicalExecutionRequestValidation =
  | { ok: true; value: TechnicalExecutionRequest }
  | { ok: false; error: string };

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{15,127}$/;

export function validateTechnicalExecutionRequest(
  body: unknown,
): TechnicalExecutionRequestValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid request body" };
  }

  const { source, requestedTestIds, idempotencyKey } = body as Record<string, unknown>;
  if (typeof source !== "string" || !source.trim()) {
    return { ok: false, error: "Python source is required" };
  }
  if (Buffer.byteLength(source, "utf8") > MAX_TECHNICAL_SOURCE_BYTES) {
    return { ok: false, error: "Python source exceeds the allowed size" };
  }
  if (
    !Array.isArray(requestedTestIds) ||
    requestedTestIds.length === 0 ||
    requestedTestIds.length > MAX_REQUESTED_PUBLIC_TESTS ||
    requestedTestIds.some((id) => typeof id !== "string" || !id)
  ) {
    return { ok: false, error: "Choose one or more visible tests" };
  }
  if (new Set(requestedTestIds).size !== requestedTestIds.length) {
    return { ok: false, error: "Visible tests must not be repeated" };
  }
  if (typeof idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
    return { ok: false, error: "Invalid execution request identifier" };
  }

  return { ok: true, value: { source, requestedTestIds, idempotencyKey } };
}

/** Rebuild only requested public fixtures from the authoritative catalog. */
export function buildPublicHarness(
  assignment: TechnicalAssignmentPrivate,
  requestedTestIds: readonly string[],
): ServerOnlyHarness | null {
  const byId = new Map(assignment.publicTestCases.map((test) => [test.id, test]));
  const publicTests = requestedTestIds.map((id) => byId.get(id));
  if (publicTests.some((test) => !test)) return null;

  return {
    assignmentId: assignment.id,
    assignmentVersion: assignment.version,
    publicTests: publicTests.map((test) => ({
      id: test!.id,
      input: test!.input,
      expected: test!.expected,
    })),
  };
}

/** Only normalized public evidence may leave the execution boundary. */
export function toPublicExecutionResult(
  result: TechnicalExecutionResult,
): TechnicalExecutionResult {
  return {
    status: result.status,
    ...(result.errorCategory ? { errorCategory: result.errorCategory } : {}),
    ...(typeof result.durationMs === "number" ? { durationMs: result.durationMs } : {}),
    ...(result.output ? { output: result.output.slice(0, 4_000) } : {}),
    ...(result.publicResults
      ? {
          publicResults: result.publicResults.map(({ id, passed, message }) => ({
            id,
            passed,
            ...(message ? { message: message.slice(0, 500) } : {}),
          })),
        }
      : {}),
  };
}
