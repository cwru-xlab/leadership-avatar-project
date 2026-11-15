import { expect, test, type Page } from "@playwright/test";

/**
 * Client tweaks 2026-11-14: "personalized" headline + green record button.
 * Run: E2E_BASE_URL=http://localhost:3111 npx playwright test e2e/record-button.spec.ts
 */
const SHOTS = "/Users/ajabreu79/projects/leadership-avatar-wt/screenshots-2026-11-14/loop-tweaks-ui";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test("practice headline says personalized", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "student@case.edu", "student123");
  await page.goto("/practice");
  const em = page.locator("header p em", { hasText: "personalized" });
  await expect(em).toBeVisible();
  await expect(page.locator("header p").first()).toHaveText(
    "Each session is a personalized live conversation with an AI avatar, followed by a scored report.",
  );
  await page.screenshot({ path: `${SHOTS}/headline-practice.png`, clip: { x: 0, y: 0, width: 1440, height: 260 } });
});
