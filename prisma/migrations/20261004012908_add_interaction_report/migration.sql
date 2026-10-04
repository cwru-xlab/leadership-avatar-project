-- CreateTable
CREATE TABLE "InteractionReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "typeSlug" TEXT NOT NULL,
    "status" "InterviewReportStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "inputSnapshot" JSONB,
    "scores" JSONB,
    "transcriptKey" TEXT,
    "interactionLogId" TEXT,
    "studentEmail" TEXT,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "cameraMode" TEXT,
    "visualMetrics" JSONB,
    "vocalMetrics" JSONB,
    "visualUnscoredReason" TEXT,
    "vocalUnscoredReason" TEXT,
    "metricsConsentAt" TIMESTAMP(3),
    "reportStructured" JSONB,
    "reportMarkdown" TEXT,
    "failureReason" TEXT,
    "evalModel" TEXT,
    "terminationReason" TEXT,
    "outcome" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteractionReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InteractionReport_userId_createdAt_idx" ON "InteractionReport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InteractionReport_userId_typeSlug_idx" ON "InteractionReport"("userId", "typeSlug");

-- AddForeignKey
ALTER TABLE "InteractionReport" ADD CONSTRAINT "InteractionReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
