-- Projects and invoices use Pulse users for assignment while preserving the
-- previous owner text as a migration snapshot. Updates and documents extend
-- through the complete Request -> Quote -> Project -> Invoice lifecycle.

ALTER TABLE "Project"
  ADD COLUMN "assignedToId" TEXT,
  ADD COLUMN "currentStepId" TEXT;

ALTER TABLE "Invoice"
  ADD COLUMN "assignedToId" TEXT,
  ADD COLUMN "currentStepId" TEXT;

UPDATE "Project" project
SET "assignedToId" = (
  SELECT pulse_user."id"
  FROM "LocalUser" pulse_user
  WHERE pulse_user."active" = TRUE
    AND (
      LOWER(TRIM(pulse_user."name")) = LOWER(TRIM(project."owner"))
      OR LOWER(TRIM(pulse_user."email")) = LOWER(TRIM(project."owner"))
    )
  ORDER BY pulse_user."id"
  LIMIT 1
)
WHERE NULLIF(TRIM(project."owner"), '') IS NOT NULL
  AND LOWER(TRIM(project."owner")) <> 'unassigned';

UPDATE "Invoice" invoice
SET "assignedToId" = (
  SELECT pulse_user."id"
  FROM "LocalUser" pulse_user
  WHERE pulse_user."active" = TRUE
    AND (
      LOWER(TRIM(pulse_user."name")) = LOWER(TRIM(invoice."owner"))
      OR LOWER(TRIM(pulse_user."email")) = LOWER(TRIM(invoice."owner"))
    )
  ORDER BY pulse_user."id"
  LIMIT 1
)
WHERE NULLIF(TRIM(invoice."owner"), '') IS NOT NULL
  AND LOWER(TRIM(invoice."owner")) <> 'unassigned';

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "LocalUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "LocalUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Project_assignedToId_idx" ON "Project"("assignedToId");
CREATE INDEX "Project_currentStepId_idx" ON "Project"("currentStepId");
CREATE INDEX "Invoice_assignedToId_idx" ON "Invoice"("assignedToId");
CREATE INDEX "Invoice_currentStepId_idx" ON "Invoice"("currentStepId");

ALTER TABLE "RequestUpdate"
  DROP CONSTRAINT "RequestUpdate_lifecycle_parent_check",
  ADD COLUMN "projectId" TEXT,
  ADD COLUMN "invoiceId" TEXT;

ALTER TABLE "RequestUpdate"
  ADD CONSTRAINT "RequestUpdate_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RequestUpdate"
  ADD CONSTRAINT "RequestUpdate_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RequestUpdate"
  ADD CONSTRAINT "RequestUpdate_lifecycle_parent_check"
  CHECK (num_nonnulls("requestId", "quoteId", "projectId", "invoiceId") = 1);

CREATE INDEX "RequestUpdate_projectId_createdAt_idx"
  ON "RequestUpdate"("projectId", "createdAt");
CREATE INDEX "RequestUpdate_invoiceId_createdAt_idx"
  ON "RequestUpdate"("invoiceId", "createdAt");

ALTER TABLE "LifecycleDocument"
  DROP CONSTRAINT "LifecycleDocument_one_origin_check",
  ADD COLUMN "invoiceId" TEXT;

ALTER TABLE "LifecycleDocument"
  ADD CONSTRAINT "LifecycleDocument_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LifecycleDocument"
  ADD CONSTRAINT "LifecycleDocument_one_origin_check"
  CHECK (num_nonnulls("requestId", "quoteId", "projectId", "invoiceId") = 1);

CREATE INDEX "LifecycleDocument_invoiceId_deletedAt_idx"
  ON "LifecycleDocument"("invoiceId", "deletedAt");
