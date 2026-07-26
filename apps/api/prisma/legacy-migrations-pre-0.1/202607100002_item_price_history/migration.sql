CREATE TABLE IF NOT EXISTS "ItemPriceHistory" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "previousCost" DECIMAL(12,2),
  "newCost" DECIMAL(12,2) NOT NULL,
  "previousSellPrice" DECIMAL(12,2),
  "newSellPrice" DECIMAL(12,2) NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemPriceHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ItemPriceHistory_itemId_changedAt_idx"
  ON "ItemPriceHistory"("itemId", "changedAt");

DO $$ BEGIN
  ALTER TABLE "ItemPriceHistory" ADD CONSTRAINT "ItemPriceHistory_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "ItemPriceHistory" (
  "id",
  "itemId",
  "previousCost",
  "newCost",
  "previousSellPrice",
  "newSellPrice",
  "changedAt"
)
SELECT
  'baseline-' || item."id",
  item."id",
  NULL,
  item."cost",
  NULL,
  item."sellPrice",
  item."createdAt"
FROM "Item" item
WHERE NOT EXISTS (
  SELECT 1
  FROM "ItemPriceHistory" history
  WHERE history."itemId" = item."id"
)
ON CONFLICT ("id") DO NOTHING;
