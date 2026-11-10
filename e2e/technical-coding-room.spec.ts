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

/**
 * Walks the setup wizard the coding room now runs: focus, interviewer, resume,
 * posting, learner briefing, camera. `focus` and the two document steps are
 * optional, so the default path skips them — this is the fastest route to the
 * room, and it also proves "no preference" still yields a problem rather than
 * an empty pool.
 */
async function openRoom(
  page: Page,
  options: {
    topics?: string[];
    difficulty?: string;
    language?: "Python" | "JavaScript";
    camera?: "ON" | "OFF";
  } = {},
) {
  await page.goto("/practice/interviews/technical");

  // Focus step: optional, so only touched when the test asks for a filter.
  await expect(page.getByRole("heading", { name: /want to practise/i })).toBeVisible({
    timeout: 30_000,
  });
  for (const topic of options.topics ?? []) {
    await page.getByRole("checkbox", { name: topic, exact: true }).click();
  }
  if (options.difficulty) {
    await page.getByRole("radio", { name: options.difficulty, exact: true }).click();
  }
  if (options.language) {
    await page.getByRole("radio", { name: options.language, exact: true }).click();
  }
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // Interviewer is the one REQUIRED step: pick the first avatar offered.
  await expect(page.getByRole("heading", { name: /interviewer/i })).toBeVisible({
    timeout: 30_000,
  });
  // The roster selects its first interviewer as soon as it loads. Assert that
  // default and continue; cards are named by voice/persona, not "Select".
  await expect(page.getByRole("button", { pressed: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // Resume and posting are optional — skip both.
  for (let step = 0; step < 2; step += 1) {
    await page.getByRole("button", { name: /Skip for now/i }).first().click();
  }

  // The briefing describes the public workflow before the shared camera gate.
  // It must not receive private assignment or evaluator material.
  const briefing = page.getByTestId("technical-coding-briefing");
  await expect(briefing).toBeVisible();
  await expect(briefing.getByRole("heading", { name: /how this coding interview works/i })).toBeVisible();
  await expect(briefing).toContainText(/correctness, code and algorithm quality, and technical communication/i);
  await expect(briefing).toContainText(/visible tests run locally in your browser/i);
  await expect(briefing).toContainText(/deterministic hidden-test correctness is not currently calculated/i);
  await expect(briefing).toContainText(/stage-specific hints/i);
  await expect(briefing).not.toContainText(/reference solution|rubric anchors|execution harness|provider/i);
  await briefing.getByRole("button", { name: /Continue to camera setup/i }).click();

  // The shared camera consent gate, which this room now uses like every
  // other type instead of silently forcing OFF.
  await expect(page.getByRole("button", { name: /Begin coding session/i })).toBeVisible({
    timeout: 30_000,
  });
  if (options.camera === "ON") {
    await page.getByRole("button", { name: /camera on/i }).first().click();
  } else {
    await page.getByRole("button", { name: /^Camera off/ }).click();
  }

  // Starting the session intentionally replaces the wizard as soon as the
  // response arrives. Do not make Playwright wait for the clicked button to
  // remain attached after dispatching its React handler.
  const startResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/practice/session/start") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: /Begin coding session/i })
    .evaluate((button) => (button as HTMLButtonElement).click());
  expect((await startResponse).status(), "session launch succeeds").toBe(200);

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
    await page.waitForTimeout(400);
    await expect(page.locator(".cm-editor")).toBeInViewport();
    await expect(page.getByRole("button", { name: /^Terminal/ })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Run" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "End and get my report" })).toBeInViewport();

    // `toBeInViewport` is an intersection check, so a shaved edge still passes
    // it, and page-scroll math is absorbed by the app shell's overflow
    // containers. Measure the room's own box instead: when the room forgets to
    // opt into the full-screen layout it renders inside MainContent's padded
    // max-width column, so its rect is inset from the viewport on every side
    // and the bottom control row is clipped away.
    const room = page.locator("main").filter({ has: page.locator(".cm-editor") }).first();
    const box = await room.boundingBox();
    expect(box, "the room has a measurable box").not.toBeNull();
    const viewport = page.viewportSize()!;
    expect(Math.round(box!.x), "room is flush to the left edge").toBeLessThanOrEqual(1);
    expect(Math.round(box!.y), "room is flush to the top edge").toBeLessThanOrEqual(1);
    expect(
      Math.round(box!.width),
      "room spans the full viewport width (no max-width column, no navbar)",
    ).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(
      Math.round(box!.y + box!.height),
      "room's bottom edge is not pushed past the viewport",
    ).toBeLessThanOrEqual(viewport.height + 1);

    // The Run/Submit row is the part that actually disappeared: assert it sits
    // wholly inside the viewport, not merely that it intersects it.
    for (const name of ["Run", "End and get my report"]) {
      const control = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(control, `${name} has a box`).not.toBeNull();
      expect(
        Math.round(control!.y + control!.height),
        `${name} is fully inside the viewport`,
      ).toBeLessThanOrEqual(viewport.height);
    }
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

  test("runs JavaScript in the browser worker", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRoom(page, { language: "JavaScript" });

    await expect(page.getByText("JavaScript", { exact: true })).toBeVisible();
    const signature = await page.locator(".cm-content").innerText();
    const entry = /function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/.exec(signature);
    expect(entry, "JavaScript starter code exposes a function signature").not.toBeNull();
    const [, name, args] = entry!;
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(`function ${name}(${args}) { return "definitely-wrong"; }`);
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByTestId("coding-test-terminal")).toContainText(
      /0\/\d+ visible tests passed/,
      { timeout: 30_000 },
    );
  });

  test("each run replaces the previous terminal output", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRoom(page);

    const terminal = page.locator('[aria-live="polite"]').filter({ hasText: /Ready\.|python/ });
    const signature = await page.locator(".cm-content").innerText();
    const entry = /def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/.exec(signature);
    expect(entry, "starter code exposes a function signature").not.toBeNull();
    const [, name, args] = entry!;

    const write = async (body: string) => {
      await page.locator(".cm-content").click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type(body);
    };

    // A run that errors leaves a distinctive marker, so a second run that
    // merely APPENDS would still show it.
    await write("def broken(:\n  pass");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(terminal).toContainText(/Error/i, { timeout: 120_000 });

    await write(`def ${name}(${args}):\n    return "definitely-wrong"`);
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(terminal).toContainText(/visible tests passed/, { timeout: 60_000 });

    // The earlier failure is gone, and exactly one command line is present.
    await expect(terminal).not.toContainText(/SyntaxError/i);
    const commands = await terminal.locator("text=/python -m pytest visible/").count();
    expect(commands, "only the current run's command line is shown").toBe(1);

    // And the newest output starts at the top of the scroller, not below it.
    const scrollTop = await terminal.evaluate((node) => node.scrollTop);
    expect(scrollTop, "terminal is scrolled to the newest output").toBeLessThanOrEqual(1);
  });

  test("confirms before ending and queues a report", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRoom(page);

    await page.getByRole("button", { name: "End and get my report" }).click();
    const dialog = page.getByRole("dialog", { name: /end session and generate your report/i });
    await expect(dialog).toContainText(/final code and interview conversation will be evaluated/i);
    await dialog.getByRole("button", { name: "Keep coding" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "End and get my report" }).click();
    const finishResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/practice/session/finish") &&
        response.request().method() === "POST",
    );
    await dialog
      .getByRole("button", { name: "End and get my report" })
      .evaluate((button) => (button as HTMLButtonElement).click());
    expect((await finishResponse).status(), "report finish request is accepted").toBe(202);
    await page.waitForURL(/\/reports\//, { timeout: 30_000 });
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

  test("serves the staged authored hint ladder and stops at its final stage", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRoom(page);

    const transcript = page.locator('[aria-label="Interviewer conversation"]:visible');
    for (const tier of [1, 2, 3]) {
      await page.getByRole("button", { name: `Hint stage ${tier - 1}/3`, exact: true }).click();
      await expect(transcript).toContainText(`Hint ${tier} of 3:`, { timeout: 45_000 });
    }
    await expect(page.getByRole("button", { name: "Hint stage 3/3", exact: true })).toBeDisabled();
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
