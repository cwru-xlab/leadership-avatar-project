#!/usr/bin/env node
/**
 * Local setup / preflight check.
 *
 *   npm run setup                  verify everything, apply pending migrations
 *   npm run setup -- --seed        ...and seed the database (idempotent upserts)
 *   npm run setup -- --write-probe ...and prove S3 writes work (temp object)
 *   npm run setup -- --no-migrate  verify only, change nothing
 *
 * The point is diagnosis, not automation: each dependency is probed separately
 * so a failure names the thing that is actually wrong, instead of surfacing
 * later as an empty page or a confusing stack trace.
 *
 * Deliberately never runs `prisma migrate dev` or `migrate reset`. Those can
 * offer to reset the database, and this project's dev database is SHARED — a
 * reset would wipe every teammate's data. Only `migrate deploy` is used, which
 * applies pending migrations and creates none.
 */

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const has = (flag) => args.includes(`--${flag}`);
const DO_SEED = has("seed");
const DO_WRITE_PROBE = has("write-probe");
const DO_MIGRATE = !has("no-migrate");
const FORCE = has("force");

// ── Output ────────────────────────────────────────────────────────────────

const results = [];
const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function record(name, status, detail, hint) {
  results.push({ name, status, detail, hint });
  const mark =
    status === "ok" ? c.green("✓") : status === "warn" ? c.yellow("!") : c.red("✗");
  console.log(`${mark} ${name.padEnd(28)} ${detail ?? ""}`);
  if (hint && status !== "ok") console.log(`  ${c.dim("→ " + hint)}`);
}

const fail = (name, detail, hint) => record(name, "fail", detail, hint);
const warn = (name, detail, hint) => record(name, "warn", detail, hint);
const pass = (name, detail) => record(name, "ok", detail);

// ── Env loading ───────────────────────────────────────────────────────────
// Next.js reads .env.local over .env. The Prisma CLI reads ONLY .env, which is
// why the two are compared below and why DATABASE_URL is passed explicitly to
// every Prisma invocation.

function parseEnvFile(path) {
  if (!existsSync(path)) return null;
  const out = {};
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const dotEnv = parseEnvFile(".env");
const dotEnvLocal = parseEnvFile(".env.local");
const env = { ...(dotEnv ?? {}), ...(dotEnvLocal ?? {}) };
// A value exported in the shell wins over both, matching how the app runs.
for (const key of Object.keys(env)) {
  if (process.env[key]) env[key] = process.env[key];
}

const REQUIRED = [
  "DATABASE_URL",
  "JWT_SECRET",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "AWS_S3_BUCKET_NAME",
  "OPENAI_API_KEY",
  "HEYGEN_API_KEY",
];

const PLACEHOLDER = /^(your[-_]|xxx|changeme|placeholder|<.*>)/i;

// ── Checks ────────────────────────────────────────────────────────────────

function checkEnv() {
  if (!dotEnv && !dotEnvLocal) {
    fail(
      "env files",
      "no .env or .env.local found",
      "copy .env.template to .env.local and fill in the values",
    );
    return false;
  }
  pass(
    "env files",
    [dotEnv && ".env", dotEnvLocal && ".env.local"].filter(Boolean).join(" + "),
  );

  const missing = REQUIRED.filter((k) => !env[k]);
  const placeholder = REQUIRED.filter((k) => env[k] && PLACEHOLDER.test(env[k]));

  if (missing.length) {
    fail("required variables", `missing: ${missing.join(", ")}`, "add them to .env.local");
    return false;
  }
  if (placeholder.length) {
    fail(
      "required variables",
      `placeholder values: ${placeholder.join(", ")}`,
      "replace with real credentials",
    );
    return false;
  }
  pass("required variables", `all ${REQUIRED.length} present`);

  // The Prisma CLI ignores .env.local, so a mismatch means migrations would
  // target a different database than the app talks to.
  if (dotEnv?.DATABASE_URL && dotEnvLocal?.DATABASE_URL) {
    if (dotEnv.DATABASE_URL !== dotEnvLocal.DATABASE_URL) {
      warn(
        "DATABASE_URL agreement",
        ".env and .env.local disagree",
        "the Prisma CLI reads .env only; this script forces the .env.local value, but other prisma commands will not",
      );
    } else {
      pass("DATABASE_URL agreement", ".env and .env.local match");
    }
  }
  return true;
}

/** Run a command with the resolved env so Prisma targets the app's database. */
function run(cmd, cmdArgs, { quiet = true } = {}) {
  return spawnSync(cmd, cmdArgs, {
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
    env: { ...process.env, ...env },
  });
}

function checkPrismaGenerate() {
  const r = run("npx", ["prisma", "generate"]);
  if (r.status !== 0) {
    fail(
      "prisma generate",
      "failed",
      (r.stderr || r.stdout || "").trim().split("\n").slice(-3).join(" "),
    );
    return false;
  }
  pass("prisma generate", "client generated");
  return true;
}

function checkMigrations() {
  const status = run("npx", ["prisma", "migrate", "status"]);
  const out = `${status.stdout ?? ""}${status.stderr ?? ""}`;

  if (/P1001|Can't reach database server/i.test(out)) {
    fail(
      "database connection",
      "unreachable",
      "check DATABASE_URL host/port, and that your IP is allowed by the database firewall",
    );
    return false;
  }
  pass("database connection", "reachable");

  const upToDate = /Database schema is up to date/i.test(out);
  if (upToDate) {
    pass("migrations", "up to date");
    return true;
  }

  const pending = /have not yet been applied|following migration/i.test(out);
  if (!pending) {
    // Divergence: the database records migrations this checkout does not have.
    warn(
      "migrations",
      "history differs from this checkout",
      "do NOT run `prisma migrate dev` or `migrate reset` against the shared database — pull the latest migrations first, or ask whoever created them to commit the migration folder",
    );
    return true;
  }

  if (!DO_MIGRATE) {
    warn("migrations", "pending (not applied: --no-migrate)", "re-run without --no-migrate");
    return true;
  }

  const deploy = run("npx", ["prisma", "migrate", "deploy"]);
  if (deploy.status !== 0) {
    fail(
      "migrations",
      "migrate deploy failed",
      `${deploy.stdout ?? ""}${deploy.stderr ?? ""}`.trim().split("\n").slice(-3).join(" "),
    );
    return false;
  }
  pass("migrations", "pending migrations applied");
  return true;
}

async function checkSchemaUsable() {
  let PrismaClient;
  try {
    ({ PrismaClient } = require("@prisma/client"));
  } catch {
    fail("prisma client", "not importable", "run `npx prisma generate`");
    return;
  }
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    const users = await prisma.user.count();
    if (users === 0) {
      warn(
        "schema + data",
        "User table exists but is empty",
        "run `npm run setup -- --seed` to create the dev accounts",
      );
    } else {
      pass("schema + data", `${users} user(s) present`);
    }
  } catch (err) {
    const code = err?.code ?? "";
    fail(
      "schema + data",
      code === "P2021" ? "the User table does not exist" : `${code} ${err.message.slice(0, 80)}`,
      code === "P2021"
        ? "migrations have not been applied to this database — re-run without --no-migrate"
        : undefined,
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function checkS3() {
  const bucket = env.AWS_S3_BUCKET_NAME;
  let S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand;
  try {
    ({ S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } =
      require("@aws-sdk/client-s3"));
  } catch {
    fail("s3", "@aws-sdk/client-s3 not installed", "run `npm install`");
    return;
  }

  const client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 5 }),
    );
    pass("s3 read", `${bucket} reachable (${listed.KeyCount ?? 0} keys sampled)`);
  } catch (err) {
    const http = err?.$metadata?.httpStatusCode;
    fail(
      "s3 read",
      `${bucket}: ${http ?? ""} ${err.name}`,
      http === 403
        ? "either AWS_S3_BUCKET_NAME names the wrong bucket, or this IAM user lacks s3:ListBucket/s3:GetObject on it"
        : "check AWS_REGION and AWS_S3_BUCKET_NAME",
    );
    return;
  }

  if (!DO_WRITE_PROBE) {
    console.log(`  ${c.dim("→ write access unverified; add --write-probe to test it")}`);
    return;
  }

  const key = `_permcheck/setup-${Date.now()}.json`;
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify({ probe: true }),
        ContentType: "application/json",
      }),
    );
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    pass("s3 write", "put + delete succeeded (temp object removed)");
  } catch (err) {
    fail(
      "s3 write",
      `${err?.$metadata?.httpStatusCode ?? ""} ${err.name}`,
      "saving interactions will fail — this IAM user needs s3:PutObject and s3:DeleteObject",
    );
  }
}

async function checkOpenAI() {
  try {
    const res = await fetch("https://api.openai.com/v1/models/gpt-4.1", {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) pass("openai key", "valid (gpt-4.1 reachable)");
    else
      fail(
        "openai key",
        `HTTP ${res.status}`,
        res.status === 401 ? "OPENAI_API_KEY is invalid or revoked" : undefined,
      );
  } catch (err) {
    fail("openai key", `request failed: ${err.message}`);
  }
}

async function checkLiveAvatar() {
  const base =
    env.NEXT_PUBLIC_LIVEAVATAR_API_URL?.trim() || "https://api.liveavatar.com";
  try {
    // Read-only: proves the key authenticates without creating a session.
    const res = await fetch(`${base}/v1/avatars`, {
      headers: { "X-API-KEY": env.HEYGEN_API_KEY },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      fail(
        "heygen key",
        `HTTP ${res.status}`,
        res.status === 401 ? "HEYGEN_API_KEY is invalid for " + base : undefined,
      );
      return;
    }
    const body = await res.json();
    const avatars = body?.data?.results ?? [];
    pass("heygen key", `valid (${avatars.length} avatar(s) available)`);
  } catch (err) {
    fail("heygen key", `request failed: ${err.message}`);
  }
}

function runSeed() {
  console.log(`\n${c.bold("Seeding database")} ${c.dim("(idempotent upserts)")}`);
  const r = run("npx", ["prisma", "db", "seed"], { quiet: false });
  if (r.status !== 0) {
    fail("seed", "failed", "see output above");
    return;
  }
  pass("seed", "completed");
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(c.bold("\nLocal setup check\n"));

  if (process.env.NODE_ENV === "production" && !FORCE) {
    console.error(
      c.red("Refusing to run with NODE_ENV=production.\n") +
        "This applies migrations and can seed data. Pass --force only if you are certain.",
    );
    process.exit(2);
  }

  if (!checkEnv()) {
    console.log(c.red("\nStopped: fix the environment first.\n"));
    process.exit(1);
  }

  if (checkPrismaGenerate() && checkMigrations()) {
    await checkSchemaUsable();
  }

  await checkS3();
  await checkOpenAI();
  await checkLiveAvatar();

  if (DO_SEED) runSeed();

  const failed = results.filter((r) => r.status === "fail");
  const warned = results.filter((r) => r.status === "warn");

  console.log();
  if (failed.length) {
    console.log(
      c.red(`${failed.length} check(s) failed:`) +
        " " +
        failed.map((r) => r.name).join(", "),
    );
    console.log(c.dim("The app will not work correctly until these are resolved.\n"));
    process.exit(1);
  }

  if (warned.length) {
    console.log(
      c.yellow(`All required checks passed, with ${warned.length} warning(s):`) +
        " " +
        warned.map((r) => r.name).join(", "),
    );
  } else {
    console.log(c.green("All checks passed."));
  }
  console.log(`\nStart the app with ${c.bold("npm run dev")}\n`);
}

main().catch((err) => {
  console.error(c.red(`\nUnexpected error: ${err.message}\n`));
  process.exit(1);
});
