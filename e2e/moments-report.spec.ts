import { expect, test, type Page } from "@playwright/test";

const SHOTS = ".loop-shots";
const ALICE = { email: "alice.johnson@case.edu", password: "student123" };
const STUDENT = { email: "student@case.edu", password: "student123" };
// Existing test-account reports. General interview with camera and voice.
const INTERVIEW = "2cd23e87-49e4-4d94-a5b3-aeaa048589f5";
// One answer has no transcript line.
const UNMATCHED = "a72071fc-1119-4b96-880c-23ef701dd09d";
// Belongs to student@case.edu, not Alice.
const OTHER_USERS = "ca5f5982-4bae-410c-9cb4-55a258873373";

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(who.email);
  await page.locator('input[type="password"]').fill(who.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function openReport(page: Page, id: string) {
  await page.goto(`/reports/${id}`);
  await expect(page.locator("#moments")).toBeVisible({ timeout: 45_000 });
}

async function headerBoxes(page: Page) {
  return {
    title: await page.locator("h1").boundingBox(),
    // The date line under the title. (" · " also matches the setup panel's
    // "~20 min · 9 questions" row, which is not the header.)
    meta: await page.locator("main").getByText(/\b\d{4}, \d{1,2}:\d\d [AP]M/).first().boundingBox(),
    again: await page.getByRole("button", { name: "Practice again" }).boundingBox(),
  };
}

for (const [name, viewport] of [
  ["1440", { width: 1440, height: 900 }],
  ["375", { width: 375, height: 800 }],
] as const) {
  test.describe(`report at ${name}`, () => {
    test.use({ viewport, hasTouch: true });

    test("session setup floats without moving the header", async ({ page }) => {
      await signIn(page, ALICE);
      await openReport(page, INTERVIEW);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${SHOTS}/setup-resting-${name}.png` });

      const before = await headerBoxes(page);
      const summary = page.locator("summary", { hasText: "Session setup" });
      await summary.click();
      const panel = page.locator("details dl").first();
      await expect(panel).toBeVisible();
      await page.waitForTimeout(250);
      expect(await headerBoxes(page)).toEqual(before);

      await expect(panel).toContainText("General / cross-industry");
      await expect(panel).toContainText("Early-career professional role");
      await expect(panel).not.toContainText("an early-career");

      const box = await panel.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      await page.waitForTimeout(100);
      await page.screenshot({ path: `${SHOTS}/setup-open-${name}.png` });

      // A mouse click leaves no focus box.
      expect(await summary.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");

      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(summary).toBeFocused();

      await summary.click();
      await expect(panel).toBeVisible();
      await page.locator("h1").click();
      await expect(panel).toBeHidden();

      // The keyboard gets a ring and can open it.
      await page.locator("h1").click();
      await page.getByRole("button", { name: "My reports" }).focus();
      await page.keyboard.press("Tab");
      await expect(summary).toBeFocused();
      expect(await summary.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      await page.screenshot({ path: `${SHOTS}/setup-keyboard-focus-${name}.png` });
      await page.keyboard.press("Enter");
      await expect(panel).toBeVisible();
    });

    test("camera moments and excerpts sit on one clock", async ({ page }) => {
      await signIn(page, ALICE);
      const response = page.waitForResponse((r) => r.url().includes(`/api/practice/report/${INTERVIEW}`));
      await openReport(page, INTERVIEW);
      const { report } = await (await response).json();
      const clock = report.moments.clock;
      expect(clock.visualBasis).toBe("opening-line");

      // Every stored episode is drawn, at its shifted time and under its kind.
      const session = report.metrics.visual.coverage.session_seconds;
      const expected = report.metrics.visual.episodes
        .filter((e: { start_s: number }) => e.start_s < session)
        .map((e: { kind: string; start_s: number }) => [e.kind, Math.round(e.start_s + clock.visualShiftS)].join("@"))
        .sort();
      const drawn = await page.locator("[data-moment-kind]").evaluateAll((els) =>
        els.map((el) => `${el.getAttribute("data-moment-kind")}@${el.getAttribute("data-moment-start")}`).sort(),
      );
      expect(drawn).toEqual(expected);

      const moments = page.locator("#moments");
      await moments.scrollIntoViewIfNeeded();

      // Excerpts: on the first answer, then by tap, then by the keyboard stepper.
      const quote = moments.locator("blockquote");
      await expect(quote).toHaveText(`“${report.moments.excerpts[0]}”`);
      await moments.screenshot({ path: `${SHOTS}/moments-resting-${name}.png` });

      await moments.getByRole("button", { name: /^Answer 2 at/ }).tap();
      await expect(quote).toHaveText(`“${report.moments.excerpts[1]}”`);

      await moments.getByRole("button", { name: "Next answer" }).focus();
      await page.keyboard.press("Enter");
      await expect(quote).toHaveText(`“${report.moments.excerpts[2]}”`);

      await moments.getByRole("button", { name: /^Answer 1 at/ }).focus();
      await page.keyboard.press("Enter");
      await expect(quote).toHaveText(`“${report.moments.excerpts[0]}”`);

      await moments.locator("summary").click();
      await expect(moments.getByText(/Between answers|Answer \d/).first()).toBeVisible();
      await moments.screenshot({ path: `${SHOTS}/moments-expanded-${name}.png` });
      await expect(page.locator("body")).toHaveJSProperty("scrollWidth", viewport.width);
    });
  });
}

test("an answer with no transcript line says so", async ({ page }) => {
  await signIn(page, ALICE);
  await openReport(page, UNMATCHED);
  const moments = page.locator("#moments");
  await moments.getByRole("button", { name: /^Answer 1 at/ }).click();
  await expect(moments.getByText("This answer isn't in your saved transcript.")).toBeVisible();
  await expect(moments.locator("blockquote")).toHaveCount(0);
  await moments.scrollIntoViewIfNeeded();
  await moments.screenshot({ path: `${SHOTS}/moments-unmatched-1440.png` });
});

test("legacy states: no transcript, and no recorded setup", async ({ page }) => {
  await signIn(page, ALICE);
  await page.route(`**/api/practice/report/${INTERVIEW}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.report.moments = null;
    delete body.report.metrics.visual.coverage.capture_offset_s;
    for (const key of ["industry", "roleTitle", "difficulty", "targetMinutes", "targetQuestionCount", "interviewerPersona"]) {
      body.report.input[key] = null;
    }
    await route.fulfill({ response, json: body });
  });
  await openReport(page, INTERVIEW);
  await expect(page.getByText("Customization wasn't recorded for this session.")).toBeVisible();
  const moments = page.locator("#moments");
  await expect(moments.locator("blockquote")).toHaveCount(0);
  await expect(moments.getByText("isn't in your saved transcript")).toHaveCount(0);
  await expect(moments.locator("[data-moment-kind]").first()).toBeAttached();
  await moments.getByRole("button", { name: /^Answer 1 at/ }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOTS}/legacy-header-1440.png` });
});

test("a report never exposes another user's data", async ({ page, request, browser }) => {
  // Middleware answers a signed-out API request with 401 before the route runs.
  const anonymous = await request.get(`/api/practice/report/${INTERVIEW}`, { maxRedirects: 0 });
  expect(anonymous.status()).toBe(401);
  expect(await anonymous.text()).not.toContain("excerpts");

  await signIn(page, ALICE);
  const notMine = await page.request.get(`/api/practice/report/${OTHER_USERS}`);
  expect(notMine.status()).toBe(404);
  expect(await notMine.text()).not.toContain("excerpts");

  const mine = await page.request.get(`/api/practice/report/${INTERVIEW}`);
  const raw = await mine.text();
  const { report } = JSON.parse(raw);
  for (const field of ["userId", "transcriptKey", "interactionLogId", "studentEmail"]) {
    expect(report[field]).toBeUndefined();
  }
  expect(Object.keys(report.moments).sort()).toEqual(["clock", "excerpts"]);
  for (const line of Object.values<string>(report.moments.excerpts)) {
    expect(line.length).toBeLessThanOrEqual(90);
  }

  // The list stays free of transcript text and storage reads.
  const list = await page.request.get("/api/practice/report");
  if (list.ok()) expect(await list.text()).not.toContain("excerpts");

  // And the owner of the other report does get it.
  const context = await browser.newContext();
  const theirs = await context.newPage();
  await signIn(theirs, STUDENT);
  const owned = await theirs.request.get(`/api/practice/report/${OTHER_USERS}`);
  expect(owned.status()).toBe(200);
  await context.close();
});
