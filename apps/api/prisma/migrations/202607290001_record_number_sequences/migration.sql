-- CreateTable
CREATE TABLE "RecordNumberSequence" (
    "kind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastSequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordNumberSequence_pkey" PRIMARY KEY ("kind", "year"),
    CONSTRAINT "RecordNumberSequence_kind_check" CHECK ("kind" IN ('request', 'quote', 'project')),
    CONSTRAINT "RecordNumberSequence_year_check" CHECK ("year" BETWEEN 0 AND 99),
    CONSTRAINT "RecordNumberSequence_lastSequence_check" CHECK ("lastSequence" BETWEEN 0 AND 9999)
);

-- Seed the current UTC year's cursor for each record kind from canonical identifiers.
WITH current_year AS (
  SELECT MOD(EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))::INTEGER, 100) AS value
),
canonical_numbers AS (
  SELECT 'request' AS kind, UPPER("requestNumber") AS record_number FROM "Request"
  UNION ALL
  SELECT 'project', UPPER("projectNumber") FROM "Project"
  UNION ALL
  SELECT 'quote', UPPER("quoteNumber") FROM "Quote"
  UNION ALL
  SELECT 'quote', UPPER("baseQuoteNumber") FROM "Quote" WHERE "baseQuoteNumber" IS NOT NULL
  UNION ALL
  SELECT 'quote', UPPER("externalQuoteNumber") FROM "Quote" WHERE "externalQuoteNumber" IS NOT NULL
),
kinds(kind, prefix) AS (
  VALUES ('request', 'RM'), ('quote', 'QM'), ('project', 'PM')
)
INSERT INTO "RecordNumberSequence" ("kind", "year", "lastSequence", "updatedAt")
SELECT
  kinds.kind,
  current_year.value,
  COALESCE(MAX(SUBSTRING(canonical_numbers.record_number FROM 5 FOR 4)::INTEGER), 0),
  CURRENT_TIMESTAMP
FROM kinds
CROSS JOIN current_year
LEFT JOIN canonical_numbers
  ON canonical_numbers.kind = kinds.kind
  AND canonical_numbers.record_number ~ (
    '^' || kinds.prefix || LPAD(current_year.value::TEXT, 2, '0') || '[0-9]{4}$'
  )
GROUP BY kinds.kind, current_year.value;
