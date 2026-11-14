import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Sales conversations (sales-discovery, 2026-11-14):
 * - the practice picker shows the Sales conversations tile;
 * - its case list renders the four seeded buyers, no hidden need leaks;
 * - choosing a case opens the briefing with "Start meeting";
 * - a REAL graded report (start + finish with a scripted listen-first
 *   transcript; the evaluator runs for real) renders the sales panels.
 *
 * Avatar streams are blocked; the report test spends one evaluation.
 */

const SHOTS =
  process.env.SALES_SHOTS ??
  "/Users/ajabreu79/projects/leadership-avatar-wt/screenshots-2026-11-14/loop-sales-listening";
const STUDENT = { email: "student@case.edu", password: "student123" };
const CASE_ID = "sales-saas-hospital-ops";
const FORBIDDEN = ["boarding", "diversion", "command center", "fiscal year", "eight thousand"];

async function shot(page: Page, name: string, fullPage = false) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage, animations: "disabled", caret: "hide" });
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
}

test.describe("sales conversations", () => {
  test.setTimeout(240_000);
  test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

  test("picker shows Sales, a case can be chosen, the session page loads", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await blockSpend(page);
    await signIn(page);

    await page.goto("/practice");
    const tile = page.getByRole("link", { name: /Sales conversations/ });
    await expect(tile).toBeVisible();
    await shot(page, "01-picker", true);

    await tile.click();
    await page.waitForURL("**/practice/sales-discovery");
    const list = page.getByTestId("persona-case-list");
    await expect(list).toBeVisible();
    const ids = await list
      .locator("[data-testid^='persona-case-']")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")!.replace("persona-case-", "")));
    expect(ids.sort()).toEqual([
      "sales-consulting-manufacturer",
      "sales-device-clinic-manager",
      "sales-saas-hospital-ops",
      "sales-startup-first-customer",
    ]);
    await expect(page.getByTestId("persona-disclaimer")).toBeVisible();
    const listText = (await page.locator("body").innerText()).toLowerCase();
    for (const f of FORBIDDEN) expect(listText, `case list leaked "${f}"`).not.toContain(f);
    await shot(page, "02-scenario-list", true);

    await page.getByTestId(`persona-case-${CASE_ID}`).click();
    await page.waitForURL(`**/practice/sales-discovery/${CASE_ID}`);
    const briefing = page.locator("section[aria-labelledby='conversation-briefing-heading']");
    await expect(briefing).toBeVisible({ timeout: 30_000 });
    await expect(briefing.getByText("The situation", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Start meeting|Next|Continue/ }).first()).toBeVisible();
    const html = (await page.content()).toLowerCase();
    for (const f of FORBIDDEN) expect(html, `briefing payload carried "${f}"`).not.toContain(f);
    expect(html).not.toContain("pitchreactionrule");
    expect(html).not.toContain("hiddenfacts");
    await shot(page, "03-briefing", true);
  });

  test("a graded listen-first meeting renders the sales report", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    const play = await page.request.get(`/api/difficult-conversation/play?id=${CASE_ID}&type=sales-discovery`);
    expect(play.ok()).toBe(true);
    const { instance } = await play.json();
    expect(instance.personaCard.style).toBe("sales-discovery");

    const started = await page.request.post("/api/practice/session/start", {
      data: { typeSlug: "sales-discovery", instanceId: CASE_ID, instance, cameraMode: "off" },
    });
    if (!started.ok()) console.log(`  [start] ${started.status()} ${await started.text()}`);
    expect(started.ok()).toBe(true);
    const { reportId } = await started.json();

    const lines: Array<[string, string]> = [
      ["user", "I'm ready to begin the interview."],
      ["assistant", "Thanks for coming in. I've got about twenty minutes. Your email said something about patient flow?"],
      ["user", "Thanks, Dana. I'm Alex from FlowBoard Health. Before I say anything about us, would it be okay if I asked a few questions about how things work here?"],
      ["assistant", "Sure, that works."],
      ["user", "How does a patient get from the ER to an inpatient bed today? Walk me through it."],
      ["assistant", "The ER calls the bed office, they check the EHR bed board and the whiteboard, and then it's a lot of phone calls to the units to find out who's actually leaving. It's slow."],
      ["user", "What's the hardest part of that for you right now?"],
      ["assistant", "Honestly, ER boarding. Admitted patients sit in the ER six to nine hours waiting for a bed, and the ER director brings it up at every leadership meeting."],
      ["user", "Six to nine hours, and it lands on you in front of leadership. What do you think is driving it?"],
      ["assistant", "Discharges. Orders get written in the morning, but transport, pharmacy and paperwork stall them, so most patients don't leave until after three."],
      ["user", "When that happens, what does it cost the hospital?"],
      ["assistant", "We went on ambulance diversion eleven times last quarter. Finance says every diversion hour is about eight thousand dollars in lost admissions."],
      ["user", "So the pain is boarding in the ER, the cause is late discharges, and it's costing real money in diversions. Did I get that right?"],
      ["assistant", "That's it exactly. But every vendor who walks in here has a dashboard. The last one meant double data entry and the nurses never used it."],
      ["user", "That's a fair worry. You said discharges stall on transport and pharmacy. FlowBoard reads the discharge order from the EHR, so nurses enter nothing new, and it alerts transport and pharmacy the moment the order lands. What would you need to see to believe that?"],
      ["assistant", "I'd want my bed-management lead to see it with our workflow, and IT would have to approve the integration. Anything over a hundred thousand goes to the CFO, and capital requests are due in March."],
      ["user", "Then could we set a 45-minute working session next Tuesday with your bed-management lead and someone from IT, so you have what you need before March?"],
      ["assistant", "Tuesday works. I'll bring Karen from the bed office and someone from IT."],
    ];
    const t0 = Date.now() - lines.length * 30_000;
    const turns = lines.map(([role, content], i) => ({ role, content, timestamp: t0 + i * 30_000 }));
    const finished = await page.request.post("/api/practice/session/finish", {
      data: { reportId, turns, terminationSource: "student" },
    });
    if (!finished.ok()) console.log(`  [finish] ${finished.status()} ${await finished.text()}`);
    expect(finished.ok()).toBe(true);

    // Poll until the real evaluation lands.
    let status = "PENDING";
    for (let i = 0; i < 60 && status !== "READY" && status !== "FAILED"; i++) {
      await page.waitForTimeout(3_000);
      const dto = await (await page.request.get(`/api/practice/report/${reportId}`)).json();
      status = dto.report.status;
    }
    expect(status).toBe("READY");
    console.log(`  report ${reportId} READY`);

    await page.goto(`/reports/${reportId}`);
    // Strength titles are model-written, so wait on fixed chrome, not on them.
    await expect(page.getByTestId("persona-report-disclaimer")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("tab", { name: "Behaviors" })).toBeVisible();
    await shot(page, "04-report-overview", true);

    await page.getByRole("tab", { name: "Behaviors" }).click();
    await expect(page.getByTestId("persona-counts-panel")).toBeVisible();
    await expect(page.getByTestId("persona-metric-questions_before_first_pitch")).toBeVisible();
    await expect(page.getByTestId("persona-metric-buyer_talk_share")).toBeVisible();
    await expect(page.getByText("Listening-first sales call checklist").first()).toBeVisible();
    await expect(page.getByText("What the buyer was holding back")).toBeVisible();
    await shot(page, "05-report-behaviors", true);
    await page.getByTestId("persona-counts-panel").screenshot({ path: `${SHOTS}/06-report-listening-counts.png` });
    await page.getByTestId("persona-checklist-panel").screenshot({ path: `${SHOTS}/07-report-checklist.png` });

    await page.getByRole("tab", { name: "Overview" }).click();
    await page.getByRole("tab", { name: "Overview" }).scrollIntoViewIfNeeded();
    await shot(page, "08-report-overview-dimensions");
  });
});
