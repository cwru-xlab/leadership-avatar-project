import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

/**
 * Report condense pass. MEASURE mode (REPORT_MEASURE=before|after) records the
 * default view's visible words and scroll height per practice type, plus every
 * tab's text, so the before/after numbers come from the same script.
 */
const SHOTS = ".loop-shots";
const MODE = process.env.REPORT_MEASURE ?? "after";
const ALICE = { email: "alice.johnson@case.edu", password: "student123" };

const REPORTS = {
  interview: "2cd23e87-49e4-4d94-a5b3-aeaa048589f5",
  elevator: "97d9f6b3-0cc5-4560-a6f9-1b89c3d7c08f",
  conversation: "5dcaf470-9011-4695-8f3c-dc20f848be52",
  caseStudy: "93a9c35c-ed36-429e-ab0e-79f7d6a0e41d",
  networking: "753e439e-2e0a-4631-93f2-64b6eced5d3f",
} as const;
const EDGE = {
  legacyMarkdown: "74aff80f-afb0-4901-ba20-54a500366032",
  failed: "3c0890ee-486e-437f-a21b-bb61c83e1280",
  pending: "099e9e96-d724-43ec-9f10-35371878eb1f",
  caseStudyNoMetrics: "f13011bb-2f76-48b3-8f6f-6ea93a01dd12",
} as const;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(ALICE.email);
  await page.locator('input[type="password"]').fill(ALICE.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

/** Words and height of the content column (`main` scrolls; the sidebar is not report text). */
async function measure(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main")!;
    const text = main.innerText;
    return { words: text.split(/\s+/).filter(Boolean).length, height: main.scrollHeight, text };
  });
}

/** First screen as the student sees it, then the whole column by growing the viewport. */
async function shoot(page: Page, file: string, viewport: { width: number; height: number }) {
  await page.evaluate(() => document.querySelector("main")!.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOTS}/${file}-first.png` });
  const height = await page.evaluate(() => {
    const main = document.querySelector("main")!;
    return main.scrollHeight + (document.documentElement.scrollHeight - main.clientHeight);
  });
  await page.setViewportSize({ width: viewport.width, height: Math.min(height, 12000) });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/${file}-full.png`, fullPage: true });
  await page.setViewportSize(viewport);
}

for (const [name, viewport] of [
  ["1440", { width: 1440, height: 900 }],
  ["375", { width: 375, height: 812 }],
] as const) {
  test.describe(`measure at ${name}`, () => {
    test.use({ viewport });

    test("default view per practice type", async ({ page }) => {
      test.setTimeout(240_000);
      await signIn(page);
      const out: Record<string, unknown> = {};
      for (const [kind, id] of Object.entries(REPORTS)) {
        await page.goto(`/reports/${id}`);
        await expect(page.getByRole("tablist").first()).toBeVisible({ timeout: 45_000 });
        await page.waitForTimeout(600);
        const m = await measure(page);
        const tabs: Record<string, string> = {};
        for (const tab of await page.getByRole("tab").all()) {
          const label = (await tab.innerText()).trim();
          await tab.click();
          await page.waitForTimeout(250);
          tabs[label] = await page.getByRole("tabpanel").innerText();
        }
        out[kind] = { words: m.words, height: m.height, text: m.text, tabs };
        await page.getByRole("tab").first().click();
        await shoot(page, `${MODE}-${kind}-${name}`, viewport);
      }
      fs.writeFileSync(`${SHOTS}/${MODE}-measure-${name}.json`, JSON.stringify(out, null, 1));
    });
  });
}

test.describe("condensed report", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("three tabs, top three rows, each fact once", async ({ page }) => {
    await signIn(page);
    await page.goto(`/reports/${REPORTS.interview}`);
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("tab")).toHaveText(["Overview", "Delivery", "Content"]);

    // Growth areas: 3 of 5 visible, all five behind "Show all (5)".
    const growth = page.locator("section", { has: page.getByRole("heading", { name: /Growth areas/ }) });
    await expect(growth.getByRole("heading")).toContainText("5 · from the conversation");
    await expect(growth.locator("button[aria-expanded]").filter({ hasNotText: /Show/ })).toHaveCount(3);
    await growth.getByRole("button", { name: "Show all (5)" }).click();
    await expect(growth.locator("button[aria-expanded]").filter({ hasNotText: /Show/ })).toHaveCount(5);
    await growth.getByRole("button", { name: "Follow-through on process/outcome" }).click();
    await expect(growth).toContainText("Consider trying this:");
    await page.screenshot({ path: `${SHOTS}/after-interview-overview-expanded-1440.png`, fullPage: false });

    // Keyboard focus shows a ring; a mouse click does not.
    const showFewer = growth.getByRole("button", { name: "Show fewer" });
    expect(await showFewer.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");

    // Delivery: figures carry the band word; the band list does not repeat it.
    await page.getByRole("tab", { name: "Delivery" }).click();
    const panel = page.getByRole("tabpanel");
    await expect(panel).toContainText("Slightly fast · above the interview target");
    await expect(panel.getByText("Eye contact", { exact: true })).toHaveCount(1);
    await expect(panel.getByText("Pace", { exact: true })).toHaveCount(0);
    await expect(panel).not.toContainText("Assessed pace");
    await expect(panel.getByRole("heading", { name: "Observations" })).toBeVisible();
    await expect(panel).toContainText("These do not affect any score.");
    await page.screenshot({ path: `${SHOTS}/after-interview-delivery-1440.png`, fullPage: false });
    await page.evaluate(() => document.querySelector("main")!.scrollTo(0, 700));
    await page.screenshot({ path: `${SHOTS}/after-interview-delivery-lower-1440.png`, fullPage: false });

    // Content: rubric notes 3 then Show all.
    await page.getByRole("tab", { name: "Content" }).click();
    await page.getByRole("tabpanel").getByRole("button", { name: "Show all (6)" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Judgment");
    await page.screenshot({ path: `${SHOTS}/after-interview-content-1440.png`, fullPage: false });
  });

  test("typed session shows no voice bands under a Not measured card", async ({ page }) => {
    await signIn(page);
    await page.goto(`/reports/${REPORTS.conversation}`);
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByLabel("Scores")).toContainText("You typed your answers");
    await page.getByRole("tab", { name: "Delivery" }).click();
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("heading", { name: "Voice" })).toHaveCount(0);
    await expect(panel).not.toContainText("Speech rate");
    await expect(panel.getByRole("heading", { name: "Observations" })).toBeVisible();
  });

  test("walk-out signals start collapsed, each moment once", async ({ page }) => {
    await signIn(page);
    await page.goto(`/reports/${REPORTS.elevator}`);
    const panel = page.getByTestId("disengagement-decline-panel");
    await expect(panel).toBeVisible({ timeout: 45_000 });
    await expect(panel.locator("summary")).toContainText("2 moments");
    await expect(panel.locator("li").first()).toBeHidden();
    await panel.locator("summary").click();
    await expect(panel.locator("li")).toHaveCount(2);
    await expect(panel).not.toContainText("0:26–0:26");
    await page.screenshot({ path: `${SHOTS}/after-elevator-signals-open-1440.png` });
  });

  test("legacy, failed, pending and metric-less reports still render", async ({ page }) => {
    await signIn(page);
    await page.goto(`/reports/${EDGE.legacyMarkdown}`);
    await expect(page.locator("h1")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByLabel("Scores")).toBeVisible();
    await expect(page.getByRole("tablist")).toHaveCount(0);
    expect((await page.locator("main").innerText()).length).toBeGreaterThan(400);
    await page.screenshot({ path: `${SHOTS}/after-legacy-1440.png` });

    await page.goto(`/reports/${EDGE.failed}`);
    await expect(page.getByText("We couldn't generate your report.")).toBeVisible({ timeout: 45_000 });

    await page.goto(`/reports/${EDGE.pending}`);
    await expect(page.getByText(/Reviewing your|taking longer/)).toBeVisible({ timeout: 45_000 });

    await page.goto(`/reports/${EDGE.caseStudyNoMetrics}`);
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("tab", { name: "Delivery" })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/after-case-no-metrics-1440.png`, fullPage: true });
  });
});
