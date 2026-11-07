import { expect, test, type Page } from "@playwright/test";

// Interview picker: entry (general vs industry-specific) → specialized list →
// customization page → setup wizard. Early-career is folded away but resolves.
const SHOTS = "test-results/interview-picker";
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

    // Problem interviews (case, PM, ...) hide lengths shorter than their own
    // target: one problem needs the full time. Those pick Extended instead.
    const lengths = page.locator('[data-choice-group="length"]');
    const quick = lengths.getByRole("radio", { name: /Quick/ });
    const expectedMinutes = (await quick.count()) > 0 ? "10 min" : "30 min";
    await (expectedMinutes === "10 min" ? quick : lengths.getByRole("radio", { name: /Extended/ })).click();
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
