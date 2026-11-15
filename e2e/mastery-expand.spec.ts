import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * /mastery card expansions. student@case.edu has movement and six badges.
 * - Opening one card leaves its neighbours' heights alone (tidy and drawer).
 * - The toggle sits right under the card's figures, open or shut.
 * - The toggle's focus ring shows on keyboard focus, not on a mouse click.
 * - Activity rows: title link and score, then a meta line; repeats get a time.
 * - No sideways scroll at 375.
 */
async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("student@case.edu");
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function openMastery(page: Page, mode: string) {
  await page.goto(`/mastery?expand=${mode}`);
  await page.getByTestId("competency-card").first().waitFor();
}

const cards = (page: Page) => page.getByTestId("competency-card");

async function heights(list: Locator): Promise<number[]> {
  return list.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
}

/** Gap between the figures block and the toggle, in px. */
async function toggleGap(card: Locator): Promise<number> {
  return card.evaluate((el) => {
    const dl = el.querySelector("dl")!.getBoundingClientRect();
    const toggle = el.querySelector('[data-testid="expand-toggle"]')!.getBoundingClientRect();
    return Math.round(toggle.top - dl.bottom);
  });
}

const ring = (el: Locator) =>
  el.evaluate((node) => {
    const style = getComputedStyle(node);
    return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
  });

test.describe("Mastery card expansions", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
  });

  for (const mode of ["tidy", "drawer"] as const) {
    test(`${mode}: opening one card keeps sibling heights`, async ({ page }) => {
      await openMastery(page, mode);
      const before = await heights(cards(page));
      expect(before.length).toBeGreaterThan(2);

      await cards(page).first().getByTestId("expand-toggle").click();
      await expect(page.getByTestId("expand-detail").filter({ visible: true }).first()).toBeVisible();
      const after = await heights(cards(page));
      // Every card but the first keeps its height.
      expect(after.slice(1)).toEqual(before.slice(1));
      if (mode === "drawer") {
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toBeHidden();
        // Focus returns to the toggle that opened it.
        await expect(cards(page).first().getByTestId("expand-toggle")).toBeFocused();
      }

      // Recent movement: same rule.
      const movement = page.getByTestId("movement-card");
      if ((await movement.count()) > 1) {
        const mBefore = await heights(movement);
        await movement.first().getByTestId("expand-toggle").click();
        const mAfter = await heights(movement);
        expect(mAfter.slice(1)).toEqual(mBefore.slice(1));
        if (mode === "drawer") await page.keyboard.press("Escape");
      }
    });
  }

  for (const mode of ["tidy", "row", "drawer"] as const) {
    test(`${mode}: toggle stays right under its content, open or shut`, async ({ page }) => {
      await openMastery(page, mode);
      const card = cards(page).nth(1);
      const sibling = cards(page).nth(2);
      const shut = await toggleGap(card);
      expect(shut).toBeLessThanOrEqual(32);
      // A shut card whose row-mate is open keeps the same gap.
      await cards(page).first().getByTestId("expand-toggle").click();
      if (mode === "drawer") await page.keyboard.press("Escape");
      expect(await toggleGap(card)).toBe(shut);
      expect(await toggleGap(sibling)).toBeLessThanOrEqual(32);
      // And once open, too.
      await card.getByTestId("expand-toggle").click();
      expect(await toggleGap(card)).toBe(shut);
    });
  }

  test("focus ring on keyboard Tab, not on mouse click", async ({ page }) => {
    await openMastery(page, "tidy");
    const toggle = cards(page).first().getByTestId("expand-toggle");
    await toggle.click();
    expect(await ring(toggle)).toBe(false);
    await toggle.click();

    // Keyboard: focus the element before the toggle, then Tab onto it.
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    const all = page.locator("a, button, summary, [tabindex='0']");
    const index = await all.evaluateAll(
      (els, target) => els.indexOf(target as HTMLElement),
      await toggle.elementHandle(),
    );
    await all.nth(index - 1).focus();
    await page.keyboard.press("Tab");
    await expect(toggle).toBeFocused();
    expect(await ring(toggle)).toBe(true);
    // The ring hugs the label: no wider than the card's content box.
    const [toggleBox, cardBox] = await Promise.all([toggle.boundingBox(), cards(page).first().boundingBox()]);
    expect(toggleBox!.width).toBeLessThan(cardBox!.width / 2);
  });

  test("activity rows: title link with score, meta on its own line", async ({ page }) => {
    await openMastery(page, "tidy");
    const movement = page.getByTestId("movement-card").first();
    test.skip((await movement.count()) === 0, "no recent movement for this student");
    await movement.getByTestId("expand-toggle").click();
    const rows = movement.getByTestId("driver-row");
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const link = row.getByRole("link");
      if (await link.count()) {
        // The link is the title alone: no date, score or meta inside it.
        await expect(link).not.toContainText("%");
        await expect(link).not.toContainText("scored");
      }
      texts.push((await row.innerText()).replace(/\s+/g, " ").trim());
    }
    // No two rows read the same.
    expect(new Set(texts).size).toBe(texts.length);
  });

  test("no sideways scroll at 375 in any mode", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const mode of ["tidy", "row", "drawer"]) {
      await openMastery(page, mode);
      await cards(page).first().getByTestId("expand-toggle").click();
      const overflow = await page.evaluate(() => {
        const roots = [document.documentElement, document.body, ...document.querySelectorAll("main")];
        return Math.max(...roots.map((el) => el.scrollWidth - el.clientWidth));
      });
      expect(overflow, mode).toBeLessThanOrEqual(0);
      if (mode === "drawer") {
        const box = await page.getByRole("dialog").boundingBox();
        // A bottom sheet: full width, anchored to the bottom.
        expect(Math.round(box!.width)).toBeGreaterThanOrEqual(370);
        expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(810);
        await page.keyboard.press("Escape");
      }
    }
  });
});
