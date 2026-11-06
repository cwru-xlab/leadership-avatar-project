import { expect, test, type Page } from "@playwright/test";

// Our report features on dev's technical coding interview: derived title,
// Moments, the check-in lead, and the Interviews chip in My Reports.
// Needs one READY technical-coding report on Alice's account with vocal
// turns and a transcript (the merge seeded "Pair Sum" for this).
const SHOTS = ".loop-shots";
const ALICE = { email: "alice.johnson@case.edu", password: "student123" };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(ALICE.email);
  await page.locator('input[type="password"]').fill(ALICE.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function technicalReport(page: Page): Promise<{ id: string; title: string }> {
  const res = await page.request.get("/api/practice/reports");
  expect(res.status()).toBe(200);
  const { reports } = (await res.json()) as {
    reports: Array<{
      id: string;
      typeSlug: string;
      status: string;
      metrics?: { cameraMode: string | null; visual: unknown } | null;
      input: { assignment?: { title?: string } } | null;
    }>;
  };
  // Real coding sessions run camera-off and so have no Moments; the seeded
  // fixture is the camera-on one this spec needs.
  const report = reports.find(
    (r) =>
      r.typeSlug === "technical-coding" &&
      r.status === "READY" &&
      r.metrics?.cameraMode === "ON" &&
      r.metrics.visual != null,
  );
  if (!report) throw new Error("Alice has no READY camera-on technical-coding report");
  return { id: report.id, title: report.input?.assignment?.title ?? "" };
}

for (const [name, viewport] of [
  ["1440", { width: 1440, height: 900 }],
  ["375", { width: 375, height: 812 }],
] as const) {
  test(`technical coding report at ${name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await signIn(page);
    const { id, title } = await technicalReport(page);
    expect(title).not.toBe("");

    await page.goto(`/reports/${id}`);
    await expect(page.locator("#moments")).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("h1")).toHaveText(title);
    await page.screenshot({ path: `${SHOTS}/technical-report-${name}.png`, fullPage: true });

    await page.goto("/reports?type=interview");
    const card = page.getByRole("link", { name: new RegExp(title) }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/technical-reports-list-${name}.png` });

    await page.goto("/reports?type=networking");
    await expect(page.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);
  });
}

test("signed-out calls to the coding routes get 401 JSON", async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL });
  for (const path of ["/api/technical-interview/run", "/api/technical-interview/opening"]) {
    const res = await anon.post(path, { data: {}, maxRedirects: 0 });
    expect(res.status()).toBe(401);
    expect(res.headers()["content-type"]).toContain("application/json");
  }
  await anon.dispose();
});
