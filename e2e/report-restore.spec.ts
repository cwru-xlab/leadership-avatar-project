import { expect, test, type Page } from "@playwright/test";

/**
 * The full report, restored after the 2026-11 condense pass was rejected
 * ("put everything back for reports ... would prefer more over less"): five
 * tabs, every strength, growth area and rubric note listed with no "Show all"
 * cut, Statistics as its own tab, Delivery with its Voice bands, and the
 * walk-out signals panel open. Read-only against Alice's existing reports.
 *
 * SHOT_TAG names the screenshots, so the same spec can photograph another
 * build (such as the pre-condense commit) for comparison.
 */
const SHOTS = ".loop-shots";
const TAG = process.env.SHOT_TAG ?? "restored";
const INTERVIEW = "2cd23e87-49e4-4d94-a5b3-aeaa048589f5";
const ELEVATOR = "97d9f6b3-0cc5-4560-a6f9-1b89c3d7c08f";
const TABS = ["Overview", "Takeaways", "Statistics", "Delivery", "Content"];

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("alice.johnson@case.edu");
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

for (const size of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`structured interview report shows all five tabs in full at ${size.width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(size);
    await signIn(page);
    const detail = await (await page.request.get(`/api/practice/report/${INTERVIEW}`)).json();
    const structured = detail.report.reportStructured;
    expect(structured, "fixture report must be structured").toBeTruthy();

    await page.goto(`/reports/${INTERVIEW}`);
    await expect(page.locator("#moments")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("tab")).toHaveText(TABS);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    // Overview: every item, no truncation button.
    const overview = page.getByRole("tabpanel");
    await expect(overview.getByRole("button", { name: /^Show all/ })).toHaveCount(0);
    const strengths = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Strengths/ }) });
    const growth = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Growth areas/ }) });
    await expect(strengths.locator("button[aria-expanded]")).toHaveCount(structured.strengths.length);
    await expect(growth.locator("button[aria-expanded]")).toHaveCount(structured.growth_areas.length);
    await page.screenshot({ path: `${SHOTS}/report-${TAG}-${size.width}-overview.png`, fullPage: true });

    await page.getByRole("tab", { name: "Takeaways" }).click();
    for (const column of ["Keep doing", "Work on next"]) {
      await expect(page.getByRole("heading", { name: column })).toBeVisible();
    }
    await page.getByRole("tabpanel").screenshot({ path: `${SHOTS}/report-${TAG}-${size.width}-takeaways.png` });

    await page.getByRole("tab", { name: "Statistics" }).click();
    await page.getByRole("tabpanel").screenshot({ path: `${SHOTS}/report-${TAG}-${size.width}-statistics.png` });

    await page.getByRole("tab", { name: "Delivery" }).click();
    if (detail.report.metrics?.vocal && detail.report.metrics?.vocalUnscored !== "TYPED_ONLY") {
      const voice = page.locator("section").filter({ has: page.getByRole("heading", { name: "Voice" }) });
      await expect(voice.locator("dt")).toHaveText(["Pace", "Filler words", "Pauses", "Volume"]);
    }
    await page.getByRole("tabpanel").screenshot({ path: `${SHOTS}/report-${TAG}-${size.width}-delivery.png` });

    await page.getByRole("tab", { name: "Content" }).click();
    if (structured.rubric_notes.length > 0) {
      const rubric = page.locator("section").filter({ has: page.getByRole("heading", { name: "By rubric item" }) });
      await expect(rubric.locator("dt")).toHaveCount(structured.rubric_notes.length);
    }
    await expect(page.getByRole("tabpanel").getByRole("button", { name: /^Show all/ })).toHaveCount(0);
    await page.getByRole("tabpanel").screenshot({ path: `${SHOTS}/report-${TAG}-${size.width}-content.png` });
  });
}

test("walk-out signals panel lists every moment without a click", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto(`/reports/${ELEVATOR}`);
  const panel = page.getByTestId("disengagement-decline-panel");
  await expect(panel).toBeVisible({ timeout: 45_000 });
  await expect(panel.getByRole("heading", { name: "Observable signals before the conversation ended" })).toBeVisible();
  await expect(panel.locator("details, summary")).toHaveCount(0);
  await expect(panel.getByRole("listitem").first()).toBeVisible();
  await panel.screenshot({ path: `${SHOTS}/report-${TAG}-walkout.png` });
});
