import "dotenv/config";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

const tables = [
  "Client",
  "PointOfContact",
  "ClientSite",
  "Request",
  "RequestUpdate",
  "Quote",
  "QuoteItem",
  "QuoteRevision",
  "Item",
  "ItemPriceHistory",
  "Project",
  "Invoice",
  "LifecycleDocument",
  "LifecycleStatusEvent"
] as const;

async function main() {
  const hash = createHash("sha256");
  const counts: Record<string, number> = {};

  for (const table of tables) {
    // Table names come only from the reviewed constant above. jsonb produces a
    // stable key order, and the primary-key sort makes row ordering explicit.
    const rows = await prisma.$queryRawUnsafe<Array<{ row: unknown }>>(
      `SELECT to_jsonb(record) AS row FROM pulse."${table}" AS record ORDER BY record.id`
    );
    counts[table] = rows.length;
    hash.update(`${table}\0`);
    for (const row of rows) hash.update(`${JSON.stringify(row.row)}\n`);
  }

  const digest = hash.digest("hex");
  if (process.argv.includes("--digest-only")) {
    process.stdout.write(`${digest}\n`);
    return;
  }
  console.log(JSON.stringify({
    mode: "READ_ONLY_RELEASE_DATA_FINGERPRINT",
    algorithm: "sha256",
    digest,
    counts
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Release data fingerprint failed.");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
