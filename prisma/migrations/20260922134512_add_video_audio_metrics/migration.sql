-- AlterTable
ALTER TABLE "InterviewReport" ADD COLUMN     "cameraMode" TEXT,
ADD COLUMN     "metricsConsentAt" TIMESTAMP(3),
ADD COLUMN     "visualMetrics" JSONB,
ADD COLUMN     "visualUnscoredReason" TEXT,
ADD COLUMN     "vocalMetrics" JSONB,
ADD COLUMN     "vocalUnscoredReason" TEXT;

-- AlterTable
ALTER TABLE "ScenarioReport" ADD COLUMN     "cameraMode" TEXT,
ADD COLUMN     "metricsConsentAt" TIMESTAMP(3),
ADD COLUMN     "visualMetrics" JSONB,
ADD COLUMN     "visualUnscoredReason" TEXT,
ADD COLUMN     "vocalMetrics" JSONB,
ADD COLUMN     "vocalUnscoredReason" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "videoAnalysisConsentAt" TIMESTAMP(3);
