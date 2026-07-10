DO $$ BEGIN
  CREATE TYPE "ItemType" AS ENUM ('PRODUCT', 'LABOR', 'SERVICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ItemRelationType" AS ENUM ('KIT_COMPONENT', 'RELATED', 'REQUIRED', 'OPTIONAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "sourceRequestIdSnapshot" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "requestNumberSnapshot" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "requestTitleSnapshot" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "requestTypeSnapshot" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "serviceCategorySnapshot" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "contactNameSnapshot" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "contactEmailSnapshot" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "contactPhoneSnapshot" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "siteNameSnapshot" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "siteAddressSnapshot" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "citySnapshot" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "stateSnapshot" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "scopeDescriptionSnapshot" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "internalNotesSnapshot" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "proposalNotes" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "proposalPreparedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Item" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "itemType" "ItemType" NOT NULL DEFAULT 'PRODUCT',
  "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
  "sku" TEXT,
  "partNumber" TEXT,
  "manufacturer" TEXT,
  "brand" TEXT,
  "category" TEXT,
  "subcategory" TEXT,
  "unitOfMeasure" TEXT,
  "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "sellPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "markupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "taxable" BOOLEAN NOT NULL DEFAULT true,
  "primaryImageUrl" TEXT,
  "productUrl" TEXT,
  "datasheetUrl" TEXT,
  "internalNotes" TEXT,
  "quoteDescription" TEXT,
  "defaultLaborHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "defaultLaborItemId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QuoteItem" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "sourceItemId" TEXT,
  "section" TEXT NOT NULL DEFAULT 'Materials',
  "name" TEXT NOT NULL,
  "description" TEXT,
  "itemType" "ItemType" NOT NULL,
  "sku" TEXT,
  "partNumber" TEXT,
  "manufacturer" TEXT,
  "brand" TEXT,
  "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
  "unitOfMeasure" TEXT,
  "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "markupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "taxable" BOOLEAN NOT NULL DEFAULT true,
  "imageUrl" TEXT,
  "productUrl" TEXT,
  "lineSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "lineTax" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "lineTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ItemRelation" (
  "id" TEXT NOT NULL,
  "parentItemId" TEXT NOT NULL,
  "childItemId" TEXT NOT NULL,
  "relationType" "ItemRelationType" NOT NULL,
  "defaultQuantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ItemRelation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Quote_sourceRequestIdSnapshot_idx" ON "Quote"("sourceRequestIdSnapshot");

CREATE INDEX IF NOT EXISTS "Item_name_idx" ON "Item"("name");
CREATE INDEX IF NOT EXISTS "Item_itemType_idx" ON "Item"("itemType");
CREATE INDEX IF NOT EXISTS "Item_status_idx" ON "Item"("status");
CREATE INDEX IF NOT EXISTS "Item_sku_idx" ON "Item"("sku");
CREATE INDEX IF NOT EXISTS "Item_partNumber_idx" ON "Item"("partNumber");
CREATE INDEX IF NOT EXISTS "Item_category_idx" ON "Item"("category");
CREATE INDEX IF NOT EXISTS "Item_defaultLaborItemId_idx" ON "Item"("defaultLaborItemId");

CREATE INDEX IF NOT EXISTS "QuoteItem_quoteId_idx" ON "QuoteItem"("quoteId");
CREATE INDEX IF NOT EXISTS "QuoteItem_sourceItemId_idx" ON "QuoteItem"("sourceItemId");
CREATE INDEX IF NOT EXISTS "QuoteItem_itemType_idx" ON "QuoteItem"("itemType");
CREATE INDEX IF NOT EXISTS "QuoteItem_section_idx" ON "QuoteItem"("section");
CREATE INDEX IF NOT EXISTS "QuoteItem_sortOrder_idx" ON "QuoteItem"("sortOrder");

CREATE UNIQUE INDEX IF NOT EXISTS "ItemRelation_parentItemId_childItemId_relationType_key"
  ON "ItemRelation"("parentItemId", "childItemId", "relationType");
CREATE INDEX IF NOT EXISTS "ItemRelation_parentItemId_idx" ON "ItemRelation"("parentItemId");
CREATE INDEX IF NOT EXISTS "ItemRelation_childItemId_idx" ON "ItemRelation"("childItemId");
CREATE INDEX IF NOT EXISTS "ItemRelation_relationType_idx" ON "ItemRelation"("relationType");
CREATE INDEX IF NOT EXISTS "ItemRelation_sortOrder_idx" ON "ItemRelation"("sortOrder");

DO $$ BEGIN
  ALTER TABLE "Item" ADD CONSTRAINT "Item_defaultLaborItemId_fkey"
    FOREIGN KEY ("defaultLaborItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_sourceItemId_fkey"
    FOREIGN KEY ("sourceItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ItemRelation" ADD CONSTRAINT "ItemRelation_parentItemId_fkey"
    FOREIGN KEY ("parentItemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ItemRelation" ADD CONSTRAINT "ItemRelation_childItemId_fkey"
    FOREIGN KEY ("childItemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
