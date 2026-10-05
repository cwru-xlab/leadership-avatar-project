/**
 * Stateless proof for fixed-production CWRU CAS handoff guards.
 *
 * Run with: npx tsx scripts/verify-cwru-sso-handoff.ts
 *
 * This intentionally does not touch a database. The corresponding deployment
 * smoke checklist in README.md covers the persisted one-time-code lifecycle.
 */
process.env.CWRU_CAS_CALLBACK_URL ??=
  "https://avatar.example.edu/api/auth/cwru-sso-callback";
process.env.AUTH_HANDOFF_SECRET ??= "local-verification-secret-not-for-production";
process.env.CWRU_ALLOWED_PREVIEW_HOST_PREFIX ??= "leadership-avatar-project-";

let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok: ${message}`);
  } else {
    console.error(`  FAIL: ${message}`);
    failed += 1;
  }
}

async function rejects(fn: () => unknown | Promise<unknown>, message: string) {
  try {
    await fn();
    check(false, message);
  } catch {
    check(true, message);
  }
}

async function main() {
  const handoff = await import("../lib/auth-handoff");

  console.log("=== verify-cwru-sso-handoff ===");
  check(
    handoff.getCanonicalCallbackUrl().toString() ===
      "https://avatar.example.edu/api/auth/cwru-sso-callback",
    "accepts exact HTTPS canonical callback"
  );
  check(handoff.safeReturnPath("/reports?view=recent") === "/reports?view=recent", "preserves local path and query");

  for (const value of [
    "https://attacker.example",
    "//attacker.example",
    "/%2F%2Fattacker.example",
    "/\\attacker.example",
    "/%5Cattacker.example",
    "/api/auth/cwru-sso-start",
    "/api/auth/cwru-sso-redeem",
    "/api/auth/cwru-sso-callback",
    "/api/auth/cwru-sso-redeem/",
    "/API/AUTH/CWRU-SSO-REDEEM",
    "/api/auth/logout",
  ]) {
    await rejects(() => handoff.safeReturnPath(value), `rejects unsafe returnTo: ${value}`);
  }

  const savedEnv = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
    CWRU_ALLOWED_PREVIEW_HOST_PREFIX: process.env.CWRU_ALLOWED_PREVIEW_HOST_PREFIX,
  };
  process.env.VERCEL_ENV = "preview";
  process.env.VERCEL_URL = "leadership-avatar-project-feature-123.vercel.app";
  process.env.VERCEL_BRANCH_URL =
    "leadership-avatar-project-git-dev-xlabs-projects-66a26c8d.vercel.app";
  const browserNonce = handoff.createPreviewBrowserNonce();
  const assertion = await handoff.createPreviewInitiation(
    "https://leadership-avatar-project-feature-123.vercel.app/reports",
    "/reports?view=recent",
    browserNonce
  );
  const claims = await handoff.verifyPreviewInitiation(assertion);
  check(
    claims.targetOrigin === "https://leadership-avatar-project-feature-123.vercel.app" &&
      claims.targetPath === "/reports?view=recent",
    "signs and verifies the exact preview origin and local path"
  );
  check(Boolean(claims.browserNonceHash), "binds assertion to a preview-browser nonce");

  const branchAssertion = await handoff.createPreviewInitiation(
    "https://leadership-avatar-project-git-dev-xlabs-projects-66a26c8d.vercel.app/reports",
    "/reports?view=recent",
    browserNonce
  );
  const branchClaims = await handoff.verifyPreviewInitiation(branchAssertion);
  check(
    branchClaims.targetOrigin ===
      "https://leadership-avatar-project-git-dev-xlabs-projects-66a26c8d.vercel.app",
    "accepts the git branch alias via VERCEL_BRANCH_URL"
  );

  process.env.CWRU_ALLOWED_PREVIEW_HOST_PREFIX = "different-project-";
  await rejects(
    () => handoff.verifyPreviewInitiation(assertion),
    "rejects an assertion outside the configured project hostname prefix"
  );
  process.env.CWRU_ALLOWED_PREVIEW_HOST_PREFIX = savedEnv.CWRU_ALLOWED_PREVIEW_HOST_PREFIX;
  await rejects(
    () => handoff.createPreviewInitiation("https://other-team.vercel.app/", "/", browserNonce),
    "rejects a request host that is not a platform preview host"
  );
  await rejects(
    () => handoff.verifyPreviewInitiation(`${assertion.slice(0, -1)}x`),
    "rejects a modified preview assertion"
  );

  process.env.VERCEL_ENV = savedEnv.VERCEL_ENV;
  process.env.VERCEL_URL = savedEnv.VERCEL_URL;
  process.env.VERCEL_BRANCH_URL = savedEnv.VERCEL_BRANCH_URL;

  const originalCallback = process.env.CWRU_CAS_CALLBACK_URL;
  process.env.CWRU_CAS_CALLBACK_URL = "https://avatar.example.edu/other";
  await rejects(() => handoff.getCanonicalCallbackUrl(), "rejects a callback with the wrong path");
  process.env.CWRU_CAS_CALLBACK_URL = originalCallback;

  if (failed) {
    console.error(`FAILED: ${failed} assertion(s)`);
    process.exit(1);
  }
  console.log("All handoff guard assertions passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
