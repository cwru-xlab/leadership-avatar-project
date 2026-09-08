import { PrismaClient, Role, AuthProvider, CohortMemberStatus } from "@prisma/client";
import crypto from "crypto";
import { DEFAULT_TOPIC_SKILLS, type PracticeTopic } from "../lib/topics";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  return crypto.createHash("sha512").update(password).digest("hex");
}

function evalPromptFor(topic: PracticeTopic, skills: string[]): string {
  return `You evaluate a ${topic} practice session for Weatherhead leadership development.
Score ONLY chat-observable skills (no camera/body-language).
Skills (0-100): ${skills.join(", ")}.
Format:
SCORE: [0-100]
SKILL_SCORES: {${skills.map((s) => `"${s}": n`).join(", ")}}
EVALUATION:
[strengths + 2-3 concrete improvement actions]`;
}

async function main() {
  console.log("🌱 Starting database seed...");

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      passwordHash: hashPassword("admin123"),
      name: "Admin User",
      role: Role.ADMIN,
      authProvider: AuthProvider.EMAIL,
      emailVerified: true,
    },
  });

  const professor1 = await prisma.user.upsert({
    where: { email: "professor.smith@case.edu" },
    update: {},
    create: {
      email: "professor.smith@case.edu",
      passwordHash: hashPassword("prof123"),
      name: "Dr. John Smith",
      role: Role.PROFESSOR,
      authProvider: AuthProvider.EMAIL,
      emailVerified: true,
    },
  });

  const professor2 = await prisma.user.upsert({
    where: { email: "professor.chen@case.edu" },
    update: {},
    create: {
      email: "professor.chen@case.edu",
      passwordHash: hashPassword("prof123"),
      name: "Dr. Wei Chen",
      role: Role.PROFESSOR,
      authProvider: AuthProvider.EMAIL,
      emailVerified: true,
    },
  });

  const student1 = await prisma.user.upsert({
    where: { email: "alice.johnson@case.edu" },
    update: {},
    create: {
      email: "alice.johnson@case.edu",
      passwordHash: hashPassword("student123"),
      name: "Alice Johnson",
      role: Role.STUDENT,
      studentNumber: "STU001",
      authProvider: AuthProvider.EMAIL,
      emailVerified: true,
    },
  });

  const student2 = await prisma.user.upsert({
    where: { email: "bob.williams@case.edu" },
    update: {},
    create: {
      email: "bob.williams@case.edu",
      passwordHash: hashPassword("student123"),
      name: "Bob Williams",
      role: Role.STUDENT,
      studentNumber: "STU002",
      authProvider: AuthProvider.EMAIL,
      emailVerified: true,
    },
  });

  const student3 = await prisma.user.upsert({
    where: { email: "carol.davis@case.edu" },
    update: {},
    create: {
      email: "carol.davis@case.edu",
      passwordHash: hashPassword("student123"),
      name: "Carol Davis",
      role: Role.STUDENT,
      studentNumber: "STU003",
      authProvider: AuthProvider.EMAIL,
      emailVerified: true,
    },
  });

  const student4 = await prisma.user.upsert({
    where: { email: "david.lee@case.edu" },
    update: {},
    create: {
      email: "david.lee@case.edu",
      passwordHash: hashPassword("student123"),
      name: "David Lee",
      role: Role.STUDENT,
      studentNumber: "STU004",
      authProvider: AuthProvider.EMAIL,
      emailVerified: true,
    },
  });

  const student5 = await prisma.user.upsert({
    where: { email: "emma.wilson@case.edu" },
    update: {},
    create: {
      email: "emma.wilson@case.edu",
      passwordHash: hashPassword("student123"),
      name: "Emma Wilson",
      role: Role.STUDENT,
      studentNumber: "STU005",
      authProvider: AuthProvider.EMAIL,
      emailVerified: true,
    },
  });

  const testStudent = await prisma.user.upsert({
    where: { email: "student@case.edu" },
    update: {},
    create: {
      email: "student@case.edu",
      passwordHash: hashPassword("student123"),
      name: "Jane Smith",
      role: Role.STUDENT,
      studentNumber: "jxs456",
      authProvider: AuthProvider.EMAIL,
      emailVerified: true,
    },
  });

  console.log("✅ Created users");

  const cohort1 = await prisma.cohort.upsert({
    where: { code: "LEAD101-F26" },
    update: {
      name: "LEAD 101 - Leadership Practice",
      description: "Fall 2026 Leadership Institute practice lab",
    },
    create: {
      name: "LEAD 101 - Leadership Practice",
      code: "LEAD101-F26",
      description: "Fall 2026 Leadership Institute practice lab",
      semester: "Fall",
      year: 2026,
      term: "Full Semester",
      isActive: true,
      creatorId: professor1.id,
    },
  });

  const cohort2 = await prisma.cohort.upsert({
    where: { code: "PROF201-F26" },
    update: {
      name: "PROF 201 - Professional Presence",
      description: "Fall 2026 interviews, pitches, and courageous conversations",
    },
    create: {
      name: "PROF 201 - Professional Presence",
      code: "PROF201-F26",
      description: "Fall 2026 interviews, pitches, and courageous conversations",
      semester: "Fall",
      year: 2026,
      term: "Full Semester",
      isActive: true,
      creatorId: professor2.id,
    },
  });

  console.log("✅ Created cohorts");

  for (const student of [student1, student2, student3, testStudent]) {
    await prisma.cohortMember.upsert({
      where: { userId_cohortId: { userId: student.id, cohortId: cohort1.id } },
      update: {},
      create: {
        userId: student.id,
        cohortId: cohort1.id,
        status: CohortMemberStatus.JOINED,
      },
    });
  }

  for (const student of [student1, student4, student5, testStudent]) {
    await prisma.cohortMember.upsert({
      where: { userId_cohortId: { userId: student.id, cohortId: cohort2.id } },
      update: {},
      create: {
        userId: student.id,
        cohortId: cohort2.id,
        status: CohortMemberStatus.JOINED,
      },
    });
  }

  console.log("✅ Added students to cohorts");

  const scenarioDefs: Array<{
    slug: string;
    title: string;
    description: string;
    topic: PracticeTopic;
    subtype: string;
    difficulty: string;
    estimatedMins: number;
    createdById: string;
  }> = [
    {
      slug: "behavioral-interview-internship",
      title: "Behavioral Interview — Summer Internship",
      description:
        "1:1 behavioral interview with a hiring manager for a competitive internship",
      topic: "interview",
      subtype: "behavioral",
      difficulty: "beginner",
      estimatedMins: 20,
      createdById: professor1.id,
    },
    {
      slug: "leadership-interview-club-officer",
      title: "Leadership Interview — Club Officer Role",
      description:
        "Practice answering leadership and teamwork questions for a student org officer interview",
      topic: "interview",
      subtype: "leadership",
      difficulty: "intermediate",
      estimatedMins: 25,
      createdById: professor1.id,
    },
    {
      slug: "investor-pitch-startup",
      title: "Investor Pitch — Campus Startup",
      description:
        "Deliver a concise pitch to an investor avatar and handle tough follow-ups",
      topic: "pitch",
      subtype: "investor",
      difficulty: "intermediate",
      estimatedMins: 15,
      createdById: professor2.id,
    },
    {
      slug: "executive-pitch-project-funding",
      title: "Executive Pitch — Project Funding",
      description:
        "Persuade an executive stakeholder to fund your cross-functional project",
      topic: "pitch",
      subtype: "executive",
      difficulty: "advanced",
      estimatedMins: 20,
      createdById: professor2.id,
    },
    {
      slug: "salary-negotiation",
      title: "Courageous Conversation — Salary Negotiation",
      description:
        "Negotiate a salary increase with your manager while staying professional and assertive",
      topic: "courageous_conversation",
      subtype: "accountability",
      difficulty: "intermediate",
      estimatedMins: 20,
      createdById: professor1.id,
    },
    {
      slug: "team-conflict-mediation",
      title: "Courageous Conversation — Team Conflict",
      description:
        "Address conflict between teammates with empathy, listening, and clear accountability",
      topic: "courageous_conversation",
      subtype: "conflict",
      difficulty: "advanced",
      estimatedMins: 30,
      createdById: professor2.id,
    },
    {
      slug: "feedback-delivery-peer",
      title: "Courageous Conversation — Delivering Feedback",
      description:
        "Give constructive feedback to a peer who missed commitments",
      topic: "courageous_conversation",
      subtype: "feedback",
      difficulty: "beginner",
      estimatedMins: 15,
      createdById: professor1.id,
    },
  ];

  const createdCases: Array<{
    id: string;
    slug: string;
    title: string;
  }> = [];
  for (const def of scenarioDefs) {
    const skills = DEFAULT_TOPIC_SKILLS[def.topic];
    const row = await prisma.case.upsert({
      where: { slug: def.slug },
      update: {
        title: def.title,
        description: def.description,
        topic: def.topic,
        subtype: def.subtype,
        difficulty: def.difficulty,
        estimatedMins: def.estimatedMins,
        category: def.topic,
        targetSkills: JSON.stringify(skills),
        isPublished: true,
      },
      create: {
        slug: def.slug,
        title: def.title,
        description: def.description,
        isPublished: true,
        difficulty: def.difficulty,
        estimatedMins: def.estimatedMins,
        category: def.topic,
        topic: def.topic,
        subtype: def.subtype,
        targetSkills: JSON.stringify(skills),
        createdById: def.createdById,
      },
    });
    createdCases.push(row);
  }

  // Soft-deprecate old customer-complaint slug by folding into feedback theme if present
  await prisma.case.upsert({
    where: { slug: "customer-complaint" },
    update: {
      title: "Courageous Conversation — Difficult Stakeholder",
      description: "Handle a difficult stakeholder conversation with empathy",
      topic: "courageous_conversation",
      subtype: "conflict",
      category: "courageous_conversation",
      targetSkills: JSON.stringify(
        DEFAULT_TOPIC_SKILLS.courageous_conversation
      ),
      isPublished: true,
    },
    create: {
      slug: "customer-complaint",
      title: "Courageous Conversation — Difficult Stakeholder",
      description: "Handle a difficult stakeholder conversation with empathy",
      isPublished: true,
      difficulty: "beginner",
      estimatedMins: 15,
      category: "courageous_conversation",
      topic: "courageous_conversation",
      subtype: "conflict",
      targetSkills: JSON.stringify(
        DEFAULT_TOPIC_SKILLS.courageous_conversation
      ),
      createdById: professor1.id,
    },
  });

  console.log("✅ Created scenarios");

  const assignAll = async (
    students: typeof student1[],
    cases: typeof createdCases,
    cohortId: string
  ) => {
    for (const student of students) {
      for (const c of cases) {
        await prisma.caseAssignment.upsert({
          where: { userId_caseId: { userId: student.id, caseId: c.id } },
          update: { cohortId },
          create: { userId: student.id, caseId: c.id, cohortId },
        });
      }
    }
  };

  const interviewPitch = createdCases.filter((c) =>
    ["interview", "pitch"].includes(
      scenarioDefs.find((d) => d.slug === c.slug)?.topic || ""
    )
  );
  const courageous = createdCases.filter(
    (c) =>
      scenarioDefs.find((d) => d.slug === c.slug)?.topic ===
      "courageous_conversation"
  );

  await assignAll(
    [student1, student2, student3, testStudent],
    createdCases,
    cohort1.id
  );
  await assignAll(
    [student1, student4, student5, testStudent],
    [...interviewPitch, ...courageous],
    cohort2.id
  );

  console.log("✅ Assigned scenarios to students");

  const interviewCase = createdCases.find(
    (c) => c.slug === "behavioral-interview-internship"
  )!;
  const pitchCase = createdCases.find(
    (c) => c.slug === "investor-pitch-startup"
  )!;
  const conflictCase = createdCases.find(
    (c) => c.slug === "team-conflict-mediation"
  )!;

  const aliceSkills1 = {
    organization: 68,
    completeness: 70,
    examples: 62,
    confidence: 65,
    preparation: 72,
  };
  const aliceSkills2 = {
    organization: 80,
    completeness: 82,
    examples: 78,
    confidence: 76,
    preparation: 84,
  };

  await prisma.attempt.upsert({
    where: {
      userId_caseId_attemptNumber: {
        userId: student1.id,
        caseId: interviewCase.id,
        attemptNumber: 1,
      },
    },
    update: {},
    create: {
      userId: student1.id,
      caseId: interviewCase.id,
      attemptNumber: 1,
      score: 70,
      topic: "interview",
      skillScores: JSON.stringify(aliceSkills1),
      totalMessages: 14,
      totalTimeSeconds: 1100,
      startedAt: new Date("2026-03-15T10:00:00Z"),
      submittedAt: new Date("2026-03-15T10:25:00Z"),
      evalResult: "Solid structure; add more specific examples and stronger closings.",
    },
  });

  await prisma.attempt.upsert({
    where: {
      userId_caseId_attemptNumber: {
        userId: student1.id,
        caseId: interviewCase.id,
        attemptNumber: 2,
      },
    },
    update: {},
    create: {
      userId: student1.id,
      caseId: interviewCase.id,
      attemptNumber: 2,
      score: 84,
      topic: "interview",
      skillScores: JSON.stringify(aliceSkills2),
      totalMessages: 16,
      totalTimeSeconds: 1300,
      startedAt: new Date("2026-03-18T14:00:00Z"),
      submittedAt: new Date("2026-03-18T14:22:00Z"),
      evalResult: "Clear improvement in examples and confidence.",
    },
  });

  await prisma.attempt.upsert({
    where: {
      userId_caseId_attemptNumber: {
        userId: student1.id,
        caseId: pitchCase.id,
        attemptNumber: 1,
      },
    },
    update: {},
    create: {
      userId: student1.id,
      caseId: pitchCase.id,
      attemptNumber: 1,
      score: 74,
      topic: "pitch",
      skillScores: JSON.stringify({
        storytelling: 72,
        persuasion: 70,
        handling_questions: 68,
        conciseness: 76,
      }),
      totalMessages: 12,
      totalTimeSeconds: 900,
      startedAt: new Date("2026-03-20T11:00:00Z"),
      submittedAt: new Date("2026-03-20T11:15:00Z"),
      evalResult: "Good narrative; tighten ask and anticipate investor objections.",
    },
  });

  await prisma.attempt.upsert({
    where: {
      userId_caseId_attemptNumber: {
        userId: student2.id,
        caseId: conflictCase.id,
        attemptNumber: 1,
      },
    },
    update: {},
    create: {
      userId: student2.id,
      caseId: conflictCase.id,
      attemptNumber: 1,
      score: 66,
      topic: "courageous_conversation",
      skillScores: JSON.stringify({
        empathy: 60,
        listening: 64,
        accountability: 70,
        emotional_regulation: 62,
      }),
      totalMessages: 18,
      totalTimeSeconds: 1400,
      startedAt: new Date("2026-03-16T09:00:00Z"),
      submittedAt: new Date("2026-03-16T09:25:00Z"),
      evalResult: "Needs more listening before proposing solutions.",
    },
  });

  // Seed skill progress for Alice + regenerate learning plan via engine logic inline
  const { upsertSkillProgressFromScores, regenerateLearningPlan } = await import(
    "../lib/learning-plan"
  );
  await upsertSkillProgressFromScores(student1.id, aliceSkills2);
  await upsertSkillProgressFromScores(student1.id, {
    storytelling: 72,
    persuasion: 70,
    handling_questions: 68,
    conciseness: 76,
  });
  await regenerateLearningPlan(student1.id);
  await regenerateLearningPlan(testStudent.id);

  // Silence unused var warning for eval helper documentation
  void evalPromptFor;
  void admin;

  console.log("\n🎉 Database seeded successfully!");
  console.log("   - LeadPath scenarios across interview / pitch / courageous_conversation");
  console.log("   - Skill progress + learning plan for Alice");
  console.log("\n🔐 Test Credentials:");
  console.log("   Admin:     admin@example.com / admin123");
  console.log("   Professor: professor.smith@case.edu / prof123");
  console.log("   Student:   student@case.edu / student123");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
