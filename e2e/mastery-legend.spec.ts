import { expect, test, type Page } from "@playwright/test";

/**
 * The level legend beside "Your skill badges" is a KEY for the 1-5 ramp, so it
 * shows the whole scale regardless of where a given student sits.
 *
 * It used to be built from the levels present in that student's own data, which
 * failed in two ways:
 *   - a student holding levels 2 and 3 saw only "2 Building — 3 Competent", so
 *     a partial scale looked like the whole scale and "Competent" read as the
 *     top rung rather than the middle one;
 *   - a student with fewer than two distinct levels (one.session@case.edu) hit
 *     a `steps.length < 2` guard and got no legend at all.
 *
 * Both students below therefore assert the SAME five rungs. one.session is the
 * falsifying case for the second bug specifically: it holds one level, so any
 * return to data-derived rungs drops it to one rung or none and fails here.
 */

const LEVEL_NAMES = ["Starting out", "Building", "Competent", "Strong", "Mastered"];

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

function legend(page: Page) {
  return page.getByRole("list", { name: "Levels" });
}

for (const { email, tag } of [
  // A long record spanning several levels.
  { email: "alice.johnson@case.edu", tag: "many-levels" },
  // One live session, so ONE distinct level: the old guard showed nothing here.
  { email: "one.session@case.edu", tag: "one-level" },
]) {
  test(`the level legend shows all five rungs (${tag})`, async ({ page }) => {
    await signIn(page, email);
    await page.goto("/mastery");

    const ladder = legend(page).first();
    await expect(ladder).toBeVisible();

    // Every rung, in order, with its word — not just the ones this student holds.
    const rungs = ladder.getByRole("listitem");
    await expect(rungs).toHaveCount(5);
    for (const [i, name] of LEVEL_NAMES.entries()) {
      await expect(rungs.nth(i)).toContainText(name);
      await expect(rungs.nth(i)).toContainText(String(i + 1));
    }

    // Reached-ness is stated in words, not carried by the dimming alone.
    const labels = await ladder.locator("span[aria-label]").evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("aria-label") ?? ""),
    );
    expect(labels).toHaveLength(5);
    for (const [i, name] of LEVEL_NAMES.entries()) {
      expect(labels[i]).toMatch(
        new RegExp(`^Level ${i + 1}, ${name}, (reached|not reached)$`),
      );
    }
    // A legend that claimed every rung were reached would be meaningless, and
    // one that claimed none would mean the student's own level never resolved.
    const reached = labels.filter((l) => l.endsWith(", reached"));
    expect(reached.length).toBeGreaterThan(0);
    expect(reached.length).toBeLessThan(5);

    await ladder.screenshot({ path: `screenshots/mastery-legend/${tag}.png` });
  });
}
