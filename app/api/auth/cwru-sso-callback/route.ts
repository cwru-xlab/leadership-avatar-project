import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/edge-config";
import {
  validateCWRUTicket,
  createOrUpdateCWRUUser,
  createToken,
} from "@/lib/auth";
import { siteConfig } from "@/config/site";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticket = searchParams.get("ticket");
    const serviceUrl = request.url.split("?")[0]; // Remove query params to get service URL

    if (!ticket) {
      return NextResponse.redirect(
        new URL("/login?error=missing_ticket", request.url)
      );
    }

    // Validate the CAS ticket with CWRU
    const validationResult = await validateCWRUTicket(ticket, serviceUrl);

    if (!validationResult.success || !validationResult.userInfo) {
      console.error("CWRU SSO validation failed:", validationResult.error);
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent(validationResult.error || "SSO validation failed")}`,
          request.url
        )
      );
    }

    // Get admin users list from Edge Config.
    //
    // This lookup decides PRIVILEGE, not IDENTITY — the CAS ticket above has
    // already proven who this person is. So it must never be able to fail the
    // login itself: if Edge Config is unreachable or misconfigured, every user
    // signs in as a normal user rather than nobody signing in at all.
    //
    // This is not hypothetical. On 2026-09-24 an empty `EDGE_CONFIG`
    // connection string in production made `get()` throw, the outer catch
    // turned it into `?error=sso_error`, and SSO was down for everyone.
    let isAdmin = false;
    let adminStatusKnown = true;

    try {
      const adminUsersString = await get("adminUsersCaseIds");

      if (adminUsersString && typeof adminUsersString === "string") {
        const adminIds = adminUsersString.split(",").map((id) => id.trim());
        isAdmin = adminIds.includes(validationResult.userInfo.studentId);
      }
    } catch (adminLookupError) {
      // Degrade, do not fail. Admin status is UNKNOWN here, not false —
      // `adminStatusKnown: false` below stops the upsert from demoting a real
      // admin just because the config store was briefly unreachable.
      adminStatusKnown = false;
      console.error(
        "CWRU SSO: admin list lookup failed, continuing without admin privileges:",
        adminLookupError
      );
    }

    // Determine role based on admin list
    const role = isAdmin ? "admin" : "user";

    // Create or update user based on CWRU data
    const user = await createOrUpdateCWRUUser(validationResult.userInfo, role, {
      adminStatusKnown,
    });

    // Create JWT token
    const token = await createToken(user);

    // Create redirect response to home page
    const response = NextResponse.redirect(new URL("/", request.url));

    // Set HTTP-only cookie with JWT token using centralized config
    response.cookies.set(siteConfig.auth.cookie.name, token, {
      ...siteConfig.auth.cookie,
      maxAge: siteConfig.auth.cookieMaxAge,
    });

    return response;
  } catch (error) {
    // Log the real cause. `sso_error` is deliberately opaque to the browser,
    // so without this the runtime log is the only way to tell a CAS failure
    // from a database outage from a misconfigured environment variable.
    console.error(
      "CWRU SSO callback error:",
      error instanceof Error ? `${error.name}: ${error.message}` : error,
      error instanceof Error ? error.stack : undefined
    );
    return NextResponse.redirect(
      new URL("/login?error=sso_error", request.url)
    );
  }
}
