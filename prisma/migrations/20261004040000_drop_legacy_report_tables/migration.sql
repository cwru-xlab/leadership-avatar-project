-- DropForeignKey
ALTER TABLE "InterviewReport" DROP CONSTRAINT "InterviewReport_userId_fkey";

-- DropForeignKey
ALTER TABLE "ScenarioReport" DROP CONSTRAINT "ScenarioReport_userId_fkey";

-- DropTable
DROP TABLE "InterviewReport";

-- DropTable
DROP TABLE "ScenarioReport";

