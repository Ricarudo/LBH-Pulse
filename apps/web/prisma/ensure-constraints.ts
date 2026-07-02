import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: "pulse" }
);
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint constraint_record
        JOIN pg_namespace namespace_record
          ON namespace_record.oid = constraint_record.connamespace
        WHERE constraint_record.conname = 'LifecycleDocument_one_origin_check'
          AND namespace_record.nspname = 'pulse'
      ) THEN
        ALTER TABLE "pulse"."LifecycleDocument"
        ADD CONSTRAINT "LifecycleDocument_one_origin_check" CHECK (
          (CASE WHEN "requestId" IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN "quoteId" IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN "projectId" IS NOT NULL THEN 1 ELSE 0 END) = 1
        );
      END IF;
    END $$;
  `);
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
