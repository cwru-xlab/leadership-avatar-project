import { expect, test, type Page } from "@playwright/test";

/**
 * "The job" on the customize page: who is asked, and what reaches the prompt.
 *
 * WHY THIS IS PERMANENT COVERAGE. This guards a fix for a SILENT
 * prompt-corruption bug, which is the kind that can be reintroduced without
 * anything looking wrong on screen. The customize page used to offer Role tiles
 * on every preset, and `resolveInterviewType` overwrites `defaultRoleTitle`
 * with any curated role slug it is handed — and `defaultRoleTitle` is what the
 * system prompt interpolates as "- Target role:" and tailors its
 * role/industry-specific stage to. So picking "Sales / client-facing" on the
 * engineering behavioral interview briefed the interviewer for a sales role,
 * contradicting the interview the student had chosen, with no visible symptom.
 * The session still started, the avatar still spoke, and only the questions
 * were wrong.
 *
 * `scripts/verify-implied-role.ts` covers the resolver's half (an absent role
 * falls back to the preset's own). This covers the half only a browser can see:
 * that the page really withholds the field. Both are needed — the resolver
 * fallback protects nothing if the page starts sending a role again, and
 * withholding protects nothing if the fallback is replaced by a default.
 *
 * Each assertion below fails differently:
 *
 *  - NO ROLE AND NO INDUSTRY IN THE PAYLOAD on the industry path. The actual
 *    bug. Read off the real `/api/practice/session/start` request, which is
 *    aborted, so no report row, no avatar and no model call. A field that is
 *    offered IS asserted present in the same payload, so "no roleSlug" can
 *    never pass for the uninteresting reason that no payload was written.
 *  - THE ROLE IS STILL SENT on the general interview. This is what catches an
 *    over-broad fix. Withholding the role everywhere would make the industry
 *    assertion greener and would silently delete the general interview's only
 *    way to say what job it is for.
 *  - A STALE `?role=` CANNOT GET THROUGH. The page mirrors choices into the
 *    query string, so a shared link or Back out of the wizard can carry a role
 *    for a page that no longer shows one. Hiding the section while still
 *    restoring and submitting that value would be a half-fix that looks
 *    complete.
 *  - THE SECTION IS ABSENT FROM THE DOM, not merely invisible, and the recap
 *    carries no Role or Industry row — a summary of a control the student never
 *    saw is the same contradiction one step later.
 */

const STUDENT = { email: "student@case.edu", password: "student123" };
const JOB_SECTION = 'section[aria-labelledby="customize-role"]';
/** A curated role that matches no preset's own, so an overwrite would be visible. */
const STALE_ROLE = "sales-client-facing";

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

/** The recap's labels, lowercased: the markup is sentence case, CSS uppercases it. */
async function recapLabels(page: Page): Promise<string[]> {
  const labels = await page.locator('section[aria-labelledby="setup-recap"] dt').allInnerTexts();
  return labels.map((text) => text.trim().toLowerCase());
}

/**
 * Walks the setup wizard to the camera step and captures the session-start body
 * WITHOUT starting a session: the request is aborted, so there is no report row,
 * no avatar and no model call. Same approach as
 * `e2e/interview-picker.spec.ts`'s `captureStartBody`.
 *
 * Also returns the Briefing step's text, which reads back the RESOLVED role —
 * the closest thing to the assembled prompt that is visible in a browser, and
 * the reason this spec can claim the prompt is right rather than just the
 * payload.
 */
async function captureStartBody(
  page: Page,
): Promise<{ customization: Record<string, unknown> | undefined; briefing: string }> {
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/practice/session/start", async (route) => {
    body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.abort();
  });
  await page.locator("button[aria-pressed]").first().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  const briefing = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  await page.getByRole("button", { name: /Continue to camera setup/ }).click();
  await page.getByRole("button", { name: /Camera off/ }).click();
  await expect.poll(() => body !== null, { timeout: 30_000 }).toBe(true);
  return {
    customization: body![("customization" as const)] as Record<string, unknown> | undefined,
    briefing,
  };
}

test("industry-specific customize pages do not ask for the job", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);

  // One non-problem preset (technical) and the problem presets, because the
  // section's two halves used to be gated by different conditions.
  for (const slug of ["technical", "finance", "system-design", "consulting"]) {
    await page.goto(`/practice/interviews/customize/${slug}`);
    await expect(page.getByRole("heading", { name: "Your interviewer" })).toBeVisible({
      timeout: 45_000,
    });

    // Count 0, not "not visible": a hidden section still submits.
    await expect(page.locator(JOB_SECTION), `${slug}: The job section is still in the DOM`).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "The job" }), `${slug}: The job heading`).toHaveCount(0);
    await expect(page.locator('[data-choice-group="role"]'), `${slug}: Role tiles`).toHaveCount(0);
    await expect(page.locator('[data-choice-group="industry"]'), `${slug}: Industry tiles`).toHaveCount(0);

    // And the recap does not summarize a control that was never shown.
    const labels = await recapLabels(page);
    console.log(`${slug} recap:`, JSON.stringify(labels));
    expect(labels, `${slug}: the recap still lists a Role`).not.toContain("role");
    expect(labels, `${slug}: the recap still lists an Industry`).not.toContain("industry");
    // The recap must not have collapsed to nothing either.
    expect(labels, `${slug}: the recap lost its remaining rows`).toContain("difficulty");
    expect(labels, `${slug}: the recap lost its remaining rows`).toContain("session length");
  }
});

test("a role cannot reach an industry-specific interview's prompt", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);

  // A stale `?role=` is the hard case: the page restores choices from the query
  // string, so a shared link can carry a role for a page that shows none.
  await page.goto(`/practice/interviews/customize/technical?role=${STALE_ROLE}`);
  await expect(page.getByRole("heading", { name: "Your interviewer" })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.locator(JOB_SECTION)).toHaveCount(0);

  // Change something that IS offered, so a handoff payload is really written.
  // Without this, `changed` stays false, nothing is stored, and the
  // "no roleSlug" assertion below would pass vacuously.
  await page
    .locator('[data-choice-group="difficulty"]')
    .getByRole("radio", { name: /Advanced/ })
    .click();

  await page.getByRole("button", { name: "Continue to setup" }).click();
  await page.waitForURL("**/practice/interviews/technical-behavioral", { timeout: 45_000 });
  const { customization, briefing } = await captureStartBody(page);
  console.log("industry start customization:", JSON.stringify(customization));

  expect(customization, "no customization payload — the role check would be vacuous").toBeTruthy();
  expect(customization?.difficulty, "the offered field did not travel").toBe("Advanced");
  expect(customization?.roleSlug, "a role the page never offered reached session start").toBeUndefined();
  expect(
    customization?.industrySlug,
    "an industry the page never offered reached session start",
  ).toBeUndefined();

  // The resolved role the wizard reads back is the INTERVIEW's own, which is
  // the same value the prompt interpolates as "- Target role:".
  console.log("industry briefing:", briefing.slice(0, 300));
  expect(briefing, "the Briefing step lost the interview's own role").toContain(
    "software engineering role",
  );
  expect(briefing, "a contradictory role survived into the session setup").not.toContain(
    "sales or client-facing",
  );
});

test("the general interview still asks for the job and still sends it", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);

  await page.goto("/practice/interviews/customize/general");
  await expect(page.getByRole("heading", { name: "The job" })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(JOB_SECTION)).toHaveCount(1);
  const roles = page.locator('[data-choice-group="role"]');
  await expect(roles).toHaveCount(1);
  // Industry is the section's other half and stays on the generic path.
  await expect(page.locator('[data-choice-group="industry"]')).toHaveCount(1);
  expect(await recapLabels(page), "the general recap lost its Role row").toContain("role");

  await roles.getByRole("radio", { name: /Sales/ }).click();
  await expect(page).toHaveURL(new RegExp(`role=${STALE_ROLE}`));
  await expect(roles.getByRole("radio", { name: /Sales/ })).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "Continue to setup" }).click();
  await page.waitForURL("**/practice/interviews/general", { timeout: 45_000 });
  const { customization, briefing } = await captureStartBody(page);
  console.log("general start customization:", JSON.stringify(customization));

  // THE OVER-BROAD-FIX GUARD. Withholding the role everywhere would make the
  // previous test greener and would delete the general interview's only way to
  // say what job it is for.
  expect(customization?.roleSlug, "the general path stopped sending the chosen role").toBe(
    STALE_ROLE,
  );
  expect(briefing, "the general path's chosen role did not reach the session setup").toContain(
    "sales or client-facing role",
  );
});
