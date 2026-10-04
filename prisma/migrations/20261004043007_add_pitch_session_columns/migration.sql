-- AlterTable
ALTER TABLE "InteractionReport" ADD COLUMN     "slideHighWaterMark" INTEGER,
ADD COLUMN     "slideReveals" JSONB,
ADD COLUMN     "terminationAtSeconds" INTEGER,
ADD COLUMN     "timeBudgetSeconds" INTEGER;
