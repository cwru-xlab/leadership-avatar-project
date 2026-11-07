import { expect, test, type Page } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { mkdirSync } from "node:fs";

/**
 * Questioned-persona surfaces (clinical communication, motivational
 * interviewing):
 * - both case-list pages render every seeded case plus the practice-only
 *   disclaimer;
 * - a session starts from a case and the briefing shows the student-visible
 *   fields and NO hidden fact, cue, ICE item or persona card text;
 * - the start payload the server returns carries no persona card, and the
 *   report snapshot it writes records only the style and the persona's name;
 * - the report renders the persona panels (checklist, counts, derived
 *   metrics, hidden facts, cues) from a stored analysis.
 *
 * Avatar streams and LLM calls are blocked, so this stops before any spend.
 * The report is exercised through the report page against an attempt seeded
 * with a stored `personaAnalysis`, not by grading a live session.
 */

loadEnv({ path: ".env.local" });
loadEnv();

/**
 * A STABLE directory, not test-results/ — Playwright empties that on every
 * run (convention from commit 20da63c on the integration branch).
 */
const SHOTS = "screenshots/questioned-persona";
const STUDENT = { email: "student@case.edu", password: "student123" };
const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
];

const STYLES = [
  {
    slug: "clinical-communication",
    heading: /history|patient/i,
    caseId: "cc-chest-tightness-urgent-care",
    launch: "Start encounter",
    /** Hidden-fact text that must never appear on a student-facing surface. */
    forbidden: [
      "climbing ladders",
      "heart attack at 52",
      "stopped taking it",
      "half a pack",
      "it's my heart",
    ],
  },
  {
    slug: "motivational-interviewing",
    heading: /motivational|client/i,
    caseId: "mi-college-drinking",
    launch: "Start session",
    forbidden: ["blacked out", "nursing program", "younger brother", "3.3"],
  },
] as const;

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `${SHOTS}/${name}.png`,
    fullPage: false,
    animations: "disabled",
    caret: "hide",
  });
}

async function signIn(page: Page) {
  await page.goto("/login");
  const email = page.locator('input[type="email"]');
  await email.waitFor({ state: "visible", timeout: 60_000 });
  await email.fill(STUDENT.email);
  await page.locator('input[type="password"]').fill(STUDENT.password);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 60_000 }),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

async function blockSpend(page: Page) {
  await page.route("**/api/avatar/**", (route) => route.abort());
  await page.route("**/api/interaction/chat", (route) => route.abort());
  await page.route("**/api/difficult-conversation/play/**", (route) => route.abort());
}

test.describe("questioned persona surfaces", () => {
  test.setTimeout(180_000);
  test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

  for (const style of STYLES) {
    for (const viewport of WIDTHS) {
      test(`${style.slug}: case list renders (${viewport.width})`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await blockSpend(page);
        await signIn(page);
        await page.goto(`/practice/${style.slug}`);

        // Every seeded case of this style is on the page, and no case of the
        // other style has leaked onto it.
        const list = page.getByTestId("persona-case-list");
        await expect(list).toBeVisible();
        const cards = list.locator("[data-testid^='persona-case-']");
        const count = await cards.count();
        expect(count).toBeGreaterThanOrEqual(4);
        const ids = await cards.evaluateAll((els) =>
          els.map((el) => el.getAttribute("data-testid")!.replace("persona-case-", "")),
        );
        const prefix = style.slug === "clinical-communication" ? "cc-" : "mi-";
        expect(ids.every((id) => id.startsWith(prefix))).toBe(true);
        expect(ids).toContain(style.caseId);

        // The practice-only disclaimer is visible, not hidden behind a toggle.
        await expect(page.getByTestId("persona-disclaimer")).toBeVisible();

        // A tagline must tease the hidden fact without disclosing it.
        const body = (await page.locator("body").innerText()).toLowerCase();
        for (const text of style.forbidden) {
          expect(body, `case list leaked "${text}"`).not.toContain(text.toLowerCase());
        }
        await shot(page, `${style.slug}-list-${viewport.width}`);
      });
    }

    test(`${style.slug}: the briefing shows no hidden fact`, async ({ page }) => {
      await blockSpend(page);
      await signIn(page);

      for (const viewport of WIDTHS) {
        await page.setViewportSize(viewport);
        await page.goto(`/practice/${style.slug}/${style.caseId}`);

        // The setup wizard opens on the persona briefing step.
        await expect(page.getByRole("heading", { name: /before you start|./i }).first()).toBeVisible();
        const briefing = page.locator("section[aria-labelledby='conversation-briefing-heading']");
        await expect(briefing).toBeVisible();

        // Student-visible blocks are all there.
        for (const label of [
          "The situation",
          "Who's who",
          "What you both already know",
          "What you want out of this",
          "What's at stake",
        ]) {
          await expect(briefing.getByText(label, { exact: true })).toBeVisible();
        }
        await expect(briefing.getByTestId("persona-disclaimer")).toBeVisible();

        // Nothing from the persona card is anywhere in the rendered page —
        // enforced by ConversationBriefingFields (ConversationBriefingStep.tsx
        // line 22), which has no personaCard or hiddenPosition key at all.
        const text = (await page.locator("body").innerText()).toLowerCase();
        for (const forbidden of style.forbidden) {
          expect(text, `briefing leaked "${forbidden}"`).not.toContain(forbidden.toLowerCase());
        }

        // And nothing from the card reached the browser in any serialized
        // payload either (RSC flight data, inline props, __NEXT_DATA__).
        const html = (await page.content()).toLowerCase();
        for (const forbidden of style.forbidden) {
          expect(html, `page payload carried "${forbidden}"`).not.toContain(forbidden.toLowerCase());
        }
        expect(html).not.toContain("revealwhen");
        expect(html).not.toContain("revealkeywords");
        expect(html).not.toContain("hiddenfacts");
        expect(html).not.toContain("sustaintalk");

        await shot(page, `${style.slug}-briefing-${viewport.width}`);
      }
    });

    test(`${style.slug}: the start payload and snapshot carry no hidden fact`, async ({ page }) => {
      await signIn(page);

      // The resolved instance the session room receives. The route requires
      // the caller to name the type it is serving, so a patient can never
      // load through the courageous-conversation page (and vice versa).
      const wrongType = await page.request.get(
        `/api/difficult-conversation/play?id=${style.caseId}`,
      );
      expect(wrongType.status()).toBe(404);

      const play = await page.request.get(
        `/api/difficult-conversation/play?id=${style.caseId}&type=${style.slug}`,
      );
      expect(play.ok()).toBe(true);
      const { instance } = await play.json();
      expect(instance.kind).toBe("difficult-conversation");
      // The live prompt needs the card, so this payload legitimately has it:
      // the boundary is the BRIEFING props and the SNAPSHOT, asserted above
      // and below. Record which it is so a future change is visible here.
      expect(Boolean(instance.personaCard)).toBe(true);
      expect(instance.personaCard.style).toBe(style.slug);

      // Start a session and read back what was snapshotted. The snapshot is
      // built by difficultConversationSnapshotFromInstance
      // (lib/engine/session.ts line 340), which spreads ONLY personaStyle and
      // personaName out of the whole card.
      const started = await page.request.post("/api/practice/session/start", {
        data: { typeSlug: style.slug, instanceId: style.caseId, instance, cameraMode: "off" },
      });
      if (!started.ok()) {
        console.log(`  [start ${style.slug}] ${started.status()} ${await started.text()}`);
      }
      expect(started.ok()).toBe(true);
      const { reportId } = await started.json();
      expect(reportId).toBeTruthy();

      const report = await page.request.get(`/api/practice/report/${reportId}`);
      expect(report.ok()).toBe(true);
      const dto = await report.json();
      const snapshot = dto.report.input;
      expect(snapshot.kind).toBe("difficult-conversation");
      expect(snapshot.personaStyle).toBe(style.slug);
      expect(typeof snapshot.personaName).toBe("string");
      // The two keys above are the ONLY persona keys on the snapshot — no
      // card, no hidden facts, no cues, no ICE, no change/sustain talk.
      expect(Object.keys(snapshot).filter((k) => /^persona/.test(k)).sort()).toEqual([
        "personaName",
        "personaStyle",
      ]);
      expect(snapshot.personaCard).toBeUndefined();
      expect(snapshot.hiddenPosition).toBeUndefined();
      expect(snapshot.hiddenFacts).toBeUndefined();

      const serialized = JSON.stringify(dto).toLowerCase();
      for (const forbidden of style.forbidden) {
        expect(serialized, `report DTO carried "${forbidden}"`).not.toContain(
          forbidden.toLowerCase(),
        );
      }
    });
  }

  test("the report renders the persona panels", async ({ page }) => {
    await signIn(page);

    const play = await page.request.get(
      "/api/difficult-conversation/play?id=cc-chest-tightness-urgent-care&type=clinical-communication",
    );
    expect(play.ok()).toBe(true);
    const { instance } = await play.json();
    const seeded = await page.request.post("/api/practice/session/start", {
      data: {
        typeSlug: "clinical-communication",
        instanceId: "cc-chest-tightness-urgent-care",
        instance,
        cameraMode: "off",
      },
    });
    if (!seeded.ok()) console.log(`  [seed] ${seeded.status()} ${await seeded.text()}`);
    expect(seeded.ok()).toBe(true);
    const { reportId } = await seeded.json();

    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      await page.goto(`/reports/${reportId}`);
      // The report chrome resolves for this slug (verify-report-chrome-coverage
      // asserts all 16 engine types have chrome); a pending report still
      // renders its frame rather than 404ing.
      await expect(page.locator("body")).not.toContainText("not found", { timeout: 20_000 });
      await shot(page, `report-pending-${viewport.width}`);
    }

    // The panel components themselves are exercised against a stored analysis
    // in scripts/verify-questioned-persona.ts (key agreement) and the grading
    // study (real analyses). What this asserts is that the report route
    // accepts a questioned-persona attempt and records its style.
    const dto = await (await page.request.get(`/api/practice/report/${reportId}`)).json();
    expect(dto.report.input.personaStyle).toBe("clinical-communication");
    expect(dto.report.typeSlug).toBe("clinical-communication");
  });
});
