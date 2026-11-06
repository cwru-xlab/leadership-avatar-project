import { expect, test, type Locator, type Page } from "@playwright/test";

import { readyWhenText } from "../lib/study-plan/ready-when";
import { withDisplayTitles } from "../lib/study-plan/title";

const SHOTS = ".loop-shots";
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 375, height: 800 };

const LONG_TITLES = [
  "Self-Paced Study Plan: Building on Solid Interview Foundations",
  "Self-Paced Study Plan: Telling Sharper Stories About Your Leadership Under Pressure and Ambiguity",
  "Self-Paced Study Plan: Structure and Clarity in High-Stakes Conversations",
];

// Plan surfaces show derived display titles (lib/study-plan/title.ts), not the
// stored ones, so the switcher is checked against what the student really sees.
const DISPLAY_TITLES = withDisplayTitles(
  LONG_TITLES.map((title, i) => ({ id: `plan-${i}`, title, savedAt: "2026-10-01T00:00:00.000Z", priorityThemes: [] })),
).map((plan) => plan.title);

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("alice.johnson@case.edu");
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

function step(position: number, status: string) {
  return {
    id: `step-${position}`,
    position,
    kind: position % 2 ? "VOICE_DRILL" : "KNOWLEDGE_CHECK",
    competencyKey: "structure",
    competencyLabel: "Structure & clarity",
    selectionReason: "Fixture",
    status,
    completedAt: status === "COMPLETE" ? "2026-10-01T00:00:00.000Z" : null,
    knowledgeCheckId: null,
    coachedSessionId: null,
    practiceSlug: null,
    check: null,
    coachedPhase: null,
    drill: null,
  };
}

const pathFor = (done: number) => ({
  id: `path-${done}`,
  generatedAt: "2026-10-01T00:00:00.000Z",
  steps: Array.from({ length: 10 }, (_, i) => step(i + 1, i < done ? "COMPLETE" : "PENDING")),
  nextStep: null,
});

const summaryFor = (id: string, title: string) => ({
  id,
  title,
  sourceReportCount: 3,
  savedAt: "2026-10-01T00:00:00.000Z",
  summary: "You build on solid foundations. Your next gain is structure.",
  priorityThemes: [],
});

/** Routes the plan list and paths, so the switcher sees exactly these plans. */
async function mockPlans(page: Page, titles: string[]) {
  const plans = titles.map((title, i) => summaryFor(`plan-${i}`, title));
  await page.route("**/api/study-plans", (route) => route.fulfill({ json: { plans } }));
  await page.route("**/api/study-plans/*/path", (route) => {
    const index = Number(/plan-(\d+)/.exec(route.request().url())?.[1] ?? 0);
    return route.fulfill({ json: { path: pathFor(index) } });
  });
}

function contentWith(priorities: number) {
  const exercises = [
    {
      title: "Layer a stronger result",
      instructions:
        "You might try retelling your last answer with one specific outcome, then a second outcome that shows what changed for the people around you, and notice how the story lands when the result comes first rather than last in the answer.",
      estimatedMinutes: 10,
      successCriteria: "Ready when you can supplement a result with a second measurable outcome without notes.",
    },
    {
      title: "Trim the setup",
      instructions: "Consider experimenting with a one sentence setup before your first action.",
      estimatedMinutes: 5,
      successCriteria: "Ready when: your setup stays under fifteen seconds.",
    },
    {
      title: "Open with the headline",
      instructions: "You could open with the headline, then back it with one example.",
      estimatedMinutes: 8,
      successCriteria: "you say the headline first in three answers out of three.",
    },
  ];
  return {
    title: "Fixture",
    summary: "You build on solid foundations. Your next gain is structure.",
    strengthsToLeverage: [
      { theme: "Calm delivery", explanation: "Your steady pace helps listeners follow complex stories.", supportingReportCount: 2 },
      { theme: "Clear ownership", explanation: "You name your own role and decisions plainly.", supportingReportCount: 2 },
    ],
    priorityThemes: Array.from({ length: priorities }, (_, i) => ({
      priority: i + 1,
      theme: ["Delivering Quantifiable Results", "Structuring long answers", "Listening before responding", "Handling pushback calmly", "Naming trade-offs"][i],
      whyItMatters:
        "Interviewers weigh evidence of impact heavily, and across your sessions the results you described stayed general, so a stronger closing would raise how credible the whole story feels and give the people listening a reason to remember it after the conversation ends and they compare your answer with the others they heard that day.",
      supportingReportCount: 2,
      practiceExercises: i === 0 ? exercises.slice(0, Math.max(1, 3 - priorities + 1)) : exercises.slice(0, 2),
      readinessChecks: ["You can name the result in one breath.", "You can say who benefited and how you know."],
    })),
    resources: [
      { title: "Situation, task, action, result", description: "A short guide to shaping stories.", url: "https://example.com/star" },
      { title: "Numbers that land", description: "When a figure helps a story, and when it distracts from it.", url: null },
      { title: "Pacing and pauses", description: "Using silence on purpose.", url: null },
      { title: "Answering follow-ups", description: "Staying steady when asked to go deeper.", url: null },
    ],
    nextPracticeFocus: "You might open your next answer with the result, then walk back to how you got there.",
  };
}

async function mockPlanPage(page: Page, priorities: number) {
  await page.route("**/api/study-plans/fixture", (route) =>
    route.fulfill({
      json: {
        plan: { ...summaryFor("fixture", LONG_TITLES[0]), content: contentWith(priorities) },
      },
    }),
  );
  await page.route("**/api/study-plans/fixture/path", (route) => route.fulfill({ json: { path: pathFor(2) } }));
}

const ringShown = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).outlineStyle !== "none");
const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe("Ready when label", () => {
  test("never repeats, with or without a stored prefix", () => {
    expect(readyWhenText("Ready when you can supplement a result.")).toBe("You can supplement a result.");
    expect(readyWhenText("Ready when: your setup is short.")).toBe("Your setup is short.");
    expect(readyWhenText("ready when — you pause.")).toBe("You pause.");
    expect(readyWhenText("You're ready when you pause.")).toBe("You pause.");
    expect(readyWhenText("you say it first.")).toBe("You say it first.");
    expect(readyWhenText("Already ready when asked.")).toBe("Already ready when asked.");
    expect(readyWhenText("Ready when:")).toBe("");
  });
});

test.describe("Paths plan switcher", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("three plans: labelled control, full titles, closes every way", async ({ page }) => {
    await mockPlans(page, LONG_TITLES);
    await page.setViewportSize(DESKTOP);
    await page.goto("/paths");

    const trigger = page.getByRole("button", { name: /Plan \d of 3/ });
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText("Plan 1 of 3");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/switcher-rest-1440.png` });

    const list = page.getByRole("listbox", { name: "Choose a study plan" });
    const options = list.getByRole("option");

    // Mouse open: no focus ring on the control, list opens with full titles.
    await trigger.click();
    await expect(list).toBeVisible();
    await expect(options).toHaveCount(3);
    await expect(list.locator(".ring-2")).toHaveCount(0);
    for (const title of DISPLAY_TITLES) {
      const row = options.filter({ hasText: title }).locator("span", { hasText: title }).last();
      const clipped = await row.evaluate((el) => el.scrollWidth > el.clientWidth + 1 || getComputedStyle(el).textOverflow === "ellipsis");
      expect(clipped).toBe(false);
    }
    await expect(list.getByRole("option", { selected: true })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Manage study plans" })).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/switcher-open-1440.png` });

    // The trigger closes it again, and a mouse press leaves no ring behind.
    await trigger.click();
    await expect(list).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await ringShown(trigger)).toBe(false);
    await trigger.click();
    await expect(list).toBeVisible();

    // Click outside closes, without forcing focus anywhere.
    await page.getByRole("heading", { name: "Paths" }).click();
    await expect(list).toBeHidden();

    // Escape closes and returns focus.
    await trigger.click();
    await expect(list).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await ringShown(trigger)).toBe(true);

    // Keyboard: open with arrows, move, wrap, select, focus returns, ring shows.
    await page.keyboard.press("ArrowDown");
    await expect(list).toBeFocused();
    await expect(list.locator(".ring-2")).toHaveCount(1);
    const activeIs = async (index: number) =>
      expect(await list.getAttribute("aria-activedescendant")).toBe(await options.nth(index).getAttribute("id"));
    await activeIs(0);
    await page.keyboard.press("ArrowDown");
    await activeIs(1);
    await page.keyboard.press("End");
    await activeIs(2);
    await page.keyboard.press("ArrowDown");
    await activeIs(0);
    await page.keyboard.press("ArrowUp");
    await activeIs(2);
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await page.screenshot({ path: `${SHOTS}/switcher-keyboard-1440.png` });
    await page.keyboard.press("Enter");
    await expect(list).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toContainText("Plan 2 of 3");
    await expect(trigger).toContainText(DISPLAY_TITLES[1]);
    await expect(page).toHaveURL(/plan=plan-1/);

    // Tab reaches Manage, Tab again leaves and closes; Escape works from the link.
    await page.keyboard.press("ArrowUp");
    await expect(list).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Manage study plans" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(list).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(list).toBeHidden();

    // Mouse select closes and switches.
    await trigger.click();
    await options.nth(2).click();
    await expect(list).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await ringShown(trigger)).toBe(false);
    await expect(trigger).toContainText("Plan 3 of 3");
    await expect(page).toHaveURL(/plan=plan-2/);
  });

  test("three plans at 375px", async ({ page }) => {
    await mockPlans(page, LONG_TITLES);
    await page.setViewportSize(PHONE);
    await page.goto("/paths");
    const trigger = page.getByRole("button", { name: /Plan \d of 3/ });
    await expect(trigger).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/switcher-rest-375.png` });
    await trigger.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/switcher-open-375.png` });
  });

  test("one plan is a plain label; no plans keeps the empty state", async ({ page }) => {
    await mockPlans(page, [LONG_TITLES[0]]);
    await page.setViewportSize(DESKTOP);
    await page.goto("/paths");
    await expect(page.getByText(LONG_TITLES[0]).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Plan \d of/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Manage study plans" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/switcher-one-1440.png` });

    await page.unroute("**/api/study-plans");
    await page.route("**/api/study-plans", (route) => route.fulfill({ json: { plans: [] } }));
    await page.goto("/paths");
    await expect(page.getByText("No study plans yet")).toBeVisible();
    await expect(page.getByText("Pick a study plan to follow its path.")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/switcher-none-1440.png` });
  });

  test("alice's real plans render the control", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/paths");
    await expect(page.getByRole("heading", { name: "Paths" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${SHOTS}/switcher-alice-1440.png` });
    const trigger = page.getByRole("button", { name: /Plan \d of \d/ });
    if (await trigger.count()) {
      await trigger.click();
      await page.screenshot({ path: `${SHOTS}/switcher-alice-open-1440.png` });
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    }
  });
});

test.describe("Study plan page", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const priorities of [1, 2, 3, 4, 5]) {
    test(`${priorities} priorities fill the row and expand cleanly`, async ({ page }) => {
      await mockPlanPage(page, priorities);
      await page.setViewportSize(DESKTOP);
      await page.goto("/study-plans/fixture");
      const heading = page.getByRole("heading", { name: "Practice priorities" });
      await expect(heading).toBeVisible();
      const tiles = page.locator("article");
      await expect(tiles).toHaveCount(priorities);
      const grid = tiles.first().locator("xpath=..");
      const gridBox = (await grid.boundingBox())!;

      // Every row reaches the grid's right edge: no hole in the row.
      const boxes = await tiles.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
      const rightEdge = Math.max(...boxes.map((b) => b.right));
      expect(Math.abs(rightEdge - (gridBox.x + gridBox.width))).toBeLessThan(1);
      const lastRowTop = Math.max(...boxes.map((b) => b.top));
      const lastRow = boxes.filter((b) => b.top === lastRowTop);
      expect(Math.abs(Math.max(...lastRow.map((b) => b.right)) - (gridBox.x + gridBox.width))).toBeLessThan(1);
      await page.screenshot({ path: `${SHOTS}/plan-${priorities}-rest-1440.png`, fullPage: true });

      // Full text reachable from the tile, without opening the panel.
      const readMore = tiles.first().getByRole("button", { name: "Read more" });
      await readMore.click();
      const clamp = await tiles.first().locator("p", { hasText: "they heard that day" }).evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
      expect(clamp).toBe(true);
      await tiles.first().getByRole("button", { name: "Show less" }).click();

      // Toggling does not move any tile, and opens one full-width panel.
      const toggle = tiles.first().getByRole("button", { name: "How to practice and readiness checks" });
      const before = await tiles.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width]; }));
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(await ringShown(toggle)).toBe(false);
      const after = await tiles.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.width]; }));
      const firstRowTop = before[0][1];
      before.forEach(([left, top, width], i) => {
        if (top === firstRowTop) {
          expect(after[i][0]).toBeCloseTo(left, 0);
          expect(after[i][1]).toBeCloseTo(width, 0);
        }
      });
      const panel = page.locator("section[aria-labelledby]").first();
      await expect(panel).toBeVisible();
      const panelBox = (await panel.boundingBox())!;
      expect(Math.abs(panelBox.width - gridBox.width)).toBeLessThan(1);

      // The label is never doubled, and reading text stays within 65ch.
      await expect(panel).not.toContainText(/Ready when\W+ready when/i);
      await expect(panel.getByText("Ready when", { exact: true }).first()).toBeVisible();
      const widest = await panel
        .locator("p")
        .evaluateAll((els) => Math.max(...els.filter((el) => (el.textContent ?? "").length > 80).map((el) => el.getBoundingClientRect().width)));
      expect(widest).toBeLessThanOrEqual(660);

      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/plan-${priorities}-open-1440.png`, fullPage: true });

      await toggle.click();
      await expect(panel).toBeHidden();

      // Keyboard: the same toggle shows its ring when tabbed to.
      await toggle.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(toggle).toBeFocused();
      expect(await ringShown(toggle)).toBe(true);
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");

      // Strengths and resources end level.
      const strengths = page.getByRole("heading", { name: "Strengths to leverage" }).locator("xpath=../ul");
      const resources = page.getByRole("heading", { name: "Useful resources" }).locator("xpath=../ul");
      const a = (await strengths.boundingBox())!;
      const b = (await resources.boundingBox())!;
      expect(Math.abs(a.y + a.height - (b.y + b.height))).toBeLessThan(1);
      expect(Math.abs(a.y - b.y)).toBeLessThan(1);
      await resources.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/plan-${priorities}-lower-1440.png` });
    });
  }

  test("375px resting and expanded", async ({ page }) => {
    await mockPlanPage(page, 3);
    await page.setViewportSize(PHONE);
    await page.goto("/study-plans/fixture");
    await expect(page.locator("article")).toHaveCount(3);
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/plan-3-rest-375.png`, fullPage: true });
    const toggle = page.locator("article").first().getByRole("button", { name: "How to practice and readiness checks" });
    await toggle.click();
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/plan-3-open-375.png`, fullPage: true });
  });

  test("alice's real plan renders", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const response = await page.goto("/study-plans");
    expect(response?.ok()).toBe(true);
    const plans = await page.evaluate(() => fetch("/api/study-plans").then((r) => r.json()));
    test.skip(!plans.plans?.length, "alice has no plans");
    await page.goto(`/study-plans/${plans.plans[0].id}`);
    const tiles = page.locator("article");
    await expect(tiles.first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/plan-alice-rest-1440.png`, fullPage: true });
    await tiles.first().getByRole("button", { name: "How to practice and readiness checks" }).click();
    const panel = page.locator("section[aria-labelledby]").first();
    await expect(panel).not.toContainText(/Ready when\W+ready when/i);
    await page.screenshot({ path: `${SHOTS}/plan-alice-open-1440.png`, fullPage: true });
  });
});
