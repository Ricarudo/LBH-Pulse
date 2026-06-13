ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

CREATE TABLE IF NOT EXISTS "Project" (
  "id" TEXT NOT NULL,
  "projectNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "quoteId" TEXT,
  "owner" TEXT NOT NULL DEFAULT 'Unassigned',
  "status" TEXT NOT NULL DEFAULT 'Ready',
  "budget" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "startDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Invoice" (
  "id" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "projectId" TEXT,
  "owner" TEXT NOT NULL DEFAULT 'Unassigned',
  "status" TEXT NOT NULL DEFAULT 'Draft',
  "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "issuedDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Project_projectNumber_key" ON "Project"("projectNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Project_quoteId_key" ON "Project"("quoteId");
CREATE INDEX IF NOT EXISTS "Project_clientId_idx" ON "Project"("clientId");
CREATE INDEX IF NOT EXISTS "Project_status_idx" ON "Project"("status");
CREATE INDEX IF NOT EXISTS "Project_owner_idx" ON "Project"("owner");
CREATE INDEX IF NOT EXISTS "Project_archivedAt_idx" ON "Project"("archivedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE INDEX IF NOT EXISTS "Invoice_clientId_idx" ON "Invoice"("clientId");
CREATE INDEX IF NOT EXISTS "Invoice_projectId_idx" ON "Invoice"("projectId");
CREATE INDEX IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX IF NOT EXISTS "Invoice_owner_idx" ON "Invoice"("owner");
CREATE INDEX IF NOT EXISTS "Invoice_archivedAt_idx" ON "Invoice"("archivedAt");
CREATE INDEX IF NOT EXISTS "Quote_clientId_idx" ON "Quote"("clientId");

DO $$ BEGIN
  ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Project" ADD CONSTRAINT "Project_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill only when a normalized client name resolves to one active account.
-- Ambiguous and unmatched names stay unlinked for a user to resolve explicitly.
WITH normalized_clients AS (
  SELECT "id", REGEXP_REPLACE(LOWER(TRIM("displayName")), '[^a-z0-9]+', '', 'g') AS normalized_name,
    COUNT(*) OVER (PARTITION BY REGEXP_REPLACE(LOWER(TRIM("displayName")), '[^a-z0-9]+', '', 'g')) AS match_count
  FROM "Client"
  WHERE "archivedAt" IS NULL AND NULLIF(TRIM("displayName"), '') IS NOT NULL
)
UPDATE "Request" request SET "clientId" = client."id"
FROM normalized_clients client
WHERE request."clientId" IS NULL AND request."archivedAt" IS NULL AND client.match_count = 1
  AND client.normalized_name <> ''
  AND REGEXP_REPLACE(LOWER(TRIM(COALESCE(request."companyName", ''))), '[^a-z0-9]+', '', 'g') = client.normalized_name;

-- Quotes may predate the request relationship, so backfill their snapshots independently.
WITH normalized_clients AS (
  SELECT "id", REGEXP_REPLACE(LOWER(TRIM("displayName")), '[^a-z0-9]+', '', 'g') AS normalized_name,
    COUNT(*) OVER (PARTITION BY REGEXP_REPLACE(LOWER(TRIM("displayName")), '[^a-z0-9]+', '', 'g')) AS match_count
  FROM "Client"
  WHERE "archivedAt" IS NULL AND NULLIF(TRIM("displayName"), '') IS NOT NULL
)
UPDATE "Quote" quote SET "clientId" = client."id"
FROM normalized_clients client
WHERE quote."clientId" IS NULL AND quote."archivedAt" IS NULL AND client.match_count = 1
  AND client.normalized_name <> ''
  AND REGEXP_REPLACE(LOWER(TRIM(COALESCE(quote."clientName", ''))), '[^a-z0-9]+', '', 'g') = client.normalized_name;

-- Prefer the request's canonical relationship when a converted quote is already linked.
UPDATE "Quote" quote SET "clientId" = request."clientId"
FROM "Request" request
WHERE quote."clientId" IS NULL AND request."relatedQuoteId" = quote."id" AND request."clientId" IS NOT NULL;
