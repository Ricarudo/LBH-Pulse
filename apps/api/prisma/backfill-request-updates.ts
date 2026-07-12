import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: "pulse" }
);
const prisma = new PrismaClient({ adapter });

async function main() {
  const migration = await readFile(
    join(__dirname, "migrations/202607100001_request_updates/migration.sql"),
    "utf8"
  );
  await prisma.$executeRawUnsafe(migration);
  console.log("Backfilled request history into RequestUpdate.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
