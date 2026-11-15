import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * /mastery details drawer. student@case.edu has movement and six badges.
 * - Opening a card's drawer leaves every card's height alone.
 * - The drawer closes on Esc and hands focus back to its toggle.
 * - At 375 it is a full-width bottom sheet; no sideways scroll.
 * - The toggle's focus ring shows on keyboard focus, not after a mouse click.
 * - Activity rows: title link and score, then a meta line; repeats differ.
 */
async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("student@case.edu");
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function openMastery(page: Page) {
  await page.goto("/mastery");
  await page.getByTestId("competency-card").first().waitFor();
}

const cards = (page: Page) => page.getByTestId("competency-card");
const movementCards = (page: Page) => page.getByTestId("movement-card");

async function heights(list: Locator): Promise<number[]> {
  return list.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
}

const ring = (el: Locator) =>
  el.evaluate((node) => {
    const style = getComputedStyle(node);
    return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
  });

test.describe("Mastery details drawer", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
  });

  test("opening a drawer keeps every card's height", async ({ page }) => {
    await openMastery(page);
    for (const list of [cards(page), movementCards(page)]) {
      if ((await list.count()) === 0) continue;
      const before = await heights(list);
      const toggle = list.first().getByTestId("expand-toggle");
      await expect(toggle).toHaveAttribute("aria-haspopup", "dialog");
      await toggle.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(await heights(list)).toEqual(before);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
    }
  });

  test("Esc closes the drawer and focus returns to the toggle", async ({ page }) => {
    await openMastery(page);
    const toggle = cards(page).nth(1).getByTestId("expand-toggle");
    await toggle.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Evidence from");
    await page.waitForTimeout(300);
    // At 1440 it is a side sheet on the right edge, full height.
    const box = (await dialog.boundingBox())!;
    expect(Math.round(box.x + box.width)).toBeGreaterThanOrEqual(1438);
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(890);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(toggle).toBeFocused();

    // Recent movement opens its activity list the same way.
    const moved = movementCards(page).first().getByTestId("expand-toggle");
    if (await moved.count()) {
      await moved.click();
      await expect(page.getByRole("dialog").getByTestId("driver-row").first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(moved).toBeFocused();
    }
  });

  test("focus ring on keyboard Tab, not after a mouse click", async ({ page }) => {
    await openMastery(page);
    const toggle = cards(page).first().getByTestId("expand-toggle");

    // Mouse: open, close with the mouse; focus lands back on the toggle without a ring.
    await toggle.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /close/i }).click();
    await expect(dialog).toBeHidden();
    expect(await ring(toggle)).toBe(false);

    // Keyboard: focus the stop before the toggle, then Tab onto it.
    const all = page.locator("a, button, summary");
    const index = await all.evaluateAll(
      (els, target) => els.indexOf(target as HTMLElement),
      await toggle.elementHandle(),
    );
    await all.nth(index - 1).focus();
    await page.keyboard.press("Tab");
    await expect(toggle).toBeFocused();
    expect(await ring(toggle)).toBe(true);
    // The ring hugs the label, not the card.
    const [toggleBox, cardBox] = await Promise.all([toggle.boundingBox(), cards(page).first().boundingBox()]);
    expect(toggleBox!.width).toBeLessThan(cardBox!.width / 2);
  });

  test("activity rows: title link with score, meta on its own line", async ({ page }) => {
    await openMastery(page);
    const toggle = movementCards(page).first().getByTestId("expand-toggle");
    test.skip((await toggle.count()) === 0, "no recent movement for this student");
    await toggle.click();
    const rows = page.getByRole("dialog").getByTestId("driver-row");
    await expect(rows.first()).toBeVisible();
    const texts: string[] = [];
    for (let i = 0; i < (await rows.count()); i++) {
      const row = rows.nth(i);
      const link = row.getByRole("link");
      if (await link.count()) {
        // The link is the title alone: no score or meta inside it.
        await expect(link).not.toContainText("%");
        await expect(link).not.toContainText("scored");
      }
      texts.push((await row.innerText()).replace(/\s+/g, " ").trim());
    }
    // No two rows read the same.
    expect(new Set(texts).size).toBe(texts.length);
  });

  test("375: bottom sheet, no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openMastery(page);
    const overflow = () =>
      page.evaluate(() => {
        const roots = [document.documentElement, document.body, ...document.querySelectorAll("main")];
        return Math.max(...roots.map((el) => el.scrollWidth - el.clientWidth));
      });
    expect(await overflow()).toBeLessThanOrEqual(0);
    const toggle = cards(page).first().getByTestId("expand-toggle");
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(300);
    const box = (await dialog.boundingBox())!;
    expect(Math.round(box.width)).toBeGreaterThanOrEqual(370);
    expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(810);
    expect(box.y).toBeGreaterThan(0);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
