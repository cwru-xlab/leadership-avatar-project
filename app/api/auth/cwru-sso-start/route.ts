import { NextRequest, NextResponse } from "next/server";
import {
  AuthHandoffError,
  CAS_PREVIEW_NONCE_COOKIE,
  CAS_START_PATH,
  CAS_STATE_COOKIE,
  createCasState,
  createPreviewBrowserNonce,
  createPreviewInitiation,
  getCanonicalCallbackUrl,
  isCanonicalRequest,
  previewNonceCookieOptions,
  safeReturnPath,
  stateCookieOptions,
  verifyPreviewInitiation,
} from "@/lib/auth-handoff";

const CAS_LOGIN_URL = "https://login.case.edu/cas/login";

function loginError(request: NextRequest, error: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const init = request.nextUrl.searchParams.get("init");
    const returnTo = request.nextUrl.searchParams.get("returnTo");
    const canonical = getCanonicalCallbackUrl();

    if (!isCanonicalRequest(request.url)) {
      if (init) {
        throw new AuthHandoffError("Non-canonical requests cannot supply an initiation assertion");
      }

      // A production alias is not a preview. Normalize it to the one registered
      // CAS origin before beginning the flow rather than incorrectly rejecting it.
      if (process.env.VERCEL_ENV === "production") {
        const startUrl = new URL(CAS_START_PATH, canonical.origin);
        startUrl.searchParams.set("returnTo", safeReturnPath(returnTo));
        return NextResponse.redirect(startUrl);
      }

      const browserNonce = createPreviewBrowserNonce();
      const assertion = await createPreviewInitiation(
        request.url,
        returnTo,
        browserNonce
      );
      const startUrl = new URL(CAS_START_PATH, canonical.origin);
      startUrl.searchParams.set("init", assertion);
      const response = NextResponse.redirect(startUrl);
      response.cookies.set(
        CAS_PREVIEW_NONCE_COOKIE,
        browserNonce,
        previewNonceCookieOptions()
      );
      response.headers.set("Cache-Control", "no-store, max-age=0");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    }

    const target = init
      ? await verifyPreviewInitiation(init)
      : {
          targetOrigin: canonical.origin,
          targetPath: safeReturnPath(returnTo),
        };
    const state = await createCasState(target);
    const casLogin = new URL(CAS_LOGIN_URL);
    casLogin.searchParams.set("service", canonical.toString());

    const response = NextResponse.redirect(casLogin);
    response.cookies.set(CAS_STATE_COOKIE, state, stateCookieOptions());
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    console.error(
      "CWRU SSO start error:",
      error instanceof Error ? `${error.name}: ${error.message}` : error
    );
    return loginError(request, "sso_unavailable");
  }
}
