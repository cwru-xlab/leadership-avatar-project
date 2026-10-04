import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { validateAndExtractDeck } from "@/lib/deck/intake";
import { convertPptxToPdf } from "@/lib/deck/pptx-convert";
import { rasterizePdf } from "@/lib/deck/pdf-rasterize";
import { persistDeck } from "@/lib/deck/store";
import { DECK_REJECTIONS, MAX_DECK_SIZE_BYTES } from "@/lib/deck/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Student-facing copy for PPTX conversion failures.
 *
 * These are 502s (not 400s): the student's file was fine, the conversion
 * service was not. Greppable here so the wizard error UI (plan 14-12) can
 * assert against the exact strings.
 */
export const PPTX_CONVERT_FAILURES = {
  "backend-unconfigured": {
    reason: "PowerPoint decks can't be processed right now.",
    fix: "Export your deck as a PDF and upload that instead — PDF decks work.",
  },
  "backend-timeout": {
    reason: "That deck took too long to process.",
    fix: "Try again, or export it as a PDF and upload that instead.",
  },
  "backend-error": {
    reason: "That .pptx couldn't be converted.",
    fix: "Re-save it as .pptx from PowerPoint or Keynote, or export it as a PDF, then try again.",
  },
} as const;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Upload a practice pitch deck (PDF or PPTX).
 *
 * The original file, per-slide PNGs, thumbnails, and manifest are private in
 * S3. Only an opaque deck ID and derived metadata return to the browser —
 * never a bucket hostname or signed URL. Later deck/manifest/slide routes
 * derive the S3 key server-side from the authenticated user and that ID.
 *
 * Rasterization is synchronous in this request (no deferred background work).
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return response({ error: "Unauthorized" }, 401);
    }

    // Reject oversized payloads before buffering multipart into memory.
    // Content-Length includes multipart overhead — allow 1MB slack over the
    // deck cap so a max-size file with boundaries still reaches intake.
    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);

      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_DECK_SIZE_BYTES + 1024 * 1024
      ) {
        const tooLarge = DECK_REJECTIONS["too-large"];

        return response(
          {
            error: tooLarge.reason,
            fix: tooLarge.fix,
            code: "too-large",
          },
          400,
        );
      }
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      const empty = DECK_REJECTIONS.empty;

      return response(
        { error: empty.reason, fix: empty.fix, code: "empty" },
        400,
      );
    }

    if (typeof file.size === "number" && file.size > MAX_DECK_SIZE_BYTES) {
      const tooLarge = DECK_REJECTIONS["too-large"];

      return response(
        {
          error: tooLarge.reason,
          fix: tooLarge.fix,
          code: "too-large",
        },
        400,
      );
    }

    // Deliberate divergence from upload-resume: do NOT gate on file.type.
    // A .pptx arrives with several different browser-reported MIME types, and
    // lib/deck/intake.ts already treats client MIME as forgeable — format is
    // decided by magic bytes alone.
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await validateAndExtractDeck(buffer, file.name);

    if (!result.ok) {
      return response(
        { error: result.reason, fix: result.fix, code: result.code },
        400,
      );
    }

    const { format } = result;
    let pdfBuffer: Buffer;

    if (format === "pptx") {
      const converted = await convertPptxToPdf(buffer);

      if (!converted.ok) {
        const copy = PPTX_CONVERT_FAILURES[converted.code];

        console.error("Deck PPTX conversion failed:", {
          userId: currentUser.id,
          code: converted.code,
          detail: converted.detail,
        });

        return response(
          { error: copy.reason, fix: copy.fix, code: converted.code },
          502,
        );
      }
      pdfBuffer = converted.pdf;
    } else {
      pdfBuffer = buffer;
    }

    const rasterized = await rasterizePdf(pdfBuffer);
    const { deckId, manifest } = await persistDeck({
      userId: currentUser.id,
      extraction: result,
      rasterized,
      originalBuffer: buffer,
      originalFormat: format,
    });

    console.info("Practice deck uploaded", {
      userId: currentUser.id,
      deckId,
      format,
      slideCount: manifest.slideCount,
      sizeBytes: buffer.length,
    });

    return response(
      {
        deckId,
        format,
        slideCount: manifest.slideCount,
        slides: manifest.slides.map((s) => ({
          index: s.index,
          widthPx: s.widthPx,
          heightPx: s.heightPx,
          textLength: s.text.length,
        })),
      },
      201,
    );
  } catch (error) {
    console.error("Practice deck upload failed:", error);

    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    if (
      message.includes("body exceeded") ||
      message.includes("request entity too large") ||
      message.includes("payload too large") ||
      message.includes("file size") ||
      message.includes("max_deck") ||
      message.includes("failed to parse body as formdata") ||
      message.includes("formdata")
    ) {
      const tooLarge = DECK_REJECTIONS["too-large"];

      return response(
        {
          error: tooLarge.reason,
          fix: tooLarge.fix,
          code: "too-large",
        },
        400,
      );
    }

    return response(
      {
        error: "We couldn't process that deck.",
        fix: "Try again in a moment, or export it as a PDF and upload that instead.",
        code: "upload-failed",
      },
      500,
    );
  }
}
