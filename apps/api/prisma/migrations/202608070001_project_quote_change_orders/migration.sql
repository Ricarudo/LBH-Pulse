CREATE TYPE "ProjectQuoteRole" AS ENUM ('ORIGINAL', 'CHANGE_ORDER');

CREATE TABLE "ProjectQuote" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "role" "ProjectQuoteRole" NOT NULL,
  "sequence" INTEGER NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "financialSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectQuote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectQuote_quoteId_key" ON "ProjectQuote"("quoteId");
CREATE UNIQUE INDEX "ProjectQuote_projectId_role_sequence_key" ON "ProjectQuote"("projectId", "role", "sequence");
CREATE INDEX "ProjectQuote_projectId_role_sequence_idx" ON "ProjectQuote"("projectId", "role", "sequence");
CREATE INDEX "ProjectQuote_approvedAt_idx" ON "ProjectQuote"("approvedAt");

ALTER TABLE "ProjectQuote"
  ADD CONSTRAINT "ProjectQuote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectQuote_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectQuote_sequence_check" CHECK (
    ("role" = 'ORIGINAL' AND "sequence" = 0) OR
    ("role" = 'CHANGE_ORDER' AND "sequence" > 0)
  );

INSERT INTO "ProjectQuote" (
  "id", "projectId", "quoteId", "role", "sequence", "approvedAt", "financialSnapshot", "createdAt", "updatedAt"
)
SELECT
  CONCAT('project-quote-', p."id"),
  p."id",
  p."quoteId",
  'ORIGINAL'::"ProjectQuoteRole",
  0,
  COALESCE(q."externalApprovedAt", p."createdAt"),
  p."quoteFinancialSnapshot",
  p."createdAt",
  p."updatedAt"
FROM "Project" p
JOIN "Quote" q ON q."id" = p."quoteId"
WHERE p."quoteId" IS NOT NULL
ON CONFLICT ("quoteId") DO NOTHING;

CREATE TABLE "ProjectExpense" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "occurredOn" TIMESTAMP(3) NOT NULL,
  "category" TEXT NOT NULL,
  "vendor" TEXT,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "receiptDocumentId" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT NOT NULL DEFAULT 'Pulse System',
  "updatedById" TEXT,
  "updatedByName" TEXT NOT NULL DEFAULT 'Pulse System',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectExpense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectExpense_receiptDocumentId_key" ON "ProjectExpense"("receiptDocumentId");
CREATE INDEX "ProjectExpense_projectId_archivedAt_occurredOn_idx" ON "ProjectExpense"("projectId", "archivedAt", "occurredOn");
CREATE INDEX "ProjectExpense_category_idx" ON "ProjectExpense"("category");
CREATE INDEX "ProjectExpense_createdById_idx" ON "ProjectExpense"("createdById");

ALTER TABLE "ProjectExpense"
  ADD CONSTRAINT "ProjectExpense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectExpense_receiptDocumentId_fkey" FOREIGN KEY ("receiptDocumentId") REFERENCES "LifecycleDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectExpense_amount_check" CHECK ("amount" > 0);
