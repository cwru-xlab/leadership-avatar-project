import { expect, test, type Page } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

/**
 * Courageous-conversation content fixes:
 * - ask-for-raise never calls the student "she";
 * - the builder blocks Save until an avatar is picked, and /add and /edit
 *   reject a missing avatar with 400 even when the UI is bypassed;
 * - a legacy authored record with no avatar explains itself (with an edit
 *   link for its owner) instead of "Conversation not found".
 *
 * Stops before any avatar stream or LLM call (both are blocked). Writes
 * authored conversations under the seeded student, which are kept.
 */

loadEnv({ path: ".env.local" });
loadEnv();

const SHOTS = ".loop-shots";
const STUDENT = { email: "alice.johnson@case.edu", password: "student123" };
const OTHER = { email: "student@case.edu", password: "student123" };

const FIELDS = {
  title: "Raise talk with Sam (e2e dc-content)",
  studentRole: "Senior analyst",
  avatarRole: "Department director",
  situation:
    "You are asking your director for a promotion after leading two client launches this year. Budget season closes next week.",
  sharedBackstory:
    "You led the Q1 and Q3 launches. Your last promotion conversation was a year ago and ended with a promise to revisit.",
  hiddenPosition:
    "You think the employee is ready but you already spent the promotion budget on another hire. You will offer a title change without pay unless pressed with evidence.",
  studentObjective: "Get a concrete promotion decision with a date.",
  stakes: "If this stalls again you start looking for roles elsewhere.",
};

function apiBody(overrides: Record<string, unknown> = {}) {
  return { ...FIELDS, difficulty: "guarded", ...overrides };
}

async function shot(page: Page, path: string) {
  await page.screenshot({ path, fullPage: false, animations: "disabled", caret: "hide" });
}

async function signIn(page: Page, who = STUDENT) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(who.email);
  await page.locator('input[type="password"]').fill(who.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

async function blockSpend(page: Page) {
  await page.route("**/api/avatar/**", (route) => route.abort());
  await page.route("**/api/interaction/chat", (route) => route.abort());
}

async function fillBuilder(page: Page) {
  await page.getByLabel("Title").fill(FIELDS.title);
  await page.getByLabel("Who you are").fill(FIELDS.studentRole);
  await page.getByLabel("Who they are").fill(FIELDS.avatarRole);
  await page.getByLabel("The situation").fill(FIELDS.situation);
  await page.getByLabel("What you both already know").fill(FIELDS.sharedBackstory);
  await page.getByLabel("What they privately think").fill(FIELDS.hiddenPosition);
  await page.getByLabel("The player's goal").fill(FIELDS.studentObjective);
  await page.getByLabel("What is at stake").fill(FIELDS.stakes);
}

/** A real catalog pair (avatar + its own voice), as the picker offers it. */
async function catalogPair(page: Page) {
  const res = await page.request.get("/api/interview/interviewers");
  expect(res.ok()).toBe(true);
  const { interviewers } = await res.json();
  const first = interviewers[0];
  return { avatarId: first.avatarId as string, voiceId: first.voice.id as string };
}

test.describe("courageous conversation content", () => {
  test.setTimeout(180_000);
  test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

  test("ask-for-raise does not assume the student's gender", async ({ page }) => {
    await signIn(page);
    const res = await page.request.get("/api/difficult-conversation/play?id=ask-for-raise");
    expect(res.ok()).toBe(true);
    const { instance } = await res.json();
    const text = [instance.situation, instance.sharedBackstory, instance.hiddenPosition, instance.studentObjective, instance.stakes].join(" ");
    expect(text).not.toMatch(/\b(she|her|hers|herself)\b/i);
    expect(instance.hiddenPosition).toContain("the employee is underpaid");
    expect(instance.stakes).toBe("Another vague deferral and you start interviewing elsewhere.");
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    test(`builder blocks Save without an avatar (${viewport.width})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await signIn(page);
      const posts: string[] = [];
      page.on("request", (r) => {
        if (r.method() === "POST" && r.url().includes("/api/difficult-conversation/")) posts.push(r.url());
      });

      await page.goto("/practice/courageous-conversations/new");
      await fillBuilder(page);
      const save = page.getByRole("button", { name: "Save", exact: true });
      // Resting hint tells the student before they press.
      await expect(page.getByText("Choose an avatar above before saving.")).toBeVisible();
      await expect(save).toHaveAttribute("aria-describedby", "dc-save-avatar-hint");

      // Keyboard press: blocked, announced, focus moved into the grid.
      await save.focus();
      await page.keyboard.press("Enter");
      const alert = page.getByRole("alert").filter({ hasText: "Choose an avatar for the character" });
      await expect(alert).toBeVisible();
      const group = page.getByRole("group", { name: /The character.s avatar/ });
      await expect(group).toHaveAttribute("aria-invalid", "true");
      await expect(group).toHaveAttribute("aria-describedby", /dc-avatar-error/);
      await expect
        .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest("[role=group]"))))
        .toBe(true);
      // Smooth scroll settles with the label (and the error) in view.
      await expect
        .poll(async () => {
          const before = await page.locator("#dc-avatar-label").evaluate((el) => el.getBoundingClientRect().top);
          await page.waitForTimeout(250);
          const after = await page.locator("#dc-avatar-label").evaluate((el) => el.getBoundingClientRect().top);
          return before === after && after > 64 && after < viewport.height / 2;
        }, { timeout: 10_000 })
        .toBe(true);
      await shot(page, `${SHOTS}/dc-content-blocked-${viewport.width}.png`);
      expect(posts).toEqual([]);

      // Picking a card (keyboard) clears the error and the save goes through.
      await page.keyboard.press("Enter");
      await expect(group.locator("button[aria-pressed=true]")).toHaveCount(1);
      await expect(alert).toHaveCount(0);
      await expect(page.getByText("Choose an avatar above before saving.")).toHaveCount(0);
      await shot(page, `${SHOTS}/dc-content-picked-${viewport.width}.png`);
      await save.click();
      await expect(page.getByText("Saved — private")).toBeVisible({ timeout: 30_000 });
      expect(posts.some((u) => u.endsWith("/add"))).toBe(true);
      await page.getByText("Saved — private").scrollIntoViewIfNeeded();
      await shot(page, `${SHOTS}/dc-content-saved-${viewport.width}.png`);
    });
  }

  test("server rejects a missing avatar with 400 on add and edit", async ({ page }) => {
    await signIn(page);
    const missing = await page.request.post("/api/difficult-conversation/add", { data: apiBody() });
    expect(missing.status()).toBe(400);
    const body = await missing.json();
    console.log("add without avatar:", JSON.stringify(body));
    expect(body.errors.some((e: { field: string }) => e.field === "avatarId")).toBe(true);

    const pair = await catalogPair(page);
    const created = await page.request.post("/api/difficult-conversation/add", { data: apiBody(pair) });
    expect(created.status()).toBe(201);
    const { id } = await created.json();

    const edit = await page.request.post("/api/difficult-conversation/edit", {
      data: { id, ...apiBody({ avatarId: "", voiceId: "" }) },
    });
    expect(edit.status()).toBe(400);
    expect((await edit.json()).errors.some((e: { field: string }) => e.field === "avatarId")).toBe(true);
  });

  test("legacy conversation without an avatar explains itself", async ({ page, browser }) => {
    await blockSpend(page);
    await signIn(page);
    const pair = await catalogPair(page);
    const created = await page.request.post("/api/difficult-conversation/add", {
      data: apiBody({ ...pair, title: "Legacy no-avatar conversation (e2e)" }),
    });
    expect(created.status()).toBe(201);
    const { id } = await created.json();

    // Reproduce a record saved before an avatar was required.
    // Runs under tsx so s3-client loads after dotenv (module init reads AWS_*).
    const out = execFileSync(
      "npx",
      [
        "tsx",
        "-e",
        `require("dotenv").config({ path: ".env.local" });
         (async () => {
           const mod = await import("./lib/s3-client");
           const s3Storage = mod.s3Storage ?? mod.default.s3Storage;
           const record = await s3Storage.getDifficultConversationObject(${JSON.stringify(id)});
           if (!record) throw new Error("record missing");
           await s3Storage.saveDifficultConversationObject({ ...record, avatarId: "", voiceId: "" });
           console.log("cleared avatar on", record.id);
         })().catch((e) => { console.error(e); process.exit(1); });`,
      ],
      { encoding: "utf8" },
    );
    expect(out).toContain(`cleared avatar on ${id}`);

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/practice/courageous-conversations/${id}`);
      await expect(page.getByRole("heading", { name: "This conversation needs an avatar" })).toBeVisible();
      await expect(page.getByText("Conversation not found")).toHaveCount(0);
      const edit = page.getByRole("link", { name: "Edit and pick an avatar" });
      await expect(edit).toHaveAttribute("href", `/practice/courageous-conversations/${id}/edit`);
      await shot(page, `${SHOTS}/dc-content-legacy-${viewport.width}.png`);
    }

    // The edit link lands in the builder with the Save block in place.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("link", { name: "Edit and pick an avatar" }).click();
    await page.waitForURL(`**/${id}/edit`);
    await expect(page.getByText("Choose an avatar above before saving.")).toBeVisible();

    // Someone else sees the explanation without an edit link.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const other = await ctx.newPage();
    await blockSpend(other);
    await signIn(other, OTHER);
    await other.goto(`/practice/courageous-conversations/${id}`);
    await expect(other.getByRole("heading", { name: "This conversation needs an avatar" })).toBeVisible();
    await expect(other.getByText("Its author needs to pick one.")).toBeVisible();
    await expect(other.getByRole("link", { name: "Edit and pick an avatar" })).toHaveCount(0);
    await ctx.close();
  });
});
