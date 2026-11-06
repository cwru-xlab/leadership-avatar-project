import { expect, test, type Page } from "@playwright/test";

// student@case.edu holds one perfect live row on Outcome achievement: the
// "100% off one session" state. alice.johnson@case.edu has a long record.
const SHOTS = ".loop-shots";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

function card(page: Page, label: string) {
  return page.getByRole("region", { name: "Mastery by competency" }).getByRole("listitem").filter({ hasText: label }).first();
}

test.describe("Mastery is an estimate, not an average", () => {
  test("one perfect session reads as an early read, not 100% or Mastered", async ({ page }) => {
    await signIn(page, "student@case.edu");
    const apiResponse = page.waitForResponse((r) => r.url().endsWith("/api/mastery") && r.ok());
    await page.goto("/mastery");
    const body = await (await apiResponse).json();

    const outcome = body.mastery.competencies.find((c: { competencyKey: string }) => c.competencyKey === "outcome_achievement");
    expect(outcome.lifetime.observedPercent).toBe(100);
    expect(outcome.lifetime.percent).toBe(66.7);
    expect(outcome.lifetime.tier).toBe("THIN");
    expect(outcome.lifetime.display).toBe("about 65%");
    expect(body.levels.outcome_achievement.current.level).toBe(2);
    expect(body.levels.outcome_achievement.current.toConfirm).toMatchObject({ level: 3, sessions: 1 });
    for (const competency of body.mastery.competencies) {
      expect(competency.lifetime.percent ?? 0).toBeLessThan(100);
    }

    const outcomeCard = card(page, "Outcome");
    await expect(outcomeCard).toContainText("about");
    await expect(outcomeCard).toContainText("65%");
    await expect(outcomeCard).toContainText("Early read");
    await expect(outcomeCard).toContainText("Level 2 · Building");
    await expect(outcomeCard).toContainText("1 more session to confirm Lv 3");
    // The real 100% is still told, but only as what was scored, behind the disclosure.
    await expect(outcomeCard.locator("dl")).not.toContainText("100%");
    await expect(outcomeCard).not.toContainText("Mastered");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${SHOTS}/mastery-one-session-1440.png`, fullPage: true });

    await outcomeCard.getByText("Trend and evidence").click();
    await expect(outcomeCard).toContainText("likely 45–90%. You averaged 100% across 1 activity.");
    await page.getByText("How these numbers work").click();
    await expect(page.getByText("Each session counts once")).toBeVisible();
    await outcomeCard.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/mastery-one-session-expanded-1440.png`, fullPage: true });

    await page.setViewportSize({ width: 375, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/mastery-one-session-375.png`, fullPage: true });
    await outcomeCard.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/mastery-one-session-card-375.png` });

    // Keyboard: the disclosure is reachable, toggles, and shows a focus ring only from the keyboard.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    const how = page.getByText("How these numbers work");
    await expect(how).toBeVisible();
    await how.click();
    expect(await how.evaluate((el) => el.matches(":focus-visible"))).toBe(false);
    await how.click();
    await how.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    expect(await how.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByText("Each session counts once")).toBeVisible();
  });

  test("the hero at 1440 shows the overall figure with its confidence", async ({ page }) => {
    await signIn(page, "student@case.edu");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/mastery");
    await expect(page.getByRole("heading", { name: "Your skill badges" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/mastery-student-top-1440.png` });
  });

  test("a long record shows whole numbers and a solid read, no decimals", async ({ page }) => {
    await signIn(page, "alice.johnson@case.edu");
    await page.setViewportSize({ width: 1440, height: 900 });
    const apiResponse = page.waitForResponse((r) => r.url().endsWith("/api/mastery") && r.ok());
    await page.goto("/mastery");
    const body = await (await apiResponse).json();
    await expect(page.getByRole("heading", { name: "Your skill badges" })).toBeVisible();

    const section = page.getByRole("region", { name: "Mastery by competency" });
    await expect(section).toContainText("Solid read");
    await expect(section.locator("dd", { hasText: /\d+\.\d%/ })).toHaveCount(0);
    expect(body.mastery.overall.lifetime.tier).toBe("ESTABLISHED");
    await page.screenshot({ path: `${SHOTS}/mastery-long-record-1440.png`, fullPage: true });

    await page.setViewportSize({ width: 375, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/mastery-long-record-375.png`, fullPage: true });
  });

  test("Growth since this plan never prints a standstill as x% to x%", async ({ page }) => {
    await signIn(page, "alice.johnson@case.edu");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/paths");
    const growth = page.getByRole("region", { name: "Growth since this plan" });
    await expect(growth).toBeVisible({ timeout: 30_000 });
    const text = (await growth.innerText()).replace(/\s+/g, " ");
    console.log(text);
    for (const match of text.matchAll(/All time (?:about )?(\d+)% → (?:about )?(\d+)%/g)) {
      expect(match[1]).not.toBe(match[2]);
    }
    expect(text).not.toMatch(/\d+\.\d%/);
    await growth.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/paths-growth-1440.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 800 });
    await growth.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/paths-growth-375.png`, fullPage: true });
  });
});
