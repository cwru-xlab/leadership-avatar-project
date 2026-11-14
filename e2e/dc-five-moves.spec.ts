import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Courageous-conversation five-moves checklist on the report page.
 *
 * Needs the two reports `scripts/verify-dc-five-moves.ts --seed-report
 * student@case.edu` inserts (ids via env), plus one pre-checklist report
 * owned by alice to prove old reports render unchanged.
 *
 *   DC_STRONG_ID=… DC_WEAK_ID=… DC_OLD_ID=… E2E_BASE_URL=http://localhost:3113 \
 *     npx playwright test e2e/dc-five-moves.spec.ts
 */

const SHOTS =
  process.env.SHOTS_DIR ?? "/Users/ajabreu79/projects/leadership-avatar-wt/screenshots-2026-11-14/loop-dc-crucial";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function shotPanel(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  const panel = page.getByTestId("conversation-steps-panel");
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: `${SHOTS}/${name}-panel.png`, animations: "disabled" });
  await page.screenshot({ path: `${SHOTS}/${name}-full.png`, fullPage: true, animations: "disabled" });
}

test.describe("five moves panel", () => {
  for (const [label, id, hits] of [
    ["strong", process.env.DC_STRONG_ID, /5 hit/],
    ["weak", process.env.DC_WEAK_ID, /5 missed/],
  ] as const) {
    test(`${label} report shows all five moves`, async ({ page }) => {
      test.skip(!id, "report id not provided");
      // Tall viewport: the app shell scrolls an inner pane, so element and
      // full-page shots clip at the viewport height.
      await page.setViewportSize({ width: 1280, height: 2600 });
      await signIn(page, "student@case.edu");
      await page.goto(`/practice/difficult-conversation/report/${id}`);
      const panel = page.getByTestId("conversation-steps-panel");
      await expect(panel).toBeVisible({ timeout: 60_000 });
      await expect(panel.getByRole("heading", { name: "The five moves" })).toBeVisible();
      for (const key of ["common_ground", "facts_observations", "frame_concern", "lead_with_inquiry", "next_step"]) {
        await expect(page.getByTestId(`process-step-${key}`)).toBeVisible();
      }
      await expect(page.getByTestId("conversation-steps-summary")).toHaveText(hits);
      await shotPanel(page, `dc-five-moves-${label}`);
    });
  }

  test("middling report shows Partly in the chips and the summary", async ({ page }) => {
    const id = process.env.DC_MIDDLING_ID;
    test.skip(!id, "middling report id not provided");
    await page.setViewportSize({ width: 1280, height: 2600 });
    await signIn(page, "student@case.edu");
    await page.goto(`/practice/difficult-conversation/report/${id}`);
    const panel = page.getByTestId("conversation-steps-panel");
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("conversation-steps-summary")).toHaveText(/\d+ hit · [1-9]\d* partly · \d+ missed/);
    await expect(panel.locator('[data-status="partly"]').first()).toHaveText("Partly");
    await shotPanel(page, "dc-five-moves-middling");
  });

  test("clinical checklist shows Partly", async ({ page }) => {
    const id = process.env.CLINICAL_PARTLY_ID;
    test.skip(!id, "clinical report id not provided");
    await page.setViewportSize({ width: 1280, height: 2600 });
    await signIn(page, "student@case.edu");
    await page.goto(`/practice/clinical-communication/report/${id}`);
    await page.getByRole("tab", { name: "Behaviors" }).click({ timeout: 60_000 });
    const panel = page.getByTestId("persona-checklist-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("persona-checklist-summary")).toContainText("Steps partly done");
    await expect(panel.getByText("Partly", { exact: true }).first()).toBeVisible();
    mkdirSync(SHOTS, { recursive: true });
    await panel.screenshot({ path: `${SHOTS}/clinical-checklist-partly-panel.png`, animations: "disabled" });
  });

  test("pre-checklist report renders without the panel", async ({ page }) => {
    const id = process.env.DC_OLD_ID;
    test.skip(!id, "old report id not provided");
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, "alice.johnson@case.edu");
    await page.goto(`/practice/difficult-conversation/report/${id}`);
    await expect(page.getByTestId("in-role-reaction-panel").or(page.getByText("Clarity").first())).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("conversation-steps-panel")).toHaveCount(0);
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/dc-old-report-unchanged.png`, fullPage: true, animations: "disabled" });
  });
});
