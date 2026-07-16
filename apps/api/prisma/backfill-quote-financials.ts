import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import {
  calculateLegacyQuoteFinancials,
  exactFinancialSummarySnapshot
} from "../src/modules/quotes/quote-financials";

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: "pulse" }
);
const prisma = new PrismaClient({ adapter });
const apply = process.argv.includes("--apply");

function object(value: Prisma.JsonValue) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

async function main() {
  const quotes = await prisma.quote.findMany({
    select: {
      id: true,
      quoteNumber: true,
      calculationMode: true,
      total: true,
      legacyMaterialSale: true,
      legacyMaterialCost: true,
      legacyLaborSale: true,
      legacyLaborCost: true,
      legacyTaxAmount: true,
      items: { select: { lineSubtotal: true, lineTax: true } },
      revisions: { select: { id: true, snapshot: true, totalSnapshot: true } }
    },
    orderBy: { quoteNumber: "asc" }
  });

  const legacyCandidates = quotes.filter((quote) =>
    quote.calculationMode === "PULSE" &&
    quote.items.length === 0 &&
    quote.total.greaterThan(0) &&
    [
      quote.legacyMaterialSale,
      quote.legacyMaterialCost,
      quote.legacyLaborSale,
      quote.legacyLaborCost,
      quote.legacyTaxAmount
    ].every((value) => value.isZero())
  );
  const pulseQuotes = quotes.filter((quote) => quote.items.length > 0);
  const conflicts = quotes.filter((quote) =>
    quote.calculationMode === "LEGACY" && quote.items.length > 0
  );

  console.log(`${apply ? "Applying" : "Previewing"} quote financial backfill.`);
  console.log(`Legacy candidates (no items, positive historical total): ${legacyCandidates.length}`);
  legacyCandidates.forEach((quote) =>
    console.log(`  ${quote.quoteNumber}: ${quote.total.toFixed(2)} -> material sale`)
  );
  console.log(`Pulse quotes with line items: ${pulseQuotes.length}`);
  console.log(`Conflicting Legacy quotes with items (review required): ${conflicts.length}`);
  conflicts.forEach((quote) => console.log(`  ${quote.quoteNumber}`));

  if (!apply) {
    console.log("No changes made. Re-run with --apply after reviewing this report.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const quote of legacyCandidates) {
      await tx.quote.update({
        where: { id: quote.id },
        data: {
          calculationMode: "LEGACY",
          legacyMaterialSale: quote.total,
          total: quote.total
        }
      });
    }

    for (const quote of pulseQuotes) {
      const total = quote.items.reduce(
        (sum, item) => sum.plus(item.lineSubtotal).plus(item.lineTax),
        new Prisma.Decimal(0)
      );
      await tx.quote.update({
        where: { id: quote.id },
        data: { calculationMode: "PULSE", total }
      });
    }

    for (const quote of quotes) {
      for (const revision of quote.revisions) {
        const snapshot = object(revision.snapshot);
        const snapshotItems = Array.isArray(snapshot.items) ? snapshot.items : [];
        const revisionMode = snapshot.calculationMode === "LEGACY" ||
          (!snapshot.calculationMode && snapshotItems.length === 0 && revision.totalSnapshot.greaterThan(0))
          ? "LEGACY"
          : "PULSE";
        const legacyFinancials = revisionMode === "LEGACY" && !snapshot.legacyFinancials
          ? {
              materialSale: revision.totalSnapshot.toFixed(2),
              materialCost: "0.00",
              laborSale: "0.00",
              laborCost: "0.00",
              taxAmount: "0.00",
              estimatedDurationBusinessDays: null
            }
          : undefined;
        const financialSummary = legacyFinancials && !snapshot.financialSummary
          ? exactFinancialSummarySnapshot(calculateLegacyQuoteFinancials({
              materialSale: legacyFinancials.materialSale,
              materialCost: 0,
              laborSale: 0,
              laborCost: 0,
              taxAmount: 0,
              estimatedDurationBusinessDays: null
            }))
          : snapshot.financialSummary;
        await tx.quoteRevision.update({
          where: { id: revision.id },
          data: {
            snapshot: {
              ...snapshot,
              calculationMode: revisionMode,
              ...(legacyFinancials ? { legacyFinancials } : {}),
              ...(financialSummary ? { financialSummary } : {})
            }
          }
        });
      }
    }
  });

  console.log("Quote financial backfill complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
