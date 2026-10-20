-- CreateTable
CREATE TABLE "MasteryContribution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "competencyKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rawScore" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "sourceReportId" TEXT,
    "sourceAttemptId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedReason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasteryContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studyPlanId" TEXT NOT NULL,
    "competencyKey" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "answerKey" JSONB,
    "sourceReportId" TEXT,
    "quotedTurnIndex" INTEGER,
    "quotedText" TEXT,
    "generationModel" TEXT NOT NULL,
    "flaggedAt" TIMESTAMP(3),
    "flagReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeCheckAttempt" (
    "id" TEXT NOT NULL,
    "knowledgeCheckId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "correct" BOOLEAN,
    "score" DOUBLE PRECISION,
    "gradedBy" TEXT NOT NULL,
    "graderModel" TEXT,
    "graderRationale" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradedAt" TIMESTAMP(3),

    CONSTRAINT "KnowledgeCheckAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingContest" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,

    CONSTRAINT "GradingContest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyPlanPath" (
    "id" TEXT NOT NULL,
    "studyPlanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "selectionSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyPlanPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyPlanPathStep" (
    "id" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "competencyKey" TEXT NOT NULL,
    "selectionReason" TEXT NOT NULL,
    "knowledgeCheckId" TEXT,
    "coachedSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StudyPlanPathStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachedSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pathStepId" TEXT NOT NULL,
    "competencyKey" TEXT NOT NULL,
    "replaySourceReportId" TEXT NOT NULL,
    "replayTurnIndex" INTEGER NOT NULL,
    "freshScenarioPrompt" TEXT NOT NULL,
    "reportId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CoachedSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MasteryContribution_userId_competencyKey_occurredAt_idx" ON "MasteryContribution"("userId", "competencyKey", "occurredAt");

-- CreateIndex
CREATE INDEX "MasteryContribution_userId_occurredAt_idx" ON "MasteryContribution"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "MasteryContribution_sourceAttemptId_idx" ON "MasteryContribution"("sourceAttemptId");

-- CreateIndex
CREATE INDEX "KnowledgeCheck_userId_studyPlanId_idx" ON "KnowledgeCheck"("userId", "studyPlanId");

-- CreateIndex
CREATE INDEX "KnowledgeCheck_userId_competencyKey_idx" ON "KnowledgeCheck"("userId", "competencyKey");

-- CreateIndex
CREATE INDEX "KnowledgeCheck_flaggedAt_idx" ON "KnowledgeCheck"("flaggedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeCheckAttempt_knowledgeCheckId_userId_key" ON "KnowledgeCheckAttempt"("knowledgeCheckId", "userId");

-- CreateIndex
CREATE INDEX "KnowledgeCheckAttempt_userId_submittedAt_idx" ON "KnowledgeCheckAttempt"("userId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GradingContest_attemptId_key" ON "GradingContest"("attemptId");

-- CreateIndex
CREATE INDEX "GradingContest_status_raisedAt_idx" ON "GradingContest"("status", "raisedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudyPlanPath_studyPlanId_key" ON "StudyPlanPath"("studyPlanId");

-- CreateIndex
CREATE INDEX "StudyPlanPath_userId_generatedAt_idx" ON "StudyPlanPath"("userId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudyPlanPathStep_pathId_position_key" ON "StudyPlanPathStep"("pathId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CoachedSession_pathStepId_key" ON "CoachedSession"("pathStepId");

-- CreateIndex
CREATE INDEX "CoachedSession_userId_startedAt_idx" ON "CoachedSession"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "MasteryContribution" ADD CONSTRAINT "MasteryContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCheck" ADD CONSTRAINT "KnowledgeCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCheck" ADD CONSTRAINT "KnowledgeCheck_studyPlanId_fkey" FOREIGN KEY ("studyPlanId") REFERENCES "StudyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCheckAttempt" ADD CONSTRAINT "KnowledgeCheckAttempt_knowledgeCheckId_fkey" FOREIGN KEY ("knowledgeCheckId") REFERENCES "KnowledgeCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCheckAttempt" ADD CONSTRAINT "KnowledgeCheckAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingContest" ADD CONSTRAINT "GradingContest_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "KnowledgeCheckAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingContest" ADD CONSTRAINT "GradingContest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlanPath" ADD CONSTRAINT "StudyPlanPath_studyPlanId_fkey" FOREIGN KEY ("studyPlanId") REFERENCES "StudyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlanPath" ADD CONSTRAINT "StudyPlanPath_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlanPathStep" ADD CONSTRAINT "StudyPlanPathStep_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "StudyPlanPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachedSession" ADD CONSTRAINT "CoachedSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachedSession" ADD CONSTRAINT "CoachedSession_pathStepId_fkey" FOREIGN KEY ("pathStepId") REFERENCES "StudyPlanPathStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
