import { expect, test, type Page } from "@playwright/test";

/**
 * Display titles, the study-plan report picker, and My Reports filtering.
 * Read-only against the seeded test accounts: student@case.edu holds two
 * identical same-day general interviews; alice.johnson@case.edu holds many
 * reports and saved plans, with identical same-day sessions among them.
 */
const SHOTS = ".loop-shots";
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 375, height: 800 };

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

const rows = (page: Page) => page.getByRole("region", { name: "Practice reports" }).locator("ul li a");
const countOf = async (page: Page) => (await page.getByTestId("report-count").innerText()).trim();
const wordCount = (title: string) => title.split(/\s+/).filter((word) => word !== "·").length;

async function reportsReady(page: Page) {
  await expect(rows(page).first()).toBeVisible({ timeout: 40_000 });
}

test("the reports API stays owner-scoped", async ({ page }) => {
  // Signed out, the middleware redirects to /login before the route runs.
  const signedOut = await page.request.get("/api/practice/reports", { maxRedirects: 0 });
  expect(signedOut.status()).toBe(307);
  expect(signedOut.headers().location).toBe("/login");

  await signIn(page, "student@case.edu");
  const student = await (await page.request.get("/api/practice/reports")).json();
  // student@case.edu has no saved plans, so no report of theirs can count as planned.
  expect(student.plannedReportIds).toEqual([]);
  const studentIds = new Set(student.reports.map((report: { id: string }) => report.id));

  await page.context().clearCookies();
  await signIn(page, "alice.johnson@case.edu");
  const alice = await (await page.request.get("/api/practice/reports")).json();
  expect(alice.plannedReportIds.length).toBeGreaterThan(0);
  expect(alice.reports.some((report: { id: string }) => studentIds.has(report.id))).toBe(false);
});

test.describe("student@case.edu: identical same-day interviews", () => {
  test("picker tells them apart, in plain language, with real checkboxes", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signIn(page, "student@case.edu");
    await page.goto("/reports");
    await reportsReady(page);
    await page.getByRole("button", { name: "Generate study plan" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Choose which interviews to use")).toBeVisible();
    await expect(dialog.getByText(/2 selected, up to 10/)).toBeVisible();
    await expect(dialog).not.toContainText("cap 10");

    const boxes = dialog.getByRole("checkbox");
    await expect(boxes).toHaveCount(2);
    const names = await Promise.all([0, 1].map(async (i) => (await boxes.nth(i).evaluate(
      (el) => el.closest("label")?.textContent ?? "",
    )).trim()));
    console.log("picker rows:", names);
    expect(names[0]).not.toBe(names[1]);
    expect(names[0]).toMatch(/\d{1,2}:\d{2}\s?[AP]M/);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/picker-1440.png` });

    await boxes.nth(1).focus();
    await page.keyboard.press("Space");
    await expect(dialog.getByText(/1 selected, up to 10/)).toBeVisible();
    await dialog.getByRole("button", { name: "Clear" }).click();
    await expect(dialog.getByRole("button", { name: "Generate study plan" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Use latest 2" }).click();
    await expect(dialog.getByText(/2 selected, up to 10/)).toBeVisible();

    await page.setViewportSize(PHONE);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/picker-375.png` });
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await page.setViewportSize(DESKTOP);
    const titles = await rows(page).allInnerTexts();
    const interviews = titles.filter((text) => text.startsWith("General interview"));
    console.log("list rows:", interviews.map((text) => text.split("\n")[0]));
    expect(new Set(interviews.map((text) => text.split("\n")[0])).size).toBe(interviews.length);

    await rows(page).filter({ hasText: "General interview" }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("General interview", { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/Your interview report/);
    await page.screenshot({ path: `${SHOTS}/report-header-1440.png` });
  });
});

test.describe("alice.johnson@case.edu: many reports and plans", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signIn(page, "alice.johnson@case.edu");
  });

  test("filters cover the whole list and live in the URL", async ({ page }) => {
    await page.goto("/reports");
    await reportsReady(page);
    const initial = await countOf(page);
    const total = Number(initial.match(/\d+/)![0]);
    expect(total).toBeGreaterThan(10);


    // Same-day repeats get a time, all within the word budget.
    const search = page.getByRole("textbox", { name: "Search reports" });
    await search.fill("asking manager raise");
    await expect(page).toHaveURL(/q=asking/);
    await expect(page.getByTestId("report-count")).toContainText(`of ${total}`);
    const raise = (await rows(page).allInnerTexts()).map((text) => text.split("\n")[0]!);
    console.log("same-day repeats:", raise.slice(0, 4));
    expect(raise.length).toBeGreaterThan(1);
    expect(new Set(raise).size).toBe(raise.length);
    raise.forEach((title) => expect(wordCount(title)).toBeLessThanOrEqual(8));
    expect(raise[0]).toMatch(/^Asking your manager for a raise · .*[AP]M$/);
    await page.screenshot({ path: `${SHOTS}/reports-search-1440.png` });

    // A match beyond the 10 drawn rows proves the filter isn't page-bound:
    // sorting oldest shows reports the unfiltered first page never drew.
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(search).toHaveValue("");
    await page.getByRole("combobox", { name: "Sort reports" }).selectOption("oldest");
    await expect(page).toHaveURL(/sort=oldest/);
    await expect(page.getByTestId("report-count")).toHaveText(`${total} reports`);

    // Progressive disclosure: the panel starts closed.
    await expect(page.locator("#report-filters")).toHaveCount(0);
    await page.getByRole("button", { name: /^Filters/ }).click();
    await expect(page.locator("#report-filters")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/reports-filters-open-1440.png`, fullPage: true });

    // Score band.
    await page.getByLabel("Content score").selectOption("high");
    await expect(page).toHaveURL(/content=high/);
    const high = Number((await countOf(page)).match(/\d+/)![0]);
    expect(high).toBeLessThan(total);
    expect(high).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: /Remove filter: Content/ })).toBeVisible();

    // Study-plan filter splits the band exactly.
    await page.locator("#report-filters").getByLabel("Study plan").selectOption("with");
    const withPlan = Number((await countOf(page)).match(/\d+/)![0]);
    await page.locator("#report-filters").getByLabel("Study plan").selectOption("without");
    const withoutPlan = Number((await countOf(page)).match(/\d+/)![0]);
    expect(withPlan + withoutPlan).toBe(high);

    // Back undoes the last filter; a reload keeps the rest.
    await page.goBack();
    await expect(page).toHaveURL(/plan=with(&|$)/);
    expect(Number((await countOf(page)).match(/\d+/)![0])).toBe(withPlan);
    await page.reload();
    await reportsReady(page).catch(() => undefined);
    await expect(page.getByRole("button", { name: /Remove filter: Used in a study plan/ })).toBeVisible();
    await expect(page.getByTestId("report-count")).toContainText(`${withPlan} of ${total}`);

    // Removing a chip works alone.
    await page.getByRole("button", { name: /Remove filter: Used in a study plan/ }).click();
    await expect(page).not.toHaveURL(/plan=/);
  });

  test("type, date range, empty state, deep link and back link", async ({ page }) => {
    await page.goto("/reports?type=pitch&from=2026-10-25&to=2026-10-25&sort=newest");
    await reportsReady(page);
    await expect(page.getByRole("button", { name: /^Pitches/ })).toHaveAttribute("aria-pressed", "true");
    const texts = await rows(page).allInnerTexts();
    expect(texts.length).toBeGreaterThan(0);
    texts.forEach((text) => expect(text).toMatch(/pitch/i));
    await expect(page.getByRole("button", { name: /Remove filter: From/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Remove filter: To/ })).toBeVisible();

    await rows(page).first().click();
    await page.waitForURL(/\/reports\/[0-9a-f-]+/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/Your (interview|practice) report/, { timeout: 30_000 });
    await page.getByRole("button", { name: "My reports" }).click();
    await page.waitForURL(/\/reports\?.*type=pitch/, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Remove filter: From/ })).toBeVisible();

    await page.getByRole("textbox", { name: "Search reports" }).fill("zzz-no-such-report");
    await expect(page.getByText("Nothing matches “zzz-no-such-report”.")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/reports-empty-1440.png` });
    await page.getByRole("button", { name: "Clear all filters" }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await reportsReady(page);
  });

  test("phone layout has no horizontal scroll, open or closed", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/reports?content=high");
    await reportsReady(page);
    await page.getByRole("button", { name: /^Filters/ }).click();
    await expect(page.locator("#report-filters")).toBeVisible();
    await page.locator("#report-filters").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/reports-filters-375.png` });
    await page.locator("#report-filters").screenshot({ path: `${SHOTS}/reports-filters-panel-375.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("picker with a long list: filter, scrolling, limit", async ({ page }) => {
    await page.goto("/reports");
    await reportsReady(page);
    await page.getByRole("button", { name: "Generate study plan" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/10 selected, up to 10/)).toBeVisible();
    await expect(dialog.getByText(/most one plan can use/)).toBeVisible();

    const boxes = dialog.getByRole("checkbox");
    const total = await boxes.count();
    expect(total).toBeGreaterThan(10);
    await expect(boxes.nth(total - 1)).toBeDisabled();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/picker-long-1440.png` });

    // Keyboard focus shows the ring on the row's checkbox.
    await dialog.getByRole("textbox", { name: "Filter interviews" }).focus();
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);
    await dialog.locator("ul").screenshot({ path: `${SHOTS}/picker-focus-1440.png` });

    await boxes.first().uncheck({ force: true });
    await expect(dialog.getByText(/9 selected, up to 10/)).toBeVisible();
    await expect(boxes.nth(total - 1)).toBeEnabled();

    const filter = dialog.getByRole("textbox", { name: "Filter interviews" });
    await filter.fill("zzz-nothing");
    await expect(dialog.getByText("No interviews match that filter.")).toBeVisible();
    await expect(dialog.getByText(/hidden by your filter/)).toBeVisible();
    await filter.fill("");
    await expect(boxes).toHaveCount(total);
    await page.setViewportSize(PHONE);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/picker-long-375.png` });
  });

  test("plan titles are short and distinct on every plan surface", async ({ page }) => {
    await page.goto("/study-plans");
    await expect(page.locator('a[href^="/study-plans/"] .font-display').first()).toBeVisible({ timeout: 40_000 });
    const cards = await page.locator('a[href^="/study-plans/"] .font-display').allInnerTexts();
    console.log("plan cards:", cards);
    expect(new Set(cards).size).toBe(cards.length);
    cards.forEach((title) => {
      expect(wordCount(title)).toBeLessThanOrEqual(8);
      expect(title).not.toMatch(/self-paced|study plan|practice plan/i);
    });
    await page.screenshot({ path: `${SHOTS}/study-plans-1440.png` });

    await page.locator('a[href^="/study-plans/"]').first().click();
    await page.waitForURL(/\/study-plans\/[0-9a-f-]+/, { timeout: 30_000 });
    const h1 = await page.getByRole("heading", { level: 1 }).innerText();
    expect(cards[0]!.startsWith(h1.replace(/…$/, ""))).toBe(true);
    await page.screenshot({ path: `${SHOTS}/plan-page-1440.png` });

    await page.goto("/paths");
    await expect(page.getByRole("button", { expanded: false }).filter({ hasText: /plans?$/ })).toBeVisible({ timeout: 40_000 });
    await page.getByRole("button", { expanded: false }).filter({ hasText: /plans?$/ }).click();
    const options = await page.getByRole("option").allInnerTexts();
    console.log("paths switcher:", options.map((text) => text.split("\n")[0]));
    expect(options.join("\n")).not.toMatch(/self-paced|study plan:|practice plan/i);
    await page.screenshot({ path: `${SHOTS}/paths-switcher-1440.png` });
  });
});
