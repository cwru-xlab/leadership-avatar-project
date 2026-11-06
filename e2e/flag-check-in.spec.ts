import { config as loadEnv } from "dotenv";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient, Prisma } from "@prisma/client";

/**
 * The report check-in, end to end against real rows.
 *
 * Fixture reports are written under the seeded test account
 * alice.johnson@case.edu only, cloned from one of Alice's own READY reports,
 * titled "Check-in fixture: ...", and kept (no cleanup). Each run resets the
 * fixtures' metrics so the answers start empty. No model is called.
 */
loadEnv({ path: ".env.local" });

const SHOTS = ".loop-shots";
const ALICE = "alice.johnson@case.edu";
const OTHER = "student@case.edu";

const FLAGGED_VISUAL = {
  eye_contact_pct: 88, attentiveness_pct: 90, camera_centered_pct: 95, face_presence_pct: 99,
  lighting_ok: true, posture_flags: ["multiple_faces_detected"],
  not_measured: ["background_environment", "fidgeting"],
  episodes: [{ kind: "multiple_faces", start_s: 30, end_s: 50, severity: 1 }],
  coverage: {
    session_seconds: 600, track_live_seconds: 600, expected_samples: 1800, processed_samples: 1800,
    face_detected_samples: 1790, speaking_samples: 900, listening_samples: 900, capture_offset_s: 8,
    sample_hz: 6, analyzer_error: false,
  },
  observations: {
    phone_visible_seconds: 40, posture_shoulder_tilt_deg: 3, posture_forward_head_offset: 0.7,
    hand_at_mouth_events: 9, mouth_movement_silent_seconds: 90, food_or_drink_visible_seconds: 40,
    middle_finger_extended_seconds: 2,
    episodes: [
      { kind: "phone_visible", start_s: 72, end_s: 112, severity: 1 },
      { kind: "hand_at_mouth_repeated", start_s: 120, end_s: 210, severity: 1 },
      { kind: "mouth_movement_silent", start_s: 125, end_s: 215, severity: 0.9 },
      { kind: "middle_finger_extended", start_s: 300, end_s: 300, severity: 1 },
    ],
  },
};

const CLEAN_VISUAL = {
  ...FLAGGED_VISUAL,
  posture_flags: [],
  episodes: [],
  observations: { ...FLAGGED_VISUAL.observations, phone_visible_seconds: 0, hand_at_mouth_events: 0, episodes: [] },
};

const Q = {
  hand_at_mouth: "We noticed your hand at your mouth repeatedly from 2:08 to 3:38. Were you eating or drinking?",
  mouth_movement:
    "We noticed your mouth moving while you weren't speaking from 2:13 to 3:43. Were you eating or chewing something?",
  hand_shape: "We noticed a hand shape that can read as an offensive gesture at 5:08. Was that intentional?",
  another_person:
    "We noticed what looked like another person in frame from 0:38 to 0:58. Was someone else there with you?",
  phone: "We noticed a phone visible in frame from 1:20 to 2:00. Was there a phone in view?",
};

type Fixture = { id: string };
const fixtures: Record<"flagged" | "clean" | "cameraOff" | "failed" | "legacy", Fixture> = {} as never;

test.beforeAll(async () => {
  const prisma = new PrismaClient();
  try {
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: ALICE } });
    const source = await prisma.interactionReport.findFirst({
      where: {
        userId: alice.id,
        status: "READY",
        // An interview, so the coaching lines open "In a real interview".
        typeSlug: { in: ["general", "technical", "consulting", "early-career"] },
        NOT: [{ reportStructured: { equals: Prisma.DbNull } }, { title: { startsWith: "Check-in fixture" } }],
      },
      orderBy: { createdAt: "desc" },
    });
    if (!source) throw new Error("Alice has no READY structured interview report to clone");

    async function upsert(
      title: string,
      data: Partial<Prisma.InteractionReportUncheckedCreateInput>,
    ): Promise<Fixture> {
      const base = {
        userId: alice.id,
        typeSlug: source!.typeSlug,
        status: "READY" as const,
        inputSnapshot: (source!.inputSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
        scores: (source!.scores ?? undefined) as Prisma.InputJsonValue | undefined,
        reportStructured: source!.reportStructured as Prisma.InputJsonValue,
        reportMarkdown: source!.reportMarkdown,
        turnCount: source!.turnCount,
        cameraMode: "ON",
        startedAt: source!.startedAt,
        completedAt: source!.completedAt ?? new Date(),
        title,
        ...data,
      };
      const existing = await prisma.interactionReport.findFirst({ where: { userId: alice.id, title } });
      const row = existing
        ? await prisma.interactionReport.update({ where: { id: existing.id }, data: base })
        : await prisma.interactionReport.create({ data: base as Prisma.InteractionReportUncheckedCreateInput });
      return { id: row.id };
    }

    fixtures.flagged = await upsert("Check-in fixture: all flags", { visualMetrics: FLAGGED_VISUAL });
    fixtures.clean = await upsert("Check-in fixture: nothing flagged", { visualMetrics: CLEAN_VISUAL });
    fixtures.cameraOff = await upsert("Check-in fixture: camera off", {
      cameraMode: "OFF",
      visualMetrics: Prisma.JsonNull,
      visualUnscoredReason: "CAMERA_OFF_OPTOUT",
    });
    fixtures.failed = await upsert("Check-in fixture: failed report", {
      status: "FAILED",
      failureReason: "Fixture: evaluation failed on purpose.",
      visualMetrics: FLAGGED_VISUAL,
    });
    fixtures.legacy = await upsert("Check-in fixture: legacy report", {
      reportStructured: Prisma.JsonNull,
      reportMarkdown: source.reportMarkdown ?? "Legacy fixture report.",
      visualMetrics: FLAGGED_VISUAL,
    });
  } finally {
    await prisma.$disconnect();
  }
});

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function openReport(page: Page, id: string) {
  await page.goto(`/reports/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Reviewing your").first()).toBeHidden();
}

function banner(page: Page): Locator {
  return page.getByTestId("check-in");
}

function answers(page: Page, question: string): Locator {
  return banner(page).getByRole("group", { name: question, exact: true });
}

async function observationLabels(page: Page): Promise<string[]> {
  await page.getByRole("tab", { name: "Delivery" }).click();
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Observations" }) });
  if ((await section.count()) === 0) return [];
  return section.locator("dt").allInnerTexts();
}

async function deliveryCameraLabels(page: Page): Promise<string[]> {
  await page.getByRole("tab", { name: "Delivery" }).click();
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "On camera" }) });
  if ((await section.count()) === 0) return [];
  return section.locator("dt").allInnerTexts();
}

test.describe.configure({ mode: "serial" });

test("asks one question per flag, saves all three answers, hides after No, persists", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, ALICE);
  await openReport(page, fixtures.flagged.id);

  const scoresBefore = await page.locator("main").getByText(/\/ 5/).allInnerTexts();

  await expect(banner(page).getByRole("heading", { name: "Quick check-in" })).toBeVisible();
  await expect(banner(page).getByText("Question 1 of 5")).toBeVisible();
  // The banner sits above the score panel.
  const bannerBox = (await banner(page).boundingBox())!;
  const scoreBox = (await page.getByText(/\/ 5/).first().boundingBox())!;
  expect(bannerBox.y).toBeLessThan(scoreBox.y);
  await page.screenshot({ path: `${SHOTS}/check-in-1440-q1.png` });

  // Every observation row is visible before any answer.
  expect(await observationLabels(page)).toEqual([
    "Phone in frame", "Shoulder line (absolute)", "Head position (absolute)", "Hand at mouth",
    "Mouth movement", "Cup, bottle or food in frame", "Hand shape",
  ]);
  expect(await deliveryCameraLabels(page)).toContain("Others in frame");

  // 1. Hand at mouth: Yes.
  await expect(banner(page).getByText(Q.hand_at_mouth)).toBeVisible();
  await answers(page, Q.hand_at_mouth).getByRole("button", { name: "Yes" }).click();
  await expect(banner(page).getByRole("status")).toHaveText("Answer saved.");

  // 2. Mouth movement: Something else reveals its options; picking one saves.
  await expect(banner(page).getByText(Q.mouth_movement)).toBeVisible();
  await expect(banner(page).getByText("Question 2 of 5")).toBeVisible();
  await answers(page, Q.mouth_movement).getByRole("button", { name: "Something else" }).click();
  const mouthOptions = banner(page).getByRole("group", { name: "What was it?" });
  await expect(mouthOptions.getByRole("button")).toHaveText([
    "Thinking or mouthing words", "A medical need", "A habit or tic", "Wearing a mask", "Another reason",
  ]);
  await page.screenshot({ path: `${SHOTS}/check-in-1440-something-else.png` });
  await mouthOptions.getByRole("button", { name: "Thinking or mouthing words" }).click();

  // 3. Hand shape: Something else, glasses.
  await expect(banner(page).getByText(Q.hand_shape)).toBeVisible();
  await answers(page, Q.hand_shape).getByRole("button", { name: "Something else" }).click();
  const shapeOptions = banner(page).getByRole("group", { name: "What was it?" });
  await expect(shapeOptions.getByRole("button")).toHaveText([
    "Adjusting my glasses or face", "Signing", "How my hand naturally rests", "Another reason",
  ]);
  await shapeOptions.getByRole("button", { name: "Adjusting my glasses or face" }).click();

  // 4. Another person: No.
  await expect(banner(page).getByText(Q.another_person)).toBeVisible();
  await answers(page, Q.another_person).getByRole("button", { name: "No" }).click();

  // 5. Phone: by keyboard. Focus moved to the question, so Tab reaches Yes.
  await expect(banner(page).getByText(Q.phone)).toBeVisible();
  await expect(banner(page).getByText(Q.phone)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(answers(page, Q.phone).getByRole("button", { name: "Yes" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(answers(page, Q.phone).getByRole("button", { name: "No" })).toBeFocused();
  await banner(page).screenshot({ path: `${SHOTS}/check-in-1440-keyboard-focus.png` });
  await page.keyboard.press("Enter");

  // Collapsed: one Thanks line, focus on it, one coaching line for the one Yes.
  await expect(banner(page).getByText("Thanks for checking in.")).toBeVisible();
  await expect(banner(page).getByText("Thanks for checking in.").locator("..").locator("..")).toBeFocused();
  const tips = banner(page).getByRole("list", { name: "Tips from your check-in" });
  await expect(tips.getByRole("listitem")).toHaveText([
    "In a real interview, finish eating before you join and keep food off camera. A quick sip of water is fine.",
  ]);
  await page.screenshot({ path: `${SHOTS}/check-in-1440-thanks.png` });

  // Hidden after No / Something else; kept after Yes. Scores unchanged.
  expect(await observationLabels(page)).toEqual([
    "Shoulder line (absolute)", "Head position (absolute)", "Hand at mouth", "Cup, bottle or food in frame",
  ]);
  expect(await deliveryCameraLabels(page)).not.toContain("Others in frame");
  expect(await page.locator("main").getByText(/\/ 5/).allInnerTexts()).toEqual(scoresBefore);

  // Persistence across reload.
  await page.reload();
  await expect(banner(page).getByText("Thanks for checking in.")).toBeVisible({ timeout: 30_000 });
  await expect(tips.getByRole("listitem")).toHaveCount(1);
  expect(await observationLabels(page)).toEqual([
    "Shoulder line (absolute)", "Head position (absolute)", "Hand at mouth", "Cup, bottle or food in frame",
  ]);

  // Change an answer: phone No -> Yes. The row comes back and a second tip appears.
  await banner(page).getByRole("button", { name: "Change answers" }).click();
  await expect(banner(page).getByRole("button", { name: "Done" })).toHaveAttribute("aria-expanded", "true");
  await expect(answers(page, Q.phone).getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "true");
  await expect(answers(page, Q.mouth_movement).getByRole("button", { name: "Something else" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.screenshot({ path: `${SHOTS}/check-in-1440-review.png`, fullPage: false });
  await banner(page).screenshot({ path: `${SHOTS}/check-in-1440-review-banner.png` });
  await answers(page, Q.phone).getByRole("button", { name: "Yes" }).click();
  await expect(answers(page, Q.phone).getByRole("button", { name: "Yes" })).toHaveAttribute("aria-pressed", "true");
  await expect(answers(page, Q.phone).getByRole("button", { name: "Yes" })).toBeFocused();
  // And hand at mouth Yes -> No: its row and the cup row go.
  await answers(page, Q.hand_at_mouth).getByRole("button", { name: "No" }).click();
  await expect(answers(page, Q.hand_at_mouth).getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "true");
  await banner(page).getByRole("button", { name: "Done" }).click();
  await expect(tips.getByRole("listitem")).toHaveText([
    "In a real interview, put your phone away and out of frame before you join.",
  ]);

  await page.reload();
  await expect(banner(page).getByText("Thanks for checking in.")).toBeVisible({ timeout: 30_000 });
  expect(await observationLabels(page)).toEqual([
    "Phone in frame", "Shoulder line (absolute)", "Head position (absolute)",
  ]);
  expect(await page.locator("main").getByText(/\/ 5/).allInnerTexts()).toEqual(scoresBefore);

  // The API returns the record, and every answer is kept with its reason.
  const report = (await (await page.request.get(`/api/practice/report/${fixtures.flagged.id}`)).json()).report;
  expect(Object.keys(report.checkIn).sort()).toEqual(
    ["another_person", "hand_at_mouth", "hand_shape", "mouth_movement", "phone"],
  );
  expect(report.checkIn.hand_shape).toMatchObject({ answer: "other", reason: "glasses" });
  expect(report.metrics.visual.check_in).toBeUndefined();
  // The measurement itself is untouched by any answer.
  expect(report.metrics.visual.observations.episodes).toHaveLength(4);
});

test("strict validation on the check-in route", async ({ page }) => {
  await signIn(page, ALICE);
  const url = `/api/practice/report/${fixtures.flagged.id}/check-in`;
  const post = (data: unknown) => page.request.post(url, { data: data as object });
  expect((await post({ flag: "phone", answer: "maybe" })).status()).toBe(400);
  expect((await post({ flag: "phone", answer: "other" })).status()).toBe(400);
  expect((await post({ flag: "phone", answer: "other", reason: "water" })).status()).toBe(400);
  expect((await post({ flag: "phone", answer: "yes", note: "free text" })).status()).toBe(400);
  expect((await post({ flag: "yawning", answer: "yes" })).status()).toBe(400);
  // A flag this report never asks about.
  expect((await page.request.post(`/api/practice/report/${fixtures.clean.id}/check-in`, {
    data: { flag: "phone", answer: "yes" },
  })).status()).toBe(400);
  expect((await page.request.post(`/api/practice/report/${fixtures.failed.id}/check-in`, {
    data: { flag: "phone", answer: "yes" },
  })).status()).toBe(409);
  expect((await page.request.post(`/api/practice/report/not-a-uuid/check-in`, {
    data: { flag: "phone", answer: "yes" },
  })).status()).toBe(404);
});

test("no banner on clean, camera-off, failed and legacy reports", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, ALICE);
  for (const key of ["clean", "cameraOff", "failed", "legacy"] as const) {
    await openReport(page, fixtures[key].id);
    if (key === "failed") await expect(page.getByText("We couldn't generate your report.")).toBeVisible();
    else await expect(page.getByText(/\/ 5|Not yet measured|Not measured/).first()).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  }
});

test("another account and signed-out callers get the same responses as the report read", async ({ page, browser }) => {
  await signIn(page, OTHER);
  const read = await page.request.get(`/api/practice/report/${fixtures.flagged.id}`);
  const write = await page.request.post(`/api/practice/report/${fixtures.flagged.id}/check-in`, {
    data: { flag: "phone", answer: "no" },
  });
  expect(read.status()).toBe(404);
  expect(write.status()).toBe(404);
  expect(await write.json()).toEqual(await read.json());
  await page.goto(`/reports/${fixtures.flagged.id}`);
  await expect(page.getByText("We couldn't find that report.")).toBeVisible();
  await expect(banner(page)).toHaveCount(0);

  const anon = await browser.newContext();
  const anonRead = await anon.request.get(`/api/practice/report/${fixtures.flagged.id}`, { maxRedirects: 0 });
  const anonWrite = await anon.request.post(`/api/practice/report/${fixtures.flagged.id}/check-in`, {
    data: { flag: "phone", answer: "no" },
    maxRedirects: 0,
  });
  expect(anonWrite.status()).toBe(anonRead.status());
  expect(anonWrite.headers()["location"]).toBe(anonRead.headers()["location"]);
  await anon.close();
});

test("phone width: one question at a time, then the thanks line", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  // Reset the flagged fixture's answers so the first question shows again.
  const prisma = new PrismaClient();
  await prisma.interactionReport.update({ where: { id: fixtures.flagged.id }, data: { visualMetrics: FLAGGED_VISUAL } });
  await prisma.$disconnect();

  await signIn(page, ALICE);
  await openReport(page, fixtures.flagged.id);
  await expect(banner(page).getByText(Q.hand_at_mouth)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/check-in-375-q1.png` });
  await answers(page, Q.hand_at_mouth).getByRole("button", { name: "Something else" }).click();
  await banner(page).screenshot({ path: `${SHOTS}/check-in-375-something-else.png` });
  await banner(page).getByRole("group", { name: "What was it?" }).getByRole("button", { name: "Sipping water" }).click();
  for (const question of [Q.mouth_movement, Q.hand_shape, Q.another_person, Q.phone]) {
    await expect(banner(page).getByText(question)).toBeVisible();
    await answers(page, question).getByRole("button", { name: "Yes" }).click();
  }
  await expect(banner(page).getByText("Thanks for checking in.")).toBeVisible();
  await expect(banner(page).getByRole("listitem")).toHaveCount(4);
  await page.screenshot({ path: `${SHOTS}/check-in-375-thanks.png` });
});

test("coaching lines name the practice type, not always an interview", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, ALICE);
  // Host the flagged reading on one of Alice's READY reports of each other
  // type, at the network layer only: nothing is written.
  const list = await (await page.request.get("/api/practice/reports")).json();
  const rows: Array<Record<string, unknown>> = list.reports ?? list.items ?? list;
  const leads: Array<[RegExp, string]> = [
    [/^pitch-elevator$/, "When you pitch for real"],
    [/^pitch-(deck|funding|product|talk|general)$/, "In a real presentation"],
    [/^difficult-conversation$/, "In a real courageous conversation"],
    [/^networking$/, "In a real networking conversation"],
    [/^case-study$/, "In a real meeting"],
  ];
  const at = "2026-11-06T12:00:00.000Z";
  const yes = { answer: "yes", at };
  let checked = 0;
  for (const [slug, lead] of leads) {
    const row = rows.find((r) => r.status === "READY" && slug.test(String(r.typeSlug ?? r.type ?? "")));
    if (!row) continue;
    const id = String(row.id ?? row.reportId);
    await page.route(`**/api/practice/report/${id}`, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.report.metrics = { ...body.report.metrics, cameraMode: "ON", visual: FLAGGED_VISUAL, visualUnscored: null };
      body.report.checkIn = { hand_at_mouth: yes, mouth_movement: yes, hand_shape: yes, another_person: yes, phone: yes };
      await route.fulfill({ response, json: body });
    });
    await openReport(page, id);
    const tips = banner(page).getByRole("list", { name: "Tips from your check-in" });
    await expect(tips.getByRole("listitem")).toHaveCount(5, { timeout: 30_000 });
    const lines = await tips.getByRole("listitem").allInnerTexts();
    for (const line of lines) expect(line.startsWith(`${lead}, `), line).toBe(true);
    expect(lines.join(" ")).not.toMatch(/interview/i);
    expect(lines[0]).toMatch(/A quick sip of water is fine\.$/);
    await banner(page).screenshot({ path: `${SHOTS}/check-in-lead-${lead.replace(/\W+/g, "-").toLowerCase()}.png` });
    checked += 1;
  }
  console.log(`check-in leads verified on ${checked} practice types`);
  expect(checked).toBeGreaterThan(0);
});
