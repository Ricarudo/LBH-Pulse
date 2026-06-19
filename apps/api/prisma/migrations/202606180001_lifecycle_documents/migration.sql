CREATE TABLE "LifecycleDocument" (
  "id" TEXT NOT NULL,
  "requestId" TEXT,
  "quoteId" TEXT,
  "projectId" TEXT,
  "objectKey" TEXT,
  "originalFileName" TEXT NOT NULL,
  "mediaType" TEXT,
  "byteSize" BIGINT NOT NULL DEFAULT 0,
  "sha256" TEXT,
  "category" TEXT NOT NULL DEFAULT 'Other',
  "scanStatus" TEXT NOT NULL DEFAULT 'Clean',
  "scanMessage" TEXT,
  "scannedAt" TIMESTAMP(3),
  "uploadedById" TEXT,
  "uploadedByName" TEXT NOT NULL DEFAULT 'Pulse System',
  "deletedAt" TIMESTAMP(3),
  "deletedById" TEXT,
  "deletedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LifecycleDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LifecycleDocument_one_origin_check" CHECK (
    (CASE WHEN "requestId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "quoteId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "projectId" IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

INSERT INTO "LifecycleDocument" (
  "id", "requestId", "originalFileName", "category", "scanStatus",
  "scanMessage", "uploadedByName", "createdAt", "updatedAt"
)
SELECT
  "id", "requestId", "fileName", 'Unverified Legacy', 'Legacy',
  'This filename-only record predates secure object storage and is not downloadable.',
  'Legacy Import', "createdAt", "createdAt"
FROM "RequestAttachment";

DROP TABLE "RequestAttachment";

CREATE UNIQUE INDEX "LifecycleDocument_objectKey_key" ON "LifecycleDocument"("objectKey");
CREATE INDEX "LifecycleDocument_requestId_deletedAt_idx" ON "LifecycleDocument"("requestId", "deletedAt");
CREATE INDEX "LifecycleDocument_quoteId_deletedAt_idx" ON "LifecycleDocument"("quoteId", "deletedAt");
CREATE INDEX "LifecycleDocument_projectId_deletedAt_idx" ON "LifecycleDocument"("projectId", "deletedAt");
CREATE INDEX "LifecycleDocument_uploadedById_idx" ON "LifecycleDocument"("uploadedById");
CREATE INDEX "LifecycleDocument_sha256_idx" ON "LifecycleDocument"("sha256");
CREATE INDEX "LifecycleDocument_createdAt_idx" ON "LifecycleDocument"("createdAt");

ALTER TABLE "LifecycleDocument" ADD CONSTRAINT "LifecycleDocument_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifecycleDocument" ADD CONSTRAINT "LifecycleDocument_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifecycleDocument" ADD CONSTRAINT "LifecycleDocument_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifecycleDocument" ADD CONSTRAINT "LifecycleDocument_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
