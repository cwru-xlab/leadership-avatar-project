import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Problem-interview engine, end to end against the dev-only fixture type
 * (`/practice/problem-fixture`, lib/problem-interview/fixtures/). REAL APIs:
 * live avatar, live interviewer model, live evaluator. Typed answers only.
 *
 * Proves: the briefing names the interview kind; the posed problem appears in
 * Case materials; asking for usage data puts the fixture's table exhibit on
 * screen; the session ends into a report that shows The problem and Process
 * steps panels. Writes one READY report under the seeded student (kept).
 *
 * Run: E2E_BASE_URL=http://localhost:3101 npx playwright test e2e/problem-interview.spec.ts
 */

const SHOTS = "test-results/problem-interview";
const STUDENT = { email: "student@case.edu", password: "student123" };

test.use({
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  },
});

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  const path = `${SHOTS}/${name}.png`;
  await page.screenshot({ path, timeout: 20_000, animations: "disabled", caret: "hide" });
  console.log(`shot ${path}`);
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(STUDENT.email);
  await page.locator('input[type="password"]').fill(STUDENT.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

/** Sends one typed answer and waits for the interviewer's reply to land. */
async function answer(page: Page, text: string) {
  const assistantTurns = page.locator("article.max-w-\\[94\\%\\]");
  const before = await assistantTurns.count();
  const box = page.locator("#interview-answer");
  await expect(box).toBeEnabled({ timeout: 90_000 });
  await box.fill(text);
  await page.getByRole("button", { name: "Send answer" }).click();
  await expect.poll(() => assistantTurns.count(), { timeout: 90_000 }).toBeGreaterThan(before);
  await expect(box).toBeEnabled({ timeout: 90_000 });
  const reply = (await assistantTurns.last().innerText()).trim();
  console.log(`> ${text}\n< ${reply.replace(/\s+/g, " ")}`);
  return reply;
}

test("problem interview: exhibit on screen, process steps on the report", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);

  await page.goto("/practice/problem-fixture");
  // Interviewer
  await page.locator("button[aria-pressed]").first().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // Resume, job posting: skip
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  // Briefing names the kind of interview, not the steps.
  const briefing = page.getByTestId("problem-briefing");
  await expect(briefing).toBeVisible();
  await expect(briefing).toContainText("One problem, worked out loud");
  await expect(briefing).not.toContainText("Identify the customer");
  await shot(page, "01-briefing");
  await page.getByRole("button", { name: /Continue to camera setup/ }).click();
  // Camera off launches the session directly.
  await page.getByRole("button", { name: /Camera off/ }).click();

  // Live room: the opening question arrives after the avatar connects.
  await expect(page.getByTestId("problem-agenda")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("article.max-w-\\[94\\%\\]").first()).toBeVisible({ timeout: 120_000 });
  await shot(page, "02-opening");

  // Fit answer(s) until the problem is posed (fit allows one follow-up).
  const prompt = page.getByTestId("case-prompt");
  await answer(
    page,
    "I'm an MBA student who spent three years as a product analyst at a regional bank, where I led the redesign of our mobile onboarding. I want this role because I like turning messy usage data into product decisions.",
  );
  for (let i = 0; i < 3 && !(await prompt.isVisible()); i += 1) {
    await answer(
      page,
      "The onboarding redesign cut drop-off by about a fifth. I'm ready for the problem whenever you are.",
    );
  }
  await expect(prompt).toBeVisible({ timeout: 10_000 });
  await expect(prompt).toContainText("library");
  await shot(page, "03-problem-posed");

  // Clarify the goal, then ask for usage data → the table exhibit appears.
  await answer(page, "Before I jump in, what is the main goal here — what would success look like for the library?");
  const exhibit = page.getByTestId("exhibit-ex1");
  for (let i = 0; i < 3 && !(await exhibit.isVisible()); i += 1) {
    await answer(
      page,
      "Do you have data on who uses the app today — for example sessions and e-book loans broken down by age group?",
    );
  }
  await expect(exhibit).toBeVisible({ timeout: 10_000 });
  await expect(exhibit.getByRole("table")).toBeVisible();
  await expect(exhibit).toContainText("55+");
  await shot(page, "04-exhibit-on-screen");

  // Previously posed prompt stays reachable.
  await page.getByRole("tab", { name: "Problem" }).click();
  await expect(prompt).toBeVisible();
  await page.getByRole("tab", { name: "Exhibit 1" }).click();

  // Phone width: the exhibit stays readable inside its own scroll box.
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(exhibit).toBeVisible();
  const pageScrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(pageScrolls).toBe(false);
  await shot(page, "05-exhibit-375");
  await page.setViewportSize({ width: 1440, height: 900 });

  await answer(
    page,
    "Reading the table: 55+ users borrow about 0.38 loans per session versus 0.2 for 18-34, so they are high-intent but rarely open the app. I'd focus on 55+ readers with a holds-ready notification and a simpler borrowing flow, aiming to lift loans per active user. My recommendation is to ship hold notifications first and measure monthly e-book loans per active 55+ user.",
  );

  // End the session.
  await page.getByRole("button", { name: "End interview" }).click();
  await page.getByRole("button", { name: "End and get my report" }).click();
  await page.waitForURL(/\/reports?\/[0-9a-f-]{36}/, { timeout: 60_000 });

  // Report: wait for evaluation, then the problem panels.
  const steps = page.getByTestId("process-steps-panel");
  await expect(steps).toBeVisible({ timeout: 4 * 60_000 });
  await expect(page.getByTestId("problem-question-panel")).toContainText("Public library app");
  await expect(steps).toContainText("Clarify the goal");
  await expect(steps.locator("[data-status]").first()).toBeVisible();
  await shot(page, "06-report-top");
  await page.getByText("Exhibits you saw").click();
  await expect(page.getByTestId("problem-question-panel").getByTestId("exhibit-ex1")).toBeVisible();
  await steps.scrollIntoViewIfNeeded();
  await shot(page, "07-report-process-steps");
  await page.screenshot({ path: `${SHOTS}/08-report-full.png`, fullPage: true, timeout: 30_000 });
  console.log(`shot ${SHOTS}/08-report-full.png`);
  await page.setViewportSize({ width: 375, height: 812 });
  await steps.scrollIntoViewIfNeeded();
  await shot(page, "09-report-375");
  console.log("report url", page.url());
});
