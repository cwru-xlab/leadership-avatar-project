import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/edge-config";
import {
  createOrUpdateCWRUUser,
  validateCWRUTicket,
} from "@/lib/auth";
import {
  AuthHandoffError,
  CAS_REDEEM_PATH,
  CAS_STATE_COOKIE,
  getCanonicalCallbackUrl,
  getPendingHandoff,
  isCanonicalRequest,
  issueHandoffCode,
  stateCookieOptions,
} from "@/lib/auth-handoff";

function callbackError(request: NextRequest, error: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
  response.cookies.set(CAS_STATE_COOKIE, "", { ...stateCookieOptions(), maxAge: 0 });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  try {
    if (!isCanonicalRequest(request.url)) {
      throw new AuthHandoffError("CAS callback did not reach the canonical origin");
    }

    const ticket = request.nextUrl.searchParams.get("ticket");
    const state = request.cookies.get(CAS_STATE_COOKIE)?.value;
    if (!ticket || !state) {
      return callbackError(request, "sso_session_expired");
    }

    // The state record holds the only trusted return destination. We intentionally
    // use the registered callback URL exactly as configured, never request headers.
    const pending = await getPendingHandoff(state);
    const validationResult = await validateCWRUTicket(
      ticket,
      getCanonicalCallbackUrl().toString()
    );

    if (!validationResult.success || !validationResult.userInfo) {
      console.error("CWRU SSO validation failed:", validationResult.error);
      return callbackError(request, "sso_sign_in_failed");
    }

    // This lookup decides privilege, not identity. Preserve the existing
    // availability behavior: a temporary Edge Config issue must not block SSO.
    let isAdmin = false;
    let adminStatusKnown = true;
    try {
      const adminUsersString = await get("adminUsersCaseIds");
      if (adminUsersString && typeof adminUsersString === "string") {
        const adminIds = adminUsersString.split(",").map((id) => id.trim());
        isAdmin = adminIds.includes(validationResult.userInfo.studentId);
      }
    } catch (adminLookupError) {
      adminStatusKnown = false;
      console.error(
        "CWRU SSO: admin list lookup failed, continuing without admin privileges:",
        adminLookupError
      );
    }

    const user = await createOrUpdateCWRUUser(
      validationResult.userInfo,
      isAdmin ? "admin" : "user",
      { adminStatusKnown }
    );
    const code = await issueHandoffCode(state, user.id);
    const redeemUrl = new URL(CAS_REDEEM_PATH, pending.targetOrigin);
    redeemUrl.searchParams.set("code", code);

    const response = NextResponse.redirect(redeemUrl);
    response.cookies.set(CAS_STATE_COOKIE, "", { ...stateCookieOptions(), maxAge: 0 });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    console.error(
      "CWRU SSO callback error:",
      error instanceof Error ? `${error.name}: ${error.message}` : error,
      error instanceof Error ? error.stack : undefined
    );
    return callbackError(request, "sso_error");
  }
}
