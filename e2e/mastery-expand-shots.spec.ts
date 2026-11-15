import { test, type Page } from "@playwright/test";

/**
 * Screenshot capture for the /mastery expand comparison (not an assertion
 * spec). SHOT_MODE=before|tidy|row|drawer picks the label and the ?expand=.
 */
const MODE = process.env.SHOT_MODE ?? "tidy";
const DIR = "/Users/ajabreu79/projects/leadership-avatar-wt/screenshots-2026-11-14/mastery-expand";
const query = MODE === "before" ? "" : `?expand=${MODE}`;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("student@case.edu");
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function open(page: Page) {
  await page.goto(`/mastery${query}`);
  await page.getByRole("region", { name: "Mastery by competency" }).waitFor();
  await page.waitForTimeout(400);
}

const badges = (page: Page) => page.getByRole("region", { name: "Mastery by competency" });
const movement = (page: Page) => page.getByRole("region", { name: "Recent movement" });

test(`mastery expand shots: ${MODE}`, async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await open(page);

  // (a) one competency card open, the badge grid in view.
  const toggle = badges(page).getByText("Trend and evidence", { exact: true }).first();
  await toggle.click();
  await page.waitForTimeout(400);
  if (MODE === "drawer") {
    await page.screenshot({ path: `${DIR}/${MODE}-a-card-open-1440.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  } else {
    await badges(page).getByRole("heading", { name: "Your skill badges" }).evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${DIR}/${MODE}-a-card-open-1440.png` });
    // The toggle right after a mouse click: the focus ring should not show.
    await toggle.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${DIR}/${MODE}-a2-toggle-after-click-1440.png`,
      clip: await (async () => {
        const box = (await toggle.boundingBox())!;
        return { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 60), width: 460, height: 140 };
      })(),
    });
    // Keyboard focus on the same toggle: the ring should show, hugging the label.
    await page.keyboard.press("Shift");
    await toggle.evaluate((el) => (el as HTMLElement).focus());
    await page.screenshot({
      path: `${DIR}/${MODE}-a3-toggle-keyboard-focus-1440.png`,
      clip: await (async () => {
        const box = (await toggle.boundingBox())!;
        return { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 60), width: 460, height: 140 };
      })(),
    });
    await toggle.click();
  }

  // (b) Recent movement with one open.
  await open(page);
  const moved = movement(page).getByText(/^Moved by/).first();
  if (await moved.count()) {
    await moved.click();
    await page.waitForTimeout(400);
    if (MODE === "drawer") await page.screenshot({ path: `${DIR}/${MODE}-b-movement-open-1440.png` });
    else {
      await movement(page).evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${DIR}/${MODE}-b-movement-open-1440.png` });
    }
  }

  // (c) 375 wide, the first card open.
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  const narrow = badges(page).getByText("Trend and evidence", { exact: true }).first();
  await narrow.scrollIntoViewIfNeeded();
  await narrow.click();
  await page.waitForTimeout(400);
  if (MODE === "drawer") await page.screenshot({ path: `${DIR}/${MODE}-c-375.png` });
  else {
    const card = badges(page).getByRole("listitem").filter({ has: page.getByText("Trend and evidence", { exact: true }) }).first();
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DIR}/${MODE}-c-375.png`, fullPage: false });
  }
});
