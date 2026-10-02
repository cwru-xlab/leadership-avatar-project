-- Structured report body (see lib/report/structured.ts).
-- Additive and nullable: every existing row keeps rendering from reportMarkdown,
-- which is now composed from this column rather than returned by the model.
ALTER TABLE "InterviewReport" ADD COLUMN "reportStructured" JSONB;
ALTER TABLE "ScenarioReport" ADD COLUMN "reportStructured" JSONB;
