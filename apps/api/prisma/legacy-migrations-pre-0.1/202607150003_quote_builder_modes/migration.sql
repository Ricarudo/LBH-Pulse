DO $$ BEGIN
  CREATE TYPE "QuoteCalculationMode" AS ENUM ('LEGACY', 'PULSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Quote"
  ADD COLUMN IF NOT EXISTS "calculationMode" "QuoteCalculationMode" NOT NULL DEFAULT 'PULSE',
  ADD COLUMN IF NOT EXISTS "legacyMaterialSale" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "legacyMaterialCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "legacyLaborSale" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "legacyLaborCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "legacyTaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "legacyEstimatedDurationBusinessDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "externalQuoteNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "importBatchId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalCreatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "externalSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "externalApprovedAt" TIMESTAMP(3);

-- Existing rows with any QuoteItem are intentionally treated as native Pulse
-- quotes, including development-era synthetic total lines. A positive manual
-- total with no items is the only legacy-summary backfill case.
UPDATE "Quote" quote
SET "calculationMode" = CASE
  WHEN EXISTS (SELECT 1 FROM "QuoteItem" item WHERE item."quoteId" = quote.id)
    THEN 'PULSE'::"QuoteCalculationMode"
  WHEN quote.total > 0
    THEN 'LEGACY'::"QuoteCalculationMode"
  ELSE 'PULSE'::"QuoteCalculationMode"
END;

UPDATE "Quote"
SET
  "legacyMaterialSale" = total,
  "legacyMaterialCost" = 0,
  "legacyLaborSale" = 0,
  "legacyLaborCost" = 0,
  "legacyTaxAmount" = 0
WHERE "calculationMode" = 'LEGACY';

UPDATE "Quote" quote
SET total = totals."finalTotal"
FROM (
  SELECT
    item."quoteId",
    COALESCE(SUM(item."lineSubtotal" + item."lineTax"), 0)::DECIMAL(12,2) AS "finalTotal"
  FROM "QuoteItem" item
  GROUP BY item."quoteId"
) totals
WHERE quote.id = totals."quoteId"
  AND quote."calculationMode" = 'PULSE';

UPDATE "QuoteRevision"
SET snapshot = jsonb_set(
  snapshot,
  '{calculationMode}',
  to_jsonb(CASE
    WHEN jsonb_typeof(snapshot->'items') = 'array'
      AND jsonb_array_length(snapshot->'items') > 0 THEN 'PULSE'::text
    WHEN "totalSnapshot" > 0 THEN 'LEGACY'::text
    ELSE 'PULSE'::text
  END),
  true
);

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "sourceQuoteRevisionNumber" INTEGER,
  ADD COLUMN IF NOT EXISTS "sourceQuoteCalculationMode" "QuoteCalculationMode",
  ADD COLUMN IF NOT EXISTS "quoteFinancialSnapshot" JSONB;

ALTER TABLE "Quote"
  DROP CONSTRAINT IF EXISTS "Quote_legacy_financials_nonnegative_check";
ALTER TABLE "Quote"
  ADD CONSTRAINT "Quote_legacy_financials_nonnegative_check" CHECK (
    "legacyMaterialSale" >= 0 AND
    "legacyMaterialCost" >= 0 AND
    "legacyLaborSale" >= 0 AND
    "legacyLaborCost" >= 0 AND
    "legacyTaxAmount" >= 0 AND
    ("legacyEstimatedDurationBusinessDays" IS NULL OR "legacyEstimatedDurationBusinessDays" >= 0)
  );

CREATE INDEX IF NOT EXISTS "Quote_calculationMode_idx" ON "Quote"("calculationMode");
CREATE INDEX IF NOT EXISTS "Quote_externalQuoteNumber_idx" ON "Quote"("externalQuoteNumber");
CREATE INDEX IF NOT EXISTS "Quote_importBatchId_idx" ON "Quote"("importBatchId");
