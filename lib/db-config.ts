/**
 * Local-dev helpers when Postgres is not configured.
 * Production always requires DATABASE_URL.
 */

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function isLocalDevWithoutDb(): boolean {
  return process.env.NODE_ENV !== "production" && !isDatabaseConfigured();
}
