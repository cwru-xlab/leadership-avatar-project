import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Technical-coding report: the Coding tab (rubric dims MI-style + process
 * steps), the Your solution tab, the model solution's explicit reveal,
 * Practice again, 375 width, and an old report without codingSteps.
 *
 * Fixtures come from the dev-only seed (no model calls):
 *   npx tsx --env-file=.env.local scripts/research/seed-coding-report-fixture.ts
 * which writes their ids to scripts/research/out/coding-report-fixture.json.
 * The server must run with TECHNICAL_POST_SESSION_FIXTURE pointing at the
 * mock material that script writes, until loop/coding-corpus authors the
 * real material:
 *   TECHNICAL_POST_SESSION_FIXTURE=$PWD/scripts/research/fixtures/coding-post-session.mock.json \
 *     PORT=3127 npm run dev
 *   E2E_BASE_URL=http://localhost:3127 npx playwright test e2e/technical-coding-report.spec.ts
 */

const FIXTURE_PATH = "scripts/research/out/coding-report-fixture.json";
const SHOTS =
  process.env.SHOTS_DIR ??
  "/Users/ajabreu79/projects/leadership-avatar-wt/screenshots-2026-11-14/coding-report/ui";

const fixture: { email: string; graded: string; old: string; marker: string } | null = existsSync(FIXTURE_PATH)
  ? JSON.parse(readFileSync(FIXTURE_PATH, "utf8"))
  : null;

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function openReport(page: Page, id: string) {
  await page.goto(`/reports/${id}`);
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible({ timeout: 60_000 });
}

async function noSidewaysScroll(page: Page) {
  // Anything poking past the right edge, unless an ancestor clips or scrolls
  // it sideways (a code block scrolling inside its own box is fine).
  const offenders = await page.evaluate(() => {
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== "visible") return true;
      }
      return false;
    };
    const out: string[] = [];
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) out.push("document");
    for (const el of Array.from(document.querySelectorAll("main *"))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > window.innerWidth + 1 && !clipped(el)) {
        out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(r.right)}`);
      }
    }
    return out.slice(0, 5);
  });
  expect(offenders).toEqual([]);
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, animations: "disabled" });
}

test.describe("technical coding report", () => {
  test.skip(!fixture, `run scripts/research/seed-coding-report-fixture.ts first (no ${FIXTURE_PATH})`);

  for (const [label, viewport] of [
    ["1440", { width: 1440, height: 900 }],
    ["375", { width: 375, height: 812 }],
  ] as const) {
    test(`graded report at ${label}`, async ({ page }) => {
      test.setTimeout(150_000);
      // Tall: the app shell scrolls an inner pane, so full-page shots clip
      // at the viewport height otherwise.
      await page.setViewportSize({ width: viewport.width, height: 2400 });
      await signIn(page, fixture!.email);
      await openReport(page, fixture!.graded);

      // Headline four cards unchanged; no coding card added to them.
      const scores = page.getByRole("region", { name: "Scores" });
      await expect(scores).toContainText("Content & Structure");
      await expect(scores).not.toContainText("Coding");

      // Practice again → the coding setup with the same language.
      const again = page.getByRole("button", { name: "Practice again" });
      await expect(again).toBeVisible();

      // No resume attribution chips on coding reports.
      await expect(page.getByText("From the conversation")).toHaveCount(0);
      await noSidewaysScroll(page);
      await shot(page, `overview-${label}`);

      // Coding tab: rubric dims MI-style and the steps panel.
      await page.getByRole("tab", { name: "Coding" }).click();
      const panel = page.getByTestId("coding-scores-panel");
      await expect(panel).toBeVisible();
      await expect(page.getByTestId("coding-score-coding_quality")).toContainText("4");
      await expect(page.getByTestId("coding-score-coding_quality")).toContainText("Strong");
      await expect(page.getByTestId("coding-score-technical_communication")).toContainText("Solid");
      await expect(page.getByTestId("coding-score-coding_correctness")).toContainText("Not run");
      await expect(page.getByTestId("coding-steps-panel")).toBeVisible();
      for (const key of ["clarify", "examples_edge_cases", "approach_before_code", "complexity", "narrate_implementation", "test_and_trace", "wrap_up"]) {
        await expect(page.getByTestId(`process-step-${key}`)).toBeVisible();
      }
      await expect(page.getByTestId("coding-steps-summary")).toHaveText("4 hit · 1 prompted · 1 partly · 1 missed");
      await noSidewaysScroll(page);
      await shot(page, `steps-${label}`);

      // Your solution, before the reveal: the model solution is not in the DOM.
      await page.getByRole("tab", { name: "Your solution" }).click();
      await expect(page.getByTestId("coding-problem")).toContainText("Target complexity");
      await expect(page.getByTestId("coding-target-complexity")).toContainText("O(n) time, O(k) space");
      await expect(page.getByTestId("coding-final-code")).toContainText("a repeat left of the window is stale", { timeout: 30_000 });
      await expect(page.getByTestId("coding-visible-tests")).toContainText("Visible test 1");
      await expect(page.getByTestId("coding-hints-count")).toHaveText("2 of 3");
      await expect(page.getByTestId("coding-hints")).toContainText("Consider a contiguous region");
      await expect(page.getByTestId("coding-approach")).toContainText("Grow a window");
      await expect(page.getByRole("button", { name: "Show model solution" })).toBeVisible();
      expect(await page.content()).not.toContain(fixture!.marker);
      await noSidewaysScroll(page);
      await shot(page, `solution-before-reveal-${label}`);

      // Reveal, then switch language.
      await page.getByRole("button", { name: "Show model solution" }).click();
      await expect(page.getByTestId("coding-model-solution-code")).toContainText(`${fixture!.marker} (python)`);
      await page.getByRole("button", { name: "JavaScript", exact: true }).click();
      await expect(page.getByTestId("coding-model-solution-code")).toContainText(`${fixture!.marker} (javascript)`);
      await page.getByRole("button", { name: "Python", exact: true }).click();
      await expect(page.getByTestId("coding-model-solution-code")).toContainText(`${fixture!.marker} (python)`);
      await noSidewaysScroll(page);
      await shot(page, `solution-after-reveal-${label}`);

      // Hide removes it again.
      await page.getByRole("button", { name: "Hide model solution" }).click();
      await expect(page.getByTestId("coding-model-solution-code")).toHaveCount(0);

      await again.click();
      await page.waitForURL(/\/practice\/interviews\/technical\?language=python/);
    });
  }

  test("old report without codingSteps renders without the steps panel", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 2400 });
    await signIn(page, fixture!.email);
    await openReport(page, fixture!.old);
    // Resume chip suppressed on the coding chrome even though the row has one.
    await expect(page.getByText("From your resume")).toHaveCount(0);
    await page.getByRole("tab", { name: "Coding" }).click();
    await expect(page.getByTestId("coding-scores-panel")).toBeVisible();
    await expect(page.getByTestId("coding-steps-panel")).toHaveCount(0);
    await page.getByRole("tab", { name: "Your solution" }).click();
    await expect(page.getByTestId("coding-final-code-empty")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("coding-hints-count")).toHaveText("0 of 3");
    await shot(page, "old-report-solution-1440");
  });

  test("By rubric item shows figures for label-shaped items", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 2400 });
    await signIn(page, fixture!.email);
    await openReport(page, fixture!.graded);
    await page.getByRole("tab", { name: "Content" }).click();
    const quality = page.locator("dt", { hasText: "Coding Quality" }).locator("..");
    await expect(quality).toContainText("4");
    await expect(quality).toContainText("/ 5");
  });

  test("solution routes are owner-only and never leak the model solution", async ({ page, playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL });
    expect((await anon.get(`/api/practice/report/${fixture!.graded}/coding`)).status()).toBe(401);
    await anon.dispose();

    await signIn(page, "alice.johnson@case.edu");
    expect((await page.request.get(`/api/practice/report/${fixture!.graded}/coding`)).status()).toBe(404);
    expect(
      (await page.request.get(`/api/practice/report/${fixture!.graded}/coding/model-solution?language=python`)).status(),
    ).toBe(404);

    await page.context().clearCookies();
    await signIn(page, fixture!.email);
    const tab = await page.request.get(`/api/practice/report/${fixture!.graded}/coding`);
    expect(tab.status()).toBe(200);
    expect(await tab.text()).not.toContain(fixture!.marker);
    const report = await page.request.get(`/api/practice/report/${fixture!.graded}`);
    expect(await report.text()).not.toContain(fixture!.marker);
    expect(await report.text()).not.toContain("a repeat left of the window is stale");
    expect(
      (await page.request.get(`/api/practice/report/${fixture!.graded}/coding/model-solution?language=ruby`)).status(),
    ).toBe(400);
  });
});
