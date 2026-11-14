import { expect, test, type Page } from "@playwright/test";

/**
 * Client tweaks 2026-11-14: "personalized" headline + green record button.
 * Run: E2E_BASE_URL=http://localhost:3111 npx playwright test e2e/record-button.spec.ts
 */
const SHOTS = "/Users/ajabreu79/projects/leadership-avatar-wt/screenshots-2026-11-14/loop-tweaks-ui";

async function shotLocator(page: Page, testId: string, name: string) {
  await page.getByTestId(testId).screenshot({ path: `${SHOTS}/${name}.png`, animations: "disabled" });
}

test("practice headline says personalized", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("student@case.edu");
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  await page.goto("/practice");
  const em = page.locator("header p em", { hasText: "personalized" });
  await expect(em).toBeVisible();
  await expect(page.locator("header p").first()).toHaveText(
    "Each session is a personalized live conversation with an AI avatar, followed by a scored report.",
  );
  await page.screenshot({ path: `${SHOTS}/headline-practice.png`, clip: { x: 0, y: 0, width: 1440, height: 260 } });
});

test("record button variants", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/test-pages/record-button");
  await expect(page.getByText("Record button states")).toBeVisible();
  // No crossed-out mic on any new recording state; buttons use the success (green) fill.
  const sessionBar = page.getByTestId("session-bar");
  await expect(sessionBar.getByRole("button", { name: "Stop recording and send answer" })).toHaveCount(3);
  const bg = await sessionBar
    .getByRole("button", { name: "Stop recording and send answer" })
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgb(55, 126, 114)");
  await shotLocator(page, "session-bar", "record-session-bar");
  await shotLocator(page, "floating", "record-floating");
  await shotLocator(page, "kiosk", "record-kiosk");
  await page.screenshot({ path: `${SHOTS}/record-all.png`, fullPage: true, animations: "disabled" });
});
