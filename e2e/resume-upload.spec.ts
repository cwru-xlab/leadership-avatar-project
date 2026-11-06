import { chromium, expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
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
 * private PDF in S3 for that test account (or, for a PDF over 4 MB, its text).
 *
 * PDFs over 4 MB are read in the browser and only their text is posted, since
 * Vercel rejects request bodies over 4.5 MB. The "large PDF" tests check that
 * the text arrives whole and that the PDF bytes never leave the browser.
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

  // A real PDF padded with an incompressible attachment to hit a size. The
  // attachment carries no page text, so the text is the base PDF's.
  const padded = async (target: number, base: Buffer = fx.text) => {
    const doc = await PDFDocument.load(base);
    const baseSize = (await doc.save()).length;
    const pad = randomBytes(target - baseSize - 4096);
    await doc.attach(pad, "pad.bin", { mimeType: "application/octet-stream" });
    return Buffer.from(await doc.save({ useObjectStreams: false }));
  };
  fx.under10 = await padded(10 * MB - 64 * 1024);
  fx.over10 = await padded(10 * MB + 64 * 1024);
  fx.large6 = await padded(6 * MB);
  fx.large9 = await padded(9.5 * MB, fx.unicode);
  fx.largeLong = await padded(5 * MB, fx.long);
  fx.largeScanned = await padded(5 * MB, fx.scanned);
  fx.largeFake = Buffer.concat([fx.png, randomBytes(5 * MB)]);
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

  test("a large PDF's text arrives through the text-only path", async ({ page }) => {
    await signIn(page);
    const post = (data: unknown, path = "/api/interview/upload-resume") =>
      page.request.post(path, { data, timeout: 60_000 });
    const ok = await post({ text: "Jordan  Q.   Testcase \n\n\n\nreduced cycle time by 18%\u0000", fileName: "Big résumé.PDF", fileSize: 6 * MB });
    const okBody = await ok.json();
    expect(ok.status(), okBody.error).toBe(201);
    expect(okBody.resumeId).toMatch(/^[0-9a-f-]{36}$/);
    // Cleaned exactly as server-extracted text is.
    expect(okBody.resumeText).toBe("Jordan Q. Testcase\n\nreduced cycle time by 18%");

    const jd = await post(
      { text: "Senior Analyst\nOwn the forecasting roadmap.", fileName: "posting.pdf", fileSize: 7 * MB },
      "/api/interview/upload-job-description",
    );
    const jdBody = await jd.json();
    expect(jd.status(), jdBody.error).toBe(201);
    expect(jdBody.jobDescriptionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(jdBody.jobDescriptionText).toBe("Senior Analyst\nOwn the forecasting roadmap.");

    const rejected: [string, unknown, number, RegExp][] = [
      ["scan", { text: " \n\t ", fileName: "a.pdf", fileSize: 5 * MB }, 422, /scan or photo/],
      ["not a PDF", { text: "x", fileName: "a.docx", fileSize: 5 * MB }, 400, /Only PDF/],
      ["over 10 MB", { text: "x", fileName: "a.pdf", fileSize: 10 * MB + 1 }, 400, /10MB/],
      ["no size", { text: "x", fileName: "a.pdf" }, 400, /empty/],
      ["text not a string", { text: 42, fileName: "a.pdf", fileSize: 5 * MB }, 400, /must be provided/],
      ["too much text", { text: "word ".repeat(50_000), fileName: "a.pdf", fileSize: 5 * MB }, 413, /more text/],
      ["body over the cap", { text: "x".repeat(2.5 * MB), fileName: "a.pdf", fileSize: 5 * MB }, 413, /more text/],
    ];
    for (const [name, data, status, message] of rejected) {
      const res = await post(data);
      const body = await res.json();
      expect(res.status(), name).toBe(status);
      expect(body.error, name).toMatch(message);
    }
  });

  test("signed out gets a 401, never a redirect, and never reaches the parser", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL });
    const unauthorized = async (res: APIResponse, name: string) => {
      expect(res.status(), name).toBe(401);
      expect(res.headers().location, name).toBeUndefined();
      expect((await res.json()).error, name).toBe("Sign in to continue.");
    };
    await unauthorized(
      await anon.post("/api/interview/upload-resume", {
        multipart: { file: { name: "text.pdf", mimeType: "application/pdf", buffer: fx.text } },
        maxRedirects: 0,
      }),
      "PDF upload",
    );
    await unauthorized(
      await anon.post("/api/interview/upload-resume", {
        data: { text: "Jordan", fileName: "big.pdf", fileSize: 6 * MB },
        maxRedirects: 0,
      }),
      "text upload",
    );
    await unauthorized(
      await anon.post("/api/interview/upload-job-description", {
        data: { text: "Posting", fileName: "big.pdf", fileSize: 6 * MB },
        maxRedirects: 0,
      }),
      "job posting text upload",
    );
    await unauthorized(await anon.get("/api/practice/reports", { maxRedirects: 0 }), "reports API");

    // Pages still redirect to sign-in and come back.
    const pageRes = await anon.get("/practice/interviews/general?x=1", { maxRedirects: 0 });
    expect(pageRes.status()).toBe(307);
    expect(pageRes.headers().location).toBe("/login?returnTo=%2Fpractice%2Finterviews%2Fgeneral%3Fx%3D1");

    // Public routes stay public: the route answers, not middleware.
    expect((await anon.get("/login", { maxRedirects: 0 })).status()).toBe(200);
    const me = await anon.get("/api/auth/me", { maxRedirects: 0 });
    expect(me.status()).toBe(401);
    expect((await me.json()).error).toBe("Unauthorized");
    await anon.dispose();

    // An invalid token gets the same 401 and is cleared.
    const forged = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { cookie: "auth-token=not-a-real-token" },
    });
    const bad = await forged.get("/api/practice/reports", { maxRedirects: 0 });
    await unauthorized(bad, "invalid token");
    expect(bad.headers()["set-cookie"] ?? "").toMatch(/auth-token=;/);
    await forged.dispose();
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

  test("an expired sign-in says so and leads back to sign-in", async ({ page }) => {
    await page.context().clearCookies();
    await dropzone(page).setInputFiles({ name: "text.pdf", mimeType: "application/pdf", buffer: fx.text });
    await expect(alert(page)).toContainText("sign-in has expired");
    // The large-file path says the same.
    await dropzone(page).setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer: fx.large6 });
    await expect(alert(page)).toContainText("sign-in has expired", { timeout: 30_000 });
    const link = alert(page).getByRole("link", { name: "Sign in again" });
    await expect(link).toHaveAttribute("href", "/login?error=session_expired&returnTo=%2Fpractice%2Finterviews%2Fgeneral");
    await page.screenshot({ path: `${SHOTS}/resume-signed-out-1440.png`, fullPage: true });
    await link.click();
    await expect(page).toHaveURL(/\/login\?error=session_expired/);
    await expect(page.getByRole("alert").filter({ hasText: "Your sign-in expired" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/resume-signed-out-login-1440.png` });
  });

  test("a large PDF is read here and only its text is sent", async ({ page, browserName }) => {
    test.setTimeout(180_000);
    const sent: { contentType: string; bytes: number; body: string }[] = [];
    page.on("request", (req) => {
      if (req.url().endsWith("/api/interview/upload-resume")) {
        const body = req.postDataBuffer() ?? Buffer.alloc(0);
        sent.push({ contentType: req.headers()["content-type"] ?? "", bytes: body.length, body: body.toString("utf8") });
      }
    });

    const cases: [string, Buffer, string][] = [
      ["Résumé 6 MB.pdf", fx.large6, "reduced cycle time by 18%"],
      ["unicode 9.5 MB.pdf", fx.large9, "Jöse Ñúñez-Testcase 李测试"],
      ["long 5 MB.pdf", fx.largeLong, "Role 400:"],
    ];
    for (const [name, buffer, phrase] of cases) {
      expect(buffer.length).toBeGreaterThan(4 * MB);
      expect(buffer.length).toBeLessThan(10 * MB);
      sent.length = 0;
      await page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: "application/pdf", buffer });
      await expect(page.getByText(name)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("read on this device and only its text was saved")).toBeVisible();
      expect(sent).toHaveLength(1);
      expect(sent[0].contentType).toContain("application/json");
      expect(sent[0].bytes).toBeLessThan(1 * MB);
      const payload = JSON.parse(sent[0].body) as { text: string; fileName: string; fileSize: number };
      expect(payload.text, name).toContain(phrase);
      expect(payload.fileName).toBe(name);
      expect(payload.fileSize).toBe(buffer.length);
    }
    await page.screenshot({ path: `${SHOTS}/resume-large-ready-${browserName}-1440.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Remove" }).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/resume-large-ready-${browserName}-375.png` });
    await page.setViewportSize({ width: 1440, height: 900 });

    // A small PDF after a large one goes up as the PDF again, notice gone.
    sent.length = 0;
    await page.locator('input[type="file"]').first().setInputFiles({ name: "small.pdf", mimeType: "application/pdf", buffer: fx.text });
    await expect(page.getByText("small.pdf")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("read on this device")).toHaveCount(0);
    expect(sent[0].contentType).toContain("multipart/form-data");
  });

  test("a large scan or non-PDF gets the same message, and nothing is sent", async ({ page, browserName }) => {
    test.setTimeout(120_000);
    let requests = 0;
    page.on("request", (req) => {
      if (req.url().endsWith("/api/interview/upload-resume")) requests += 1;
    });
    await dropzone(page).setInputFiles({ name: "scanned 5 MB.pdf", mimeType: "application/pdf", buffer: fx.largeScanned });
    await expect(alert(page)).toContainText(
      "No readable text was found in that PDF. It looks like a scan or photo. Export your resume from Word, Google Docs or Pages as a PDF, then upload it.",
      { timeout: 60_000 },
    );
    await page.screenshot({ path: `${SHOTS}/resume-large-scan-${browserName}-1440.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await alert(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/resume-large-scan-${browserName}-375.png` });
    await page.setViewportSize({ width: 1440, height: 900 });

    await dropzone(page).setInputFiles({ name: "photo 5 MB.pdf", mimeType: "application/pdf", buffer: fx.largeFake });
    await expect(alert(page)).toContainText("not a valid PDF", { timeout: 30_000 });
    expect(requests).toBe(0);
  });

  test("the job posting step takes a large PDF the same way", async ({ page, browserName }) => {
    test.setTimeout(120_000);
    let contentType = "";
    page.on("request", (req) => {
      if (req.url().endsWith("/api/interview/upload-job-description")) contentType = req.headers()["content-type"] ?? "";
    });
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page.getByRole("heading", { name: "Practice for the actual posting" })).toBeVisible();
    await page.locator('input[type="file"]').first().setInputFiles({ name: "posting 6 MB.pdf", mimeType: "application/pdf", buffer: fx.large6 });
    await expect(page.getByText("posting 6 MB.pdf")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("read on this device and only its text was saved")).toBeVisible();
    expect(contentType).toContain("application/json");
    await page.screenshot({ path: `${SHOTS}/job-posting-large-${browserName}-1440.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.getByText("posting 6 MB.pdf").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/job-posting-large-${browserName}-375.png` });
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.getByRole("button", { name: "Use a different posting" }).click();
    await page.locator('input[type="file"]').first().setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: fx.largeScanned });
    await expect(page.getByText("Upload a text-based job posting PDF.").first()).toBeVisible({ timeout: 60_000 });
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

for (const [label, file, phrase] of [
  ["the extracted text reaches session setup", "text", "reduced cycle time by 18%"],
  ["a large PDF's browser-read text reaches session setup", "large6", "reduced cycle time by 18%"],
] as const) {
  test(label, async ({ baseURL }) => {
    test.setTimeout(150_000);
    // Its own Chromium with a fake camera, since the wizard ends in a camera step.
    const browser = await chromium.launch({
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    });
    const context = await browser.newContext({ baseURL, permissions: ["camera", "microphone"], viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await signIn(page);
    await openResumeStep(page);
    await dropzone(page).setInputFiles({ name: `${file}.pdf`, mimeType: "application/pdf", buffer: fx[file] });
    await expect(page.getByText("Parsed and ready for this interview.")).toBeVisible({ timeout: 60_000 });

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
    await page.screenshot({ path: `${SHOTS}/resume-session-start-${file}-1440.png` });
    await expect.poll(() => startBody, { timeout: 20_000 }).not.toBeNull();
    const sent = startBody as unknown as { resumeId: string; resumeText: string };
    expect(sent.resumeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent.resumeText).toContain(phrase);
    await browser.close();
  });
}
