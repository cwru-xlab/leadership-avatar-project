import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { loadDeckSlideImage } from "@/lib/deck/store";

export const runtime = "nodejs";

/**
 * This is the first route in this codebase that serves a PRIVATE binary
 * object back to its authenticated owner. Resume PDFs are stored privately
 * but only their extracted text ever leaves the server; avatar/profile/case-
 * cover images are public-read. If you are adding a second such route,
 * follow this one's ownership-check shape.
 *
 * Ownership comes from the session cookie — never from the request body or
 * a client-supplied user id. Missing deck / wrong owner / bad index → 404.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deckId: string; index: string }> },
) {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const currentUser = await getCurrentUser(token || "");

    if (!currentUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        {
          status: 401,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    const { deckId, index: indexParam } = await params;
    const index = Number.parseInt(indexParam, 10);

    // Non-numeric or negative → 404 (not 400) so we do not leak whether the
    // deck exists.
    if (!Number.isInteger(index) || index < 0 || String(index) !== indexParam) {
      return NextResponse.json(
        { error: "Not found" },
        {
          status: 404,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    const v = request.nextUrl.searchParams.get("v");
    // Unknown variant values fall through to full slide rather than erroring.
    const variant: "slide" | "thumb" = v === "thumb" ? "thumb" : "slide";

    const image = await loadDeckSlideImage(
      currentUser.id,
      deckId,
      index,
      variant,
    );

    if (!image) {
      return NextResponse.json(
        { error: "Not found" },
        {
          status: 404,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    // `private` is required — a shared CDN cache must never hold another
    // student's slide image.
    return new NextResponse(new Uint8Array(image.body), {
      status: 200,
      headers: {
        "Content-Type": image.contentType || "image/png",
        "Content-Length": String(image.body.length),
        "Cache-Control": "private, max-age=3600, immutable",
      },
    });
  } catch (error) {
    console.error("Practice deck slide fetch failed:", error);

    return NextResponse.json(
      { error: "Unable to load the slide." },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
