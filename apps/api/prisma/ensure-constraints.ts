import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: "pulse" }
);
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "pulse"."LifecycleDocument"
      DROP CONSTRAINT IF EXISTS "LifecycleDocument_one_origin_check";
    ALTER TABLE "pulse"."LifecycleDocument"
      ADD CONSTRAINT "LifecycleDocument_one_origin_check" CHECK (
        num_nonnulls("requestId", "quoteId", "projectId", "invoiceId") = 1
      );

    ALTER TABLE "pulse"."RequestUpdate"
      DROP CONSTRAINT IF EXISTS "RequestUpdate_lifecycle_parent_check";
    ALTER TABLE "pulse"."RequestUpdate"
      ADD CONSTRAINT "RequestUpdate_lifecycle_parent_check" CHECK (
        num_nonnulls("requestId", "quoteId", "projectId", "invoiceId") = 1
      );

    ALTER TABLE "pulse"."ProjectTask"
      DROP CONSTRAINT IF EXISTS "ProjectTask_status_check";
    ALTER TABLE "pulse"."ProjectTask"
      ADD CONSTRAINT "ProjectTask_status_check" CHECK (
        "status" IN ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE')
      );
    ALTER TABLE "pulse"."ProjectTask"
      DROP CONSTRAINT IF EXISTS "ProjectTask_weight_check";
    ALTER TABLE "pulse"."ProjectTask"
      ADD CONSTRAINT "ProjectTask_weight_check" CHECK (
        "weight" BETWEEN 1 AND 1000
      );

    ALTER TABLE "pulse"."Quote"
      DROP CONSTRAINT IF EXISTS "Quote_legacy_financials_nonnegative_check";
    ALTER TABLE "pulse"."Quote"
      ADD CONSTRAINT "Quote_legacy_financials_nonnegative_check" CHECK (
        "legacyMaterialSale" >= 0 AND
        "legacyMaterialCost" >= 0 AND
        "legacyLaborSale" >= 0 AND
        "legacyLaborCost" >= 0 AND
        "legacyTaxAmount" >= 0 AND
        ("legacyEstimatedDurationBusinessDays" IS NULL OR "legacyEstimatedDurationBusinessDays" >= 0)
      );
  `);
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
