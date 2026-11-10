import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

import { getProblemBank } from "../lib/problem-interview/banks.server";

/**
 * Consulting case + product-management interviews, end to end, REAL APIs:
 * live avatar, live interviewer model, live evaluator. Typed answers only.
 *
 * One session each, steered to a question family through the customize
 * page's "Question type" choice (business-scenario cases carry data
 * exhibits; product-design uses CIRCLES). The spec asserts the start request
 * carried that `problemFamily` and that the posed problem is from it.
 *
 * Consulting: problem posed, clarifying question, ask for data → an exhibit
 * is on screen; report shows Process steps.
 * PM: problem posed, clarifying question, then a deliberately incomplete
 * process (jumps to features for "everyone", no prioritisation) → the report's
 * Process steps panel names CIRCLES and at least one step is not a hit.
 *
 * Writes two READY reports under the seeded student (kept).
 * Run: E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/case-pm-live.spec.ts
 */

// Not test-results/: Playwright empties it at the start of every run.
const SHOTS = "screenshots/case-pm-live";
const STUDENT = { email: "student@case.edu", password: "student123" };

test.use({
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  },
});

async function shot(page: Page, name: string, fullPage = false) {
  mkdirSync(SHOTS, { recursive: true });
  const path = `${SHOTS}/${name}.png`;
  await page.screenshot({ path, fullPage, timeout: 30_000, animations: "disabled", caret: "hide" });
  console.log(`shot ${path}`);
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(STUDENT.email);
  await page.locator('input[type="password"]').fill(STUDENT.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

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

/**
 * Customize page (pick the question type) → wizard → camera off → live room.
 * Returns the session-start body the browser sent.
 */
async function launch(page: Page, slug: string, familyLabel: RegExp, briefingHeadline: string) {
  let startBody: Record<string, unknown> = {};
  await page.route("**/api/practice/session/start", async (route) => {
    startBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.continue();
  });
  await page.goto(`/practice/interviews/customize/${slug}`);
  await page.locator('[data-choice-group="family"]').getByRole("radio", { name: familyLabel }).click();
  await page.getByRole("button", { name: "Continue to setup" }).click();
  await page.waitForURL(`**/practice/interviews/${slug}`, { timeout: 45_000 });
  await page.locator("button[aria-pressed]").first().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByTestId("problem-briefing")).toContainText(briefingHeadline);
  await page.getByRole("button", { name: /Continue to camera setup/ }).click();
  await page.getByRole("button", { name: /Camera off/ }).click();
  await expect(page.getByTestId("problem-agenda")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("article.max-w-\\[94\\%\\]").first()).toBeVisible({ timeout: 120_000 });
  return startBody;
}

/** The posed problem (Case materials text) is one of `family`'s bank questions. */
function expectPosedFromFamily(slug: string, family: string, posed: string) {
  const norm = (t: string) => t.replace(/\s+/g, " ").trim();
  const match = getProblemBank(slug).find((q) => norm(posed).includes(norm(q.prompt).slice(0, 80)));
  expect(match, `posed problem not found in the ${slug} bank`).toBeTruthy();
  expect(match!.family).toBe(family);
}

/** Fit answers until the problem appears in Case materials. */
async function untilPosed(page: Page, fit: string) {
  const prompt = page.getByTestId("case-prompt");
  await answer(page, fit);
  for (let i = 0; i < 3 && !(await prompt.isVisible()); i += 1) {
    await answer(page, "Thanks — happy to go deeper later. I'm ready for the problem whenever you are.");
  }
  await expect(prompt).toBeVisible({ timeout: 10_000 });
  return (await prompt.innerText()).trim();
}

async function sessionShots(page: Page, prefix: string) {
  await shot(page, `${prefix}-session-1440`);
  await page.setViewportSize({ width: 375, height: 812 });
  const pageScrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(pageScrolls).toBe(false);
  await shot(page, `${prefix}-session-375`);
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function endAndWaitForReport(page: Page) {
  await page.getByRole("button", { name: "End interview" }).click();
  await page.getByRole("button", { name: "End and get my report" }).click();
  await page.waitForURL(/\/reports?\/[0-9a-f-]{36}/, { timeout: 60_000 });
  const steps = page.getByTestId("process-steps-panel");
  await expect(steps).toBeVisible({ timeout: 60_000 });
  // READY: the evaluator graded the steps.
  await expect(page.getByTestId("process-steps-summary")).toBeVisible({ timeout: 5 * 60_000 });
  return steps;
}

async function reportShots(page: Page, prefix: string) {
  const steps = page.getByTestId("process-steps-panel");
  await shot(page, `${prefix}-report-1440`);
  await steps.scrollIntoViewIfNeeded();
  await shot(page, `${prefix}-report-steps-1440`);
  await shot(page, `${prefix}-report-full-1440`, true);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, `${prefix}-report-375`);
  await steps.scrollIntoViewIfNeeded();
  await shot(page, `${prefix}-report-steps-375`);
  await page.setViewportSize({ width: 1440, height: 900 });
  console.log(`${prefix} report url ${page.url()}`);
}

test.describe.configure({ mode: "serial" });

test("consulting case: data exhibit on screen, process steps on the report", async ({ page }) => {
  test.setTimeout(12 * 60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const start = await launch(page, "consulting", /Business case/, "A real case interview");
  expect(start.problemFamily).toBe("business-scenario");

  const posed = await untilPosed(
    page,
    "I spent three years in operations at a regional manufacturer, where I built the cost model we used to decide which product lines to keep. I want consulting because I like structuring messy business problems with numbers.",
  );
  console.log(`case posed: ${posed.replace(/\s+/g, " ")}`);
  expectPosedFromFamily("consulting", "business-scenario", posed);

  await answer(page, "Before I structure anything — what is the client's objective here, and is there a time frame or a target number they need to hit?");
  await answer(
    page,
    "Thanks. I'd structure it as revenue, costs, and market or competitive factors, and check each against the objective. I'd like to start with the numbers.",
  );
  const exhibits = page.locator('[data-testid^="exhibit-"]');
  const asks = [
    "Do you have any data you can share — for example a breakdown of revenues and costs, or the market figures?",
    "Could I see whatever data you have on costs and pricing?",
    "Is there a chart or table with the market size, volumes, or margins?",
  ];
  for (let i = 0; i < asks.length && !(await exhibits.first().isVisible()); i += 1) {
    await answer(page, asks[i]!);
  }
  await expect(exhibits.first()).toBeVisible({ timeout: 10_000 });
  await sessionShots(page, "consulting");

  await answer(
    page,
    "Reading that, the economics hinge on the biggest cost line versus the price we can charge. My recommendation is to proceed only if we can hit the target on that line; the main risk is a competitive response, and next I'd validate demand.",
  );
  const steps = await endAndWaitForReport(page);
  await expect(steps.locator("[data-status]").first()).toBeVisible();
  const statuses = await steps.locator("[data-status]").evaluateAll((els) => els.map((el) => el.getAttribute("data-status")));
  console.log(`consulting step statuses: ${statuses.join(", ")}`);
  await reportShots(page, "consulting");
});

test("product management: CIRCLES graded, an incomplete process is not all hits", async ({ page }) => {
  test.setTimeout(12 * 60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const start = await launch(page, "product-management", /Product design/, "One open product problem");
  expect(start.problemFamily).toBe("product-design");

  const posed = await untilPosed(
    page,
    "I've been a data analyst on a growth team for two years. I want to be a PM because I want to own what we build, not just measure it. A product I admire is Google Maps.",
  );
  console.log(`pm posed: ${posed.replace(/\s+/g, " ")}`);
  expectPosedFromFamily("product-management", "product-design", posed);

  await answer(page, "Quick clarifying question — is this for a specific platform or market?");
  // Deliberately incomplete: no user segment, no needs, no prioritisation.
  await answer(
    page,
    "Okay. I'd just build it for everyone. Features: a companion app, smart notifications, a vibration wristband, and a social sharing feature. I'd ship all of them.",
  );
  await answer(page, "I think that covers it — those features together would make it great.");
  await sessionShots(page, "pm");

  await answer(page, "So my answer is to build all four features and launch.");
  const steps = await endAndWaitForReport(page);
  await expect(steps).toContainText("CIRCLES");
  const statuses = await steps.locator("[data-status]").evaluateAll((els) => els.map((el) => el.getAttribute("data-status")));
  console.log(`pm step statuses: ${statuses.join(", ")}`);
  expect(statuses.length).toBeGreaterThan(0);
  expect(statuses.some((s) => s !== "hit")).toBe(true);
  await reportShots(page, "pm");
});

test("industry-specific picker lists every specialized interview as a card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/practice/interviews/industry-specific");
  const list = page.getByRole("list", { name: "Industry-specific interviews" });
  await expect(list).toBeVisible({ timeout: 45_000 });
  const cards: Array<[string, string]> = [
    ["technical", "~20 min"],
    ["consulting", "~25 min"],
    ["product-management", "~30 min"],
    ["data-analytics", "~30 min"],
    ["finance", "~25 min"],
    ["system-design", "~35 min"],
    ["technical-coding", "~30 min"],
  ];
  const keys = await page.locator("[data-interview]").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-interview")));
  expect(keys).toEqual(cards.map(([key]) => key));
  for (const [key, minutes] of cards) {
    await expect(page.locator(`[data-interview="${key}"]`)).toContainText(minutes);
  }
  // The app shell scrolls an inner column, so a full-page capture stops at
  // the viewport: size the viewport to the list so every card is in the shot.
  const fitHeight = () => page.evaluate(() => Math.ceil(document.querySelector('[aria-label="Industry-specific interviews"]')!.getBoundingClientRect().bottom + 48));
  await page.setViewportSize({ width: 1440, height: Math.max(900, await fitHeight()) });
  await shot(page, "picker-industry-1440", true);
  await page.setViewportSize({ width: 375, height: 812 });
  const pageScrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(pageScrolls).toBe(false);
  await page.setViewportSize({ width: 375, height: Math.max(812, await fitHeight()) });
  await shot(page, "picker-industry-375", true);
});
