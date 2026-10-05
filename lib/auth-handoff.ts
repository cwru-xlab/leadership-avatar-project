import crypto from "crypto";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "@/lib/prisma";

export const CAS_CALLBACK_PATH = "/api/auth/cwru-sso-callback";
export const CAS_START_PATH = "/api/auth/cwru-sso-start";
export const CAS_REDEEM_PATH = "/api/auth/cwru-sso-redeem";
export const CAS_STATE_COOKIE = "cwru-cas-state";
export const CAS_PREVIEW_NONCE_COOKIE = "cwru-cas-preview-nonce";
export const AUTH_HANDOFF_TTL_SECONDS = 5 * 60;

const AUTH_FLOW_PATHS = new Set([
  CAS_CALLBACK_PATH,
  CAS_START_PATH,
  CAS_REDEEM_PATH,
]);
const ASSERTION_ISSUER = "leadership-avatar-preview";
const ASSERTION_AUDIENCE = "leadership-avatar-production";

export class AuthHandoffError extends Error {}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_HANDOFF_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new AuthHandoffError(
      "AUTH_HANDOFF_SECRET must be configured with at least 32 bytes"
    );
  }

  return new TextEncoder().encode(secret);
}

export function getCanonicalCallbackUrl(): URL {
  const value = process.env.CWRU_CAS_CALLBACK_URL?.trim();
  if (!value) {
    throw new AuthHandoffError("CWRU_CAS_CALLBACK_URL is not configured");
  }

  let callback: URL;
  try {
    callback = new URL(value);
  } catch {
    throw new AuthHandoffError("CWRU_CAS_CALLBACK_URL must be an absolute URL");
  }

  if (
    callback.protocol !== "https:" ||
    callback.username ||
    callback.password ||
    callback.search ||
    callback.hash ||
    callback.pathname !== CAS_CALLBACK_PATH
  ) {
    throw new AuthHandoffError(
      `CWRU_CAS_CALLBACK_URL must be an HTTPS ${CAS_CALLBACK_PATH} URL without query, fragment, or credentials`
    );
  }

  return callback;
}

export function originForRequest(requestUrl: string): string {
  const url = new URL(requestUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AuthHandoffError("Request origin has an unsupported protocol");
  }
  return url.origin;
}

export function isCanonicalRequest(requestUrl: string): boolean {
  return originForRequest(requestUrl) === getCanonicalCallbackUrl().origin;
}

export function safeReturnPath(value: string | null): string {
  const candidate = value || "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    throw new AuthHandoffError("returnTo must be URI encoded correctly");
  }

  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    decoded.startsWith("//") ||
    decoded.includes("\\")
  ) {
    throw new AuthHandoffError("returnTo must be a local path");
  }

  let target: URL;
  try {
    target = new URL(candidate, "https://local.invalid");
  } catch {
    throw new AuthHandoffError("returnTo must be a valid local path");
  }

  const normalizedPath = target.pathname.replace(/\/+$/, "") || "/";
  if (
    target.origin !== "https://local.invalid" ||
    target.username ||
    target.password ||
    target.hash ||
    normalizedPath.toLowerCase() === "/api" ||
    normalizedPath.toLowerCase().startsWith("/api/") ||
    AUTH_FLOW_PATHS.has(normalizedPath)
  ) {
    throw new AuthHandoffError("returnTo is not an allowed application path");
  }

  return `${target.pathname}${target.search}`;
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomValue(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function expiresAt(): Date {
  return new Date(Date.now() + AUTH_HANDOFF_TTL_SECONDS * 1000);
}

export function stateCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: CAS_CALLBACK_PATH,
    maxAge: AUTH_HANDOFF_TTL_SECONDS,
  };
}

export function previewNonceCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: CAS_REDEEM_PATH,
    maxAge: AUTH_HANDOFF_TTL_SECONDS,
  };
}

export type PreviewInitiation = {
  targetOrigin: string;
  targetPath: string;
  browserNonceHash?: string;
};

function allowedPreviewHost(hostname: string): boolean {
  const prefix = process.env.CWRU_ALLOWED_PREVIEW_HOST_PREFIX?.trim().toLowerCase();
  if (!prefix || !/^[a-z0-9-]+$/.test(prefix)) {
    throw new AuthHandoffError("CWRU_ALLOWED_PREVIEW_HOST_PREFIX is not configured safely");
  }

  return hostname.toLowerCase().startsWith(prefix) && hostname.endsWith(".vercel.app");
}

function platformPreviewHosts(): Set<string> {
  // VERCEL_URL is the unique deployment host (…-abc123-….vercel.app).
  // VERCEL_BRANCH_URL is the stable git-branch alias (…-git-dev-….vercel.app).
  // Users almost always open the branch alias, so both must be accepted.
  const hosts = new Set<string>();
  for (const value of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    const host = value?.trim().toLowerCase();
    if (!host || host.includes("://") || host.includes("/")) continue;
    hosts.add(host);
  }
  return hosts;
}

function verifiedPreviewOrigin(requestUrl: string): string {
  if (process.env.VERCEL_ENV !== "preview") {
    throw new AuthHandoffError("Preview handoff is only available in Vercel previews");
  }

  const platformHosts = platformPreviewHosts();
  if (platformHosts.size === 0) {
    throw new AuthHandoffError("VERCEL_URL is not configured as a host");
  }

  const request = new URL(requestUrl);
  const requestHost = request.host.toLowerCase();
  // Return the origin the browser actually used so the redeem redirect and
  // preview-nonce cookie stay on the same host (branch alias vs deployment URL).
  if (
    request.protocol !== "https:" ||
    !platformHosts.has(requestHost) ||
    !allowedPreviewHost(requestHost)
  ) {
    throw new AuthHandoffError("Preview request host is not an allowed Vercel deployment");
  }

  return `https://${requestHost}`;
}

export async function createPreviewInitiation(
  requestUrl: string,
  returnTo: string | null,
  browserNonce: string
): Promise<string> {
  const targetOrigin = verifiedPreviewOrigin(requestUrl);
  const targetPath = safeReturnPath(returnTo);
  if (!browserNonce) {
    throw new AuthHandoffError("Preview browser nonce is missing");
  }

  return new SignJWT({
    targetOrigin,
    targetPath,
    browserNonceHash: hash(browserNonce),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${AUTH_HANDOFF_TTL_SECONDS}s`)
    .setIssuer(ASSERTION_ISSUER)
    .setAudience(ASSERTION_AUDIENCE)
    .sign(secretKey());
}

export async function verifyPreviewInitiation(token: string): Promise<PreviewInitiation> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ASSERTION_ISSUER,
      audience: ASSERTION_AUDIENCE,
    });
    const targetOrigin = typeof payload.targetOrigin === "string" ? payload.targetOrigin : "";
    const targetPath = typeof payload.targetPath === "string" ? payload.targetPath : "";
    const browserNonceHash =
      typeof payload.browserNonceHash === "string" ? payload.browserNonceHash : "";
    const target = new URL(targetOrigin);

    if (
      target.protocol !== "https:" ||
      target.username ||
      target.password ||
      target.pathname !== "/" ||
      target.search ||
      target.hash ||
      !allowedPreviewHost(target.hostname) ||
      !/^[a-f0-9]{64}$/.test(browserNonceHash) ||
      safeReturnPath(targetPath) !== targetPath
    ) {
      throw new AuthHandoffError("Preview initiation has invalid claims");
    }

    return { targetOrigin: target.origin, targetPath, browserNonceHash };
  } catch (error) {
    if (error instanceof AuthHandoffError) throw error;
    throw new AuthHandoffError("Preview initiation is invalid or expired");
  }
}

export function createPreviewBrowserNonce(): string {
  return randomValue();
}

export async function createCasState(target: PreviewInitiation): Promise<string> {
  const state = randomValue();
  const now = new Date();
  await prisma.authHandoff.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.authHandoff.create({
    data: {
      stateHash: hash(state),
      browserNonceHash: target.browserNonceHash ?? null,
      targetOrigin: target.targetOrigin,
      targetPath: target.targetPath,
      expiresAt: expiresAt(),
    },
  });
  return state;
}

export async function getPendingHandoff(state: string): Promise<PreviewInitiation> {
  const handoff = await prisma.authHandoff.findFirst({
    where: {
      stateHash: hash(state),
      codeHash: null,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { targetOrigin: true, targetPath: true },
  });

  if (!handoff) {
    throw new AuthHandoffError("CAS state is invalid or expired");
  }

  return handoff;
}

export async function issueHandoffCode(state: string, userId: string): Promise<string> {
  const code = randomValue();
  const issued = await prisma.authHandoff.updateMany({
    where: {
      stateHash: hash(state),
      codeHash: null,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { codeHash: hash(code), userId },
  });

  if (issued.count !== 1) {
    throw new AuthHandoffError("CAS state is expired or has already been used");
  }

  return code;
}

export async function consumeHandoffCode(
  code: string,
  requestUrl: string,
  browserNonce: string | undefined
): Promise<{ userId: string; targetPath: string }> {
  const codeHash = hash(code);
  const targetOrigin = originForRequest(requestUrl);
  const handoff = await prisma.authHandoff.findFirst({
    where: { codeHash, targetOrigin },
    select: { id: true, userId: true, targetPath: true, browserNonceHash: true },
  });

  if (
    !handoff?.userId ||
    (handoff.browserNonceHash &&
      (!browserNonce || hash(browserNonce) !== handoff.browserNonceHash))
  ) {
    throw new AuthHandoffError("Handoff code is invalid");
  }

  const consumed = await prisma.authHandoff.updateMany({
    where: {
      id: handoff.id,
      codeHash,
      targetOrigin,
      userId: handoff.userId,
      browserNonceHash: handoff.browserNonceHash,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });

  if (consumed.count !== 1) {
    throw new AuthHandoffError("Handoff code is expired or has already been used");
  }

  return { userId: handoff.userId, targetPath: handoff.targetPath };
}
