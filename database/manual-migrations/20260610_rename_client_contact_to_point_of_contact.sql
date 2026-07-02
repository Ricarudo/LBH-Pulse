-- Data-preserving Pulse migration:
-- ClientContact becomes the generic PointOfContact table.
--
-- Run before `prisma db push` so Prisma sees the renamed table with the
-- required generic ownership fields already populated.

BEGIN;

CREATE SCHEMA IF NOT EXISTS pulse;
SET search_path TO pulse;

DO $$
DECLARE
  schema_name text := current_schema();
BEGIN
  IF to_regclass(format('%I.%I', schema_name, 'ClientContact')) IS NOT NULL
     AND to_regclass(format('%I.%I', schema_name, 'PointOfContact')) IS NULL THEN
    ALTER TABLE "ClientContact" RENAME TO "PointOfContact";
  END IF;

  IF to_regclass(format('%I.%I', schema_name, 'PointOfContact')) IS NULL THEN
    RAISE EXCEPTION 'Expected either ClientContact or PointOfContact in schema %', schema_name;
  END IF;
END $$;

ALTER TABLE "PointOfContact"
  ADD COLUMN IF NOT EXISTS "ownerType" TEXT DEFAULT 'Client',
  ADD COLUMN IF NOT EXISTS "ownerId" TEXT;

UPDATE "PointOfContact"
SET "ownerType" = 'Client'
WHERE "ownerType" IS NULL OR btrim("ownerType") = '';

UPDATE "PointOfContact"
SET "ownerId" = "clientId"
WHERE "ownerId" IS NULL AND "clientId" IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PointOfContact" WHERE "ownerId" IS NULL) THEN
    RAISE EXCEPTION 'PointOfContact.ownerId could not be backfilled for every row';
  END IF;
END $$;

ALTER TABLE "PointOfContact"
  ALTER COLUMN "ownerType" SET DEFAULT 'Client',
  ALTER COLUMN "ownerType" SET NOT NULL,
  ALTER COLUMN "ownerId" SET NOT NULL,
  ALTER COLUMN "clientId" DROP NOT NULL;

DO $$
DECLARE
  schema_name text := current_schema();
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = schema_name
      AND t.relname = 'PointOfContact'
      AND c.conname = 'ClientContact_pkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = schema_name
      AND t.relname = 'PointOfContact'
      AND c.conname = 'PointOfContact_pkey'
  ) THEN
    ALTER TABLE "PointOfContact" RENAME CONSTRAINT "ClientContact_pkey" TO "PointOfContact_pkey";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = schema_name
      AND t.relname = 'PointOfContact'
      AND c.conname = 'ClientContact_clientId_fkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = schema_name
      AND t.relname = 'PointOfContact'
      AND c.conname = 'PointOfContact_clientId_fkey'
  ) THEN
    ALTER TABLE "PointOfContact" RENAME CONSTRAINT "ClientContact_clientId_fkey" TO "PointOfContact_clientId_fkey";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = schema_name
      AND t.relname = 'PointOfContact'
      AND c.conname = 'ClientContact_siteId_fkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = schema_name
      AND t.relname = 'PointOfContact'
      AND c.conname = 'PointOfContact_siteId_fkey'
  ) THEN
    ALTER TABLE "PointOfContact" RENAME CONSTRAINT "ClientContact_siteId_fkey" TO "PointOfContact_siteId_fkey";
  END IF;
END $$;

DO $$
DECLARE
  schema_name text := current_schema();
BEGIN
  IF to_regclass(format('%I.%I', schema_name, 'ClientContact_clientId_idx')) IS NOT NULL
     AND to_regclass(format('%I.%I', schema_name, 'PointOfContact_clientId_idx')) IS NULL THEN
    ALTER INDEX "ClientContact_clientId_idx" RENAME TO "PointOfContact_clientId_idx";
  END IF;

  IF to_regclass(format('%I.%I', schema_name, 'ClientContact_siteId_idx')) IS NOT NULL
     AND to_regclass(format('%I.%I', schema_name, 'PointOfContact_siteId_idx')) IS NULL THEN
    ALTER INDEX "ClientContact_siteId_idx" RENAME TO "PointOfContact_siteId_idx";
  END IF;

  IF to_regclass(format('%I.%I', schema_name, 'ClientContact_email_idx')) IS NOT NULL
     AND to_regclass(format('%I.%I', schema_name, 'PointOfContact_email_idx')) IS NULL THEN
    ALTER INDEX "ClientContact_email_idx" RENAME TO "PointOfContact_email_idx";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PointOfContact_ownerType_ownerId_idx"
  ON "PointOfContact"("ownerType", "ownerId");

COMMIT;
