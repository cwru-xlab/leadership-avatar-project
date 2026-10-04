/**
 * Authenticated end-to-end proof of the three practice deck routes (14-07).
 *
 * Run against a live `next dev`:
 *   npx tsx scripts/verify-deck-routes.ts
 *
 * Auth:
 *   DECK_AUTH_COOKIE — optional raw `auth-token=<jwt>` for the owner
 *   DECK_AUTH_COOKIE_OTHER — optional second student's cookie (cross-owner 404)
 *   If unset, logs in as student@case.edu / alice.johnson@case.edu.
 *
 * Base URL: DECK_ROUTES_BASE_URL (default http://localhost:3000)
 *
 * PPTX happy-path convert requires DECK_CONVERT_URL. When unset, the script
 * asserts the clear 502 backend-unconfigured reason+fix pair instead.
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { readFileSync } from "fs";
import { join } from "path";

import { DECK_REJECTIONS, MAX_DECK_SIZE_BYTES } from "../lib/deck/types";

/** Mirrors PPTX_CONVERT_FAILURES in app/api/practice/deck/upload/route.ts — do not import the route under tsx. */
const PPTX_CONVERT_FAILURES = {
  "backend-unconfigured": {
    reason: "PowerPoint decks can't be processed right now.",
    fix: "Export your deck as a PDF and upload that instead — PDF decks work.",
  },
  "backend-timeout": {
    reason: "That deck took too long to process.",
    fix: "Try again, or export it as a PDF and upload that instead.",
  },
  "backend-error": {
    reason: "That .pptx couldn't be converted.",
    fix: "Re-save it as .pptx from PowerPoint or Keynote, or export it as a PDF, then try again.",
  },
} as const;

const BASE_URL = (
  process.env.DECK_ROUTES_BASE_URL || "http://localhost:3000"
).replace(/\/$/, "");
const FIXTURES = join(process.cwd(), "scripts/fixtures");
const URL_RE = /https?:\/\//;
const UPLOAD_ROUTE_SRC = join(
  process.cwd(),
  "app/api/practice/deck/upload/route.ts"
);

let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed += 1;
  } else {
    console.log(`  ok: ${message}`);
  }
}

function load(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

async function section(n: number, title: string, fn: () => Promise<void>) {
  console.log(`\n${n}. ${title}`);
  await fn();
}

function cookieHeader(cookie: string): string {
  return cookie.includes("=") ? cookie : `auth-token=${cookie}`;
}

async function loginAs(
  email: string,
  password: string
): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(`login ${email} failed: HTTP ${res.status} ${await res.text()}`);
  }

  const setCookie = res.headers.getSetCookie?.() ?? [];
  const authLine =
    setCookie.find((c) => c.startsWith("auth-token=")) ||
    (res.headers.get("set-cookie") || "")
      .split(/,(?=\s*auth-token=)/)
      .find((c) => c.includes("auth-token="));

  if (!authLine) {
    throw new Error(`login ${email}: no auth-token Set-Cookie`);
  }

  const pair = authLine.split(";")[0]?.trim();
  if (!pair?.startsWith("auth-token=")) {
    throw new Error(`login ${email}: could not parse auth-token`);
  }

  return pair;
}

async function obtainOwnerCookie(): Promise<string> {
  if (process.env.DECK_AUTH_COOKIE?.trim()) {
    return cookieHeader(process.env.DECK_AUTH_COOKIE.trim());
  }

  return loginAs("student@case.edu", "student123");
}

async function obtainOtherCookie(): Promise<string> {
  if (process.env.DECK_AUTH_COOKIE_OTHER?.trim()) {
    return cookieHeader(process.env.DECK_AUTH_COOKIE_OTHER.trim());
  }

  return loginAs("alice.johnson@case.edu", "student123");
}

type JsonBody = Record<string, unknown>;

async function upload(
  cookie: string | null,
  filename: string,
  bytes: Buffer,
  contentType = "application/octet-stream",
  opts: { redirect?: RequestRedirect } = {}
): Promise<{ status: number; body: JsonBody; text: string; location: string | null }> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: contentType }),
    filename
  );

  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${BASE_URL}/api/practice/deck/upload`, {
    method: "POST",
    headers,
    body: form,
    redirect: opts.redirect ?? "follow",
  });

  const text = await res.text();
  let body: JsonBody = {};
  try {
    body = JSON.parse(text) as JsonBody;
  } catch {
    body = {};
  }

  return {
    status: res.status,
    body,
    text,
    location: res.headers.get("location"),
  };
}

async function getJson(
  path: string,
  cookie: string | null,
  opts: { redirect?: RequestRedirect } = {}
): Promise<{ status: number; body: JsonBody; text: string; location: string | null }> {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    redirect: opts.redirect ?? "follow",
  });
  const text = await res.text();
  let body: JsonBody = {};
  try {
    body = JSON.parse(text) as JsonBody;
  } catch {
    body = {};
  }

  return {
    status: res.status,
    body,
    text,
    location: res.headers.get("location"),
  };
}

async function getBinary(
  path: string,
  cookie: string | null,
  opts: { redirect?: RequestRedirect } = {}
): Promise<{
  status: number;
  contentType: string | null;
  cacheControl: string | null;
  bytes: Buffer;
  text: string;
  location: string | null;
}> {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    redirect: opts.redirect ?? "follow",
  });
  const ab = await res.arrayBuffer();
  const bytes = Buffer.from(ab);
  const contentType = res.headers.get("content-type");
  const isJson = contentType?.includes("application/json");

  return {
    status: res.status,
    contentType,
    cacheControl: res.headers.get("cache-control"),
    bytes,
    text: isJson ? bytes.toString("utf8") : "",
    location: res.headers.get("location"),
  };
}

/** Unauthenticated: middleware 307→/login, or route-level 401 if middleware is bypassed. */
function assertUnauthenticated(
  status: number,
  location: string | null,
  label: string
) {
  const redirectedToLogin =
    (status === 307 || status === 302 || status === 303) &&
    Boolean(location && location.includes("/login"));

  assert(
    status === 401 || redirectedToLogin,
    `${label}: 401 or redirect to /login (got ${status}, location=${location})`
  );
}

function assertReasonFix(body: JsonBody, label: string) {
  const error = typeof body.error === "string" ? body.error : "";
  const fix = typeof body.fix === "string" ? body.fix : "";

  assert(error.length > 0, `${label}: error non-empty`);
  assert(fix.length > 0, `${label}: fix non-empty`);
  assert(error !== fix, `${label}: error !== fix`);
}

function assertNoUrl(text: string, label: string) {
  assert(!URL_RE.test(text), `${label}: no http(s) URL in body`);
}

/** PDF with zero pages — intake maps to no-extractable-pages. */
function buildZeroPagePdf(): Buffer {
  return Buffer.from(
    `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [] /Count 0 >>endobj
xref
0 3
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
trailer<< /Size 3 /Root 1 0 R >>
startxref
110
%%EOF
`,
    "utf8"
  );
}

/** Minimal PDF with /Encrypt so intake maps to password-protected. */
function buildEncryptedLookingPdf(): Buffer {
  return Buffer.from(
    `%PDF-1.4
1 0 obj<< /Encrypt 2 0 R /Type /Catalog /Pages 3 0 R >>endobj
2 0 obj<< /Filter /Standard /V 1 /R 2 /O (xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx) /U (xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx) /P -4 >>endobj
3 0 obj<< /Type /Pages /Kids [] /Count 0 >>endobj
trailer<< /Root 1 0 R /Encrypt 2 0 R >>
%%EOF
`,
    "utf8"
  );
}

async function main() {
  console.log("=== verify-deck-routes (14-07) ===");
  console.log(`Base URL: ${BASE_URL}`);

  let ownerCookie = "";
  let otherCookie = "";
  let deckId = "";

  await section(1, "obtain auth cookies (owner + other student)", async () => {
    ownerCookie = await obtainOwnerCookie();
    otherCookie = await obtainOtherCookie();
    assert(ownerCookie.startsWith("auth-token="), "owner cookie captured");
    assert(otherCookie.startsWith("auth-token="), "other cookie captured");
    assert(ownerCookie !== otherCookie, "owner and other cookies differ");
  });

  await section(2, "unauthenticated without a cookie on upload / manifest / slide", async () => {
    // App middleware redirects cookieless requests to /login (307) before the
    // route runs. Route handlers still return 401 when reached without a user.
    const up = await upload(
      null,
      "deck-landscape.pdf",
      load("deck-landscape.pdf"),
      "application/pdf",
      { redirect: "manual" }
    );
    assertUnauthenticated(up.status, up.location, "upload");

    const man = await getJson(
      "/api/practice/deck/00000000-0000-0000-0000-000000000000",
      null,
      { redirect: "manual" }
    );
    assertUnauthenticated(man.status, man.location, "manifest");

    const slide = await getBinary(
      "/api/practice/deck/00000000-0000-0000-0000-000000000000/slide/0",
      null,
      { redirect: "manual" }
    );
    assertUnauthenticated(slide.status, slide.location, "slide");
  });

  await section(3, "PDF happy path: upload + manifest + slide bytes", async () => {
    const up = await upload(
      ownerCookie,
      "deck-landscape.pdf",
      load("deck-landscape.pdf"),
      "application/pdf"
    );

    assert(up.status === 201, `upload → 201 (got ${up.status})`);
    assertNoUrl(up.text, "upload response");
    assert(typeof up.body.deckId === "string" && (up.body.deckId as string).length > 0, "deckId present");
    assert(up.body.slideCount === 3, `slideCount === 3 (got ${String(up.body.slideCount)})`);
    assert(up.body.format === "pdf", 'format === "pdf"');
    assert(!("http" in up.body), "no http key on body");

    const slides = up.body.slides as Array<Record<string, unknown>> | undefined;
    assert(Array.isArray(slides) && slides.length === 3, "slides array length 3");
    if (slides?.[0]) {
      assert(typeof slides[0].textLength === "number", "textLength present (not full text)");
      assert(slides[0].text === undefined, "upload response omits slide text");
    }

    deckId = String(up.body.deckId);

    const man = await getJson(`/api/practice/deck/${deckId}`, ownerCookie);
    assert(man.status === 200, `manifest → 200 (got ${man.status})`);
    assertNoUrl(man.text, "manifest response");
    assert(man.body.slideCount === 3, "manifest slideCount === 3");
    const manSlides = man.body.slides as Array<Record<string, unknown>> | undefined;
    assert(
      Array.isArray(manSlides) && typeof manSlides[0]?.text === "string",
      "manifest includes per-slide text"
    );

    const slide = await getBinary(
      `/api/practice/deck/${deckId}/slide/0`,
      ownerCookie
    );
    assert(slide.status === 200, `slide/0 → 200 (got ${slide.status})`);
    assert(
      (slide.contentType || "").includes("image/png"),
      `Content-Type image/png (got ${slide.contentType})`
    );
    assert(slide.bytes.length > 1000, `png bytes > 1000 (got ${slide.bytes.length})`);
    assert(
      slide.bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      ),
      "PNG magic"
    );
    assert(
      (slide.cacheControl || "").toLowerCase().includes("private"),
      `Cache-Control contains private (got ${slide.cacheControl})`
    );

    const thumb = await getBinary(
      `/api/practice/deck/${deckId}/slide/0?v=thumb`,
      ownerCookie
    );
    assert(thumb.status === 200, `thumb → 200 (got ${thumb.status})`);
    assert(
      thumb.bytes.length < slide.bytes.length,
      `thumb smaller than slide (${thumb.bytes.length} < ${slide.bytes.length})`
    );
  });

  await section(4, "PPTX path: convert happy path OR clear 502 when unprovisioned", async () => {
    const up = await upload(
      ownerCookie,
      "spike-deck.pptx",
      load("spike-deck.pptx"),
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );

    const convertConfigured = Boolean(process.env.DECK_CONVERT_URL?.trim());

    if (convertConfigured) {
      assert(up.status === 201, `pptx upload → 201 (got ${up.status})`);
      assertNoUrl(up.text, "pptx upload");
      assert(up.body.slideCount === 2, `pptx slideCount === 2 (got ${String(up.body.slideCount)})`);
      assert(up.body.format === "pptx", 'format === "pptx"');
    } else {
      assert(up.status === 502, `unprovisioned pptx → 502 (got ${up.status})`);
      assert(up.body.code === "backend-unconfigured", 'code === "backend-unconfigured"');
      assertReasonFix(up.body, "pptx unconfigured");
      assert(
        up.body.error === PPTX_CONVERT_FAILURES["backend-unconfigured"].reason,
        "matches PPTX_CONVERT_FAILURES reason"
      );
      assert(
        up.body.fix === PPTX_CONVERT_FAILURES["backend-unconfigured"].fix,
        "matches PPTX_CONVERT_FAILURES fix"
      );
      assertNoUrl(up.text, "pptx 502 body");
      console.log("  note: DECK_CONVERT_URL unset — asserted clear 502 copy (not a silent skip)");
    }
  });

  await section(5, "rejection codes return error + fix (differing)", async () => {
    const cases: Array<{
      code: string;
      filename: string;
      bytes: Buffer;
      status?: number;
    }> = [
      {
        code: "empty",
        filename: "empty.bin",
        bytes: Buffer.alloc(0),
      },
      {
        code: "too-large",
        filename: "huge.bin",
        bytes: Buffer.alloc(MAX_DECK_SIZE_BYTES + 1),
      },
      {
        code: "unknown-format",
        filename: "not-a-deck.txt",
        bytes: load("not-a-deck.txt"),
      },
      {
        code: "corrupt-pdf",
        filename: "fake.pdf",
        bytes: load("fake.pdf"),
      },
      {
        code: "corrupt-pptx",
        filename: "not-pptx.zip",
        bytes: load("not-pptx.zip"),
      },
      {
        code: "no-extractable-pages",
        filename: "zero-pages.pdf",
        bytes: buildZeroPagePdf(),
      },
      {
        code: "password-protected",
        filename: "encrypted.pdf",
        bytes: buildEncryptedLookingPdf(),
      },
    ];

    for (const c of cases) {
      const up = await upload(ownerCookie, c.filename, c.bytes);
      const expectedStatus = c.status ?? 400;

      assert(
        up.status === expectedStatus,
        `${c.code}: status ${expectedStatus} (got ${up.status})`
      );
      assert(up.body.code === c.code, `${c.code}: body.code matches`);
      assertReasonFix(up.body, c.code);
      assertNoUrl(up.text, c.code);
    }

    // Static copy completeness for every DECK_REJECTIONS entry (greppable source of truth).
    for (const code of Object.keys(DECK_REJECTIONS) as Array<keyof typeof DECK_REJECTIONS>) {
      const copy = DECK_REJECTIONS[code];
      assert(copy.reason.length > 0 && copy.fix.length > 0, `DECK_REJECTIONS.${code} populated`);
      assert(copy.reason !== copy.fix, `DECK_REJECTIONS.${code} reason !== fix`);
    }

    for (const code of Object.keys(PPTX_CONVERT_FAILURES) as Array<
      keyof typeof PPTX_CONVERT_FAILURES
    >) {
      const copy = PPTX_CONVERT_FAILURES[code];
      assert(copy.reason.length > 0 && copy.fix.length > 0, `PPTX_CONVERT_FAILURES.${code} populated`);
      assert(copy.reason !== copy.fix, `PPTX_CONVERT_FAILURES.${code} reason !== fix`);
    }

    const uploadSrc = readFileSync(UPLOAD_ROUTE_SRC, "utf8");
    assert(
      uploadSrc.includes("export const PPTX_CONVERT_FAILURES"),
      "upload route exports PPTX_CONVERT_FAILURES"
    );
    for (const copy of Object.values(PPTX_CONVERT_FAILURES)) {
      assert(uploadSrc.includes(copy.reason), `upload route contains reason: ${copy.reason.slice(0, 40)}…`);
      assert(uploadSrc.includes(copy.fix), `upload route contains fix: ${copy.fix.slice(0, 40)}…`);
    }
  });

  await section(6, "out-of-range slide index → 404", async () => {
    assert(deckId.length > 0, "deckId from happy path available");
    const slide = await getBinary(
      `/api/practice/deck/${deckId}/slide/999`,
      ownerCookie
    );
    assert(slide.status === 404, `slide/999 → 404 (got ${slide.status})`);

    const bad = await getBinary(
      `/api/practice/deck/${deckId}/slide/not-a-number`,
      ownerCookie
    );
    assert(bad.status === 404, `non-numeric index → 404 (got ${bad.status})`);
  });

  await section(7, "cross-owner deck → 404 (not 403)", async () => {
    assert(deckId.length > 0, "deckId from happy path available");
    const man = await getJson(`/api/practice/deck/${deckId}`, otherCookie);
    assert(man.status === 404, `other student manifest → 404 (got ${man.status})`);
    assert(man.status !== 403, "not 403");

    const slide = await getBinary(
      `/api/practice/deck/${deckId}/slide/0`,
      otherCookie
    );
    assert(slide.status === 404, `other student slide → 404 (got ${slide.status})`);
    assert(slide.status !== 403, "slide not 403");
  });

  await section(8, "no-URL guard on all deck-route JSON bodies exercised above", async () => {
    // Re-fetch key JSON surfaces and assert again (belt and suspenders).
    const man = await getJson(`/api/practice/deck/${deckId}`, ownerCookie);
    assertNoUrl(man.text, "final manifest");
    const rej = await upload(ownerCookie, "not-a-deck.txt", load("not-a-deck.txt"));
    assertNoUrl(rej.text, "final rejection");
  });

  console.log("");
  if (failed > 0) {
    console.error(`FAILED: ${failed} assertion(s)`);
    process.exit(1);
  }

  console.log("All eight sections passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
