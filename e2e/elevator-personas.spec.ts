import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * The elevator pitch's listener varies across fresh starts and holds across a
 * refresh, stopping before any avatar stream or LLM call (both are blocked).
 * Writes IN_PROGRESS reports under the seeded student, which are kept.
 */

const SHOTS = ".loop-shots";
const RUN = Date.now();
const STUDENT = { email: "alice.johnson@case.edu", password: "student123" };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(STUDENT.email);
  await page.locator('input[type="password"]').fill(STUDENT.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

async function blockSpend(page: Page) {
  await page.route("**/api/avatar/**", (route) => route.abort());
  await page.route("**/api/interaction/chat", (route) => route.abort());
  await page.route(/^https?:\/\/[^/]*(liveavatar\.com|heygen\.com|livekit)/, (route) =>
    route.request().resourceType() === "image" ? route.continue() : route.abort(),
  );
}

async function toKnowledgeStep(page: Page, subject: string) {
  await page.goto("/practice/pitches/elevator");
  await page.getByLabel("What you are pitching").fill(subject);
  await page.getByRole("button", { name: /continue|next/i }).click();
  await expect(
    page.getByRole("heading", { name: /how much do you know/i }),
  ).toBeVisible();
}

/** Picks a level and returns the name the card shows. */
async function chooseLevel(page: Page, level: RegExp) {
  await page.getByRole("button", { name: level }).click();
  const card = page.getByTestId("listener-disclosure");
  await expect(card).toBeVisible({ timeout: 30_000 });
  return (await card.locator("p.font-display").innerText()).trim();
}

/** Continue through the camera gate; resolves with the start response. */
async function launch(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: /camera off/i }).click();
  const started = page.waitForResponse("**/api/practice/session/start");
  await page
    .getByRole("button", { name: /^(start|begin|launch)/i })
    .first()
    .click();
  const response = await started;
  expect(response.ok()).toBe(true);
  return (await response.json()) as {
    reportId: string;
    listener: { avatarId: string; voiceId: string; name: string | null };
  };
}

test.describe("elevator pitch listener", () => {
  test.setTimeout(240_000);
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

  test("fresh starts vary, the shown name is who starts, a refresh holds", async ({
    page,
  }) => {
    await blockSpend(page);
    await signIn(page);

    const starts: { name: string; avatarId: string }[] = [];
    for (let i = 0; i < 5; i += 1) {
      const subject = `E2E persona run ${RUN} pitch ${i}`;
      await toKnowledgeStep(page, subject);
      const shown = await chooseLevel(page, /full profile/i);
      if (i === 0) {
        await page.screenshot({ path: `${SHOTS}/personas-wizard-full.png` });
        await page.reload();
        await toKnowledgeStep(page, subject);
        expect(await chooseLevel(page, /name and role/i)).toBe(shown);
        await page.screenshot({ path: `${SHOTS}/personas-wizard-name-role.png` });
      }
      const { listener } = await launch(page);
      expect(listener.name).toBe(shown);
      starts.push({ name: shown, avatarId: listener.avatarId });
      console.log(`start ${i}: ${shown}`);
      if (i === 0) {
        await expect(page.getByText(shown).first()).toBeVisible({ timeout: 30_000 });
        await page.screenshot({ path: `${SHOTS}/personas-session-start.png` });
      }
    }

    expect(starts.every((s) => s.name !== "Dana Reyes")).toBe(true);
    for (let i = 1; i < starts.length; i += 1) {
      expect(starts[i].name).not.toBe(starts[i - 1].name);
    }
    expect(new Set(starts.map((s) => s.name)).size).toBe(starts.length);
    expect(new Set(starts.map((s) => s.avatarId)).size).toBe(starts.length);
  });

  test("restarting the same pitch keeps the listener, blind reveals nothing", async ({
    page,
  }) => {
    await blockSpend(page);
    await signIn(page);

    // Refresh mid-session, then start the same pitch again.
    const subject = `E2E persona run ${RUN} restart`;
    await toKnowledgeStep(page, subject);
    const shown = await chooseLevel(page, /name and role/i);
    const first = await launch(page);
    await page.reload();
    await toKnowledgeStep(page, subject);
    expect(await chooseLevel(page, /name and role/i)).toBe(shown);
    const second = await launch(page);
    expect(second.reportId).not.toBe(first.reportId);
    expect(second.listener.avatarId).toBe(first.listener.avatarId);

    // Blind: no preview request, no name in the DOM or the start response.
    const previews: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/elevator-listener")) previews.push(r.url());
    });
    await toKnowledgeStep(page, `E2E persona run ${RUN} blind`);
    await page.getByRole("button", { name: /completely blind/i }).click();
    await expect(page.getByText(/you will meet them cold/i)).toBeVisible();
    await expect(page.getByTestId("listener-disclosure")).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/personas-wizard-blind.png` });
    expect(previews).toEqual([]);
    const blind = await launch(page);
    expect(blind.listener.name).toBeNull();
    expect(blind.listener.avatarId).toBeTruthy();
    await expect(page.getByText("Your listener").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: `${SHOTS}/personas-session-blind.png` });
  });
});
