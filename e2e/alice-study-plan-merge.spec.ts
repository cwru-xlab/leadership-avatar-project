import { expect, test, type Page } from "@playwright/test";

const EMAIL = "alice.johnson@case.edu";
const PASSWORD = "student123";

async function signInAsAlice(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 20_000,
  });
}

test.describe("Alice student merge smoke", () => {
  test("signs in and reaches Weatherhead reports plus study-plan hubs", async ({
    page,
  }) => {
    await signInAsAlice(page);

    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "My Reports" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Build a self-paced study plan" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Practice reports" }),
    ).toBeVisible();

    const viewPlan = page.getByRole("button", { name: "View plan" }).first();
    if (await viewPlan.isVisible().catch(() => false)) {
      await viewPlan.click();
      await expect(page).toHaveURL(/\/study-plans\/[0-9a-f-]+$/i);
      await expect(page.getByRole("heading").first()).toBeVisible();
    }

    await page.goto("/study-plans");
    await expect(
      page.getByRole("heading", { name: "Study Plans", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Build a self-paced study plan" }),
    ).toBeVisible();

    await page.goto("/paths");
    await expect(page.getByRole("heading", { name: "Paths" })).toBeVisible();

    await page.goto("/mastery");
    await expect(page.getByRole("heading", { name: "Mastery" })).toBeVisible();
  });
});
