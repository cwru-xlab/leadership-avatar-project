import { chromium, expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";

/**
 * Resume upload matrix: the real route with synthetic files, and the wizard
 * step's states. Every resume here is invented ("Jordan Q. Testcase").
 *
 * PDFs are rendered at test time with Chromium's page.pdf() so they carry
 * real fonts, ligatures and layout. The few files that need tools a CI box
 * may lack (qpdf encryption, macOS textutil for .doc/.docx/.rtf) are checked
 * in under e2e/fixtures/resume/.
 *
 * Writes only under alice.johnson@case.edu: each accepted upload stores one
 * private PDF in S3 for that test account.
 */

const SHOTS = ".loop-shots";
const FIXTURES = join(__dirname, "fixtures", "resume");
const EMAIL = "alice.johnson@case.edu";
const MB = 1024 * 1024;

const BODY = `
<h1>Jordan Q. Testcase</h1><p>jordan.testcase@example.com · 555-0100 · Cleveland, OH</p>
<h2>Experience</h2>
<p><b>Product Analyst</b>, Fictional Widgets Inc. (2022–2024)</p>
<ul><li>Led an efficient office workflow redesign affecting 40 staff; reduced cycle time by 18%.</li>
<li>Built a forecasting model in Python; first-pass accuracy of 92%.</li></ul>
<h2>Education</h2><p>MBA candidate, Example School of Management, 2026</p>`;

function html(css: string, inner: string) {
  return `<html><head><meta charset="utf-8"><style>body{font-family:Georgia,serif;font-size:12px;margin:40px} ${css}</style></head><body>${inner}</body></html>`;
}

type Fx = Record<string, Buffer>;
const fx: Fx = {};

test.beforeAll(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pdf = async (h: string) => {
    await page.setContent(h);
    return Buffer.from(await page.pdf({ format: "Letter" }));
  };
  fx.text = await pdf(html("", BODY));
  fx.twoColumn = await pdf(html(".c{column-count:2;column-gap:30px}", `<div class="c">${BODY}${BODY}</div>`));
  fx.ligatures = await pdf(
    html(
      "body{font-family:'Hoefler Text',Baskerville,serif;font-variant-ligatures:common-ligatures discretionary-ligatures}",
      `${BODY}<p>Office efficiency, affiliate fiscal workflow.</p>`,
    ),
  );
  fx.unicode = await pdf(html("", BODY.replace("Jordan Q. Testcase", "Jöse Ñúñez-Testcase 李测试")));
  let roles = "";
  for (let i = 0; i < 400; i++) {
    roles += `<h3>Role ${i + 1}: Example Manager at Placeholder Corp ${i}</h3><ul><li>Delivered project ${i} across five teams with measurable impact, up 12%.</li></ul>`;
  }
  fx.long = await pdf(html("", BODY + roles));
  await page.setViewportSize({ width: 850, height: 1100 });
  await page.setContent(html("", BODY));
  fx.png = Buffer.from(await page.screenshot({ type: "png" }));
  fx.jpg = Buffer.from(await page.screenshot({ type: "jpeg" }));
  await browser.close();

  const scan = await PDFDocument.create();
  const img = await scan.embedPng(fx.png);
  scan.addPage([612, 792]).drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
  fx.scanned = Buffer.from(await scan.save());

  // A real text PDF padded with an incompressible attachment to hit a size.
  const padded = async (target: number) => {
    const doc = await PDFDocument.load(fx.text);
    const base = (await doc.save()).length;
    const pad = randomBytes(target - base - 4096);
    await doc.attach(pad, "pad.bin", { mimeType: "application/octet-stream" });
    return Buffer.from(await doc.save({ useObjectStreams: false }));
  };
  fx.under10 = await padded(10 * MB - 64 * 1024);
  fx.over10 = await padded(10 * MB + 64 * 1024);
  fx.corrupt = fx.text.subarray(0, Math.floor(fx.text.length / 3));
  fx.garbage = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(4000, 7)]);

  for (const name of ["encrypted-user-pw.pdf", "owner-restricted.pdf", "resume.docx", "resume.doc", "resume.rtf"]) {
    fx[name] = readFileSync(join(FIXTURES, name));
  }
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  // WebKit can hydrate after the first fill and wipe it; fill until it sticks.
  const email = page.locator('input[type="email"]');
  await expect(async () => {
    await email.fill(EMAIL);
    await expect(email).toHaveValue(EMAIL, { timeout: 500 });
  }).toPass({ timeout: 15_000 });
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

function upload(request: APIRequestContext, name: string, buffer: Buffer, mimeType: string) {
  // A FormData File, so an empty MIME type is sent as-is (the way some
  // browsers send a .pdf they cannot classify).
  const form = new FormData();
  form.append("file", new File([new Uint8Array(buffer)], name, { type: mimeType }));
  return request.post("/api/interview/upload-resume", { multipart: form, timeout: 60_000 });
}

async function openResumeStep(page: Page) {
  await page.goto("/practice/interviews/general");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Bring your resume into the room" })).toBeVisible();
}

const dropzone = (page: Page) => page.locator('input[type="file"]').first();
// The step's own inline message, not the HeroUI toast (also role="alert").
const alert = (page: Page) => page.locator('p[role="alert"]');

test.describe("resume upload route", () => {
  test("accepts every real PDF, whatever the browser calls it", async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page);
    const accepted: [string, Buffer, string, string][] = [
      // name, bytes, declared MIME, a phrase the text must carry
      ["text.pdf", fx.text, "application/pdf", "reduced cycle time by 18%"],
      ["text.pdf", fx.text, "application/octet-stream", "first-pass accuracy of 92%"],
      ["RESUME FINAL.PDF", fx.text, "", "Fictional Widgets Inc."],
      ["Résumé Jordan – final 🚀 (v2).pdf", fx.text, "application/pdf", "Product Analyst"],
      ["two-column.pdf", fx.twoColumn, "application/pdf", "Example School of Management"],
      ["ligatures.pdf", fx.ligatures, "application/pdf", "efficient office workflow"],
      ["unicode.pdf", fx.unicode, "application/pdf", "Jöse Ñúñez-Testcase 李测试"],
      ["owner-restricted.pdf", fx["owner-restricted.pdf"], "application/pdf", "reduced cycle time by 18%"],
      ["just-under-10mb.pdf", fx.under10, "application/pdf", "Jordan Q. Testcase"],
    ];
    for (const [name, buffer, mime, phrase] of accepted) {
      const res = await upload(page.request, name, buffer, mime);
      const body = await res.json();
      expect(res.status(), `${name} as "${mime}": ${body.error}`).toBe(201);
      expect(body.resumeId).toMatch(/^[0-9a-f-]{36}$/);
      expect(body.resumeText, name).toContain(phrase);
      // Lines stay apart: the name is not glued onto the email line.
      expect(body.resumeText, name).not.toMatch(/Testcasejordan/);
    }

    const long = await upload(page.request, "long.pdf", fx.long, "application/pdf");
    const longBody = await long.json();
    expect(long.status()).toBe(201);
    expect(longBody.resumeText.length).toBeGreaterThan(40_000);
    expect(longBody.resumeText).toContain("Role 400:");
  });

  test("rejects other files with a reason the student can act on", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page);
    const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const rejected: [string, Buffer, string, number, RegExp][] = [
      ["scanned.pdf", fx.scanned, "application/pdf", 422, /scan or photo/],
      ["locked.pdf", fx["encrypted-user-pw.pdf"], "application/pdf", 422, /password-protected/],
      ["corrupt.pdf", fx.corrupt, "application/pdf", 422, /may be damaged/],
      ["garbage.pdf", fx.garbage, "application/pdf", 422, /may be damaged/],
      ["photo-renamed.pdf", fx.png, "application/pdf", 400, /not a valid PDF/],
      ["empty.pdf", Buffer.alloc(0), "application/pdf", 400, /empty/],
      ["just-over-10mb.pdf", fx.over10, "application/pdf", 400, /10MB/],
      ["resume.docx", fx["resume.docx"], docx, 400, /Only PDF resumes/],
      ["resume.doc", fx["resume.doc"], "application/msword", 400, /Only PDF resumes/],
      ["resume.rtf", fx["resume.rtf"], "application/rtf", 400, /Only PDF resumes/],
      ["resume.txt", Buffer.from("Jordan Q. Testcase\n"), "text/plain", 400, /Only PDF resumes/],
      ["resume.pages", Buffer.from("PK\u0003\u0004pages"), "application/octet-stream", 400, /Only PDF resumes/],
      ["photo.png", fx.png, "image/png", 400, /Only PDF resumes/],
      ["photo.jpg", fx.jpg, "image/jpeg", 400, /Only PDF resumes/],
    ];
    for (const [name, buffer, mime, status, message] of rejected) {
      const res = await upload(page.request, name, buffer, mime);
      const body = await res.json();
      expect(res.status(), name).toBe(status);
      expect(body.error, name).toMatch(message);
    }
  });

  test("signed out never reaches the parser", async ({ playwright, baseURL }) => {
    // Middleware answers a cookieless API call with a redirect to /login
    // (not a 401); the route itself is never invoked.
    const anon = await playwright.request.newContext({ baseURL });
    const res = await anon.post("/api/interview/upload-resume", {
      multipart: { file: { name: "text.pdf", mimeType: "application/pdf", buffer: fx.text } },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toMatch(/\/login$/);
    await anon.dispose();
  });
});

test.describe("resume step", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await openResumeStep(page);
  });

  test("a failed upload stays visible and the student can retry, replace and remove", async ({ page, browserName }) => {
    test.setTimeout(120_000);
    const shot = (name: string) => `${SHOTS}/resume-${name}-${browserName}`;

    // A scan: the reason stays on the page after the toast fades.
    await dropzone(page).setInputFiles({ name: "scanned resume.pdf", mimeType: "application/pdf", buffer: fx.scanned });
    await expect(alert(page)).toContainText("scan or photo");
    await page.waitForTimeout(7000);
    await expect(alert(page)).toContainText("scan or photo");
    await page.screenshot({ path: `${shot("error")}-1440.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await alert(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shot("error")}-375.png` });
    await page.setViewportSize({ width: 1440, height: 900 });

    // Retry with a real PDF the browser reports with no MIME type.
    await dropzone(page).setInputFiles({ name: "Résumé Jordan – final 🚀.PDF", mimeType: "", buffer: fx.text });
    await expect(page.getByText("Parsed and ready for this interview.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Résumé Jordan – final 🚀.PDF")).toBeVisible();
    await expect(alert(page)).toHaveCount(0);
    await page.screenshot({ path: `${shot("ready")}-1440.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Remove" }).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shot("ready")}-375.png` });
    await page.setViewportSize({ width: 1440, height: 900 });

    // Replace in place.
    await page.locator('input[type="file"]').first().setInputFiles({ name: "two-column.pdf", mimeType: "application/pdf", buffer: fx.twoColumn });
    await expect(page.getByText("two-column.pdf")).toBeVisible({ timeout: 30_000 });

    // Back and forward keep the attached file.
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("two-column.pdf")).toBeVisible();

    // Remove brings the picker back.
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Upload a PDF resume")).toBeVisible();
  });

  test("client checks match the server and name the problem", async ({ page }) => {
    await dropzone(page).setInputFiles({
      name: "resume.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: fx["resume.docx"],
    });
    await expect(alert(page)).toContainText("Choose a PDF");
    await dropzone(page).setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer: fx.over10 });
    await expect(alert(page)).toContainText("10 MB or smaller");
    await dropzone(page).setInputFiles({ name: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) });
    await expect(alert(page)).toContainText("empty");
  });

  test("platform errors without JSON still say what happened", async ({ page }) => {
    const cases: [number, string, RegExp][] = [
      [413, "Request Entity Too Large", /too large to upload/],
      [401, "", /sign-in has expired/],
      [504, "<html>An error occurred</html>", /took too long/],
    ];
    for (const [status, body, message] of cases) {
      await page.route("**/api/interview/upload-resume", (route) =>
        route.fulfill({ status, contentType: "text/html", body }),
      );
      await dropzone(page).setInputFiles({ name: "text.pdf", mimeType: "application/pdf", buffer: fx.text });
      await expect(alert(page)).toContainText(message);
      await page.unroute("**/api/interview/upload-resume");
    }
    await page.screenshot({ path: `${SHOTS}/resume-error-413-1440.png`, fullPage: true });
  });

  test("an expired sign-in says so instead of blaming the file", async ({ page }) => {
    await page.context().clearCookies();
    await dropzone(page).setInputFiles({ name: "text.pdf", mimeType: "application/pdf", buffer: fx.text });
    await expect(alert(page)).toContainText("sign-in has expired");
  });

  test("Skip and Back wait while a PDF is being read", async ({ page }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/interview/upload-resume", async (route) => {
      await gate;
      await route.continue();
    });
    await dropzone(page).setInputFiles({ name: "text.pdf", mimeType: "application/pdf", buffer: fx.text });
    await expect(page.getByText("Reading your PDF…")).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip for now" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Back" })).toBeDisabled();
    release();
    await expect(page.getByText("Parsed and ready for this interview.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Skip for now" })).toBeEnabled();
  });
});

test("the extracted text reaches session setup", async ({ baseURL }) => {
  test.setTimeout(120_000);
  // Its own Chromium with a fake camera, since the wizard ends in a camera step.
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const context = await browser.newContext({ baseURL, permissions: ["camera", "microphone"], viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await signIn(page);
  await openResumeStep(page);
  await dropzone(page).setInputFiles({ name: "text.pdf", mimeType: "application/pdf", buffer: fx.text });
  await expect(page.getByText("Parsed and ready for this interview.")).toBeVisible({ timeout: 30_000 });

  // Stop at the session-start request: no avatar or model call is made.
  let startBody: Record<string, unknown> | null = null;
  await page.route("**/api/practice/session/start", async (route) => {
    startBody = route.request().postDataJSON();
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"stopped by test"}' });
  });
  for (let i = 0; i < 10 && !startBody; i++) {
    const next = page.getByRole("button", { name: /^(Continue.*|Skip for now|Start.*|Begin.*|Enter.*)$/ }).last();
    if (await next.isVisible().catch(() => false)) {
      if (await next.isDisabled()) {
        const box = page.getByRole("checkbox").first();
        if (await box.isVisible().catch(() => false)) await box.check();
      }
      await next.click({ timeout: 10_000 }).catch(() => {});
    }
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${SHOTS}/resume-session-start-1440.png` });
  await expect.poll(() => startBody, { timeout: 20_000 }).not.toBeNull();
  const sent = startBody as unknown as { resumeId: string; resumeText: string };
  expect(sent.resumeId).toMatch(/^[0-9a-f-]{36}$/);
  expect(sent.resumeText).toContain("reduced cycle time by 18%");
  await browser.close();
});
