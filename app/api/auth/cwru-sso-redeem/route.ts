import { NextRequest, NextResponse } from "next/server";
import { createToken, getUserById } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import {
  CAS_PREVIEW_NONCE_COOKIE,
  consumeHandoffCode,
  previewNonceCookieOptions,
} from "@/lib/auth-handoff";

function redeemError(request: NextRequest, error: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    if (!code) {
      return redeemError(request, "sso_handoff_invalid");
    }

    const browserNonce = request.cookies.get(CAS_PREVIEW_NONCE_COOKIE)?.value;
    const { userId, targetPath } = await consumeHandoffCode(
      code,
      request.url,
      browserNonce
    );
    const user = await getUserById(userId);
    if (!user || !user.id) {
      throw new Error("Handoff user no longer exists");
    }

    const token = await createToken(user);
    const response = NextResponse.redirect(new URL(targetPath, request.url));
    response.cookies.set(siteConfig.auth.cookie.name, token, {
      ...siteConfig.auth.cookie,
      maxAge: siteConfig.auth.cookieMaxAge,
    });
    response.cookies.set(CAS_PREVIEW_NONCE_COOKIE, "", {
      ...previewNonceCookieOptions(),
      maxAge: 0,
    });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    console.error(
      "CWRU SSO redeem error:",
      error instanceof Error ? `${error.name}: ${error.message}` : error
    );
    return redeemError(request, "sso_handoff_invalid");
  }
}
