ALTER TABLE "RequestUpdate"
  ADD COLUMN "metadata" JSONB;

ALTER TABLE "Quote"
  ADD COLUMN "baseQuoteNumber" TEXT,
  ADD COLUMN "revisionNumber" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "versionCreatedAt" TIMESTAMP(3),
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "sentAtPrecision" "LifecycleEventPrecision";

UPDATE "Quote"
SET
  "baseQuoteNumber" = regexp_replace("quoteNumber", 'R[0-9]+$', '', 'i'),
  "revisionNumber" = CASE
    WHEN "quoteNumber" ~* 'R[0-9]+$'
      THEN regexp_replace("quoteNumber", '^.*R([0-9]+)$', '\1', 'i')::INTEGER
    ELSE 0
  END,
  "versionCreatedAt" = "createdAt",
  "sentAt" = CASE
    WHEN "status" IN ('Sent', 'Approved', 'Rejected', 'Expired', 'Cancelled')
      THEN "createdAt"
    ELSE NULL
  END,
  "sentAtPrecision" = CASE
    WHEN "status" IN ('Sent', 'Approved', 'Rejected', 'Expired', 'Cancelled')
      THEN 'ESTIMATED'::"LifecycleEventPrecision"
    ELSE NULL
  END;

CREATE INDEX "Quote_baseQuoteNumber_idx" ON "Quote"("baseQuoteNumber");
CREATE INDEX "Quote_revisionNumber_idx" ON "Quote"("revisionNumber");

CREATE TABLE "QuoteRevision" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "quoteNumber" TEXT NOT NULL,
  "titleSnapshot" TEXT NOT NULL,
  "clientIdSnapshot" TEXT,
  "clientNameSnapshot" TEXT,
  "ownerSnapshot" TEXT NOT NULL,
  "totalSnapshot" DECIMAL(12,2) NOT NULL,
  "priorStatus" TEXT NOT NULL,
  "outcome" TEXT NOT NULL DEFAULT 'Revision Requested',
  "versionCreatedAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "requestedAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "legacyQuoteId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'APPLICATION',
  "precision" "LifecycleEventPrecision" NOT NULL DEFAULT 'EXACT',
  "requestedById" TEXT,
  "requestedByName" TEXT NOT NULL DEFAULT 'Pulse System',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuoteRevision_legacyQuoteId_key" ON "QuoteRevision"("legacyQuoteId");
CREATE UNIQUE INDEX "QuoteRevision_quoteId_revisionNumber_key" ON "QuoteRevision"("quoteId", "revisionNumber");
CREATE INDEX "QuoteRevision_quoteId_requestedAt_idx" ON "QuoteRevision"("quoteId", "requestedAt");
CREATE INDEX "QuoteRevision_clientIdSnapshot_requestedAt_idx" ON "QuoteRevision"("clientIdSnapshot", "requestedAt");
CREATE INDEX "QuoteRevision_requestedById_idx" ON "QuoteRevision"("requestedById");
CREATE INDEX "QuoteRevision_precision_idx" ON "QuoteRevision"("precision");

ALTER TABLE "QuoteRevision"
  ADD CONSTRAINT "QuoteRevision_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "Quote"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuoteRevision"
  ADD CONSTRAINT "QuoteRevision_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "LocalUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
