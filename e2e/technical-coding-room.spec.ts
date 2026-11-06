import { expect, test, type Page } from "@playwright/test";

/**
 * Drives the real coding room: layout fits without page scroll, candidate
 * Python actually runs in the browser worker, and the interviewer's
 * server-authored brief arrives and is recorded in the transcript.
 */

const EMAIL = "alice.johnson@case.edu";
const PASSWORD = "student123";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function openRoom(page: Page) {
  await page.goto("/practice/interviews/technical");
  await page.getByRole("button", { name: /Begin coding session/i }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 30_000 });
}

test.describe("technical coding room", () => {
  test("layout fits the viewport at desktop and phone width", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRoom(page);

    // The room owns the viewport: the page itself must not scroll, and each
    // column scrolls internally instead.
    for (const size of [
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth - window.innerWidth,
        vertical: document.body.scrollHeight - window.innerHeight,
      }));
      expect(overflow.horizontal, `horizontal overflow at ${size.width}px`).toBeLessThanOrEqual(1);
      expect(overflow.vertical, `vertical overflow at ${size.width}px`).toBeLessThanOrEqual(1);
    }

    // Editor and terminal are both reachable without scrolling the page.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator(".cm-editor")).toBeInViewport();
    await expect(page.getByRole("button", { name: /^Terminal/ })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Run" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Submit" })).toBeInViewport();
  });

  test("runs candidate Python and reports per-test pass and fail", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRoom(page);

    const terminal = page.locator('[aria-live="polite"]').filter({ hasText: /Ready\.|python/ });

    // A deliberately wrong body must FAIL — a runner that reports success here
    // would be lying about correctness.
    const signature = await page.locator(".cm-content").innerText();
    const entry = /def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/.exec(signature);
    expect(entry, "starter code exposes a function signature").not.toBeNull();
    const [, name, args] = entry!;

    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(`def ${name}(${args}):\n    return "definitely-wrong"`);
    await page.getByRole("button", { name: "Run" }).click();

    // First run downloads the Python runtime from the CDN.
    await expect(terminal).toContainText(/visible tests passed/, { timeout: 120_000 });
    await expect(terminal).toContainText(/0\/\d+ visible tests passed/);

    // A syntax error must be reported as such, not as a pass.
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("def broken(:\n  pass");
    await page.getByRole("button", { name: "Run" }).click();
    await expect(terminal).toContainText(/Error/i, { timeout: 60_000 });
  });

  test("uses the shared push-to-talk control and answers a typed turn", async ({ page }) => {
    const apiFailures: string[] = [];
    page.on("response", (response) => {
      const url = response.url();
      if (
        (url.includes("/api/interaction/chat") ||
          url.includes("/api/technical-interview/opening")) &&
        response.status() >= 400
      ) {
        apiFailures.push(`${response.status()} ${url}`);
      }
    });

    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRoom(page);

    // The SAME control every other live session renders
    // (components/session/SessionRoom PushToTalkControl), not a second
    // implementation. Both responsive panels carry the label, so scope to the
    // one actually on screen.
    await expect(
      page.getByRole("button", { name: /Start recording answer/i }).locator("visible=true"),
    ).toBeVisible();

    await page
      .getByRole("textbox", { name: /Message the interviewer/i })
      .locator("visible=true")
      .fill("I plan to iterate once and build the result as I go.");
    await page.getByRole("button", { name: "Send", exact: true }).locator("visible=true").click();

    const transcript = page.locator('[aria-label="Interviewer conversation"]:visible');
    await expect(transcript).toContainText(/Interviewer/, { timeout: 60_000 });
    expect(apiFailures, "the interviewer turn must not fail").toEqual([]);
  });

  test("a failed avatar connection degrades to text instead of stranding the room", async ({
    page,
  }) => {
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    // Force a definitive vendor failure: the session-token fetch fails, which
    // is what `onSessionTokenError` reports. Before this was handled, the room
    // kept a dead video box with no brief and a disabled microphone.
    // Scoped to the token route alone so the rest of the room still loads
    // normally — the point is a dead interviewer, not a dead page.
    await page.route("**/api/avatar/get-access-token", (route) => route.abort());

    await openRoom(page);

    // The room explains itself rather than showing a bare "Disconnected" box.
    await expect(page.getByText(/continues in text/i).locator("visible=true")).toBeVisible({
      timeout: 45_000,
    });

    // The brief still arrives in the transcript, and input is still usable.
    const transcript = page.locator('[aria-label="Interviewer conversation"]:visible');
    await expect(transcript).toContainText(/talk me through/i, { timeout: 45_000 });
    await expect(
      page.getByRole("button", { name: /Start recording answer/i }).locator("visible=true"),
    ).toBeEnabled();
  });

  test("interviewer brief is server-authored, spoken once, and idempotent", async ({
    page,
    request,
  }) => {
    await signIn(page);
    await openRoom(page);

    const reportId = await page.evaluate(() => {
      const key = Object.keys(window.localStorage).find((name) =>
        name.startsWith("technical-coding:"),
      );
      return key?.split(":")[1] ?? null;
    });
    expect(reportId, "the room persisted a report id").toBeTruthy();

    const cookies = await page.context().cookies();
    const header = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    const call = async () =>
      (
        await request.post("/api/technical-interview/opening", {
          headers: { cookie: header, "content-type": "application/json" },
          data: { reportId },
        })
      ).json();

    const first = await call();
    expect(typeof first.opening).toBe("string");
    expect(first.opening).toMatch(/talk me through/i);
    // Replaying must return the SAME recorded greeting, never a second one.
    const second = await call();
    expect(second.opening).toBe(first.opening);
    expect(second.replayed).toBe(true);

    // Saying that hidden tests exist is legitimate interview framing. What the
    // brief must never do is disclose their CONTENT, a reference solution, or
    // scoring internals.
    expect(first.opening).not.toMatch(
      /reference solution|rubric|hidden (?:input|case|fixture|expected)|threshold/i,
    );

    const report = await (
      await request.get(`/api/practice/report/${reportId}`, { headers: { cookie: header } })
    ).json();
    expect(JSON.stringify(report)).not.toMatch(
      /referenceSolution|hiddenTests|rubricAnchors|publicTestCases|executionLimits/,
    );
  });
});
