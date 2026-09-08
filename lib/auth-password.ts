import crypto from "crypto";

/** Shared password hashing (kept separate so edge/auth can import without prisma). */
export function hashPassword(password: string): string {
  return crypto.createHash("sha512").update(password).digest("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}
