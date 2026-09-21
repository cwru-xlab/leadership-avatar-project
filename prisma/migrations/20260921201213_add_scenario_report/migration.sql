-- CreateTable
CREATE TABLE "ScenarioReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "interactionLogId" TEXT,
    "studentEmail" TEXT,
    "status" "InterviewReportStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "visualScore" INTEGER,
    "vocalScore" INTEGER,
    "contentScore" INTEGER,
    "behavioralScore" INTEGER,
    "reportMarkdown" TEXT,
    "failureReason" TEXT,
    "evalModel" TEXT,
    "caseName" TEXT NOT NULL,
    "backgroundSnapshot" TEXT NOT NULL,
    "avatarsSnapshot" JSONB NOT NULL,
    "criteriaSnapshot" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScenarioReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScenarioReport_userId_createdAt_idx" ON "ScenarioReport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ScenarioReport_userId_caseId_idx" ON "ScenarioReport"("userId", "caseId");

-- AddForeignKey
ALTER TABLE "ScenarioReport" ADD CONSTRAINT "ScenarioReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
