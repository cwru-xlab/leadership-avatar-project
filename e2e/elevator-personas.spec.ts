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

/** Bounded: the live shell keeps animating, which can stall a default capture. */
async function shot(page: Page, path: string) {
  console.log(`shot ${path}`);
  await page.screenshot({ path, timeout: 20_000, animations: "disabled", caret: "hide" });
}

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
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /how much do you know/i }),
  ).toBeVisible();
}

/** Picks a level and returns the name the card shows. */
async function chooseLevel(page: Page, level: RegExp) {
  await page.getByRole("button", { name: level }).click();
  const card = page.getByTestId("listener-disclosure");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.scrollIntoViewIfNeeded();
  // Let the headshot land so the screenshot shows the face, not a gap.
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('[data-testid="listener-disclosure"] img')].every(
          (img) => (img as HTMLImageElement).complete,
        ),
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => undefined);
  return (await card.locator("p.font-display").innerText()).trim();
}

type StartBody = {
  reportId: string;
  listener: { avatarId: string; voiceId: string; name: string | null };
};

/** Continue through the camera gate; resolves with the start response body. */
async function launch(page: Page): Promise<StartBody> {
  let body: StartBody | null = null;
  await page.route("**/api/practice/session/start", async (route) => {
    const response = await route.fetch();
    body = (await response.json()) as StartBody;
    await route.fulfill({ response, json: body });
  });
  const step = (label: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${label}`);
  step("launch: continue");
  await page.getByRole("button", { name: "Continue", exact: true }).click({ timeout: 20_000 });
  step("launch: camera off");
  await page.getByRole("button", { name: /camera off/i }).click({ timeout: 20_000 });
  // Choosing "Camera off" launches straight away (CameraConsentStep).
  step("launch: wait body");
  await expect.poll(() => body, { timeout: 60_000 }).not.toBeNull();
  step("launch: unroute");
  await page.unroute("**/api/practice/session/start");
  console.log(`started ${body!.reportId}`);
  return body!;
}

test.describe("elevator pitch listener", () => {
  test.setTimeout(300_000);
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
        await shot(page, `${SHOTS}/personas-wizard-full.png`);
        await page.reload();
        await toKnowledgeStep(page, subject);
        expect(await chooseLevel(page, /name and role/i)).toBe(shown);
        await shot(page, `${SHOTS}/personas-wizard-name-role.png`);
      }
      const { listener } = await launch(page);
      expect(listener.name).toBe(shown);
      starts.push({ name: shown, avatarId: listener.avatarId });
      console.log(`start ${i}: ${shown}`);
      if (i === 0) {
        await expect(
          page.getByRole("heading", { name: `Conversation with ${shown}` }),
        ).toBeVisible({ timeout: 30_000 });
        await shot(page, `${SHOTS}/personas-session-start.png`);
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
    await shot(page, `${SHOTS}/personas-wizard-blind.png`);
    expect(previews).toEqual([]);
    const blind = await launch(page);
    expect(blind.listener.name).toBeNull();
    expect(blind.listener.avatarId).toBeTruthy();
    await expect(
      page.getByRole("heading", { name: "Conversation with Your listener" }),
    ).toBeVisible({ timeout: 30_000 });
    await shot(page, `${SHOTS}/personas-session-blind.png`);
  });

  test("reports name the listener, including pre-roster reports", async ({
    page,
  }) => {
    await signIn(page);
    // Test copy of a READY report whose snapshot pins anastasia-doyle, and
    // the original, which predates the roster (listenerPersona: null).
    const cases = [
      ["7ba2a6cd-9ff4-41ce-9a94-b8f21933293f", "Anastasia Doyle", "report-roster"],
      ["97d9f6b3-0cc5-4560-a6f9-1b89c3d7c08f", "Dana Reyes", "report-legacy"],
    ] as const;
    for (const [id, name, file] of cases) {
      await page.goto(`/reports/${id}`);
      const panel = page.getByTestId("listener-identity-panel");
      await expect(panel).toBeVisible({ timeout: 60_000 });
      await expect(panel).toContainText(name);
      await expect(panel.getByText("Interests")).toBeHidden();
      await panel.getByText("What they cared about").click();
      await expect(panel.getByText("Interests")).toBeVisible();
      await panel.scrollIntoViewIfNeeded();
      await shot(page, `${SHOTS}/personas-${file}.png`);
    }
  });
});

test.describe("elevator pitch listener at 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("wizard card and report panel fit, disclosure is keyboard reachable", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await blockSpend(page);
    await signIn(page);
    await toKnowledgeStep(page, `E2E persona run ${RUN} narrow`);
    await chooseLevel(page, /full profile/i);
    await shot(page, `${SHOTS}/personas-375-wizard.png`);
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.goto("/reports/7ba2a6cd-9ff4-41ce-9a94-b8f21933293f");
    const panel = page.getByTestId("listener-identity-panel");
    await expect(panel).toBeVisible({ timeout: 60_000 });
    const summary = panel.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(panel.getByText("Interests")).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    await shot(page, `${SHOTS}/personas-375-report.png`);
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});
