import { expect, test, type Page } from "@playwright/test";

// The behavioral `technical` preset has its own public URL; the coding
// interview keeps /practice/interviews/technical. Report slugs are unchanged.
const SHOTS = "test-results/technical-preset-route";
const STUDENT = { email: "student@case.edu", password: "student123" };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(STUDENT.email);
  await page.locator('input[type="password"]').fill(STUDENT.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

test("picker starts the behavioral technical preset with Customize settings", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/practice/interviews");

  await page.getByRole("button", { name: /Engineering Behavioral Interview/ }).click();
  await page.getByRole("button", { name: /Customize/ }).click();
  await page.getByRole("button", { name: /Session length/ }).click();
  await page.getByRole("option", { name: /Extended/ }).click();
  await page.screenshot({ path: `${SHOTS}/picker-customized.png`, fullPage: true });
  await page.getByRole("button", { name: "Start interview" }).click();

  await page.waitForURL("**/practice/interviews/technical-behavioral", { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Engineering Behavioral Interview" })).toBeVisible({ timeout: 45_000 });
  // Extended length (30 min vs the preset's 20) survived the handoff.
  await expect(page.getByText("30 min", { exact: true })).toBeVisible();
  await expect(page.getByText("Technical interview", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/behavioral-setup.png`, fullPage: true });
});

test("/practice/interviews/technical still opens the coding interview", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto("/practice/interviews/technical");
  await expect(page.getByRole("heading", { name: "Engineering Behavioral Interview" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Coding interview room" })).toBeVisible({ timeout: 45_000 });
  await page.screenshot({ path: `${SHOTS}/coding-route.png`, fullPage: true });

  await page.goto("/practice/interviews/technical-coding");
  await page.waitForURL((url) => url.pathname === "/practice/interviews/technical", { timeout: 30_000 });
});

test("Practice again on a `technical` report opens the behavioral URL", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const res = await page.request.get("/api/practice/reports");
  expect(res.status()).toBe(200);
  const { reports } = (await res.json()) as { reports: Array<{ id: string; typeSlug: string; status: string }> };
  const report = reports.find((r) => r.typeSlug === "technical" && r.status === "READY");
  test.skip(!report, "student has no READY technical report");

  await page.goto(`/reports/${report!.id}`);
  const again = page.getByRole("button", { name: /Practice again/i }).first();
  await expect(again).toBeVisible({ timeout: 45_000 });
  await page.screenshot({ path: `${SHOTS}/technical-report.png`, fullPage: true });
  await again.click();
  await page.waitForURL("**/practice/interviews/technical-behavioral", { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Engineering Behavioral Interview" })).toBeVisible({ timeout: 45_000 });
  await page.screenshot({ path: `${SHOTS}/practice-again-behavioral.png`, fullPage: true });
});
