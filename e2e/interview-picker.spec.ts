import { expect, test, type Page } from "@playwright/test";

// Interview picker: entry (general vs industry-specific) → specialized list →
// customization page → setup wizard. Early-career is folded away but resolves.
// Screenshots go to screenshots/ (repo root), NOT test-results/: Playwright
// empties test-results/ at the start of every run.
const SHOTS = "screenshots/interview-picker";
const STUDENT = { email: "student@case.edu", password: "student123" };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(STUDENT.email);
  await page.locator('input[type="password"]').fill(STUDENT.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });

for (const viewport of [
  { name: "1440", width: 1440, height: 900, tall: 1700 },
  { name: "375", width: 375, height: 812, tall: 3000 },
]) {
  test(`screenshots of each picker page at ${viewport.name}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await signIn(page);
    // The app shell scrolls an inner column, so full-page captures stop at the
    // viewport; a tall viewport shows each page whole.
    await page.setViewportSize({ width: viewport.width, height: viewport.tall });

    await page.goto("/practice/interviews");
    await expect(page.getByRole("heading", { name: "General interview" })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("heading", { name: "Industry-specific interview" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/entry-${viewport.name}.png`, fullPage: true });

    await page.goto("/practice/interviews/industry-specific");
    await expect(page.getByRole("list", { name: "Industry-specific interviews" })).toBeVisible({ timeout: 45_000 });
    await page.locator('[data-interview="technical"] summary').click();
    await page.screenshot({ path: `${SHOTS}/industry-${viewport.name}.png`, fullPage: true });

    await page.goto("/practice/interviews/customize/consulting");
    await expect(page.getByRole("heading", { name: "Your interviewer" })).toBeVisible({ timeout: 45_000 });
    await page.screenshot({ path: `${SHOTS}/customize-${viewport.name}.png`, fullPage: true });

    // No horizontal page scroll at any width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("entry → General starts the general setup with preset defaults", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/practice/interviews");
  await page.getByRole("link", { name: "Start general interview" }).click();
  await page.waitForURL("**/practice/interviews/general", { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "General Interview" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("20 min", { exact: true })).toBeVisible();
});

test("General → Customize first → change length → setting carries into setup", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/practice/interviews");
  await page.getByRole("link", { name: "Customize first" }).click();
  await page.waitForURL("**/practice/interviews/customize/general");
  await page.locator('[data-choice-group="length"]').getByRole("radio", { name: /Extended/ }).click();
  await expect(page).toHaveURL(/length=extended/);
  await page.getByRole("button", { name: "Continue to setup" }).click();
  await page.waitForURL("**/practice/interviews/general", { timeout: 45_000 });
  await expect(page.getByText("30 min", { exact: true })).toBeVisible({ timeout: 45_000 });

  // Back returns to the customize page with the choice restored from the URL.
  await page.goBack();
  await page.waitForURL(/customize\/general\?length=extended/);
  await expect(
    page.locator('[data-choice-group="length"]').getByRole("radio", { name: /Extended/ }),
  ).toHaveAttribute("aria-checked", "true");
});

test("industry-specific: every listed card opens, customizes and carries into setup", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);

  await page.goto("/practice/interviews");
  await page.getByRole("link", { name: /Choose an interview/ }).click();
  await page.waitForURL("**/practice/interviews/industry-specific");

  const list = page.getByRole("list", { name: "Industry-specific interviews" });
  await expect(list).toBeVisible({ timeout: 45_000 });
  await expect(list.getByText(/Early-Career/i)).toHaveCount(0);
  await expect(page.locator('[data-interview="general"]')).toHaveCount(0);

  const keys = await page.locator("[data-interview]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-interview") ?? ""),
  );
  expect(keys).toContain("technical-coding");
  expect(keys).not.toContain("early-career");

  for (const key of keys) {
    await page.goto("/practice/interviews/industry-specific");
    const card = page.locator(`[data-interview="${key}"]`);
    await card.getByRole("link").click();

    if (key === "technical-coding") {
      await page.waitForURL((url) => url.pathname === "/practice/interviews/technical", { timeout: 45_000 });
      await expect(page.getByRole("heading", { name: "Coding interview room" })).toBeVisible({ timeout: 45_000 });
      continue;
    }

    await page.waitForURL(`**/practice/interviews/customize/${key}`, { timeout: 45_000 });
    // Keyboard: arrow keys move through the difficulty radios.
    const difficulty = page.locator('[data-choice-group="difficulty"]');
    await difficulty.locator('[aria-checked="true"]').focus();
    await page.keyboard.press("ArrowRight");
    await expect(difficulty.locator('[aria-checked="true"]')).toBeFocused();

    // Problem interviews hide lengths shorter than their own target: one
    // problem needs the full time. Most pick Extended. system-design's target
    // (35m) is longer than EVERY named preset, so its only tile is "Interview
    // default", which carries the type's own target — asserted deterministically
    // in scripts/verify-session-length-choices.ts. Derive the expectation from
    // the tiles actually rendered instead of assuming Extended exists.
    const lengths = page.locator('[data-choice-group="length"]');
    const quick = lengths.getByRole("radio", { name: /Quick/ });
    const extended = lengths.getByRole("radio", { name: /Extended/ });
    const interviewDefault = lengths.getByRole("radio", { name: /Interview default/ });
    let chosen = quick;
    let expectedMinutes = "10 min";
    if ((await quick.count()) === 0) {
      if ((await extended.count()) > 0) {
        chosen = extended;
        expectedMinutes = "30 min";
      } else {
        // Only the interview's own default is on offer; read its minutes from
        // the tile hint (`~35 min`) so this keeps working if a target changes.
        chosen = interviewDefault;
        const hint = (await interviewDefault.textContent()) ?? "";
        const match = hint.match(/~?(\d+)\s*min/);
        expect(match, `no minutes in the Interview default tile: ${hint}`).not.toBeNull();
        expectedMinutes = `${match![1]} min`;
      }
    }
    await chosen.click();
    await page.getByRole("button", { name: "Continue to setup" }).click();
    await page.waitForURL((url) => url.pathname.startsWith("/practice/interviews/") && !url.pathname.includes("customize"), {
      timeout: 45_000,
    });
    const stored = await page.evaluate((slug) => sessionStorage.getItem(`interview:customization:${slug}`), key);
    expect(stored).toBeNull(); // read once and cleared by the wizard
    await expect(page.getByText(expectedMinutes, { exact: true })).toBeVisible({ timeout: 45_000 });
  }
});

test("early-career is folded away but its URL still loads", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/practice/interviews");
  await expect(page.getByText(/Early-Career/i)).toHaveCount(0);
  await page.goto("/practice/interviews/early-career");
  await expect(page.getByRole("heading", { name: "Early-Career / Internship Interview" })).toBeVisible({ timeout: 45_000 });
  await page.screenshot({ path: `${SHOTS}/early-career-still-loads.png`, fullPage: true });
});

/**
 * Walk the setup wizard to the camera step and capture the session-start
 * body WITHOUT starting a session (the request is aborted: no report row,
 * no avatar, no model calls).
 */
async function captureStartBody(page: Page): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/practice/session/start", async (route) => {
    body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.abort();
  });
  await page.locator("button[aria-pressed]").first().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: /Continue to camera setup/ }).click();
  await page.getByRole("button", { name: /Camera off/ }).click();
  await expect.poll(() => body !== null, { timeout: 30_000 }).toBe(true);
  return body!;
}

test("question type: Surprise me is the default and sends no family", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/practice/interviews/customize/consulting");
  const group = page.locator('[data-choice-group="family"]');
  await expect(group).toBeVisible({ timeout: 45_000 });
  const tiles = await group.getByRole("radio").allInnerTexts();
  expect(tiles[0]).toContain("Surprise me");
  expect(tiles.join(" ")).toMatch(/Business case[\s\S]*Estimation[\s\S]*Brainteaser/);
  await expect(group.getByRole("radio", { name: /Surprise me/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Continue to setup" }).click();
  await page.waitForURL("**/practice/interviews/consulting", { timeout: 45_000 });
  const body = await captureStartBody(page);
  expect(body.problemFamily).toBeUndefined();
  expect((body.customization as Record<string, unknown> | undefined)?.problemFamily).toBeUndefined();
});

test("question type: a chosen family persists in the URL and reaches session start", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/practice/interviews/customize/product-management");
  const group = page.locator('[data-choice-group="family"]');
  await expect(group).toBeVisible({ timeout: 45_000 });
  await group.getByRole("radio", { name: /Metrics/ }).click();
  await expect(page).toHaveURL(/family=metrics-execution/);
  await page.locator('[aria-labelledby="customize-problem"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/customize-question-type-1440.png` });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('[aria-labelledby="customize-problem"]').scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/customize-question-type-375.png` });
  await page.setViewportSize({ width: 1440, height: 900 });

  // Back from the wizard restores the choice from the query string.
  await page.getByRole("button", { name: "Continue to setup" }).click();
  await page.waitForURL("**/practice/interviews/product-management", { timeout: 45_000 });
  await page.goBack();
  await page.waitForURL(/customize\/product-management\?family=metrics-execution/);
  await expect(group.getByRole("radio", { name: /Metrics/ })).toHaveAttribute("aria-checked", "true", { timeout: 45_000 });

  await page.getByRole("button", { name: "Continue to setup" }).click();
  await page.waitForURL("**/practice/interviews/product-management", { timeout: 45_000 });
  const body = await captureStartBody(page);
  expect(body.problemFamily).toBe("metrics-execution");
});

test("question type: not offered on non-problem interviews", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/practice/interviews/customize/general");
  await expect(page.getByRole("heading", { name: "Your interviewer" })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('[data-choice-group="family"]')).toHaveCount(0);
});
