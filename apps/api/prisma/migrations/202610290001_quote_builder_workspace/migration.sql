-- Additive estimating-only migration. Existing Quote financial and lifecycle data is untouched.
ALTER TABLE "WorkspaceSettings" ADD COLUMN "quoteCalculationSettings" JSONB NOT NULL DEFAULT '{"overtimeMultiplier":"1","practicalTimelineFactor":"1.4","materialIvuRate":"0.115","b2bServiceTaxRate":"0.04","payrollBurden":"0.35","laborContingency":"0.15","laborMargin":"0.5","fondo":"0.016","materialMargin":"0.3","materialFreight":"0.05","materialContingency":"0.025","vehicleWeeklyCost":null,"annualRent":null,"annualBondInsurance":null,"indirectRoles":null}';
CREATE TABLE "QuoteLaborClass" (
  "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "hourlyRate" DECIMAL(20,8),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
ALTER TABLE "Item" ADD COLUMN "defaultProductionRate" DECIMAL(20,8), ADD COLUMN "defaultCrewSize" DECIMAL(12,3), ADD COLUMN "defaultLaborClassId" TEXT;
CREATE INDEX "Item_defaultLaborClassId_idx" ON "Item"("defaultLaborClassId");
ALTER TABLE "Item" ADD CONSTRAINT "Item_defaultLaborClassId_fkey" FOREIGN KEY ("defaultLaborClassId") REFERENCES "QuoteLaborClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "QuoteBuilderWorkspace" (
  "quoteId" TEXT NOT NULL PRIMARY KEY, "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "state" JSONB NOT NULL, "writeToken" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteBuilderWorkspace_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
COMMENT ON TABLE "QuoteBuilderWorkspace" IS 'Editable, non-authoritative estimating inputs; not historical Quote financial truth. No lifecycle or parent-total writes.';
