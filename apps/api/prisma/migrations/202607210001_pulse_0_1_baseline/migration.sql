-- The pulse schema is created and assigned to the restricted migration role by
-- scripts/database/provision-roles.ts before migrate deploy. Keeping schema
-- provisioning outside this baseline avoids granting database-wide CREATE to
-- the migration role.

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('PRODUCT', 'LABOR', 'SERVICE');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ItemRelationType" AS ENUM ('KIT_COMPONENT', 'RELATED', 'REQUIRED', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "QuoteCalculationMode" AS ENUM ('LEGACY', 'PULSE');

-- CreateEnum
CREATE TYPE "LifecycleEntityType" AS ENUM ('REQUEST', 'QUOTE', 'PROJECT', 'INVOICE');

-- CreateEnum
CREATE TYPE "LifecycleEventPrecision" AS ENUM ('EXACT', 'ESTIMATED');

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "serviceCategory" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'New',
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "companyName" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "siteName" TEXT,
    "siteAddress" TEXT,
    "city" TEXT,
    "state" TEXT,
    "clientId" TEXT,
    "contactId" TEXT,
    "siteId" TEXT,
    "assignedToId" TEXT,
    "lifecycleContextId" TEXT,
    "currentStepId" TEXT,
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "nextAction" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "missingInfo" TEXT,
    "siteVisitNeeded" BOOLEAN NOT NULL DEFAULT false,
    "siteVisitCompleted" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "internalNotes" TEXT,
    "relatedQuoteId" TEXT,
    "checklistTemplateId" TEXT,
    "checklistTemplateNameSnapshot" TEXT,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestUpdate" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "quoteId" TEXT,
    "projectId" TEXT,
    "invoiceId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "authorId" TEXT,
    "authorNameSnapshot" TEXT NOT NULL DEFAULT 'Pulse System',
    "authorEmailSnapshot" TEXT,
    "authorRoleSnapshot" TEXT,
    "assigneeId" TEXT,
    "assigneeNameSnapshot" TEXT,
    "assigneeEmailSnapshot" TEXT,
    "targetDate" TIMESTAMP(3),
    "stepStatus" TEXT,
    "supersedesId" TEXT,
    "legacyTaskId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestCollaborator" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestUpdateMention" (
    "id" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestUpdateMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestChecklistTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requestType" TEXT,
    "serviceCategory" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestChecklistTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "appliesWhen" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "group" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RequestChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestChecklistItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "templateItemId" TEXT,
    "checklistInstanceId" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "appliesWhen" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "group" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completedByNameSnapshot" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestTrade" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "serviceCategory" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestChecklistInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestActivity" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'Pulse User',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestTask" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "owner" TEXT NOT NULL DEFAULT 'Unassigned',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestNote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'Pulse User',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "authProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    "themeMode" TEXT NOT NULL DEFAULT 'system',
    "accentTheme" TEXT NOT NULL DEFAULT 'blue',
    "motionMode" TEXT NOT NULL DEFAULT 'luxurious',
    "dashboardPreferences" JSONB,
    "entraObjectId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748B',
    "systemKey" TEXT,
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permission")
);

-- CreateTable
CREATE TABLE "WorkspaceSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL DEFAULT 'R2 Communications',
    "timeZone" TEXT NOT NULL DEFAULT 'America/Puerto_Rico',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "dateFormat" TEXT NOT NULL DEFAULT 'MM/DD/YYYY',
    "weekStartsOn" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "relatedEntityType" TEXT NOT NULL,
    "relatedEntityId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "owner" TEXT NOT NULL DEFAULT 'Unassigned',
    "value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "baseQuoteNumber" TEXT,
    "revisionNumber" INTEGER NOT NULL DEFAULT 0,
    "versionCreatedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "sentAtPrecision" "LifecycleEventPrecision",
    "title" TEXT NOT NULL,
    "clientId" TEXT,
    "contactId" TEXT,
    "siteId" TEXT,
    "assignedToId" TEXT,
    "lifecycleContextId" TEXT,
    "clientName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "owner" TEXT NOT NULL DEFAULT 'Unassigned',
    "calculationMode" "QuoteCalculationMode" NOT NULL DEFAULT 'PULSE',
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "legacyMaterialSale" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "legacyMaterialCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "legacyLaborSale" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "legacyLaborCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "legacyTaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "legacyEstimatedDurationBusinessDays" INTEGER,
    "externalQuoteNumber" TEXT,
    "importBatchId" TEXT,
    "externalCreatedAt" TIMESTAMP(3),
    "externalSentAt" TIMESTAMP(3),
    "externalApprovedAt" TIMESTAMP(3),
    "sourceRequestIdSnapshot" TEXT,
    "requestNumberSnapshot" TEXT,
    "requestTitleSnapshot" TEXT,
    "requestTypeSnapshot" TEXT,
    "serviceCategorySnapshot" TEXT,
    "contactNameSnapshot" TEXT,
    "contactEmailSnapshot" TEXT,
    "contactPhoneSnapshot" TEXT,
    "siteNameSnapshot" TEXT,
    "siteAddressSnapshot" TEXT,
    "citySnapshot" TEXT,
    "stateSnapshot" TEXT,
    "scopeDescriptionSnapshot" TEXT,
    "internalNotesSnapshot" TEXT,
    "proposalNotes" TEXT,
    "proposalPreparedAt" TIMESTAMP(3),
    "currentStepId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRevision" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "clientIdSnapshot" TEXT,
    "clientNameSnapshot" TEXT,
    "ownerSnapshot" TEXT NOT NULL,
    "totalSnapshot" DECIMAL(12,2) NOT NULL,
    "priorStatus" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'Revision Requested',
    "versionCreatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "legacyQuoteId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'APPLICATION',
    "precision" "LifecycleEventPrecision" NOT NULL DEFAULT 'EXACT',
    "requestedById" TEXT,
    "requestedByName" TEXT NOT NULL DEFAULT 'Pulse System',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
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

-- CreateTable
CREATE TABLE "ItemPriceHistory" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "previousCost" DECIMAL(12,2),
    "newCost" DECIMAL(12,2) NOT NULL,
    "previousSellPrice" DECIMAL(12,2),
    "newSellPrice" DECIMAL(12,2) NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
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

-- CreateTable
CREATE TABLE "ItemRelation" (
    "id" TEXT NOT NULL,
    "parentItemId" TEXT NOT NULL,
    "childItemId" TEXT NOT NULL,
    "relationType" "ItemRelationType" NOT NULL,
    "defaultQuantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ItemRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifecycleContext" (
    "id" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "updatedByNameSnapshot" TEXT NOT NULL DEFAULT 'Pulse System',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifecycleContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "projectNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "quoteId" TEXT,
    "contactId" TEXT,
    "siteId" TEXT,
    "assignedToId" TEXT,
    "lifecycleContextId" TEXT,
    "owner" TEXT NOT NULL DEFAULT 'Unassigned',
    "currentStepId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Ready',
    "budget" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sourceQuoteRevisionNumber" INTEGER,
    "sourceQuoteCalculationMode" "QuoteCalculationMode",
    "quoteFinancialSnapshot" JSONB,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifecycleDocument" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "quoteId" TEXT,
    "projectId" TEXT,
    "invoiceId" TEXT,
    "objectKey" TEXT,
    "originalFileName" TEXT NOT NULL,
    "mediaType" TEXT,
    "byteSize" BIGINT NOT NULL DEFAULT 0,
    "sha256" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
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

    CONSTRAINT "LifecycleDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "contactId" TEXT,
    "siteId" TEXT,
    "assignedToId" TEXT,
    "lifecycleContextId" TEXT,
    "owner" TEXT NOT NULL DEFAULT 'Unassigned',
    "currentStepId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "issuedDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "clientNumber" TEXT NOT NULL,
    "companyName" TEXT,
    "legalName" TEXT,
    "displayName" TEXT NOT NULL DEFAULT 'Unnamed Client',
    "industry" TEXT,
    "website" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "accountOwner" TEXT NOT NULL DEFAULT 'Unassigned',
    "taxId" TEXT,
    "paymentTerms" TEXT,
    "preferredCurrency" TEXT NOT NULL DEFAULT 'USD',
    "preferredLanguage" TEXT NOT NULL DEFAULT 'English',
    "brandPreferences" TEXT,
    "technologyPreferences" TEXT,
    "generalNotes" TEXT,
    "importantNotes" TEXT,
    "preferredVendors" TEXT,
    "preferredCameraBrand" TEXT,
    "preferredAccessControlBrand" TEXT,
    "preferredNetworkBrand" TEXT,
    "preferredCablingBrand" TEXT,
    "standardTechnologies" TEXT,
    "documentationRequirements" TEXT,
    "invoiceRequirements" TEXT,
    "insuranceRequirements" TEXT,
    "purchaseOrderRequired" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "openOpportunities" INTEGER NOT NULL DEFAULT 0,
    "activeProjects" INTEGER NOT NULL DEFAULT 0,
    "lifetimeValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outstandingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3),

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointOfContact" (
    "id" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL DEFAULT 'Client',
    "ownerId" TEXT NOT NULL,
    "clientId" TEXT,
    "siteId" TEXT,
    "role" TEXT DEFAULT 'Primary',
    "name" TEXT,
    "firstName" TEXT NOT NULL DEFAULT 'Unknown',
    "lastName" TEXT NOT NULL DEFAULT '',
    "title" TEXT,
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "preferredContactMethod" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isBilling" BOOLEAN NOT NULL DEFAULT false,
    "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,
    "isBillingContact" BOOLEAN NOT NULL DEFAULT false,
    "isTechnicalContact" BOOLEAN NOT NULL DEFAULT false,
    "isDecisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointOfContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientSite" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT,
    "siteName" TEXT NOT NULL DEFAULT 'Unnamed Site',
    "siteType" TEXT NOT NULL DEFAULT 'Main Office',
    "address" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Puerto Rico',
    "googleMapsUrl" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "operationalHours" TEXT,
    "accessInstructions" TEXT,
    "parkingInstructions" TEXT,
    "securityRequirements" TEXT,
    "siteNotes" TEXT,
    "status" TEXT DEFAULT 'Active',
    "isPrimarySite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientService" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientActivity" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'Pulse User',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Request_requestNumber_key" ON "Request"("requestNumber");

-- CreateIndex
CREATE INDEX "Request_status_idx" ON "Request"("status");

-- CreateIndex
CREATE INDEX "Request_priority_idx" ON "Request"("priority");

-- CreateIndex
CREATE INDEX "Request_requestType_idx" ON "Request"("requestType");

-- CreateIndex
CREATE INDEX "Request_source_idx" ON "Request"("source");

-- CreateIndex
CREATE INDEX "Request_serviceCategory_idx" ON "Request"("serviceCategory");

-- CreateIndex
CREATE INDEX "Request_assignedToId_idx" ON "Request"("assignedToId");

-- CreateIndex
CREATE INDEX "Request_lifecycleContextId_idx" ON "Request"("lifecycleContextId");

-- CreateIndex
CREATE INDEX "Request_currentStepId_idx" ON "Request"("currentStepId");

-- CreateIndex
CREATE INDEX "Request_clientId_idx" ON "Request"("clientId");

-- CreateIndex
CREATE INDEX "Request_contactId_idx" ON "Request"("contactId");

-- CreateIndex
CREATE INDEX "Request_siteId_idx" ON "Request"("siteId");

-- CreateIndex
CREATE INDEX "Request_relatedQuoteId_idx" ON "Request"("relatedQuoteId");

-- CreateIndex
CREATE INDEX "Request_checklistTemplateId_idx" ON "Request"("checklistTemplateId");

-- CreateIndex
CREATE INDEX "Request_archivedAt_idx" ON "Request"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RequestUpdate_legacyTaskId_key" ON "RequestUpdate"("legacyTaskId");

-- CreateIndex
CREATE INDEX "RequestUpdate_requestId_createdAt_idx" ON "RequestUpdate"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestUpdate_quoteId_createdAt_idx" ON "RequestUpdate"("quoteId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestUpdate_projectId_createdAt_idx" ON "RequestUpdate"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestUpdate_invoiceId_createdAt_idx" ON "RequestUpdate"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestUpdate_requestId_kind_stepStatus_idx" ON "RequestUpdate"("requestId", "kind", "stepStatus");

-- CreateIndex
CREATE INDEX "RequestUpdate_assigneeId_stepStatus_idx" ON "RequestUpdate"("assigneeId", "stepStatus");

-- CreateIndex
CREATE INDEX "RequestUpdate_supersedesId_idx" ON "RequestUpdate"("supersedesId");

-- CreateIndex
CREATE INDEX "RequestCollaborator_userId_idx" ON "RequestCollaborator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestCollaborator_requestId_userId_key" ON "RequestCollaborator"("requestId", "userId");

-- CreateIndex
CREATE INDEX "RequestUpdateMention_userId_readAt_idx" ON "RequestUpdateMention"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "RequestUpdateMention_updateId_userId_key" ON "RequestUpdateMention"("updateId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestChecklistTemplate_key_key" ON "RequestChecklistTemplate"("key");

-- CreateIndex
CREATE INDEX "RequestChecklistTemplate_requestType_idx" ON "RequestChecklistTemplate"("requestType");

-- CreateIndex
CREATE INDEX "RequestChecklistTemplate_serviceCategory_idx" ON "RequestChecklistTemplate"("serviceCategory");

-- CreateIndex
CREATE INDEX "RequestChecklistTemplate_active_idx" ON "RequestChecklistTemplate"("active");

-- CreateIndex
CREATE INDEX "RequestChecklistTemplate_archivedAt_idx" ON "RequestChecklistTemplate"("archivedAt");

-- CreateIndex
CREATE INDEX "RequestChecklistTemplateItem_templateId_idx" ON "RequestChecklistTemplateItem"("templateId");

-- CreateIndex
CREATE INDEX "RequestChecklistTemplateItem_sortOrder_idx" ON "RequestChecklistTemplateItem"("sortOrder");

-- CreateIndex
CREATE INDEX "RequestChecklistTemplateItem_active_idx" ON "RequestChecklistTemplateItem"("active");

-- CreateIndex
CREATE INDEX "RequestChecklistItem_requestId_idx" ON "RequestChecklistItem"("requestId");

-- CreateIndex
CREATE INDEX "RequestChecklistItem_templateItemId_idx" ON "RequestChecklistItem"("templateItemId");

-- CreateIndex
CREATE INDEX "RequestChecklistItem_checklistInstanceId_idx" ON "RequestChecklistItem"("checklistInstanceId");

-- CreateIndex
CREATE INDEX "RequestChecklistItem_completed_idx" ON "RequestChecklistItem"("completed");

-- CreateIndex
CREATE INDEX "RequestChecklistItem_completedById_idx" ON "RequestChecklistItem"("completedById");

-- CreateIndex
CREATE INDEX "RequestTrade_serviceCategory_idx" ON "RequestTrade"("serviceCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RequestTrade_requestId_serviceCategory_key" ON "RequestTrade"("requestId", "serviceCategory");

-- CreateIndex
CREATE INDEX "RequestChecklistInstance_requestId_idx" ON "RequestChecklistInstance"("requestId");

-- CreateIndex
CREATE INDEX "RequestChecklistInstance_templateId_idx" ON "RequestChecklistInstance"("templateId");

-- CreateIndex
CREATE INDEX "RequestChecklistInstance_active_idx" ON "RequestChecklistInstance"("active");

-- CreateIndex
CREATE INDEX "RequestChecklistInstance_matchType_matchValue_idx" ON "RequestChecklistInstance"("matchType", "matchValue");

-- CreateIndex
CREATE INDEX "RequestActivity_requestId_idx" ON "RequestActivity"("requestId");

-- CreateIndex
CREATE INDEX "RequestActivity_createdAt_idx" ON "RequestActivity"("createdAt");

-- CreateIndex
CREATE INDEX "RequestTask_requestId_idx" ON "RequestTask"("requestId");

-- CreateIndex
CREATE INDEX "RequestTask_completedAt_idx" ON "RequestTask"("completedAt");

-- CreateIndex
CREATE INDEX "RequestNote_requestId_idx" ON "RequestNote"("requestId");

-- CreateIndex
CREATE INDEX "RequestNote_createdAt_idx" ON "RequestNote"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LocalUser_email_key" ON "LocalUser"("email");

-- CreateIndex
CREATE INDEX "LocalUser_role_idx" ON "LocalUser"("role");

-- CreateIndex
CREATE INDEX "LocalUser_active_idx" ON "LocalUser"("active");

-- CreateIndex
CREATE INDEX "LocalUser_authProvider_idx" ON "LocalUser"("authProvider");

-- CreateIndex
CREATE INDEX "LocalUser_entraObjectId_idx" ON "LocalUser"("entraObjectId");

-- CreateIndex
CREATE INDEX "LocalUser_lastLoginAt_idx" ON "LocalUser"("lastLoginAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccessRole_normalizedName_key" ON "AccessRole"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "AccessRole_systemKey_key" ON "AccessRole"("systemKey");

-- CreateIndex
CREATE INDEX "AccessRole_archivedAt_idx" ON "AccessRole"("archivedAt");

-- CreateIndex
CREATE INDEX "AccessRole_name_idx" ON "AccessRole"("name");

-- CreateIndex
CREATE INDEX "RolePermission_permission_idx" ON "RolePermission"("permission");

-- CreateIndex
CREATE INDEX "Activity_relatedEntityType_relatedEntityId_idx" ON "Activity"("relatedEntityType", "relatedEntityId");

-- CreateIndex
CREATE INDEX "Activity_actorUserId_idx" ON "Activity"("actorUserId");

-- CreateIndex
CREATE INDEX "Activity_actorRole_idx" ON "Activity"("actorRole");

-- CreateIndex
CREATE INDEX "Activity_type_idx" ON "Activity"("type");

-- CreateIndex
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");

-- CreateIndex
CREATE INDEX "Activity_relatedEntityType_createdAt_idx" ON "Activity"("relatedEntityType", "createdAt");

-- CreateIndex
CREATE INDEX "LifecycleStatusEvent_entityType_entityId_changedAt_idx" ON "LifecycleStatusEvent"("entityType", "entityId", "changedAt");

-- CreateIndex
CREATE INDEX "LifecycleStatusEvent_entityType_toStatus_changedAt_idx" ON "LifecycleStatusEvent"("entityType", "toStatus", "changedAt");

-- CreateIndex
CREATE INDEX "LifecycleStatusEvent_changedAt_idx" ON "LifecycleStatusEvent"("changedAt");

-- CreateIndex
CREATE INDEX "LifecycleStatusEvent_actorUserId_idx" ON "LifecycleStatusEvent"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_number_key" ON "Opportunity"("number");

-- CreateIndex
CREATE INDEX "Opportunity_status_idx" ON "Opportunity"("status");

-- CreateIndex
CREATE INDEX "Opportunity_owner_idx" ON "Opportunity"("owner");

-- CreateIndex
CREATE INDEX "Opportunity_archivedAt_idx" ON "Opportunity"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteNumber_key" ON "Quote"("quoteNumber");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "Quote_calculationMode_idx" ON "Quote"("calculationMode");

-- CreateIndex
CREATE INDEX "Quote_externalQuoteNumber_idx" ON "Quote"("externalQuoteNumber");

-- CreateIndex
CREATE INDEX "Quote_importBatchId_idx" ON "Quote"("importBatchId");

-- CreateIndex
CREATE INDEX "Quote_baseQuoteNumber_idx" ON "Quote"("baseQuoteNumber");

-- CreateIndex
CREATE INDEX "Quote_revisionNumber_idx" ON "Quote"("revisionNumber");

-- CreateIndex
CREATE INDEX "Quote_owner_idx" ON "Quote"("owner");

-- CreateIndex
CREATE INDEX "Quote_clientId_idx" ON "Quote"("clientId");

-- CreateIndex
CREATE INDEX "Quote_contactId_idx" ON "Quote"("contactId");

-- CreateIndex
CREATE INDEX "Quote_siteId_idx" ON "Quote"("siteId");

-- CreateIndex
CREATE INDEX "Quote_assignedToId_idx" ON "Quote"("assignedToId");

-- CreateIndex
CREATE INDEX "Quote_lifecycleContextId_idx" ON "Quote"("lifecycleContextId");

-- CreateIndex
CREATE INDEX "Quote_sourceRequestIdSnapshot_idx" ON "Quote"("sourceRequestIdSnapshot");

-- CreateIndex
CREATE INDEX "Quote_currentStepId_idx" ON "Quote"("currentStepId");

-- CreateIndex
CREATE INDEX "Quote_archivedAt_idx" ON "Quote"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRevision_legacyQuoteId_key" ON "QuoteRevision"("legacyQuoteId");

-- CreateIndex
CREATE INDEX "QuoteRevision_quoteId_requestedAt_idx" ON "QuoteRevision"("quoteId", "requestedAt");

-- CreateIndex
CREATE INDEX "QuoteRevision_clientIdSnapshot_requestedAt_idx" ON "QuoteRevision"("clientIdSnapshot", "requestedAt");

-- CreateIndex
CREATE INDEX "QuoteRevision_requestedById_idx" ON "QuoteRevision"("requestedById");

-- CreateIndex
CREATE INDEX "QuoteRevision_precision_idx" ON "QuoteRevision"("precision");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRevision_quoteId_revisionNumber_key" ON "QuoteRevision"("quoteId", "revisionNumber");

-- CreateIndex
CREATE INDEX "Item_name_idx" ON "Item"("name");

-- CreateIndex
CREATE INDEX "Item_itemType_idx" ON "Item"("itemType");

-- CreateIndex
CREATE INDEX "Item_status_idx" ON "Item"("status");

-- CreateIndex
CREATE INDEX "Item_sku_idx" ON "Item"("sku");

-- CreateIndex
CREATE INDEX "Item_partNumber_idx" ON "Item"("partNumber");

-- CreateIndex
CREATE INDEX "Item_category_idx" ON "Item"("category");

-- CreateIndex
CREATE INDEX "Item_defaultLaborItemId_idx" ON "Item"("defaultLaborItemId");

-- CreateIndex
CREATE INDEX "ItemPriceHistory_itemId_changedAt_idx" ON "ItemPriceHistory"("itemId", "changedAt");

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_idx" ON "QuoteItem"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteItem_sourceItemId_idx" ON "QuoteItem"("sourceItemId");

-- CreateIndex
CREATE INDEX "QuoteItem_itemType_idx" ON "QuoteItem"("itemType");

-- CreateIndex
CREATE INDEX "QuoteItem_section_idx" ON "QuoteItem"("section");

-- CreateIndex
CREATE INDEX "QuoteItem_sortOrder_idx" ON "QuoteItem"("sortOrder");

-- CreateIndex
CREATE INDEX "ItemRelation_parentItemId_idx" ON "ItemRelation"("parentItemId");

-- CreateIndex
CREATE INDEX "ItemRelation_childItemId_idx" ON "ItemRelation"("childItemId");

-- CreateIndex
CREATE INDEX "ItemRelation_relationType_idx" ON "ItemRelation"("relationType");

-- CreateIndex
CREATE INDEX "ItemRelation_sortOrder_idx" ON "ItemRelation"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ItemRelation_parentItemId_childItemId_relationType_key" ON "ItemRelation"("parentItemId", "childItemId", "relationType");

-- CreateIndex
CREATE INDEX "LifecycleContext_updatedById_idx" ON "LifecycleContext"("updatedById");

-- CreateIndex
CREATE INDEX "LifecycleContext_updatedAt_idx" ON "LifecycleContext"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectNumber_key" ON "Project"("projectNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Project_quoteId_key" ON "Project"("quoteId");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_contactId_idx" ON "Project"("contactId");

-- CreateIndex
CREATE INDEX "Project_siteId_idx" ON "Project"("siteId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_assignedToId_idx" ON "Project"("assignedToId");

-- CreateIndex
CREATE INDEX "Project_lifecycleContextId_idx" ON "Project"("lifecycleContextId");

-- CreateIndex
CREATE INDEX "Project_currentStepId_idx" ON "Project"("currentStepId");

-- CreateIndex
CREATE INDEX "Project_archivedAt_idx" ON "Project"("archivedAt");

-- CreateIndex
CREATE INDEX "ProjectTask_projectId_archivedAt_sortOrder_idx" ON "ProjectTask"("projectId", "archivedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "ProjectTask_assignedToId_idx" ON "ProjectTask"("assignedToId");

-- CreateIndex
CREATE INDEX "ProjectTask_status_idx" ON "ProjectTask"("status");

-- CreateIndex
CREATE INDEX "ProjectTask_dueDate_idx" ON "ProjectTask"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "LifecycleDocument_objectKey_key" ON "LifecycleDocument"("objectKey");

-- CreateIndex
CREATE INDEX "LifecycleDocument_requestId_deletedAt_idx" ON "LifecycleDocument"("requestId", "deletedAt");

-- CreateIndex
CREATE INDEX "LifecycleDocument_quoteId_deletedAt_idx" ON "LifecycleDocument"("quoteId", "deletedAt");

-- CreateIndex
CREATE INDEX "LifecycleDocument_projectId_deletedAt_idx" ON "LifecycleDocument"("projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "LifecycleDocument_invoiceId_deletedAt_idx" ON "LifecycleDocument"("invoiceId", "deletedAt");

-- CreateIndex
CREATE INDEX "LifecycleDocument_uploadedById_idx" ON "LifecycleDocument"("uploadedById");

-- CreateIndex
CREATE INDEX "LifecycleDocument_sha256_idx" ON "LifecycleDocument"("sha256");

-- CreateIndex
CREATE INDEX "LifecycleDocument_tags_idx" ON "LifecycleDocument" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "LifecycleDocument_createdAt_idx" ON "LifecycleDocument"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- CreateIndex
CREATE INDEX "Invoice_projectId_idx" ON "Invoice"("projectId");

-- CreateIndex
CREATE INDEX "Invoice_contactId_idx" ON "Invoice"("contactId");

-- CreateIndex
CREATE INDEX "Invoice_siteId_idx" ON "Invoice"("siteId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_assignedToId_idx" ON "Invoice"("assignedToId");

-- CreateIndex
CREATE INDEX "Invoice_lifecycleContextId_idx" ON "Invoice"("lifecycleContextId");

-- CreateIndex
CREATE INDEX "Invoice_currentStepId_idx" ON "Invoice"("currentStepId");

-- CreateIndex
CREATE INDEX "Invoice_archivedAt_idx" ON "Invoice"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_clientNumber_key" ON "Client"("clientNumber");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_accountOwner_idx" ON "Client"("accountOwner");

-- CreateIndex
CREATE INDEX "Client_archivedAt_idx" ON "Client"("archivedAt");

-- CreateIndex
CREATE INDEX "PointOfContact_ownerType_ownerId_idx" ON "PointOfContact"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "PointOfContact_clientId_idx" ON "PointOfContact"("clientId");

-- CreateIndex
CREATE INDEX "PointOfContact_siteId_idx" ON "PointOfContact"("siteId");

-- CreateIndex
CREATE INDEX "PointOfContact_email_idx" ON "PointOfContact"("email");

-- CreateIndex
CREATE INDEX "ClientSite_clientId_idx" ON "ClientSite"("clientId");

-- CreateIndex
CREATE INDEX "ClientSite_siteType_idx" ON "ClientSite"("siteType");

-- CreateIndex
CREATE INDEX "ClientSite_isPrimarySite_idx" ON "ClientSite"("isPrimarySite");

-- CreateIndex
CREATE INDEX "ClientService_clientId_idx" ON "ClientService"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientService_clientId_serviceName_key" ON "ClientService"("clientId", "serviceName");

-- CreateIndex
CREATE INDEX "ClientActivity_clientId_idx" ON "ClientActivity"("clientId");

-- CreateIndex
CREATE INDEX "ClientActivity_createdAt_idx" ON "ClientActivity"("createdAt");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "PointOfContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ClientSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_lifecycleContextId_fkey" FOREIGN KEY ("lifecycleContextId") REFERENCES "LifecycleContext"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_relatedQuoteId_fkey" FOREIGN KEY ("relatedQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "RequestChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestUpdate" ADD CONSTRAINT "RequestUpdate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestUpdate" ADD CONSTRAINT "RequestUpdate_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestUpdate" ADD CONSTRAINT "RequestUpdate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestUpdate" ADD CONSTRAINT "RequestUpdate_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestUpdate" ADD CONSTRAINT "RequestUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestUpdate" ADD CONSTRAINT "RequestUpdate_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestUpdate" ADD CONSTRAINT "RequestUpdate_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "RequestUpdate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestCollaborator" ADD CONSTRAINT "RequestCollaborator_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestCollaborator" ADD CONSTRAINT "RequestCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "LocalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestCollaborator" ADD CONSTRAINT "RequestCollaborator_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestUpdateMention" ADD CONSTRAINT "RequestUpdateMention_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "RequestUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestUpdateMention" ADD CONSTRAINT "RequestUpdateMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "LocalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestChecklistTemplateItem" ADD CONSTRAINT "RequestChecklistTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RequestChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestChecklistItem" ADD CONSTRAINT "RequestChecklistItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestChecklistItem" ADD CONSTRAINT "RequestChecklistItem_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "RequestChecklistTemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestChecklistItem" ADD CONSTRAINT "RequestChecklistItem_checklistInstanceId_fkey" FOREIGN KEY ("checklistInstanceId") REFERENCES "RequestChecklistInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestChecklistItem" ADD CONSTRAINT "RequestChecklistItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestTrade" ADD CONSTRAINT "RequestTrade_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestChecklistInstance" ADD CONSTRAINT "RequestChecklistInstance_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestChecklistInstance" ADD CONSTRAINT "RequestChecklistInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RequestChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestActivity" ADD CONSTRAINT "RequestActivity_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestTask" ADD CONSTRAINT "RequestTask_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestNote" ADD CONSTRAINT "RequestNote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalUser" ADD CONSTRAINT "LocalUser_role_fkey" FOREIGN KEY ("role") REFERENCES "AccessRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AccessRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleStatusEvent" ADD CONSTRAINT "LifecycleStatusEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "PointOfContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ClientSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_lifecycleContextId_fkey" FOREIGN KEY ("lifecycleContextId") REFERENCES "LifecycleContext"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_defaultLaborItemId_fkey" FOREIGN KEY ("defaultLaborItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPriceHistory" ADD CONSTRAINT "ItemPriceHistory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRelation" ADD CONSTRAINT "ItemRelation_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRelation" ADD CONSTRAINT "ItemRelation_childItemId_fkey" FOREIGN KEY ("childItemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleContext" ADD CONSTRAINT "LifecycleContext_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "PointOfContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ClientSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_lifecycleContextId_fkey" FOREIGN KEY ("lifecycleContextId") REFERENCES "LifecycleContext"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleDocument" ADD CONSTRAINT "LifecycleDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleDocument" ADD CONSTRAINT "LifecycleDocument_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleDocument" ADD CONSTRAINT "LifecycleDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleDocument" ADD CONSTRAINT "LifecycleDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleDocument" ADD CONSTRAINT "LifecycleDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "PointOfContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ClientSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_lifecycleContextId_fkey" FOREIGN KEY ("lifecycleContextId") REFERENCES "LifecycleContext"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfContact" ADD CONSTRAINT "PointOfContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfContact" ADD CONSTRAINT "PointOfContact_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ClientSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSite" ADD CONSTRAINT "ClientSite_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientService" ADD CONSTRAINT "ClientService_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientActivity" ADD CONSTRAINT "ClientActivity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Validated application invariants that Prisma cannot express in the schema.
ALTER TABLE "LifecycleDocument" ADD CONSTRAINT "LifecycleDocument_one_origin_check" CHECK (
  num_nonnulls("requestId", "quoteId", "projectId", "invoiceId") = 1
);
ALTER TABLE "RequestUpdate" ADD CONSTRAINT "RequestUpdate_lifecycle_parent_check" CHECK (
  num_nonnulls("requestId", "quoteId", "projectId", "invoiceId") = 1
);
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_status_check" CHECK (
  "status" IN ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE')
);
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_weight_check" CHECK (
  "weight" BETWEEN 1 AND 1000
);
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_legacy_financials_nonnegative_check" CHECK (
  "legacyMaterialSale" >= 0 AND
  "legacyMaterialCost" >= 0 AND
  "legacyLaborSale" >= 0 AND
  "legacyLaborCost" >= 0 AND
  "legacyTaxAmount" >= 0 AND
  ("legacyEstimatedDurationBusinessDays" IS NULL OR "legacyEstimatedDurationBusinessDays" >= 0)
);
