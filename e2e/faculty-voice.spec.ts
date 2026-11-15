import { expect, test, type Page } from "@playwright/test";

/**
 * The Voice filter against the five Weatherhead faculty.
 *
 * WHY THIS EXISTS. The faculty speak with custom voices absent from HeyGen's
 * preset catalog, so the vendor supplies no gender for them and the picker's
 * "absent means always-visible" rule kept all five under BOTH choices: a
 * student asking for a female voice was shown four male instructors, and one
 * asking for a male voice was shown Jenny Hawkins. `FACULTY_VOICE_GENDER`
 * curates the five values; this spec is what keeps them honest.
 *
 * It asserts through the live catalog rather than a fixture, so a faculty
 * avatar added upstream without an entry in that map fails here.
 */

const STUDENT = { email: "student@case.edu", password: "student123" };

/** The account's five custom avatars, and how each voice reads. */
const FACULTY: Readonly<Record<string, "female" | "male">> = {
  "Jenny Hawkins": "female",
  "Scott Cowen": "male",
  "Richard Boyatsis": "male",
  "Michael Goldberg": "male",
  "John Paul Stephens": "male",
};

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

test("every faculty voice carries a gender, and the vendor still wins", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const catalog = await page.evaluate(
    `fetch("/api/interview/interviewers").then((r) => r.json())`,
  );
  const list = ((catalog as { interviewers?: unknown[] }).interviewers ?? []) as Array<{
    name: string;
    gender?: string;
    faculty?: boolean;
  }>;
  expect(list.length, "catalog came back empty").toBeGreaterThan(10);

  const faculty = list.filter((o) => o.faculty);
  expect(faculty.length, "expected the five custom faculty avatars").toBe(
    Object.keys(FACULTY).length,
  );
  for (const person of faculty) {
    const expected = FACULTY[person.name];
    expect(expected, `${person.name} is faculty but not in this spec's map`).toBeDefined();
    expect(person.gender, `${person.name}'s voice gender`).toBe(expected);
  }

  // The curated map fills a GAP; it must never restate or override a vendor
  // value, so no stock face may depend on it.
  const stockMissing = list.filter((o) => !o.faculty && !o.gender).map((o) => o.name);
  expect(stockMissing, "stock faces should carry a vendor gender").toEqual([]);
});

test("the Voice filter splits the faculty instead of showing all five", async ({ page }) => {
  test.setTimeout(150_000);
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const choice of ["female", "male"] as const) {
    // Fresh load per choice: re-opening the select and picking a second option
    // toggles the first one off and clears the filter instead.
    await page.goto("/practice/interviews/general");
    await expect(page.getByRole("heading", { name: "Choose your interviewer" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByLabel("Search by name")).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);

    const trigger = page.locator('button[data-slot="trigger"]').first();
    await trigger.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await trigger.click();
    await expect(page.getByRole("listbox")).toBeVisible({ timeout: 15_000 });
    // By data-key, not by label: both labels contain "voice", and matching on
    // text picked the same option twice.
    await page.locator(`li[role="option"][data-key="${choice}"]`).click();
    await page.waitForTimeout(900);

    const shown = await page.evaluate(
      `(() => Array.from(document.querySelectorAll('main button[aria-pressed]')).map((b) => b.textContent.trim()))()`,
    );
    const names = shown as string[];
    for (const [person, voice] of Object.entries(FACULTY)) {
      const listed = names.some((n) => n.includes(person));
      expect(listed, `${person} under the ${choice}-voice filter`).toBe(voice === choice);
    }
  }
});

test("the always-visible caveat retires while the roster is fully described", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  await page.goto("/practice/interviews/general");
  await expect(page.getByRole("heading", { name: "Choose your interviewer" })).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);

  const trigger = page.locator('button[data-slot="trigger"]').first();
  await trigger.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible({ timeout: 15_000 });
  await page.locator('li[role="option"][data-key="female"]').click();
  await page.waitForTimeout(900);

  // The note is computed from live data, so with every face described it
  // should be gone. If a future avatar arrives undescribed it comes back —
  // that is the rule working, and this assertion is the tripwire that says so.
  await expect(page.getByText(/listed under either choice/)).toHaveCount(0);
});
