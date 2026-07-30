ALTER TABLE "Client"
ADD COLUMN "mergedIntoId" TEXT,
ADD COLUMN "mergedAt" TIMESTAMP(3),
ADD COLUMN "mergedById" TEXT,
ADD COLUMN "mergedByName" TEXT;

CREATE TABLE "ClientAlias" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'Manual',
    "originalClientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAlias_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Client_mergedIntoId_idx" ON "Client"("mergedIntoId");
CREATE INDEX "ClientAlias_normalizedName_idx" ON "ClientAlias"("normalizedName");
CREATE INDEX "ClientAlias_originalClientId_idx" ON "ClientAlias"("originalClientId");
CREATE UNIQUE INDEX "ClientAlias_clientId_normalizedName_key" ON "ClientAlias"("clientId", "normalizedName");

ALTER TABLE "Client"
ADD CONSTRAINT "Client_mergedIntoId_fkey"
FOREIGN KEY ("mergedIntoId") REFERENCES "Client"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientAlias"
ADD CONSTRAINT "ClientAlias_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
