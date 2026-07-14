CREATE TYPE "LifecycleEntityType" AS ENUM ('REQUEST', 'QUOTE', 'PROJECT', 'INVOICE');
CREATE TYPE "LifecycleEventPrecision" AS ENUM ('EXACT', 'ESTIMATED');

CREATE TABLE "LifecycleStatusEvent" (
    "id" TEXT NOT NULL,
    "entityType" "LifecycleEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL,
    "actorUserId" TEXT,
    "actorNameSnapshot" TEXT NOT NULL DEFAULT 'Pulse System',
    "valueSnapshot" DECIMAL(12,2),
    "metadata" JSONB,
    "source" TEXT NOT NULL DEFAULT 'APPLICATION',
    "precision" "LifecycleEventPrecision" NOT NULL DEFAULT 'EXACT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LifecycleStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LifecycleStatusEvent_entityType_entityId_changedAt_idx"
ON "LifecycleStatusEvent"("entityType", "entityId", "changedAt");
CREATE INDEX "LifecycleStatusEvent_entityType_toStatus_changedAt_idx"
ON "LifecycleStatusEvent"("entityType", "toStatus", "changedAt");
CREATE INDEX "LifecycleStatusEvent_changedAt_idx" ON "LifecycleStatusEvent"("changedAt");
CREATE INDEX "LifecycleStatusEvent_actorUserId_idx" ON "LifecycleStatusEvent"("actorUserId");

ALTER TABLE "LifecycleStatusEvent"
ADD CONSTRAINT "LifecycleStatusEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "LifecycleStatusEvent" (
  "id", "entityType", "entityId", "toStatus", "changedAt", "actorNameSnapshot",
  "valueSnapshot", "metadata", "source", "precision"
)
SELECT 'migration_request_' || md5("id"), 'REQUEST', "id", "status", "updatedAt", 'Pulse migration',
  NULL, jsonb_build_object('receivedDate', "receivedDate", 'dueDate', "dueDate"), 'MIGRATION', 'ESTIMATED'
FROM "Request";

INSERT INTO "LifecycleStatusEvent" (
  "id", "entityType", "entityId", "toStatus", "changedAt", "actorNameSnapshot",
  "valueSnapshot", "metadata", "source", "precision"
)
SELECT 'migration_quote_' || md5("id"), 'QUOTE', "id", "status", "updatedAt", 'Pulse migration',
  "total", jsonb_build_object('createdAt', "createdAt"), 'MIGRATION', 'ESTIMATED'
FROM "Quote";

INSERT INTO "LifecycleStatusEvent" (
  "id", "entityType", "entityId", "toStatus", "changedAt", "actorNameSnapshot",
  "valueSnapshot", "metadata", "source", "precision"
)
SELECT 'migration_project_' || md5("id"), 'PROJECT', "id", "status", "updatedAt", 'Pulse migration',
  "budget", jsonb_build_object('startDate', "startDate", 'dueDate', "dueDate"), 'MIGRATION', 'ESTIMATED'
FROM "Project";

INSERT INTO "LifecycleStatusEvent" (
  "id", "entityType", "entityId", "toStatus", "changedAt", "actorNameSnapshot",
  "valueSnapshot", "metadata", "source", "precision"
)
SELECT 'migration_invoice_' || md5("id"), 'INVOICE', "id", "status", "updatedAt", 'Pulse migration',
  "amount", jsonb_build_object('issuedDate', "issuedDate", 'dueDate', "dueDate"), 'MIGRATION', 'ESTIMATED'
FROM "Invoice";
