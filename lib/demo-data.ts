/**
 * Temporary UI placeholder content when env/services are missing.
 * Remove once real DATABASE_URL / AWS / etc. are wired up.
 */

import type { CaseStudy } from "@/types";
import {
  DEFAULT_TOPIC_SKILLS,
  SKILL_META,
  SKILL_TARGET_SCORE,
  type PracticeTopic,
  type SkillKey,
} from "@/lib/topics";
import { isDatabaseConfigured } from "@/lib/db-config";

export function isS3Configured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim() &&
      process.env.AWS_S3_BUCKET_NAME?.trim()
  );
}

/** Non-production placeholder mode when core services are missing */
export function isDemoMode(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.FORCE_DEMO_DATA === "1") return true;
  return !isDatabaseConfigured() || !isS3Configured();
}

/** Use placeholder scenarios when S3 is unavailable */
export function shouldUseDemoScenarios(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.FORCE_DEMO_DATA === "1") return true;
  return !isS3Configured();
}

/** Use placeholder progress/plan when Postgres is unavailable */
export function shouldUseDemoLearningRecords(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.FORCE_DEMO_DATA === "1") return true;
  return !isDatabaseConfigured();
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function buildEvalPrompt(topic: PracticeTopic, skills: SkillKey[]): string {
  return `You evaluate a ${topic} practice session.
Score ONLY chat-observable skills (no camera/body-language).
Skills (0-100): ${skills.join(", ")}.
Format:
SCORE: [0-100]
SKILL_SCORES: {${skills.map((s) => `"${s}": n`).join(", ")}}
EVALUATION:
[strengths + 2-3 concrete improvement actions]`;
}

const now = new Date().toISOString();

export const DEMO_SCENARIOS: CaseStudy[] = [
  {
    id: "behavioral-interview-internship",
    name: "Behavioral Interview — Summer Internship",
    backgroundInfo:
      "You are interviewing for a competitive summer internship. The hiring manager will ask behavioral questions about teamwork, ownership, and a time you handled ambiguity. Use specific examples (STAR). This is placeholder demo content.",
    evaluationPrompt: buildEvalPrompt("interview", DEFAULT_TOPIC_SKILLS.interview),
    topic: "interview",
    subtype: "behavioral",
    personaRole: "interviewer",
    difficulty: "beginner",
    estimatedMins: 20,
    targetSkills: [...DEFAULT_TOPIC_SKILLS.interview],
    avatars: [
      {
        id: "demo-interviewer-1",
        name: "Jordan Lee",
        role: "Hiring Manager",
        additionalInfo:
          "Warm but direct interviewer at a mid-size firm. Asks follow-ups when answers are vague.",
      },
    ],
    cohortIds: ["demo-cohort-lead101"],
    createdBy: "Demo",
    lastEditedBy: "Demo",
    createdAt: now,
    lastEditedAt: now,
  },
  {
    id: "leadership-interview-club-officer",
    name: "Leadership Interview — Club Officer Role",
    backgroundInfo:
      "Interview for a student organization officer role. Expect questions about leading peers, resolving conflict, and motivating a team. Placeholder demo scenario.",
    evaluationPrompt: buildEvalPrompt("interview", DEFAULT_TOPIC_SKILLS.interview),
    topic: "interview",
    subtype: "leadership",
    personaRole: "interviewer",
    difficulty: "intermediate",
    estimatedMins: 25,
    targetSkills: [...DEFAULT_TOPIC_SKILLS.interview],
    avatars: [
      {
        id: "demo-interviewer-2",
        name: "Sam Rivera",
        role: "Faculty Advisor",
        additionalInfo: "Curious about judgment and how you credit teammates.",
      },
    ],
    cohortIds: ["demo-cohort-lead101"],
    createdBy: "Demo",
    lastEditedBy: "Demo",
    createdAt: now,
    lastEditedAt: now,
  },
  {
    id: "investor-pitch-startup",
    name: "Investor Pitch — Campus Startup",
    backgroundInfo:
      "Deliver a 2-minute pitch for your campus startup, then take tough investor questions on market size, traction, and ask. Placeholder demo scenario.",
    evaluationPrompt: buildEvalPrompt("pitch", DEFAULT_TOPIC_SKILLS.pitch),
    topic: "pitch",
    subtype: "investor",
    personaRole: "audience",
    difficulty: "intermediate",
    estimatedMins: 15,
    targetSkills: [...DEFAULT_TOPIC_SKILLS.pitch],
    avatars: [
      {
        id: "demo-investor-1",
        name: "Alex Chen",
        role: "Angel Investor",
        additionalInfo: "Skeptical on unit economics; pushes for a clear ask.",
      },
    ],
    cohortIds: ["demo-cohort-lead101"],
    createdBy: "Demo",
    lastEditedBy: "Demo",
    createdAt: now,
    lastEditedAt: now,
  },
  {
    id: "executive-pitch-project-funding",
    name: "Executive Pitch — Project Funding",
    backgroundInfo:
      "Persuade an executive stakeholder to fund your cross-functional project. Balance storytelling with a crisp business case. Placeholder demo scenario.",
    evaluationPrompt: buildEvalPrompt("pitch", DEFAULT_TOPIC_SKILLS.pitch),
    topic: "pitch",
    subtype: "executive",
    personaRole: "audience",
    difficulty: "advanced",
    estimatedMins: 20,
    targetSkills: [...DEFAULT_TOPIC_SKILLS.pitch],
    avatars: [
      {
        id: "demo-exec-1",
        name: "Morgan Blake",
        role: "VP of Operations",
        additionalInfo: "Time-boxed; wants risk, timeline, and owners.",
      },
    ],
    cohortIds: ["demo-cohort-prof201"],
    createdBy: "Demo",
    lastEditedBy: "Demo",
    createdAt: now,
    lastEditedAt: now,
  },
  {
    id: "salary-negotiation",
    name: "Courageous Conversation — Salary Negotiation",
    backgroundInfo:
      "Negotiate a salary increase with your manager. Stay professional, use evidence, and listen. Placeholder demo scenario (folded from earlier negotiation cases).",
    evaluationPrompt: buildEvalPrompt(
      "courageous_conversation",
      DEFAULT_TOPIC_SKILLS.courageous_conversation
    ),
    topic: "courageous_conversation",
    subtype: "accountability",
    personaRole: "counterpart",
    difficulty: "intermediate",
    estimatedMins: 20,
    targetSkills: [...DEFAULT_TOPIC_SKILLS.courageous_conversation],
    avatars: [
      {
        id: "demo-manager-1",
        name: "Taylor Brooks",
        role: "People Manager",
        additionalInfo: "Supportive but budget-constrained; probes for impact.",
      },
    ],
    cohortIds: ["demo-cohort-lead101"],
    createdBy: "Demo",
    lastEditedBy: "Demo",
    createdAt: now,
    lastEditedAt: now,
  },
  {
    id: "team-conflict-mediation",
    name: "Courageous Conversation — Team Conflict",
    backgroundInfo:
      "Address conflict between teammates with empathy, listening, and clear accountability. Placeholder demo scenario.",
    evaluationPrompt: buildEvalPrompt(
      "courageous_conversation",
      DEFAULT_TOPIC_SKILLS.courageous_conversation
    ),
    topic: "courageous_conversation",
    subtype: "conflict",
    personaRole: "counterpart",
    difficulty: "advanced",
    estimatedMins: 30,
    targetSkills: [...DEFAULT_TOPIC_SKILLS.courageous_conversation],
    avatars: [
      {
        id: "demo-peer-1",
        name: "Riley Quinn",
        role: "Teammate",
        additionalInfo: "Frustrated about uneven workload; needs to feel heard.",
      },
    ],
    cohortIds: ["demo-cohort-prof201"],
    createdBy: "Demo",
    lastEditedBy: "Demo",
    createdAt: now,
    lastEditedAt: now,
  },
  {
    id: "feedback-delivery-peer",
    name: "Courageous Conversation — Delivering Feedback",
    backgroundInfo:
      "Give constructive feedback to a peer who missed commitments. Practice clarity without blame. Placeholder demo scenario.",
    evaluationPrompt: buildEvalPrompt(
      "courageous_conversation",
      DEFAULT_TOPIC_SKILLS.courageous_conversation
    ),
    topic: "courageous_conversation",
    subtype: "feedback",
    personaRole: "counterpart",
    difficulty: "beginner",
    estimatedMins: 15,
    targetSkills: [...DEFAULT_TOPIC_SKILLS.courageous_conversation],
    avatars: [
      {
        id: "demo-peer-2",
        name: "Casey Ng",
        role: "Classmate",
        additionalInfo: "Defensive at first; opens up when you show curiosity.",
      },
    ],
    cohortIds: ["demo-cohort-lead101"],
    createdBy: "Demo",
    lastEditedBy: "Demo",
    createdAt: now,
    lastEditedAt: now,
  },
];

export function getDemoScenario(id: string): CaseStudy | null {
  return DEMO_SCENARIOS.find((s) => s.id === id) || null;
}

export function getDemoScenariosForTopic(topic?: string | null): CaseStudy[] {
  if (!topic) return DEMO_SCENARIOS;
  return DEMO_SCENARIOS.filter((s) => (s.topic || "courageous_conversation") === topic);
}

export function getDemoStudentCases(topic?: string | null) {
  const scenarios = getDemoScenariosForTopic(topic).map((s) => ({
    ...s,
    cohortId: s.cohortIds[0] || "demo-cohort-lead101",
    cohortName:
      s.cohortIds[0] === "demo-cohort-prof201"
        ? "PROF 201 — Professional Presence (demo)"
        : "LEAD 101 — Leadership Practice (demo)",
    heygenMinutesLimit: null as number | null,
  }));

  return {
    cases: scenarios,
    cohorts: [
      {
        id: "demo-cohort-lead101",
        name: "LEAD 101 — Leadership Practice (demo)",
        assignedCaseIds: DEMO_SCENARIOS.map((s) => s.id),
      },
      {
        id: "demo-cohort-prof201",
        name: "PROF 201 — Professional Presence (demo)",
        assignedCaseIds: DEMO_SCENARIOS.filter((s) =>
          s.cohortIds.includes("demo-cohort-prof201")
        ).map((s) => s.id),
      },
    ],
    demo: true as const,
  };
}

const DEMO_SKILL_SCORES: Partial<Record<SkillKey, number>> = {
  organization: 78,
  completeness: 74,
  conciseness: 81,
  examples: 69,
  reflection: 72,
  preparation: 76,
  confidence: 71,
  professional_language: 84,
  listening: 68,
  storytelling: 73,
  persuasion: 70,
  handling_questions: 66,
  empathy: 64,
  emotional_regulation: 67,
  ownership: 75,
  accountability: 72,
  collaboration: 70,
  coachability: 77,
  judgment: 69,
};

export function getDemoProgressPayload() {
  const skills = Object.entries(DEMO_SKILL_SCORES).map(([skillKey, emaScore]) => {
    const key = skillKey as SkillKey;
    const score = emaScore ?? 70;
    const xp = score * 3;
    return {
      skillKey: key,
      label: SKILL_META[key]?.label || key,
      category: SKILL_META[key]?.category || "communication",
      level: Math.max(1, Math.floor(xp / 100) + 1),
      xp,
      emaScore: score,
      attemptCount: 2 + (score % 3),
      gap: Math.max(0, SKILL_TARGET_SCORE - score),
    };
  });

  const attempts = [
    {
      id: "demo-attempt-1",
      score: 84,
      topic: "interview",
      caseTitle: "Behavioral Interview — Summer Internship",
      caseSlug: "behavioral-interview-internship",
      attemptNumber: 2,
      submittedAt: isoDaysAgo(2),
      skillScores: {
        organization: 80,
        examples: 78,
        confidence: 76,
      },
    },
    {
      id: "demo-attempt-2",
      score: 74,
      topic: "pitch",
      caseTitle: "Investor Pitch — Campus Startup",
      caseSlug: "investor-pitch-startup",
      attemptNumber: 1,
      submittedAt: isoDaysAgo(5),
      skillScores: {
        storytelling: 72,
        persuasion: 70,
        handling_questions: 68,
      },
    },
    {
      id: "demo-attempt-3",
      score: 66,
      topic: "courageous_conversation",
      caseTitle: "Courageous Conversation — Team Conflict",
      caseSlug: "team-conflict-mediation",
      attemptNumber: 1,
      submittedAt: isoDaysAgo(8),
      skillScores: {
        empathy: 60,
        listening: 64,
        accountability: 70,
      },
    },
  ];

  return {
    success: true as const,
    demo: true as const,
    targetScore: SKILL_TARGET_SCORE,
    skills: skills.sort((a, b) => a.emaScore - b.emaScore),
    attempts,
    totals: {
      attempts: attempts.length,
      skillsTracked: skills.length,
      avgEma: Math.round(
        skills.reduce((sum, s) => sum + s.emaScore, 0) / skills.length
      ),
    },
    message: "Showing placeholder progress (demo mode).",
  };
}

export function getDemoPlanPayload() {
  const focusKeys: SkillKey[] = ["empathy", "handling_questions", "examples"];
  const activities = [
    {
      id: "demo-act-1",
      title: "Courageous Conversation — Team Conflict",
      status: "pending",
      priority: 1,
      skillKeys: ["empathy", "listening"],
      skillLabels: ["Empathy", "Listening"],
      topic: "courageous_conversation",
      caseSlug: "team-conflict-mediation",
      href: "/case-play/team-conflict-mediation",
      completedAt: null,
    },
    {
      id: "demo-act-2",
      title: "Investor Pitch — Campus Startup",
      status: "pending",
      priority: 2,
      skillKeys: ["handling_questions", "persuasion"],
      skillLabels: ["Handling questions", "Persuasion"],
      topic: "pitch",
      caseSlug: "investor-pitch-startup",
      href: "/case-play/investor-pitch-startup",
      completedAt: null,
    },
    {
      id: "demo-act-3",
      title: "Behavioral Interview — Summer Internship",
      status: "completed",
      priority: 3,
      skillKeys: ["examples", "organization"],
      skillLabels: ["Examples", "Organization"],
      topic: "interview",
      caseSlug: "behavioral-interview-internship",
      href: "/case-play/behavioral-interview-internship",
      completedAt: isoDaysAgo(2),
    },
    {
      id: "demo-act-4",
      title: "Courageous Conversation — Delivering Feedback",
      status: "pending",
      priority: 4,
      skillKeys: ["empathy", "ownership"],
      skillLabels: ["Empathy", "Ownership"],
      topic: "courageous_conversation",
      caseSlug: "feedback-delivery-peer",
      href: "/case-play/feedback-delivery-peer",
      completedAt: null,
    },
  ];

  return {
    success: true as const,
    demo: true as const,
    plan: {
      id: "demo-plan",
      rationale:
        "Focus on skills furthest from the 80 target: Empathy, Handling questions, Examples. (Placeholder plan — replace when Postgres is connected.)",
      generatedAt: isoDaysAgo(0),
      focusSkills: focusKeys.map((k) => ({
        skillKey: k,
        label: SKILL_META[k].label,
      })),
      activities,
    },
    message: "Showing placeholder learning plan (demo mode).",
  };
}
