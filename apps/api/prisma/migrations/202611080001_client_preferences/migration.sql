CREATE TABLE "ClientPreference" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientPreference_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ClientPreference_clientId_category_idx" ON "ClientPreference"("clientId", "category");
INSERT INTO "ClientPreference" ("id", "clientId", "category", "value")
SELECT 'migrated_' || md5("id" || ': brandPreferences'), "id", 'Brand preferences', "brandPreferences" FROM "Client" WHERE "brandPreferences" IS NOT NULL AND btrim("brandPreferences") <> '';
INSERT INTO "ClientPreference" ("id", "clientId", "category", "value")
SELECT 'migrated_' || md5("id" || ': technologyPreferences'), "id", 'Technology preferences', "technologyPreferences" FROM "Client" WHERE "technologyPreferences" IS NOT NULL AND btrim("technologyPreferences") <> '';
INSERT INTO "ClientPreference" ("id", "clientId", "category", "value")
SELECT 'migrated_' || md5("id" || ': preferredVendors'), "id", 'Preferred vendors', "preferredVendors" FROM "Client" WHERE "preferredVendors" IS NOT NULL AND btrim("preferredVendors") <> '';
INSERT INTO "ClientPreference" ("id", "clientId", "category", "value")
SELECT 'migrated_' || md5("id" || ': preferredCameraBrand'), "id", 'Camera brand', "preferredCameraBrand" FROM "Client" WHERE "preferredCameraBrand" IS NOT NULL AND btrim("preferredCameraBrand") <> '';
INSERT INTO "ClientPreference" ("id", "clientId", "category", "value")
SELECT 'migrated_' || md5("id" || ': preferredAccessControlBrand'), "id", 'Access control brand', "preferredAccessControlBrand" FROM "Client" WHERE "preferredAccessControlBrand" IS NOT NULL AND btrim("preferredAccessControlBrand") <> '';
INSERT INTO "ClientPreference" ("id", "clientId", "category", "value")
SELECT 'migrated_' || md5("id" || ': preferredNetworkBrand'), "id", 'Network brand', "preferredNetworkBrand" FROM "Client" WHERE "preferredNetworkBrand" IS NOT NULL AND btrim("preferredNetworkBrand") <> '';
INSERT INTO "ClientPreference" ("id", "clientId", "category", "value")
SELECT 'migrated_' || md5("id" || ': preferredCablingBrand'), "id", 'Cabling brand', "preferredCablingBrand" FROM "Client" WHERE "preferredCablingBrand" IS NOT NULL AND btrim("preferredCablingBrand") <> '';
INSERT INTO "ClientPreference" ("id", "clientId", "category", "value")
SELECT 'migrated_' || md5("id" || ': standardTechnologies'), "id", 'Standard technologies', "standardTechnologies" FROM "Client" WHERE "standardTechnologies" IS NOT NULL AND btrim("standardTechnologies") <> '';
UPDATE "Client" SET "generalNotes" = CASE
  WHEN "importantNotes" IS NULL OR btrim("importantNotes") = '' THEN "generalNotes"
  WHEN "generalNotes" IS NULL OR btrim("generalNotes") = '' THEN "importantNotes"
  WHEN btrim("generalNotes") = btrim("importantNotes") THEN "generalNotes"
  ELSE "generalNotes" || E'\n\n' || "importantNotes" END;
ALTER TABLE "Client" DROP COLUMN "brandPreferences";
ALTER TABLE "Client" DROP COLUMN "technologyPreferences";
ALTER TABLE "Client" DROP COLUMN "preferredVendors";
ALTER TABLE "Client" DROP COLUMN "preferredCameraBrand";
ALTER TABLE "Client" DROP COLUMN "preferredAccessControlBrand";
ALTER TABLE "Client" DROP COLUMN "preferredNetworkBrand";
ALTER TABLE "Client" DROP COLUMN "preferredCablingBrand";
ALTER TABLE "Client" DROP COLUMN "standardTechnologies";
ALTER TABLE "Client" DROP COLUMN "importantNotes";
