/**
 * Typed client for the VOICE_DRILL API (Phase 23). The drill runner that
 * mounts on the shared session shell uses ONLY these calls; the shapes are
 * the server's own DTOs (lib/study-plan/drill/types.ts), imported as types.
 * Contract: .planning/phases/23-learning-paths-hub/23-VOICE-DRILL-CONTRACT.md
 */
import type {
  CompleteDrillAttemptBody,
  VoiceDrillAttemptDTO,
  VoiceDrillDTO,
} from "@/lib/study-plan/drill/types";

export type DrillApiError = { status: number; error: string; code?: string };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw {
      status: res.status,
      error: typeof data.error === "string" ? data.error : "Request failed",
      code: typeof data.code === "string" ? data.code : undefined,
    } satisfies DrillApiError;
  }
  return data as T;
}

const base = (stepId: string) => `/api/study-plans/path-steps/${encodeURIComponent(stepId)}/drill`;

export async function fetchDrill(stepId: string): Promise<VoiceDrillDTO> {
  return (await call<{ drill: VoiceDrillDTO }>(base(stepId))).drill;
}

export async function startDrillAttempt(stepId: string, cameraMode: "ON" | "OFF"): Promise<VoiceDrillAttemptDTO> {
  return (
    await call<{ attempt: VoiceDrillAttemptDTO }>(`${base(stepId)}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cameraMode }),
    })
  ).attempt;
}

export async function completeDrillAttempt(
  stepId: string,
  attemptId: string,
  body: CompleteDrillAttemptBody,
): Promise<VoiceDrillAttemptDTO> {
  return (
    await call<{ attempt: VoiceDrillAttemptDTO }>(
      `${base(stepId)}/attempts/${encodeURIComponent(attemptId)}/complete`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    )
  ).attempt;
}
