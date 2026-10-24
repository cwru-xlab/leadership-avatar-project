-- Phase 22 coached mode. Additive only: two new tables, nullable columns, and
-- one DROP NOT NULL relaxation. Hand-authored; applied by a human (REQ-74).

-- AlterTable
ALTER TABLE "CoachedSession" ALTER COLUMN "freshScenarioPrompt" DROP NOT NULL,
ADD COLUMN     "freshSourceReportId" TEXT,
ADD COLUMN     "freshTurnIndex" INTEGER,
ADD COLUMN     "selectionBasis" TEXT,
ADD COLUMN     "replayLegCompletedAt" TIMESTAMP(3),
ADD COLUMN     "replayMomentScore" INTEGER,
ADD COLUMN     "freshMomentScore" INTEGER;

-- AlterTable
ALTER TABLE "MasteryContribution" ADD COLUMN     "sourceCoachedSessionId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "coachAvatarId" TEXT,
ADD COLUMN     "coachVoiceId" TEXT,
ADD COLUMN     "coachName" TEXT;

-- CreateTable
CREATE TABLE "CoachedTurn" (
    "id" TEXT NOT NULL,
    "coachedSessionId" TEXT NOT NULL,
    "leg" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "speaker" TEXT NOT NULL,
    "move" TEXT NOT NULL,
    "awaiting" TEXT,
    "text" TEXT NOT NULL,
    "demonstration" TEXT,
    "score" INTEGER,
    "acceptable" BOOLEAN,
    "parroted" BOOLEAN,
    "gradeRationale" TEXT,
    "spokenDurationMs" INTEGER,
    "closedAtSoftCap" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachedTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MomentCompetencyScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "competencyKey" TEXT NOT NULL,
    "evidencesCompetency" BOOLEAN NOT NULL,
    "score" INTEGER,
    "rationale" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MomentCompetencyScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachedTurn_coachedSessionId_leg_idx" ON "CoachedTurn"("coachedSessionId", "leg");

-- CreateIndex
CREATE UNIQUE INDEX "CoachedTurn_coachedSessionId_seq_key" ON "CoachedTurn"("coachedSessionId", "seq");

-- CreateIndex
CREATE INDEX "MomentCompetencyScore_userId_idx" ON "MomentCompetencyScore"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MomentCompetencyScore_reportId_turnIndex_competencyKey_key" ON "MomentCompetencyScore"("reportId", "turnIndex", "competencyKey");

-- CreateIndex
CREATE INDEX "MasteryContribution_sourceCoachedSessionId_idx" ON "MasteryContribution"("sourceCoachedSessionId");

-- AddForeignKey
ALTER TABLE "CoachedTurn" ADD CONSTRAINT "CoachedTurn_coachedSessionId_fkey" FOREIGN KEY ("coachedSessionId") REFERENCES "CoachedSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MomentCompetencyScore" ADD CONSTRAINT "MomentCompetencyScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
