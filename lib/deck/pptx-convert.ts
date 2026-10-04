/**
 * PPTX → PDF conversion driver for Phase 14 Practice Pitches.
 *
 * Selected backend: `gotenberg` (human decision 2026-10-04).
 * Contract: `.planning/phases/14-practice-pitches/14-DECK-RENDER-DECISION.md`
 *
 * Fallback order (do not re-litigate — move down only if gotenberg is refused):
 *   1. gotenberg
 *   2. vercel-libreoffice
 *   3. cloudconvert (requires explicit human data-sharing acceptance)
 *
 * Env: DECK_CONVERT_BACKEND, DECK_CONVERT_URL, DECK_CONVERT_TOKEN
 */

/** Disqualifier threshold from 14-01 — conversion of a typical deck must finish within this. */
export const DECK_CONVERT_TIMEOUT_MS = 45_000;

export type ConvertPptxSuccess = { ok: true; pdf: Buffer };

export type ConvertPptxFailure = {
  ok: false;
  code: "backend-unconfigured" | "backend-error" | "backend-timeout";
  detail: string;
};

export type ConvertPptxResult = ConvertPptxSuccess | ConvertPptxFailure;

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function isPdfBytes(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 5).toString("utf8") === "%PDF-";
}

function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const name = error.name;
  const msg = error.message.toLowerCase();
  if (name === "TypeError" && /fetch|network|econn|enotfound|econnrefused/i.test(msg)) {
    return true;
  }
  if (/econnrefused|enotfound|econnreset|etimedout|network|fetch failed/i.test(msg)) {
    return true;
  }
  return false;
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || /aborted|abort/i.test(error.message);
}

/**
 * Convert a PPTX buffer to PDF via the selected DECK_CONVERT_BACKEND.
 * Never throws — returns a typed failure instead.
 */
export async function convertPptxToPdf(buffer: Buffer): Promise<ConvertPptxResult> {
  const backend = process.env.DECK_CONVERT_BACKEND?.trim();
  const url = process.env.DECK_CONVERT_URL?.trim();

  if (!backend || !url) {
    return {
      ok: false,
      code: "backend-unconfigured",
      detail:
        "DECK_CONVERT_BACKEND and/or DECK_CONVERT_URL are unset. Provision the Gotenberg host and set env vars (see 14-DECK-RENDER-DECISION.md).",
    };
  }

  try {
    switch (backend) {
      case "gotenberg":
        return await convertViaGotenberg(buffer, url);
      case "vercel-libreoffice":
        throw new Error(
          'DECK_CONVERT_BACKEND=vercel-libreoffice is not implemented — see 14-DECK-RENDER-DECISION.md fallback order'
        );
      case "cloudconvert":
        throw new Error(
          'DECK_CONVERT_BACKEND=cloudconvert is not implemented — see 14-DECK-RENDER-DECISION.md fallback order'
        );
      default:
        return {
          ok: false,
          code: "backend-unconfigured",
          detail: `Unknown DECK_CONVERT_BACKEND="${backend}". Expected gotenberg (selected) or a documented fallback.`,
        };
    }
  } catch (error) {
    if (isAbortError(error)) {
      return {
        ok: false,
        code: "backend-timeout",
        detail: `Conversion timed out after ${DECK_CONVERT_TIMEOUT_MS}ms`,
      };
    }
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, code: "backend-error", detail };
  }
}

async function convertViaGotenberg(
  buffer: Buffer,
  baseUrl: string
): Promise<ConvertPptxResult> {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/forms/libreoffice/convert`;
  const token = process.env.DECK_CONVERT_TOKEN?.trim();

  const attempt = async (): Promise<ConvertPptxResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DECK_CONVERT_TIMEOUT_MS);

    try {
      const form = new FormData();
      form.append(
        "files",
        new Blob([new Uint8Array(buffer)], { type: PPTX_MIME }),
        "deck.pptx"
      );

      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: form,
        signal: controller.signal,
      });

      const body = Buffer.from(await res.arrayBuffer());

      if (res.status !== 200) {
        return {
          ok: false,
          code: "backend-error",
          detail: `Gotenberg HTTP ${res.status}: ${body.toString("utf8").slice(0, 400)}`,
        };
      }

      if (!isPdfBytes(body)) {
        return {
          ok: false,
          code: "backend-error",
          detail: `Gotenberg response is not a PDF (header=${body.subarray(0, 8).toString("utf8")})`,
        };
      }

      return { ok: true, pdf: body };
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attempt();
  } catch (error) {
    if (isAbortError(error)) {
      return {
        ok: false,
        code: "backend-timeout",
        detail: `Conversion timed out after ${DECK_CONVERT_TIMEOUT_MS}ms`,
      };
    }
    // One retry on network-level failure only (not 4xx — those are returned above).
    if (isNetworkFailure(error)) {
      try {
        return await attempt();
      } catch (retryError) {
        if (isAbortError(retryError)) {
          return {
            ok: false,
            code: "backend-timeout",
            detail: `Conversion timed out after ${DECK_CONVERT_TIMEOUT_MS}ms`,
          };
        }
        const detail =
          retryError instanceof Error ? retryError.message : String(retryError);
        return { ok: false, code: "backend-error", detail };
      }
    }
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, code: "backend-error", detail };
  }
}
