import { expect, test, type Page } from "@playwright/test";

/**
 * Renders the hand and mouth observation rows from a FIXTURE injected into one
 * of Alice's existing reports at the network layer. Nothing is written to the
 * database. This proves the report renders the rows; it says nothing about
 * whether a real camera produces them.
 */
const SHOTS = ".loop-shots";

const OBSERVATIONS = {
  phone_visible_seconds: 0,
  posture_shoulder_tilt_deg: 3,
  posture_forward_head_offset: 0.7,
  hand_at_mouth_events: 9,
  mouth_movement_silent_seconds: 90,
  food_or_drink_visible_seconds: 40,
  middle_finger_extended_seconds: 2,
  episodes: [
    { kind: "hand_at_mouth_repeated", start_s: 120, end_s: 210, severity: 1 },
    { kind: "mouth_movement_silent", start_s: 125, end_s: 215, severity: 0.9 },
    { kind: "middle_finger_extended", start_s: 300, end_s: 302, severity: 1 },
  ],
};

const VISUAL = {
  eye_contact_pct: 88, attentiveness_pct: 90, camera_centered_pct: 95, face_presence_pct: 99,
  lighting_ok: true, posture_flags: [], not_measured: ["background_environment", "fidgeting"],
  episodes: [],
  coverage: {
    session_seconds: 600, track_live_seconds: 600, expected_samples: 1800, processed_samples: 1800,
    face_detected_samples: 1790, speaking_samples: 900, listening_samples: 900, capture_offset_s: 10,
    sample_hz: 6, analyzer_error: false,
  },
  observations: OBSERVATIONS,
};

async function signInAsAlice(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("alice.johnson@case.edu");
  await page.locator('input[type="password"]').fill("student123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

for (const size of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`observation rows render from a fixture at ${size.width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(size);
    await signInAsAlice(page);

    const list = await (await page.request.get("/api/practice/reports")).json();
    const rows: Array<Record<string, unknown>> = list.reports ?? list.items ?? list;
    const ready = rows.find((r) => r.status === "READY");
    test.skip(!ready, "Alice has no READY report to host the fixture");
    const id = String(ready!.id ?? ready!.reportId);

    await page.route(`**/api/practice/report/${id}`, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.report.metrics = { ...body.report.metrics, cameraMode: "ON", visual: VISUAL, visualUnscored: null };
      await route.fulfill({ response, json: body });
    });

    await page.goto(`/reports/${id}`);
    await page.getByRole("tab", { name: "Delivery" }).click();
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Observations" }) });
    await expect(section).toBeVisible();
    await section.scrollIntoViewIfNeeded();

    await expect(section.getByText("Hand at mouth", { exact: true })).toBeVisible();
    await expect(section.getByText(/^Repeatedly, \d+:\d\d⁠?–⁠?\d+:\d\d \(9 times in all\)$/)).toBeVisible();
    await expect(section.getByText(/^While not speaking, /)).toBeVisible();
    await expect(section.getByText(/^Middle finger extended, others curled, /)).toBeVisible();
    await expect(section.getByText("Visible for about 40 seconds")).toBeVisible();
    await expect(section.getByText(/camera sees motion, not reasons/)).toBeVisible();
    await expect(section).not.toContainText(/eating|chewing|obscene|offensive|rude/i);

    await section.screenshot({ path: `${SHOTS}/observations-${size.width}.png` });
    await page.screenshot({ path: `${SHOTS}/observations-page-${size.width}.png`, fullPage: true });
  });
}
