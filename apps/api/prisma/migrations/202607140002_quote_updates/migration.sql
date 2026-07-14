ALTER TABLE "RequestUpdate"
  ALTER COLUMN "requestId" DROP NOT NULL,
  ADD COLUMN "quoteId" TEXT;

ALTER TABLE "Quote"
  ADD COLUMN "currentStepId" TEXT;

ALTER TABLE "RequestUpdate"
  ADD CONSTRAINT "RequestUpdate_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "Quote"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RequestUpdate"
  ADD CONSTRAINT "RequestUpdate_lifecycle_parent_check"
  CHECK (num_nonnulls("requestId", "quoteId") = 1);

CREATE INDEX "RequestUpdate_quoteId_createdAt_idx"
  ON "RequestUpdate"("quoteId", "createdAt");

CREATE INDEX "Quote_currentStepId_idx"
  ON "Quote"("currentStepId");
