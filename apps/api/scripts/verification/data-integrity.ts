import "dotenv/config";
import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client
} from "@aws-sdk/client-s3";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { calculateLegacyQuoteFinancials, calculateQuoteLine } from "@/modules/quotes/quote-financials";

const deepDocuments = process.argv.includes("--deep-documents");
const requireDocuments = process.argv.includes("--require-documents");

function moneyEqual(left: Prisma.Decimal | number | string, right: Prisma.Decimal | number | string) {
  return new Prisma.Decimal(left).minus(new Prisma.Decimal(right)).abs().lessThanOrEqualTo(0.01);
}

function storageClient() {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error("S3 verification configuration is incomplete.");
  return {
    bucket,
    client: new S3Client({
      endpoint,
      region: process.env.S3_REGION || "us-east-1",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      credentials: { accessKeyId, secretAccessKey }
    })
  };
}

async function objectKeys(client: S3Client, bucket: string) {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }));
    keys.push(...(page.Contents ?? []).flatMap((object) => object.Key ? [object.Key] : []));
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys.sort();
}

async function bodySha256(body: unknown) {
  const hash = createHash("sha256");
  for await (const chunk of body as AsyncIterable<Uint8Array>) hash.update(chunk);
  return hash.digest("hex");
}

async function main() {
  const [quotes, items, documents] = await Promise.all([
    prisma.quote.findMany({
      select: {
        id: true,
        quoteNumber: true,
        baseQuoteNumber: true,
        revisionNumber: true,
        calculationMode: true,
        total: true,
        legacyMaterialSale: true,
        legacyMaterialCost: true,
        legacyLaborSale: true,
        legacyLaborCost: true,
        legacyTaxAmount: true,
        legacyEstimatedDurationBusinessDays: true,
        items: { select: { id: true, quantity: true, unitPrice: true, discountPercent: true, lineSubtotal: true, lineTax: true, lineTotal: true } },
        revisions: { select: { id: true, revisionNumber: true, totalSnapshot: true, snapshot: true }, orderBy: { revisionNumber: "asc" } }
      },
      orderBy: { quoteNumber: "asc" }
    }),
    prisma.item.findMany({
      select: {
        id: true,
        name: true,
        cost: true,
        sellPrice: true,
        priceHistory: { select: { id: true, newCost: true, newSellPrice: true, changedAt: true }, orderBy: [{ changedAt: "desc" }, { id: "desc" }], take: 1 }
      }
    }),
    prisma.lifecycleDocument.findMany({
      select: { id: true, objectKey: true, byteSize: true, sha256: true, deletedAt: true },
      orderBy: { id: "asc" }
    })
  ]);

  const failures: Array<{ category: string; entityId: string; identifier?: string; detail: string }> = [];
  if (requireDocuments && !documents.some((document) => document.objectKey && !document.deletedAt)) {
    failures.push({
      category: "document-fixture-missing",
      entityId: "release-gate",
      detail: "Restore validation requires at least one active database document with an object key."
    });
  }
  for (const quote of quotes) {
    for (const line of quote.items) {
      const calculated = calculateQuoteLine({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        lineTax: line.lineTax
      });
      if (!moneyEqual(line.lineSubtotal, calculated.lineSubtotal) || !moneyEqual(line.lineTotal, calculated.lineTotal)) {
        failures.push({ category: "quote-line-total", entityId: line.id, identifier: quote.quoteNumber, detail: "Stored line subtotal or total differs from deterministic calculation." });
      }
    }
    const expectedTotal = quote.calculationMode === "PULSE"
      ? quote.items.reduce((sum, line) => sum.plus(line.lineSubtotal).plus(line.lineTax), new Prisma.Decimal(0))
      : calculateLegacyQuoteFinancials({
          materialSale: quote.legacyMaterialSale,
          materialCost: quote.legacyMaterialCost,
          laborSale: quote.legacyLaborSale,
          laborCost: quote.legacyLaborCost,
          taxAmount: quote.legacyTaxAmount,
          estimatedDurationBusinessDays: quote.legacyEstimatedDurationBusinessDays
        }).finalCustomerTotal;
    if (!moneyEqual(quote.total, expectedTotal)) {
      failures.push({ category: "quote-total", entityId: quote.id, identifier: quote.quoteNumber, detail: "Quote total differs from its mode-specific financial source." });
    }
    const expectedRevisionNumbers = Array.from({ length: quote.revisionNumber }, (_, index) => index);
    const actualRevisionNumbers = quote.revisions.map((revision) => revision.revisionNumber);
    if (JSON.stringify(expectedRevisionNumbers) !== JSON.stringify(actualRevisionNumbers)) {
      failures.push({ category: "quote-revision-chain", entityId: quote.id, identifier: quote.quoteNumber, detail: "Historical revisions are not a complete zero-based sequence ending before the current revision." });
    }
    for (const revision of quote.revisions) {
      const snapshot = revision.snapshot && typeof revision.snapshot === "object" && !Array.isArray(revision.snapshot)
        ? revision.snapshot as Record<string, unknown>
        : {};
      const financial = snapshot.financialSummary && typeof snapshot.financialSummary === "object" && !Array.isArray(snapshot.financialSummary)
        ? snapshot.financialSummary as Record<string, unknown>
        : null;
      if (financial?.finalCustomerTotal !== undefined && !moneyEqual(revision.totalSnapshot, String(financial.finalCustomerTotal))) {
        failures.push({ category: "quote-revision-total", entityId: revision.id, identifier: quote.quoteNumber, detail: "Revision total differs from its immutable financial snapshot." });
      }
    }
  }

  for (const item of items) {
    const latest = item.priceHistory[0];
    if (!latest) {
      failures.push({ category: "item-price-history", entityId: item.id, identifier: item.name, detail: "Item has no opening or change history." });
    } else if (!moneyEqual(item.cost, latest.newCost) || !moneyEqual(item.sellPrice, latest.newSellPrice)) {
      failures.push({ category: "item-price-history", entityId: item.id, identifier: item.name, detail: "Latest price-history values differ from the current item." });
    }
  }

  const { client, bucket } = storageClient();
  try {
    const storedKeys = await objectKeys(client, bucket);
    const databaseKeys = documents.flatMap((document) => document.objectKey ? [document.objectKey] : []).sort();
    for (const key of databaseKeys.filter((key) => !storedKeys.includes(key))) {
      failures.push({ category: "document-object-missing", entityId: key, detail: "Database metadata references an absent MinIO object." });
    }
    for (const key of storedKeys.filter((key) => !databaseKeys.includes(key))) {
      failures.push({ category: "document-object-orphan", entityId: key, detail: "MinIO object has no LifecycleDocument metadata row." });
    }
    for (const document of documents.filter((row) => row.objectKey && storedKeys.includes(row.objectKey))) {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: document.objectKey! }));
      if (head.ContentLength !== undefined && BigInt(head.ContentLength) !== document.byteSize) {
        failures.push({ category: "document-size", entityId: document.id, detail: "Database byte size differs from MinIO metadata." });
      }
      const objectDigest = head.Metadata?.sha256;
      if (document.sha256 && objectDigest && document.sha256 !== objectDigest) {
        failures.push({ category: "document-sha256-metadata", entityId: document.id, detail: "Database and MinIO SHA-256 metadata differ." });
      }
      if (deepDocuments && document.sha256) {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: document.objectKey! }));
        if (!object.Body || await bodySha256(object.Body) !== document.sha256) {
          failures.push({ category: "document-sha256-content", entityId: document.id, detail: "Downloaded object content does not match the stored SHA-256." });
        }
      }
    }
  } finally {
    client.destroy();
  }

  const summary = failures.reduce<Record<string, number>>((counts, failure) => {
    counts[failure.category] = (counts[failure.category] ?? 0) + 1;
    return counts;
  }, {});
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY_VERIFICATION",
    deepDocumentHashing: deepDocuments,
    documentsRequired: requireDocuments,
    checked: { quotes: quotes.length, quoteLines: quotes.reduce((count, quote) => count + quote.items.length, 0), items: items.length, documents: documents.length },
    status: failures.length ? "failed" : "ok",
    summary,
    failures
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Integrity verification failed.");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
