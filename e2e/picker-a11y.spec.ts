import { expect, test, type Page } from "@playwright/test";

const SHOTS = "screenshots/picker-toolbar";
const STUDENT = { email: "student@case.edu", password: "student123" };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(STUDENT.email);
  await page.locator('input[type="password"]').fill(STUDENT.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test("keyboard reaches every toolbar control and the chips", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/practice/interviews/general");
  await expect(page.getByLabel("Search by name")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2000);

  // Tab from the search input through the facet and sort controls.
  await page.getByLabel("Search by name").focus();
  const seen: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return "none";
        return `${el.tagName}:${(el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || "").slice(0, 28).replace(/\n/g, " ")}`;
      }),
    );
    await page.keyboard.press("Tab");
  }
  console.log("tab order:", JSON.stringify(seen));

  // Keyboard-only: open Voice with Enter, choose with arrows, confirm a chip.
  await page.getByLabel("Search by name").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${SHOTS}/focus-dropdown-keyboard-1440.png` });
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  // Either voice is a pass: the point is that a keyboard-only student can
  // open the control, move through it and commit a choice.
  // Scoped to the chips list: the Select TRIGGER also reads "Male voice"
  // once chosen, and focusing that instead would just reopen the dropdown.
  const chip = page
    .locator("li")
    .getByRole("button", { name: /(Female|Male) voice/ })
    .first();
  await expect(chip).toBeVisible();
  console.log(
    "after keyboard pick:",
    (await chip.innerText()).trim(),
    "|",
    (await page.locator('[aria-live="polite"]').first().innerText()).trim(),
  );

  // The chip's own focus ring.
  await chip.focus();
  await page.screenshot({ path: `${SHOTS}/focus-chip-1440.png` });
  // Removing the chip by keyboard restores the full roster.
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  await expect(page.locator('[aria-live="polite"]').first()).toContainText("54 of 54");

  // Focus ring on the search field and on a card.
  await page.getByLabel("Search by name").focus();
  await page.screenshot({ path: `${SHOTS}/focus-search-1440.png` });
  await page.locator("button[aria-pressed]").nth(1).focus();
  await page.screenshot({ path: `${SHOTS}/focus-card-1440.png` });

  // Section headings are real headings a screen reader can navigate.
  const headings = await page.getByRole("heading", { level: 3 }).allInnerTexts();
  console.log("h3 sections:", JSON.stringify(headings));
  expect(headings).toContain("Weatherhead faculty");
});
