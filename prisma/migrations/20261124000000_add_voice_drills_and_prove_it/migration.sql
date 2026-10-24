-- Phase 23 path engine: voice drills + prove-it link + coached-session
-- delivery metrics. Additive only: two new tables and five nullable columns;
-- no existing row changes meaning and every old step kind stays valid. Hand-authored; applied by a human (REQ-74).

-- AlterTable
ALTER TABLE "CoachedSession" ADD COLUMN     "cameraMode" TEXT,
ADD COLUMN     "visualMetrics" JSONB,
ADD COLUMN     "vocalMetrics" JSONB;

-- AlterTable
ALTER TABLE "MasteryContribution" ADD COLUMN     "sourceVoiceDrillAttemptId" TEXT;

-- AlterTable
ALTER TABLE "StudyPlanPathStep" ADD COLUMN     "linkedReportId" TEXT;

-- CreateTable
CREATE TABLE "VoiceDrill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pathStepId" TEXT NOT NULL,
    "competencyKey" TEXT NOT NULL,
    "scenarioPrompt" TEXT NOT NULL,
    "tipText" TEXT NOT NULL,
    "techniqueId" TEXT,
    "promptBasis" TEXT NOT NULL,
    "sourceReportId" TEXT,
    "quotedTurnIndex" INTEGER,
    "quotedText" TEXT,
    "generationModel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceDrill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceDrillAttempt" (
    "id" TEXT NOT NULL,
    "voiceDrillId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cameraMode" TEXT,
    "transcript" TEXT,
    "spokenDurationMs" INTEGER,
    "visualMetrics" JSONB,
    "vocalMetrics" JSONB,
    "score" INTEGER,
    "feedback" TEXT,
    "graderRationale" TEXT,
    "graderModel" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "VoiceDrillAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoiceDrill_pathStepId_key" ON "VoiceDrill"("pathStepId");

-- CreateIndex
CREATE INDEX "VoiceDrill_userId_createdAt_idx" ON "VoiceDrill"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceDrillAttempt_voiceDrillId_startedAt_idx" ON "VoiceDrillAttempt"("voiceDrillId", "startedAt");

-- CreateIndex
CREATE INDEX "VoiceDrillAttempt_userId_startedAt_idx" ON "VoiceDrillAttempt"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "MasteryContribution_sourceVoiceDrillAttemptId_idx" ON "MasteryContribution"("sourceVoiceDrillAttemptId");

-- AddForeignKey
ALTER TABLE "VoiceDrill" ADD CONSTRAINT "VoiceDrill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceDrill" ADD CONSTRAINT "VoiceDrill_pathStepId_fkey" FOREIGN KEY ("pathStepId") REFERENCES "StudyPlanPathStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceDrillAttempt" ADD CONSTRAINT "VoiceDrillAttempt_voiceDrillId_fkey" FOREIGN KEY ("voiceDrillId") REFERENCES "VoiceDrill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceDrillAttempt" ADD CONSTRAINT "VoiceDrillAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

