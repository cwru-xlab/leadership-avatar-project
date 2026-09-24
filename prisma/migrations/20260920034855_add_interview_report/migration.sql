-- CreateEnum
CREATE TYPE "InterviewReportStatus" AS ENUM ('IN_PROGRESS', 'PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "InterviewReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "typeSlug" TEXT NOT NULL,
    "interviewerAvatarId" TEXT,
    "interviewerName" TEXT,
    "resumeId" TEXT,
    "resumeText" TEXT,
    "transcriptKey" TEXT,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "status" "InterviewReportStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "visualScore" INTEGER,
    "vocalScore" INTEGER,
    "contentScore" INTEGER,
    "behavioralScore" INTEGER,
    "reportMarkdown" TEXT,
    "failureReason" TEXT,
    "evalModel" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewReport_userId_createdAt_idx" ON "InterviewReport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InterviewReport_userId_typeSlug_idx" ON "InterviewReport"("userId", "typeSlug");

-- AddForeignKey
ALTER TABLE "InterviewReport" ADD CONSTRAINT "InterviewReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
