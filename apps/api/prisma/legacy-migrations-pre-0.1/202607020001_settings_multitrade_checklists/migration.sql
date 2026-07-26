ALTER TABLE "LocalUser"
  ADD COLUMN "themeMode" TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN "accentTheme" TEXT NOT NULL DEFAULT 'blue';

ALTER TABLE "RequestChecklistTemplate"
  ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE TABLE "WorkspaceSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "name" TEXT NOT NULL DEFAULT 'R2 Communications',
  "timeZone" TEXT NOT NULL DEFAULT 'America/Puerto_Rico',
  "locale" TEXT NOT NULL DEFAULT 'en-US',
  "dateFormat" TEXT NOT NULL DEFAULT 'MM/DD/YYYY',
  "weekStartsOn" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "WorkspaceSettings" ("id") VALUES ('default')
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "RequestTrade" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "serviceCategory" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestTrade_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RequestTrade_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RequestTrade_requestId_serviceCategory_key"
  ON "RequestTrade"("requestId", "serviceCategory");
CREATE INDEX "RequestTrade_serviceCategory_idx" ON "RequestTrade"("serviceCategory");

CREATE TABLE "RequestChecklistInstance" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "templateId" TEXT,
  "templateKeySnapshot" TEXT NOT NULL,
  "templateNameSnapshot" TEXT NOT NULL,
  "matchType" TEXT NOT NULL,
  "matchValue" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestChecklistInstance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RequestChecklistInstance_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RequestChecklistInstance_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "RequestChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "RequestChecklistInstance_requestId_idx" ON "RequestChecklistInstance"("requestId");
CREATE INDEX "RequestChecklistInstance_templateId_idx" ON "RequestChecklistInstance"("templateId");
CREATE INDEX "RequestChecklistInstance_active_idx" ON "RequestChecklistInstance"("active");
CREATE INDEX "RequestChecklistInstance_matchType_matchValue_idx"
  ON "RequestChecklistInstance"("matchType", "matchValue");

ALTER TABLE "RequestChecklistItem" ADD COLUMN "checklistInstanceId" TEXT;
CREATE INDEX "RequestChecklistItem_checklistInstanceId_idx"
  ON "RequestChecklistItem"("checklistInstanceId");
ALTER TABLE "RequestChecklistItem"
  ADD CONSTRAINT "RequestChecklistItem_checklistInstanceId_fkey"
  FOREIGN KEY ("checklistInstanceId") REFERENCES "RequestChecklistInstance"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "RequestTrade" ("id", "requestId", "serviceCategory")
SELECT 'trade_' || md5("id"), "id", "serviceCategory"
FROM "Request"
WHERE "serviceCategory" IS NOT NULL AND "serviceCategory" <> ''
ON CONFLICT ("requestId", "serviceCategory") DO NOTHING;

INSERT INTO "RequestChecklistInstance" (
  "id",
  "requestId",
  "templateId",
  "templateKeySnapshot",
  "templateNameSnapshot",
  "matchType",
  "matchValue"
)
SELECT
  'migrated_' || md5(r."id"),
  r."id",
  r."checklistTemplateId",
  COALESCE(t."key", 'migrated'),
  COALESCE(r."checklistTemplateNameSnapshot", t."name", 'Request Intake'),
  'TRADE',
  r."serviceCategory"
FROM "Request" r
LEFT JOIN "RequestChecklistTemplate" t ON t."id" = r."checklistTemplateId"
WHERE EXISTS (
  SELECT 1 FROM "RequestChecklistItem" i WHERE i."requestId" = r."id"
);

UPDATE "RequestChecklistItem"
SET "checklistInstanceId" = 'migrated_' || md5("requestId")
WHERE EXISTS (
  SELECT 1
  FROM "RequestChecklistInstance" ci
  WHERE ci."id" = 'migrated_' || md5("RequestChecklistItem"."requestId")
);

CREATE INDEX "RequestChecklistTemplate_archivedAt_idx"
  ON "RequestChecklistTemplate"("archivedAt");
