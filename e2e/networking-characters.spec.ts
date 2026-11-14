import { expect, test, type Page } from "@playwright/test";

/**
 * The networking picker shows the widened character set, filters it by field,
 * and a new character carries through the goal step to the next setup step.
 * Avatar streams and chat are blocked; nothing is spent.
 */

const SHOTS =
  "/Users/ajabreu79/projects/leadership-avatar-wt/screenshots-2026-11-14/loop-networking-expand";
const STUDENT = { email: "student@case.edu", password: "student123" };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(STUDENT.email);
  await page.locator('input[type="password"]').fill(STUDENT.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/avatar/**", (route) => route.abort());
  await page.route("**/api/interaction/chat", (route) => route.abort());
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
});

test("picker shows new people, filters by field, and starts one", async ({ page }) => {
  await page.goto("/practice/networking");
  await expect(page.getByRole("heading", { name: "Who are you meeting?" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /Pick someone to practice with/ }).click();

  const filters = page.getByRole("radiogroup", { name: "Filter by field" });
  await expect(filters).toBeVisible();
  for (const label of ["All", "Business", "Health care", "Engineering & tech", "Public & nonprofit"]) {
    await expect(filters.getByRole("radio", { name: label, exact: true })).toBeVisible();
  }
  for (const name of [
    "Samuel Adeyemi",
    "Rosa Delgado",
    "Tomasz Kowalski",
    "Harold Brennan",
    "Keisha Robinson",
    "Priya Malhotra",
  ]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await page.screenshot({ path: `${SHOTS}/picker-all.png`, fullPage: true });

  await filters.getByRole("radio", { name: "Health care", exact: true }).click();
  await expect(filters.getByRole("radio", { name: "Health care" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("heading", { name: "Rosa Delgado", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Priya Malhotra", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/picker-health.png`, fullPage: true });

  await page.getByRole("button", { name: /Rosa Delgado/ }).click();
  await expect(page.getByRole("button", { name: /Rosa Delgado/ })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: `${SHOTS}/picker-health-selected.png`, fullPage: true });

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: /What do you want from this conversation/ })).toBeVisible();
  await page.getByLabel("Your networking goal").fill("A chance to shadow a clinic day");
  await page.screenshot({ path: `${SHOTS}/goal-step.png`, fullPage: true });
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // Next step is the shared face/voice (customize) step; Rosa carries through.
  await expect(page.getByRole("heading", { name: "Who are you meeting?" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /What do you want from this conversation/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Choose a face and voice." })).toBeVisible();
  await expect(page.getByText("Plays Rosa Delgado · Live session").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/customize-step.png`, fullPage: true });
});

test("picker at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/practice/networking");
  await page.getByRole("button", { name: /Pick someone to practice with/ }).click();
  await page.getByRole("radio", { name: "Engineering & tech", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tomasz Kowalski", exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: `${SHOTS}/picker-phone-engineering.png`, fullPage: true });
});
