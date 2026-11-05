-- Private, coding-only source checkpoint and final-source evidence.
-- ReportDTO intentionally does not serialize this column.
ALTER TABLE "InteractionReport" ADD COLUMN "technicalEvidence" JSONB;
