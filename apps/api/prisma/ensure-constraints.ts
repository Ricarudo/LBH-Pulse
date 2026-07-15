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
  `);
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
