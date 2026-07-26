import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: "pulse" }
);
const prisma = new PrismaClient({ adapter });
const apply = process.argv.includes("--apply");

async function main() {
  const itemsWithoutHistory = await prisma.item.findMany({
    where: { priceHistory: { none: {} } },
    select: {
      id: true,
      cost: true,
      sellPrice: true,
      createdAt: true
    }
  });

  if (!itemsWithoutHistory.length) {
    console.log("Item price history is already initialized.");
    return;
  }

  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "PREVIEW",
    findings: itemsWithoutHistory.map((item) => ({
      entityType: "Item",
      entityId: item.id,
      currentValue: "no price-history row",
      proposedRepair: "create an opening price-history snapshot from the current item values",
      reason: "Preserve the initial known price state without changing the item.",
      confidence: "high",
      automaticRepairSafe: true,
      humanReviewRequired: false
    }))
  }, null, 2));
  if (!apply) {
    console.log("No changes made. Re-run with --apply after reviewing the preview.");
    return;
  }

  const result = await prisma.itemPriceHistory.createMany({
    data: itemsWithoutHistory.map((item) => ({
      itemId: item.id,
      previousCost: null,
      newCost: item.cost,
      previousSellPrice: null,
      newSellPrice: item.sellPrice,
      changedAt: item.createdAt
    }))
  });

  console.log(`Initialized price history for ${result.count} items.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
