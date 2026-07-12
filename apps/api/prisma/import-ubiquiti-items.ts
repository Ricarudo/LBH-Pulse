import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ubiquitiCatalogItems } from "./ubiquiti-catalog";

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: "pulse" }
);
const prisma = new PrismaClient({ adapter });

async function main() {
  let created = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of ubiquitiCatalogItems) {
      const existing = await tx.item.findFirst({
        where: {
          manufacturer: "Ubiquiti",
          partNumber: item.partNumber
        },
        select: {
          id: true,
          cost: true,
          sellPrice: true,
          priceHistory: {
            select: { id: true },
            take: 1
          }
        }
      });

      const nextCost = Number(item.cost ?? 0);
      const nextSellPrice = Number(item.sellPrice ?? 0);

      if (existing) {
        await tx.item.update({
          where: { id: existing.id },
          data: item
        });

        const previousCost = Number(existing.cost);
        const previousSellPrice = Number(existing.sellPrice);
        const priceChanged =
          previousCost !== nextCost || previousSellPrice !== nextSellPrice;

        if (priceChanged || !existing.priceHistory.length) {
          await tx.itemPriceHistory.create({
            data: {
              itemId: existing.id,
              previousCost: priceChanged ? existing.cost : null,
              newCost: nextCost,
              previousSellPrice: priceChanged ? existing.sellPrice : null,
              newSellPrice: nextSellPrice
            }
          });
        }
        updated += 1;
      } else {
        const createdItem = await tx.item.create({ data: item });
        await tx.itemPriceHistory.create({
          data: {
            itemId: createdItem.id,
            previousCost: null,
            newCost: nextCost,
            previousSellPrice: null,
            newSellPrice: nextSellPrice
          }
        });
        created += 1;
      }
    }
  });

  console.log(
    `Ubiquiti catalog import complete: ${created} created, ${updated} updated.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
