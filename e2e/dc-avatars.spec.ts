import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

import { SEATED_PUBLIC_AVATAR_ID_SET } from "../lib/avatar-roster";
import { SEEDED_COUNTERPART_CAST } from "../lib/difficult-conversation/seeded";

/**
 * Seeded courageous conversations start with a stock avatar, not a faculty
 * likeness, and a student's own pick in an authored conversation is kept.
 * Stops before any avatar stream or LLM call (both are blocked). Writes an
 * IN_PROGRESS report and one authored conversation under the seeded student,
 * which are kept.
 */

const SHOTS = ".loop-shots";
const STUDENT = { email: "alice.johnson@case.edu", password: "student123" };
/** Scott Cowen, one of the account's faculty likenesses, with their own voice. */
const FACULTY = {
  avatarId: "52b24044-7b0c-4211-b113-239443801a5b",
  voiceId: "66f105d8-a342-4a5d-9d41-6ffd21674806",
};

async function shot(page: Page, path: string) {
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

/** Aborts every streaming/LLM request; records what the avatar start asked for. */
async function blockSpend(page: Page, seen: string[]) {
  await page.route("**/api/avatar/**", (route) => {
    seen.push(`${route.request().url()} ${route.request().postData() ?? ""}`);
    return route.abort();
  });
  await page.route("**/api/interaction/chat", (route) => route.abort());
  await page.route(/^https?:\/\/[^/]*(liveavatar\.com|heygen\.com|livekit)/, (route) => {
    if (route.request().resourceType() === "image") return route.continue();
    seen.push(`${route.request().url()} ${route.request().postData() ?? ""}`);
    return route.abort();
  });
}

test.describe("courageous conversation avatars", () => {
  test.setTimeout(240_000);
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

  test("a seeded conversation starts with its stock counterpart", async ({ page }) => {
    const seen: string[] = [];
    await blockSpend(page, seen);
    await signIn(page);

    const id = "confront-low-performer";
    const cast = SEEDED_COUNTERPART_CAST[id]!;

    // Every seeded scenario resolves to its stock cast through the live route.
    for (const seededId of Object.keys(SEEDED_COUNTERPART_CAST)) {
      const res = await page.request.get(
        `/api/difficult-conversation/play?id=${seededId}`,
      );
      expect(res.ok()).toBe(true);
      const { instance } = await res.json();
      console.log(`play ${seededId}: ${instance.avatarId} / ${instance.voiceId}`);
      expect(instance.avatarId).toBe(SEEDED_COUNTERPART_CAST[seededId]!.avatarId);
      expect(SEATED_PUBLIC_AVATAR_ID_SET.has(instance.avatarId)).toBe(true);
      expect(instance.avatarId).not.toBe(FACULTY.avatarId);
    }

    let startBody: Record<string, unknown> | null = null;
    await page.route("**/api/practice/session/start", async (route) => {
      startBody = route.request().postDataJSON();
      await route.continue();
    });

    await page.goto(`/practice/courageous-conversations/${id}`);
    await expect(page.locator("#conversation-briefing-heading")).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, `${SHOTS}/dc-avatars-briefing.png`);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await shot(page, `${SHOTS}/dc-avatars-difficulty.png`);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: /camera off/i }).click({ timeout: 20_000 });

    await expect.poll(() => startBody, { timeout: 60_000 }).not.toBeNull();
    console.log(`session start: ${JSON.stringify(startBody)}`);
    expect(startBody!.interviewerAvatarId).toBe(cast.avatarId);

    // The live shell mounts; the avatar request it would send is blocked.
    await page.waitForTimeout(6_000);
    await shot(page, `${SHOTS}/dc-avatars-session-start.png`);
    console.log(`blocked avatar requests:\n${seen.join("\n")}`);
    expect(seen.some((s) => s.includes(`"avatar_id":"${cast.avatarId}"`))).toBe(true);
    expect(seen.some((s) => s.includes(`"voice_id":"${cast.voiceId}"`))).toBe(true);
    expect(seen.filter((s) => s.includes(FACULTY.avatarId))).toEqual([]);
  });

  test("an older report cast with a faculty avatar still renders", async ({ page }) => {
    await signIn(page);
    // Alice's seeded-conversation report from before the recast; its snapshot
    // records Scott Cowen's avatar id.
    await page.goto("/reports/7914583f-47ec-4e6d-83a6-de835e175b25");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/not found|something went wrong/i)).toHaveCount(0);
    await page.waitForTimeout(2_000);
    await shot(page, `${SHOTS}/dc-avatars-old-report.png`);
  });

  test("a student's own faculty pick is kept", async ({ page }) => {
    await signIn(page);
    const add = await page.request.post("/api/difficult-conversation/add", {
      data: {
        title: `E2E faculty pick ${Date.now()}`,
        studentRole: "Team lead",
        avatarRole: "Department chair",
        situation:
          "You are meeting the department chair to discuss a scheduling conflict that affects your team's teaching load next term.",
        sharedBackstory:
          "The chair set next term's schedule last week. Two of your team's courses now overlap, and both of you know the overlap exists.",
        hiddenPosition:
          "You think the overlap is manageable and will only reconsider if the team lead shows concrete impact on students.",
        studentObjective: "Discuss the conflict and agree on a next step.",
        stakes: "If unresolved, students lose access to a required course.",
        difficulty: "guarded",
        avatarId: FACULTY.avatarId,
        voiceId: FACULTY.voiceId,
      },
    });
    const added = await add.json();
    console.log(`add: ${add.status()} ${JSON.stringify(added).slice(0, 200)}`);
    expect(add.ok()).toBe(true);

    const play = await page.request.get(
      `/api/difficult-conversation/play?id=${added.id}`,
    );
    expect(play.ok()).toBe(true);
    const { instance } = await play.json();
    expect(instance.avatarId).toBe(FACULTY.avatarId);
    expect(instance.voiceId).toBe(FACULTY.voiceId);

    // The builder's picker still offers the faculty likenesses.
    await page.goto(`/practice/courageous-conversations/${added.id}/edit`);
    const grid = page.getByText("The character's avatar");
    await expect(grid).toBeVisible({ timeout: 30_000 });
    await grid.scrollIntoViewIfNeeded();
    await expect(page.getByText("Scott Cowen").first()).toBeVisible({ timeout: 30_000 });
    await shot(page, `${SHOTS}/dc-avatars-builder-faculty-pick.png`);
  });
});
