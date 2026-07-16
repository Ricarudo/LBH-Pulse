-- Standardize the four lifecycle workspaces around shared details and linked
-- records. Legacy text is retained as a display snapshot when it cannot be
-- matched unambiguously to a real Pulse record.

CREATE TABLE "LifecycleContext" (
  "id" TEXT NOT NULL,
  "details" TEXT NOT NULL DEFAULT '',
  "updatedById" TEXT,
  "updatedByNameSnapshot" TEXT NOT NULL DEFAULT 'Pulse System',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LifecycleContext_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Request" ADD COLUMN "lifecycleContextId" TEXT;
ALTER TABLE "Quote"
  ADD COLUMN "siteId" TEXT,
  ADD COLUMN "assignedToId" TEXT,
  ADD COLUMN "lifecycleContextId" TEXT;
ALTER TABLE "Project"
  ADD COLUMN "contactId" TEXT,
  ADD COLUMN "siteId" TEXT,
  ADD COLUMN "lifecycleContextId" TEXT;
ALTER TABLE "Invoice"
  ADD COLUMN "contactId" TEXT,
  ADD COLUMN "siteId" TEXT,
  ADD COLUMN "lifecycleContextId" TEXT;

-- One context follows an existing lifecycle chain. Direct-created records get
-- their own context and can be linked normally from that point forward.
INSERT INTO "LifecycleContext" ("id", "details", "createdAt", "updatedAt")
SELECT 'lc-' || md5('request:' || request."id"), COALESCE(request."description", ''),
       request."createdAt", request."updatedAt"
FROM "Request" request;

UPDATE "Request"
SET "lifecycleContextId" = 'lc-' || md5('request:' || "id");

UPDATE "Quote" quote
SET "lifecycleContextId" = (
  SELECT request."lifecycleContextId"
  FROM "Request" request
  WHERE request."relatedQuoteId" = quote."id"
  ORDER BY request."createdAt", request."id"
  LIMIT 1
);

INSERT INTO "LifecycleContext" ("id", "details", "createdAt", "updatedAt")
SELECT 'lc-' || md5('quote:' || quote."id"), COALESCE(quote."scopeDescriptionSnapshot", ''),
       quote."createdAt", quote."updatedAt"
FROM "Quote" quote
WHERE quote."lifecycleContextId" IS NULL;

UPDATE "Quote"
SET "lifecycleContextId" = 'lc-' || md5('quote:' || "id")
WHERE "lifecycleContextId" IS NULL;

UPDATE "Project" project
SET "lifecycleContextId" = quote."lifecycleContextId",
    "contactId" = quote."contactId",
    "siteId" = quote."siteId"
FROM "Quote" quote
WHERE project."quoteId" = quote."id";

INSERT INTO "LifecycleContext" ("id", "createdAt", "updatedAt")
SELECT 'lc-' || md5('project:' || project."id"), project."createdAt", project."updatedAt"
FROM "Project" project
WHERE project."lifecycleContextId" IS NULL;

UPDATE "Project"
SET "lifecycleContextId" = 'lc-' || md5('project:' || "id")
WHERE "lifecycleContextId" IS NULL;

UPDATE "Invoice" invoice
SET "lifecycleContextId" = project."lifecycleContextId",
    "contactId" = project."contactId",
    "siteId" = project."siteId"
FROM "Project" project
WHERE invoice."projectId" = project."id";

INSERT INTO "LifecycleContext" ("id", "createdAt", "updatedAt")
SELECT 'lc-' || md5('invoice:' || invoice."id"), invoice."createdAt", invoice."updatedAt"
FROM "Invoice" invoice
WHERE invoice."lifecycleContextId" IS NULL;

UPDATE "Invoice"
SET "lifecycleContextId" = 'lc-' || md5('invoice:' || "id")
WHERE "lifecycleContextId" IS NULL;

-- Match legacy quote relationships only when exactly one active record fits.
UPDATE "Request" request
SET "clientId" = (
  SELECT MIN(client."id")
  FROM "Client" client
  WHERE client."archivedAt" IS NULL
    AND (LOWER(TRIM(client."displayName")) = LOWER(TRIM(request."companyName"))
      OR LOWER(TRIM(COALESCE(client."companyName", ''))) = LOWER(TRIM(request."companyName")))
  HAVING COUNT(*) = 1
)
WHERE request."clientId" IS NULL
  AND NULLIF(TRIM(request."companyName"), '') IS NOT NULL;

UPDATE "Quote" quote
SET "clientId" = (
  SELECT MIN(client."id")
  FROM "Client" client
  WHERE client."archivedAt" IS NULL
    AND (LOWER(TRIM(client."displayName")) = LOWER(TRIM(quote."clientName"))
      OR LOWER(TRIM(COALESCE(client."companyName", ''))) = LOWER(TRIM(quote."clientName")))
  HAVING COUNT(*) = 1
)
WHERE quote."clientId" IS NULL
  AND NULLIF(TRIM(quote."clientName"), '') IS NOT NULL;

-- Give legacy clients a minimal location that can be confirmed and corrected in
-- the client workspace. Existing site data is preserved as-is.
INSERT INTO "ClientSite" (
  "id", "clientId", "name", "siteName", "siteType", "state", "country",
  "status", "isPrimarySite", "createdAt", "updatedAt"
)
SELECT
  'site-' || md5('legacy-main-site:' || client."id"),
  client."id",
  'Main Office',
  'Main Office',
  'Main Office',
  'PR',
  'Puerto Rico',
  'Active',
  TRUE,
  client."createdAt",
  CURRENT_TIMESTAMP
FROM "Client" client
WHERE NOT EXISTS (
  SELECT 1
  FROM "ClientSite" site
  WHERE site."clientId" = client."id"
);

UPDATE "Request" request
SET "contactId" = (
  SELECT MIN(contact."id")
  FROM "PointOfContact" contact
  WHERE contact."clientId" = request."clientId"
    AND contact."ownerType" = 'Client'
    AND contact."ownerId" = request."clientId"
    AND ((NULLIF(TRIM(request."contactName"), '') IS NOT NULL
        AND LOWER(TRIM(COALESCE(contact."name", contact."firstName" || ' ' || contact."lastName"))) = LOWER(TRIM(request."contactName")))
      OR (NULLIF(TRIM(request."contactEmail"), '') IS NOT NULL
        AND LOWER(TRIM(COALESCE(contact."email", ''))) = LOWER(TRIM(request."contactEmail"))))
  HAVING COUNT(*) = 1
)
WHERE request."contactId" IS NULL
  AND request."clientId" IS NOT NULL
  AND (NULLIF(TRIM(request."contactName"), '') IS NOT NULL
    OR NULLIF(TRIM(request."contactEmail"), '') IS NOT NULL);

UPDATE "Quote" quote
SET "contactId" = (
  SELECT MIN(contact."id")
  FROM "PointOfContact" contact
  WHERE contact."clientId" = quote."clientId"
    AND contact."ownerType" = 'Client'
    AND contact."ownerId" = quote."clientId"
    AND ((NULLIF(TRIM(quote."contactNameSnapshot"), '') IS NOT NULL
        AND LOWER(TRIM(COALESCE(contact."name", contact."firstName" || ' ' || contact."lastName"))) = LOWER(TRIM(quote."contactNameSnapshot")))
      OR (NULLIF(TRIM(quote."contactEmailSnapshot"), '') IS NOT NULL
        AND LOWER(TRIM(COALESCE(contact."email", ''))) = LOWER(TRIM(quote."contactEmailSnapshot"))))
  HAVING COUNT(*) = 1
)
WHERE quote."contactId" IS NULL
  AND quote."clientId" IS NOT NULL
  AND (NULLIF(TRIM(quote."contactNameSnapshot"), '') IS NOT NULL
    OR NULLIF(TRIM(quote."contactEmailSnapshot"), '') IS NOT NULL);

UPDATE "Quote" quote
SET "assignedToId" = (
  SELECT MIN(pulse_user."id")
  FROM "LocalUser" pulse_user
  WHERE pulse_user."active" = TRUE
    AND (LOWER(TRIM(pulse_user."name")) = LOWER(TRIM(quote."owner"))
      OR LOWER(TRIM(pulse_user."email")) = LOWER(TRIM(quote."owner")))
  HAVING COUNT(*) = 1
)
WHERE NULLIF(TRIM(quote."owner"), '') IS NOT NULL
  AND LOWER(TRIM(quote."owner")) <> 'unassigned';

UPDATE "Quote" quote
SET "siteId" = (
  SELECT MIN(site."id")
  FROM "ClientSite" site
  WHERE site."clientId" = quote."clientId"
    AND (
      (NULLIF(TRIM(quote."siteNameSnapshot"), '') IS NOT NULL
        AND LOWER(TRIM(site."siteName")) = LOWER(TRIM(quote."siteNameSnapshot")))
      OR (NULLIF(TRIM(quote."siteAddressSnapshot"), '') IS NOT NULL
        AND LOWER(TRIM(COALESCE(site."addressLine1", site."address", ''))) =
         LOWER(TRIM(quote."siteAddressSnapshot")))
    )
  HAVING COUNT(*) = 1
)
WHERE quote."clientId" IS NOT NULL
  AND (NULLIF(TRIM(quote."siteNameSnapshot"), '') IS NOT NULL
    OR NULLIF(TRIM(quote."siteAddressSnapshot"), '') IS NOT NULL);

-- Exact legacy site matches win. When the quote did not carry usable site
-- details, link the client's single primary site for later data confirmation.
UPDATE "Quote" quote
SET "siteId" = (
  SELECT MIN(site."id")
  FROM "ClientSite" site
  WHERE site."clientId" = quote."clientId"
    AND site."isPrimarySite" = TRUE
  HAVING COUNT(*) = 1
)
WHERE quote."siteId" IS NULL
  AND quote."clientId" IS NOT NULL;

UPDATE "Request" request
SET "siteId" = (
  SELECT MIN(site."id")
  FROM "ClientSite" site
  WHERE site."clientId" = request."clientId"
    AND ((NULLIF(TRIM(request."siteName"), '') IS NOT NULL
        AND LOWER(TRIM(site."siteName")) = LOWER(TRIM(request."siteName")))
      OR (NULLIF(TRIM(request."siteAddress"), '') IS NOT NULL
        AND LOWER(TRIM(COALESCE(site."addressLine1", site."address", ''))) =
         LOWER(TRIM(request."siteAddress"))))
  HAVING COUNT(*) = 1
)
WHERE request."siteId" IS NULL
  AND request."clientId" IS NOT NULL
  AND (NULLIF(TRIM(request."siteName"), '') IS NOT NULL
    OR NULLIF(TRIM(request."siteAddress"), '') IS NOT NULL);

UPDATE "Project" project
SET "siteId" = quote."siteId"
FROM "Quote" quote
WHERE project."quoteId" = quote."id"
  AND project."siteId" IS NULL;

UPDATE "Invoice" invoice
SET "contactId" = project."contactId",
    "siteId" = project."siteId"
FROM "Project" project
WHERE invoice."projectId" = project."id"
  AND (invoice."contactId" IS NULL OR invoice."siteId" IS NULL);

CREATE TABLE "ProjectTask" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "weight" INTEGER NOT NULL DEFAULT 1,
  "assignedToId" TEXT,
  "dueDate" TIMESTAMP(3),
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectTask_status_check"
    CHECK ("status" IN ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE')),
  CONSTRAINT "ProjectTask_weight_check" CHECK ("weight" BETWEEN 1 AND 1000)
);

ALTER TABLE "LifecycleContext"
  ADD CONSTRAINT "LifecycleContext_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "LocalUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Request"
  ADD CONSTRAINT "Request_lifecycleContextId_fkey"
  FOREIGN KEY ("lifecycleContextId") REFERENCES "LifecycleContext"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote"
  ADD CONSTRAINT "Quote_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ClientSite"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Quote_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "LocalUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Quote_lifecycleContextId_fkey" FOREIGN KEY ("lifecycleContextId") REFERENCES "LifecycleContext"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project"
  ADD CONSTRAINT "Project_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "PointOfContact"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Project_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ClientSite"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Project_lifecycleContextId_fkey" FOREIGN KEY ("lifecycleContextId") REFERENCES "LifecycleContext"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "PointOfContact"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ClientSite"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_lifecycleContextId_fkey" FOREIGN KEY ("lifecycleContextId") REFERENCES "LifecycleContext"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectTask"
  ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "LocalUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "LifecycleContext_updatedById_idx" ON "LifecycleContext"("updatedById");
CREATE INDEX "LifecycleContext_updatedAt_idx" ON "LifecycleContext"("updatedAt");
CREATE INDEX "Request_lifecycleContextId_idx" ON "Request"("lifecycleContextId");
CREATE INDEX "Quote_siteId_idx" ON "Quote"("siteId");
CREATE INDEX "Quote_assignedToId_idx" ON "Quote"("assignedToId");
CREATE INDEX "Quote_lifecycleContextId_idx" ON "Quote"("lifecycleContextId");
CREATE INDEX "Project_contactId_idx" ON "Project"("contactId");
CREATE INDEX "Project_siteId_idx" ON "Project"("siteId");
CREATE INDEX "Project_lifecycleContextId_idx" ON "Project"("lifecycleContextId");
CREATE INDEX "Invoice_contactId_idx" ON "Invoice"("contactId");
CREATE INDEX "Invoice_siteId_idx" ON "Invoice"("siteId");
CREATE INDEX "Invoice_lifecycleContextId_idx" ON "Invoice"("lifecycleContextId");
CREATE INDEX "ProjectTask_projectId_archivedAt_sortOrder_idx"
  ON "ProjectTask"("projectId", "archivedAt", "sortOrder");
CREATE INDEX "ProjectTask_assignedToId_idx" ON "ProjectTask"("assignedToId");
CREATE INDEX "ProjectTask_status_idx" ON "ProjectTask"("status");
CREATE INDEX "ProjectTask_dueDate_idx" ON "ProjectTask"("dueDate");
