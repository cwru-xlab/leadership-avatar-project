import { expect, test, type Page } from "@playwright/test";

/**
 * The networking picker shows the widened character set, filters it by field,
 * and a new character carries through the goal step to the next setup step.
 * Avatar streams and chat are blocked; nothing is spent.
 */

const SHOTS =
  "/Users/ajabreu79/projects/leadership-avatar-wt/screenshots-2026-11-14/loop-networking-expand";
const STUDENT = { email: "student@case.edu", password: "student123" };

/** Bring the pre-selected face into view with its image loaded, then capture. */
async function shotSelectedFace(page: Page, name: RegExp, path: string) {
  const card = page.getByRole("button", { name }).first();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 160));
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button[aria-pressed="true"] img')].every(
          (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
        ),
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(500);
  await page.screenshot({ path });
}

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
  // Rosa suggests a female face (Anna): first in the grid, tagged, pre-selected,
  // visible without scrolling, and still changeable.
  await expect(page.getByText("Selected Anna")).toBeVisible();
  const faces = page.locator("section[aria-labelledby='interviewer-heading'] .grid > button");
  const first = faces.first();
  await expect(first).toContainText("Anna");
  await expect(first).toContainText("Suggested");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(first).toBeInViewport();
  await expect(page.getByText("Suggested", { exact: true })).toHaveCount(1);
  await page.waitForFunction(
    () => {
      const img = document.querySelector('button[aria-pressed="true"] img') as HTMLImageElement | null;
      return !img || (img.complete && img.naturalWidth > 0);
    },
    undefined,
    { timeout: 20_000 },
  ).catch(() => undefined);
  await page.screenshot({ path: `${SHOTS}/customize-step-rosa.png` });
  await page.getByRole("button", { name: /^Maya$/ }).click();
  await expect(page.getByText("Selected Maya")).toBeVisible();
});

test("Harold suggests an older male face", async ({ page }) => {
  await page.goto("/practice/networking");
  await page.getByRole("button", { name: /Pick someone to practice with/ }).click();
  await page.getByRole("button", { name: /Harold Brennan/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Your networking goal").fill("A once-a-semester mentor check-in");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Plays Harold Brennan · Live session").first()).toBeVisible();
  await expect(page.getByText("Selected Dexter")).toBeVisible();
  await expect(
    page.locator("section[aria-labelledby='interviewer-heading'] .grid > button").first(),
  ).toContainText("Dexter");
  await shotSelectedFace(page, /Dexter/, `${SHOTS}/customize-step-harold.png`);
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
