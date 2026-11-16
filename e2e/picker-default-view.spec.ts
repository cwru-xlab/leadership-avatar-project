import { expect, test, type Page } from "@playwright/test";

/**
 * Which of the interviewer picker's two views opens, and that an explicit
 * choice survives everything after it.
 *
 * WHY THIS IS PERMANENT COVERAGE. The default is now derived from the viewport
 * rather than hardcoded, and that is a hydration-sensitive thing to do in an
 * App Router app: reading `window.matchMedia` during the first render would
 * make the server send rows and the client render cards, which React answers by
 * throwing the markup away and warning. The implementation avoids that by
 * starting at the server's answer and correcting in an effect, and the only way
 * to know it still does is to watch the console on a real load — so this spec
 * asserts the absence of a hydration warning at BOTH widths, not just the
 * rendered view.
 *
 * The three behaviours below each have their own way of regressing:
 *
 *  - WIDTH PICKS THE DEFAULT. The grid is ~6.9 viewport-heights at 1440 and
 *    ~24 at 375 (rows: ~3.1 and ~9.3). A face is worth the scrolling on a
 *    desktop window and not on a phone, so the split exists; a single
 *    hardcoded default is a one-line edit away from coming back.
 *  - AN EXPLICIT CHOICE IS STICKY ACROSS A RESIZE. `view` is DERIVED from a
 *    nullable "what the student picked", precisely so a resize cannot walk back
 *    over the toggle. An implementation that instead synced state in an effect
 *    would pass the two default assertions and fail here.
 *  - CHOOSING THE NON-DEFAULT VIEW MUST STICK WITHOUT A RESIZE AT ALL. This is
 *    the regression a naive effect produces most often: picking rows at 1440
 *    and having the next render snap back to the grid. It is asserted after a
 *    filter change, because a re-render is what would reveal it.
 */

const STUDENT = { email: "student@case.edu", password: "student123" };

async function signIn(page: Page) {
  await page.goto("/login");
  const email = page.locator('input[type="email"]');
  const password = page.locator('input[type="password"]');
  // Assert the values survived: typing before the form hydrates gets silently
  // reset and submits an empty form.
  await expect(async () => {
    await email.fill(STUDENT.email);
    await password.fill(STUDENT.password);
    expect(await email.inputValue()).toBe(STUDENT.email);
    expect(await password.inputValue()).toBe(STUDENT.password);
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function openPicker(page: Page) {
  await page.goto("/practice/interviews/general");
  await expect(page.getByRole("heading", { name: "Choose your interviewer" })).toBeVisible({
    timeout: 60_000,
  });
  // The roster arrives over fetch, and the view toggle is only meaningful once
  // there are cards to toggle.
  await expect(page.getByRole("radio", { name: "Photo grid" })).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1200);
}

/**
 * Which view is on, read from the toolbar's radiogroup rather than from the
 * cards: it is the control the student sees, and it cannot be satisfied by a
 * card that merely happens to be tall.
 */
async function activeView(page: Page): Promise<"grid" | "list"> {
  const grid = await page
    .getByRole("radio", { name: "Photo grid" })
    .getAttribute("aria-checked");
  const list = await page
    .getByRole("radio", { name: "Compact list" })
    .getAttribute("aria-checked");
  expect([grid, list], "exactly one view must be checked").toEqual(
    grid === "true" ? ["true", "false"] : ["false", "true"],
  );
  return grid === "true" ? "grid" : "list";
}

/** The rendered geometry behind the toggle: cards are tall, rows are not. */
const FIRST_OPTION_HEIGHT = `(() => {
  const first = document.querySelector("main button[aria-pressed]");
  return first ? Math.round(first.getBoundingClientRect().height) : 0;
})()`;

test("the picker opens on the grid on desktop and on rows on a phone", async ({ page }) => {
  test.setTimeout(180_000);

  // Every console message and uncaught error for the whole run. A hydration
  // mismatch is reported as a warning and would otherwise pass unnoticed.
  const noise: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") noise.push(message.text());
  });
  page.on("pageerror", (error) => noise.push(error.message));

  await signIn(page);

  for (const [width, height, expected, label] of [
    [1440, 900, "grid", "desktop"],
    [375, 812, "list", "phone"],
  ] as const) {
    noise.length = 0;
    await page.setViewportSize({ width, height });
    await openPicker(page);

    expect(await activeView(page), `${label}: wrong view opened`).toBe(expected);

    // And the view the toggle claims is the one that rendered.
    const optionHeight = (await page.evaluate(FIRST_OPTION_HEIGHT)) as number;
    console.log(`${width} default: ${expected}, first option ${optionHeight}px`);
    if (expected === "grid") {
      expect(optionHeight, `${label}: grid default did not render photo cards`).toBeGreaterThan(200);
    } else {
      expect(optionHeight, `${label}: list default did not render compact rows`).toBeLessThan(100);
    }

    // THE POINT OF THIS SPEC. The default is read from the viewport, which is
    // only safe if the first client render still agrees with the server's.
    const hydration = noise.filter((text) => /hydrat/i.test(text));
    expect(hydration, `${label}: React reported a hydration mismatch`).toEqual([]);

    // Evidence has to show the roster, and on a phone the toolbar is below the
    // hero and the pace panel, so scroll the first option into frame.
    await page.evaluate(`(() => {
      document.querySelector("main button[aria-pressed]").scrollIntoView({ block: "center" });
    })()`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `screenshots/picker-default/${width}-default.png` });
  }
});

test("the view the student picks survives a resize and a re-render", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);

  // Pick the grid on a phone — against that width's default — then widen.
  await page.setViewportSize({ width: 375, height: 812 });
  await openPicker(page);
  expect(await activeView(page)).toBe("list");
  await page.getByRole("radio", { name: "Photo grid" }).click();
  expect(await activeView(page)).toBe("grid");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(600);
  expect(await activeView(page), "a resize undid the student's choice").toBe("grid");

  // The harder direction, and the one a synced-state implementation breaks:
  // choosing rows at a width whose DEFAULT is the grid must not snap back,
  // including across the re-render a filter change forces.
  await page.getByRole("radio", { name: "Compact list" }).click();
  expect(await activeView(page)).toBe("list");
  await page.getByLabel("Search by name").fill("scott");
  await page.waitForTimeout(700);
  expect(await activeView(page), "a re-render snapped the view back to the default").toBe("list");
  expect(
    (await page.evaluate(FIRST_OPTION_HEIGHT)) as number,
    "the view reverted to cards even though rows stayed checked",
  ).toBeLessThan(100);

  // Narrowing again must also leave it alone: the choice is the choice.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(600);
  expect(await activeView(page), "narrowing undid the student's choice").toBe("list");
});
