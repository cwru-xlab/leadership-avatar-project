/**
 * Seed representative pre-Phase-13 rows into the LOCAL dev DB's legacy
 * tables (`InterviewReport`, `ScenarioReport`) — NEVER `InteractionReport`.
 *
 * Why: plan 13-04's backfill and plan 13-14's end-to-end REQ-66 validation
 * ("every existing report renders identically at its existing URL") both
 * need REAL pre-Phase-13 rows covering every shape the backfill must
 * handle, including the pre-Phase-10 all-null legacy shape. The local dev
 * DB already has real rows from day-to-day development, but nothing
 * guarantees every shape is represented, so this script adds five FIXED,
 * well-known rows under one dedicated test user — idempotent on fixed
 * uuids, so re-running never duplicates.
 *
 * Run: DATABASE_URL="postgresql://ajabreu79@localhost:5432/leadership_avatar_dev" npx tsx scripts/seed-legacy-reports.ts
 *
 * Never touches `InteractionReport`. Never runs against the shared DB (no
 * fallback DATABASE_URL is read from `.env` — the caller must pass it
 * inline, matching every other Phase 13 script).
 */
import { PrismaClient, Role, AuthProvider } from "@prisma/client";
import type {
  VisualMetrics,
  VocalMetrics,
} from "../lib/metrics/types";
import type { StructuredReport } from "../lib/report/structured";

const prisma = new PrismaClient();

// Fixed uuids so this script is idempotent — re-running upserts the SAME
// rows rather than creating new ones. Namespaced with a recognizable
// prefix purely for human readability in `psql`/Prisma Studio; the values
// are otherwise arbitrary valid uuids.
const SEED_USER_ID = "00000000-0000-4000-8000-000000000000";
const SEED_USER_EMAIL = "phase13-seed@case.edu";

const IDS = {
  interviewReadyFull: "00000000-0000-4000-8000-000000000001",
  interviewReadyLegacy: "00000000-0000-4000-8000-000000000002",
  interviewFailed: "00000000-0000-4000-8000-000000000003",
  scenarioReadyFull: "00000000-0000-4000-8000-000000000004",
  scenarioReadyLegacy: "00000000-0000-4000-8000-000000000005",
} as const;

const visualMetricsFull: VisualMetrics = {
  eye_contact_pct: 81,
  attentiveness_pct: 88,
  camera_centered_pct: 90,
  face_presence_pct: 96,
  lighting_ok: true,
  posture_flags: [],
  not_measured: ["background_environment", "fidgeting"],
  episodes: [
    { kind: "posture_drift", start_s: 48, end_s: 86, severity: 0.72 },
    { kind: "gaze_away", start_s: 43, end_s: 86, severity: 0.4 },
  ],
  coverage: {
    session_seconds: 600,
    track_live_seconds: 598,
    expected_samples: 3588,
    processed_samples: 3550,
    face_detected_samples: 3500,
    speaking_samples: 1800,
    listening_samples: 1750,
    capture_offset_s: 2.1,
    sample_hz: 6,
    analyzer_error: false,
  },
  gesture_rate_per_min: 12.4,
  gesture_amplitude_mean: 0.31,
  hands_above_shoulder_pct: 6.2,
  hands_near_face_pct: 3.1,
  posture_drift_mean: 0.373,
  posture_drift_max_s: 12.0,
  posture_signals_measured: ["shoulder_line", "forward_head"],
  observations: {
    phone_visible_seconds: 0,
    posture_shoulder_tilt_deg: 4.3,
    posture_forward_head_offset: 0.77,
    episodes: [],
  },
};

const vocalMetricsFull: VocalMetrics = {
  words_per_minute: 138,
  filler_word_count: 5,
  filler_word_list: ["um", "like"],
  pause_count: 4,
  volume_consistency: 0.84,
  turns: [
    {
      turn_index: 0,
      start_s: 0,
      duration_s: 42,
      words_per_minute: 130,
      filler_count: 2,
      pause_count: 1,
      volume_consistency: 0.86,
    },
    {
      turn_index: 1,
      start_s: 60,
      duration_s: 55,
      words_per_minute: 145,
      filler_count: 3,
      pause_count: 3,
      volume_consistency: 0.82,
    },
  ],
  coverage: {
    spoken_turns: 4,
    typed_turns: 0,
    analyzed_turns: 4,
    spoken_seconds: 240,
    analyzer_error: false,
  },
};

const reportStructuredFull: StructuredReport = {
  overall_summary:
    "Strong structured answers with clear ownership language; posture shifted away from the opening baseline mid-session.",
  strengths: [
    {
      title: "Leadership and initiative",
      detail: "Took charge of a cross-functional launch and unblocked teammates directly.",
      evidence: "I reorganized our sprint priorities and personally unblocked two teammates.",
    },
  ],
  growth_areas: [
    {
      title: "Posture drift",
      detail: "Shifted from the opening posture for a sustained stretch mid-session.",
      suggestion: "Periodically reset to an upright seated position, especially during longer answers.",
      timecodes: ["0:48", "1:26"],
    },
  ],
  category_notes: {
    visual: "Posture shifted from the start of the session.",
    vocal: "Pace and filler use were within a comfortable range.",
    content: "Answers followed a clear situation-action-result structure.",
    behavioral: "Engaged and responsive throughout.",
  },
  rubric_notes: [{ item: "Structure", note: "Consistent situation-action-result framing." }],
  practice_next: "Practice maintaining upright posture through longer, multi-part answers.",
};

async function ensureSeedUser() {
  const user = await prisma.user.upsert({
    where: { email: SEED_USER_EMAIL },
    update: {},
    create: {
      id: SEED_USER_ID,
      email: SEED_USER_EMAIL,
      name: "Phase 13 Seed User",
      role: Role.STUDENT,
      authProvider: AuthProvider.EMAIL,
      emailVerified: true,
    },
  });
  return user.id;
}

async function seedInterviewReports(userId: string) {
  // 1. READY, fully-populated post-Phase-12 row.
  await prisma.interviewReport.upsert({
    where: { id: IDS.interviewReadyFull },
    update: {},
    create: {
      id: IDS.interviewReadyFull,
      userId,
      typeSlug: "general",
      interviewerAvatarId: "test-avatar",
      interviewerName: "Test Interviewer",
      resumeId: null,
      resumeText: "Experienced product manager with 5 years leading cross-functional teams.",
      transcriptKey: `interviews/${userId}/${IDS.interviewReadyFull}.json`,
      turnCount: 8,
      status: "READY",
      visualScore: 4,
      vocalScore: 4,
      contentScore: 5,
      behavioralScore: 4,
      cameraMode: "ON",
      visualMetrics: visualMetricsFull as unknown as object,
      vocalMetrics: vocalMetricsFull as unknown as object,
      visualUnscoredReason: null,
      vocalUnscoredReason: null,
      metricsConsentAt: new Date("2026-09-01T12:00:00Z"),
      reportStructured: reportStructuredFull as unknown as object,
      reportMarkdown: null,
      failureReason: null,
      evalModel: "gpt-4o",
      industry: "Technology",
      roleTitle: "Senior Product Manager",
      difficulty: "hard",
      targetMinutes: 20,
      targetQuestionCount: 6,
      interviewerPersona: "Direct, probing, time-conscious senior hiring manager.",
      startedAt: new Date("2026-09-01T12:00:00Z"),
      completedAt: new Date("2026-09-01T12:22:00Z"),
    },
  });

  // 2. READY pre-Phase-10 LEGACY row — cameraMode null, metrics null, both
  // unscored-reason columns null, reportStructured null (pre-structured-
  // report shape), reportMarkdown present.
  await prisma.interviewReport.upsert({
    where: { id: IDS.interviewReadyLegacy },
    update: {},
    create: {
      id: IDS.interviewReadyLegacy,
      userId,
      typeSlug: "general",
      interviewerAvatarId: "test-avatar",
      interviewerName: "Test Interviewer",
      resumeId: null,
      resumeText: null,
      transcriptKey: `interviews/${userId}/${IDS.interviewReadyLegacy}.json`,
      turnCount: 5,
      status: "READY",
      visualScore: null,
      vocalScore: null,
      contentScore: 4,
      behavioralScore: 4,
      cameraMode: null,
      visualMetrics: undefined,
      vocalMetrics: undefined,
      visualUnscoredReason: null,
      vocalUnscoredReason: null,
      metricsConsentAt: null,
      reportStructured: undefined,
      reportMarkdown:
        "### Interview Performance Report\n\n**Overall Summary**\nSolid behavioral answers with clear structure. Visual and vocal metrics were not measured for this session (pre-Phase-10).\n",
      failureReason: null,
      evalModel: "gpt-4o",
      industry: null,
      roleTitle: null,
      difficulty: null,
      targetMinutes: null,
      targetQuestionCount: null,
      interviewerPersona: null,
      startedAt: new Date("2026-06-01T12:00:00Z"),
      completedAt: new Date("2026-06-01T12:18:00Z"),
    },
  });

  // 3. FAILED row with a failureReason.
  await prisma.interviewReport.upsert({
    where: { id: IDS.interviewFailed },
    update: {},
    create: {
      id: IDS.interviewFailed,
      userId,
      typeSlug: "technical",
      interviewerAvatarId: "test-avatar",
      interviewerName: "Test Interviewer",
      resumeId: null,
      resumeText: null,
      transcriptKey: null,
      turnCount: 1,
      status: "FAILED",
      visualScore: null,
      vocalScore: null,
      contentScore: null,
      behavioralScore: null,
      cameraMode: "ON",
      visualMetrics: undefined,
      vocalMetrics: undefined,
      visualUnscoredReason: null,
      vocalUnscoredReason: null,
      metricsConsentAt: new Date("2026-08-15T09:00:00Z"),
      reportStructured: undefined,
      reportMarkdown: null,
      failureReason: "Evaluator call failed after 3 retries: upstream 503 from the model provider.",
      evalModel: "gpt-4o",
      industry: "Technology",
      roleTitle: "Software Engineer",
      difficulty: "medium",
      targetMinutes: 15,
      targetQuestionCount: 5,
      interviewerPersona: "Friendly technical screener.",
      startedAt: new Date("2026-08-15T09:00:00Z"),
      completedAt: null,
    },
  });
}

async function seedScenarioReports(userId: string) {
  // 4. READY row with the full REQ-33 snapshot and real metrics.
  await prisma.scenarioReport.upsert({
    where: { id: IDS.scenarioReadyFull },
    update: {},
    create: {
      id: IDS.scenarioReadyFull,
      userId,
      caseId: "scn-phase13-seed-case-study",
      interactionLogId: "phase13-seed-log-001",
      studentEmail: SEED_USER_EMAIL,
      status: "READY",
      turnCount: 6,
      visualScore: 4,
      vocalScore: 4,
      contentScore: 4,
      behavioralScore: 5,
      cameraMode: "ON",
      visualMetrics: visualMetricsFull as unknown as object,
      vocalMetrics: vocalMetricsFull as unknown as object,
      visualUnscoredReason: null,
      vocalUnscoredReason: null,
      metricsConsentAt: new Date("2026-09-10T10:00:00Z"),
      reportStructured: reportStructuredFull as unknown as object,
      reportMarkdown: null,
      failureReason: null,
      evalModel: "gpt-4o",
      caseName: "Phase 13 Seed Case Study",
      backgroundSnapshot:
        "A direct report has been missing deadlines for three sprints; morale is slipping. The student must address it constructively.",
      avatarsSnapshot: [
        {
          id: "00000000-0000-4000-8000-0000000000a1",
          name: "Jamie",
          role: "Direct Report",
          profileId: "adam-testing-avatar",
          additionalInfo: "Jamie is stressed about a personal issue but hasn't told anyone at work.",
        },
      ] as unknown as object,
      criteriaSnapshot:
        "Evaluate whether the student asks open-ended questions, acknowledges Jamie's perspective, and sets a concrete follow-up plan.",
      startedAt: new Date("2026-09-10T10:00:00Z"),
      completedAt: new Date("2026-09-10T10:19:00Z"),
    },
  });

  // 5. READY pre-Phase-10 legacy scenario row — cameraMode null, metrics null.
  await prisma.scenarioReport.upsert({
    where: { id: IDS.scenarioReadyLegacy },
    update: {},
    create: {
      id: IDS.scenarioReadyLegacy,
      userId,
      caseId: "scn-phase13-seed-legacy-case",
      interactionLogId: "phase13-seed-log-002",
      studentEmail: SEED_USER_EMAIL,
      status: "READY",
      turnCount: 5,
      visualScore: null,
      vocalScore: null,
      contentScore: 3,
      behavioralScore: 4,
      cameraMode: null,
      visualMetrics: undefined,
      vocalMetrics: undefined,
      visualUnscoredReason: null,
      vocalUnscoredReason: null,
      metricsConsentAt: null,
      reportStructured: undefined,
      reportMarkdown:
        "### Case Study Report\n\nThe student handled the conversation reasonably well. Visual and vocal metrics were not measured for this session (pre-Phase-10).\n",
      failureReason: null,
      evalModel: "gpt-4o",
      caseName: "Phase 13 Seed Legacy Case",
      backgroundSnapshot: "A legacy pre-Phase-10 scenario run with no video/audio metrics pipeline.",
      avatarsSnapshot: [
        {
          id: "00000000-0000-4000-8000-0000000000a2",
          name: "Pat",
          role: "Peer",
          profileId: "adam-testing-avatar",
          additionalInfo: null,
        },
      ] as unknown as object,
      criteriaSnapshot: null,
      startedAt: new Date("2026-05-01T10:00:00Z"),
      completedAt: new Date("2026-05-01T10:15:00Z"),
    },
  });
}

async function main() {
  console.log("Seeding representative pre-Phase-13 rows into LOCAL legacy tables...");

  const beforeInterview = await prisma.interviewReport.count();
  const beforeScenario = await prisma.scenarioReport.count();

  const userId = await ensureSeedUser();
  console.log(`Seed user: ${SEED_USER_EMAIL} (${userId})`);

  await seedInterviewReports(userId);
  await seedScenarioReports(userId);

  const afterInterview = await prisma.interviewReport.count();
  const afterScenario = await prisma.scenarioReport.count();

  console.log("\nSummary (counts before -> after this run):");
  console.log(`  InterviewReport: ${beforeInterview} -> ${afterInterview} (3 fixed seed rows upserted)`);
  console.log(`  ScenarioReport:  ${beforeScenario} -> ${afterScenario} (2 fixed seed rows upserted)`);
  console.log("\nSeeded row ids:");
  for (const [label, id] of Object.entries(IDS)) {
    console.log(`  ${label}: ${id}`);
  }
  console.log(`\nFinal counts — InterviewReport: ${afterInterview}, ScenarioReport: ${afterScenario}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
