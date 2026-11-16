import { expect, test, type Page } from "@playwright/test";

/**
 * The interviewer's display name is derived from the VOICE name.
 *
 * WHY. The picker used to print both the avatar name and the voice name, which
 * mostly restated each other ("Scott Cowen / Scott Cowen", "Emily (Friendly) /
 * Emily"). One name now, taken from the voice.
 *
 * WHAT COULD GO WRONG, and is therefore asserted here:
 *  - Taking the voice name LITERALLY would print HeyGen's profile suffix on 19
 *    of 54 faces ("Ann - IA", "Dexter - Professional") — worse than the
 *    duplication it replaced. Only the lead segment is a person's name.
 *  - Two faces could collapse onto one name, leaving a student unable to tell
 *    two cards apart.
 *  - A churned-in avatar could arrive with no voice name at all.
 *
 * Asserted against the LIVE catalog, not a fixture, so upstream churn that
 * breaks any of it fails here rather than in front of a student.
 */

const STUDENT = { email: "student@case.edu", password: "student123" };

/** Vendor shoot metadata and voice-profile words. None may reach a student. */
const VENDOR_WORDS = [
  "(Friendly)",
  "(Curious)",
  "(Sad)",
  " Sitting",
  " - IA",
  "Lifelike",
  "Professional",
  "Therapist",
  "Tech Expert",
];

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

interface Option {
  name: string;
  voice: { name: string };
}

test("names come from the voice name, cleanly and uniquely", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const catalog = await page.evaluate(
    `fetch("/api/interview/interviewers").then((r) => r.json())`,
  );
  const list = ((catalog as { interviewers?: unknown[] }).interviewers ?? []) as Option[];
  expect(list.length, "catalog came back empty").toBeGreaterThan(10);

  for (const option of list) {
    // The name is the voice name's lead segment, with the profile dropped.
    const lead = option.voice.name.split(/\s+-\s+/)[0]!.trim();
    expect(option.name, `${option.voice.name} should display as its lead segment`).toBe(lead);
    expect(option.name.length, "a face arrived with no usable name").toBeGreaterThan(0);
    // No vendor jargon, and no leftover " - " from a multi-dash voice name.
    expect(option.name, `"${option.name}" still carries a profile suffix`).not.toContain(" - ");
    for (const word of VENDOR_WORDS) {
      expect(option.name, `"${option.name}" still carries vendor word "${word}"`).not.toContain(
        word,
      );
    }
  }

  // Two cards must never read the same.
  const byLower = new Map<string, string[]>();
  for (const option of list) {
    const key = option.name.toLowerCase();
    byLower.set(key, [...(byLower.get(key) ?? []), option.voice.name]);
  }
  const collisions = [...byLower.entries()].filter(([, v]) => v.length > 1);
  expect(collisions.map(([name, v]) => `${name}: ${v.join(" | ")}`), "two faces share a name").toEqual(
    [],
  );
  expect(byLower.size, "distinct names should equal the roster size").toBe(list.length);
});

test("a card shows one name and no voice line", async ({ page }) => {
  test.setTimeout(150_000);
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/practice/interviews/general");
  await expect(page.getByRole("heading", { name: "Choose your interviewer" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByLabel("Search by name")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);

  for (const view of ["Compact list", "Photo grid"]) {
    await page.getByRole("radio", { name: view }).click();
    await page.waitForTimeout(800);

    const visible = await page.evaluate(
      `(() => document.querySelector("main").innerText)()`,
    );
    for (const word of VENDOR_WORDS) {
      // "Professional" and "Lifelike" only ever appeared as voice-profile
      // labels on these cards, so their absence is the duplication's absence.
      expect(String(visible), `${view} still shows vendor word "${word}"`).not.toContain(word);
    }

    // A card's own text is the name (plus its role line in the grid), never a
    // name followed by a restatement of the same name.
    const repeated = await page.evaluate(`(() => {
      const cards = Array.from(document.querySelectorAll('main button[aria-pressed]'));
      return cards
        .map((b) => b.innerText.replace(/\\s+/g, " ").trim())
        .filter((t) => {
          const first = t.split(" ")[0];
          if (!first) return false;
          // The first token appearing twice is the old double listing.
          return t.split(first).length - 1 > 1;
        });
    })()`);
    expect(repeated as string[], `${view} repeats a name within one card`).toEqual([]);
  }
});
