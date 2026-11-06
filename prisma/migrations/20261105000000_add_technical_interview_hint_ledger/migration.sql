-- Durable, server-owned allocation ledger for the two technical interview hints.
CREATE TABLE "TechnicalInterviewHint" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "tier" INTEGER NOT NULL,
  "hintText" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TechnicalInterviewHint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TechnicalInterviewHint_reportId_requestKey_key"
  ON "TechnicalInterviewHint"("reportId", "requestKey");
CREATE UNIQUE INDEX "TechnicalInterviewHint_reportId_tier_key"
  ON "TechnicalInterviewHint"("reportId", "tier");
CREATE INDEX "TechnicalInterviewHint_reportId_issuedAt_idx"
  ON "TechnicalInterviewHint"("reportId", "issuedAt");

ALTER TABLE "TechnicalInterviewHint"
  ADD CONSTRAINT "TechnicalInterviewHint_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "InteractionReport"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
