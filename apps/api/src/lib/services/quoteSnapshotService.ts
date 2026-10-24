import { z } from "zod";
import type { QuoteDetailRecord, QuoteRecord } from "@pulse/contracts/work";
import { quoteCommercialContentLocked } from "@pulse/contracts/quote-lifecycle";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

const text = z.string();
const amount = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]).transform(Number).pipe(z.number().finite());
const contact = z.object({
  id: text, siteId: text.optional(), siteName: text.optional(), role: text,
  firstName: text, lastName: text, name: text, title: text, department: text,
  email: text, phone: text, mobile: text, preferredContactMethod: text,
  isPrimary: z.boolean(), isBilling: z.boolean(), isPrimaryContact: z.boolean(),
  isBillingContact: z.boolean(), isTechnicalContact: z.boolean(), isDecisionMaker: z.boolean(), notes: text
}).nullable();
const site = z.object({ id: text, siteName: text, address: text, city: text, state: text }).nullable();
const context = z.object({
  sourceRequestId: text.nullable(), requestNumber: text, requestTitle: text, requestType: text,
  serviceCategory: text, contactName: text, contactEmail: text, contactPhone: text,
  siteName: text, siteAddress: text, city: text, state: text, scopeDescription: text, internalNotes: text
});
const financialSummary = z.object({
  materialRevenue: amount, laborRevenue: amount, serviceRevenue: amount,
  preTaxContractValue: amount, taxAmount: amount, finalCustomerTotal: amount,
  materialCost: amount, laborCost: amount, serviceCost: amount, totalEstimatedCost: amount,
  grossProfit: amount, grossMarginPercent: amount.nullable(), markupPercent: amount.nullable(),
  estimatedDurationBusinessDays: z.number().int().nullable()
});
const legacyFinancials = z.object({
  materialSale: amount, materialCost: amount, laborSale: amount, laborCost: amount,
  taxAmount: amount, estimatedDurationBusinessDays: z.number().int().nullable()
});
const item = z.object({
  id: text, quoteId: text, sourceItemId: text.nullable(), section: z.enum(["Materials", "Labor", "Services"]),
  name: text, description: text, itemType: z.enum(["PRODUCT", "LABOR", "SERVICE"]),
  sku: text, partNumber: text, manufacturer: text, brand: text, quantity: amount,
  unitOfMeasure: text, unitCost: amount, unitPrice: amount, markupPercent: amount,
  discountPercent: amount, taxable: z.boolean(), imageUrl: text, productUrl: text,
  lineSubtotal: amount, lineTax: amount, lineTotal: amount, sortOrder: z.number().int(),
  createdAt: text, updatedAt: text
});

/** Deliberately excludes live ownership, collaborators, activity and project progress. */
export const quoteCommercialViewSchema = z.object({
  title: text, clientName: text, contact, site, dueDate: text, trades: z.array(text),
  lifecycleDetails: text, context, proposalNotes: text, proposalPreparedAt: text,
  calculationMode: z.enum(["PULSE", "LEGACY"]), financialSummary, legacyFinancials,
  items: z.array(item)
});

export function captureQuoteCommercialView(record: QuoteDetailRecord) {
  return quoteCommercialViewSchema.parse({ ...record, lifecycleDetails: record.lifecycleContext.details });
}

type EventEvidence = { id: string; entityId: string; changedAt: Date; metadata: unknown };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Only an exact current send can supply evidence; a previous revision is never a fallback. */
export function projectQuoteSnapshot<T extends QuoteRecord>(record: T, events: readonly EventEvidence[]): T {
  if (!record.sentAt) return { ...record, commercialSnapshot: { status: quoteCommercialContentLocked(record) ? "UNAVAILABLE" : "DRAFT" } };
  const matches = events.filter(event => {
    const metadata = object(event.metadata);
    return event.entityId === record.id && event.changedAt.getTime() === Date.parse(record.sentAt)
      && metadata.quoteNumber === record.quoteNumber && metadata.revisionNumber === record.revisionNumber;
  });
  if (matches.length !== 1) return { ...record, commercialSnapshot: { status: "UNAVAILABLE" } };
  const event = matches[0];
  const snapshot = object(object(event.metadata).versionSnapshot);
  const full = quoteCommercialViewSchema.safeParse(snapshot.commercial);
  const result: T = { ...record, lifecycleContext: { ...record.lifecycleContext } };
  const evidence = { eventId: event.id, capturedAt: event.changedAt.toISOString() };
  if (full.success) {
    const { lifecycleDetails, context: savedContext, proposalNotes, proposalPreparedAt, items, ...saved } = full.data;
    Object.assign(result, saved, { total: saved.financialSummary.finalCustomerTotal });
    result.lifecycleContext.details = lifecycleDetails;
    if ("context" in result) Object.assign(result, { context: savedContext, proposalNotes, proposalPreparedAt, items });
    result.commercialSnapshot = { status: "FROZEN", ...evidence };
  } else {
    // Older application snapshots contain some evidence. Apply only validated fields;
    // do not pretend missing commercial facts have been recovered from today's masters.
    let recovered = 0;
    for (const [key, schema] of Object.entries({ title: text, clientName: text, contact, site, financialSummary, legacyFinancials })) {
      const parsed = schema.safeParse(snapshot[key]);
      if (parsed.success) { Object.assign(result, { [key]: parsed.data }); recovered += 1; }
    }
    if (financialSummary.safeParse(snapshot.financialSummary).success) result.total = result.financialSummary.finalCustomerTotal;
    if (typeof snapshot.lifecycleDetails === "string") { result.lifecycleContext.details = snapshot.lifecycleDetails; recovered += 1; }
    if ("context" in result) {
      for (const [key, schema] of Object.entries({ context, proposalNotes: text, proposalPreparedAt: text, items: z.array(item) })) {
        const parsed = schema.safeParse(snapshot[key]);
        if (parsed.success) { Object.assign(result, { [key]: parsed.data }); recovered += 1; }
      }
    }
    result.commercialSnapshot = { status: recovered ? "PARTIAL" : "UNAVAILABLE", ...evidence };
  }
  if ("versions" in result && Array.isArray(result.versions)) {
    result.versions = result.versions.map(version => version.isCurrent ? { ...version, title: result.title, total: result.total } : version);
  }
  return result;
}

export async function applyQuoteSnapshots<T extends QuoteRecord>(db: PrismaClient | Prisma.TransactionClient, records: T[]): Promise<T[]> {
  const ids = records.filter(record => record.sentAt).map(record => record.id);
  const events = ids.length ? await db.lifecycleStatusEvent.findMany({
    where: { entityType: "QUOTE", entityId: { in: ids }, toStatus: "Sent", disposition: null },
    select: { id: true, entityId: true, changedAt: true, metadata: true }
  }) : [];
  const byQuote = new Map<string, EventEvidence[]>();
  for (const event of events) byQuote.set(event.entityId, [...(byQuote.get(event.entityId) ?? []), event]);
  return records.map(record => projectQuoteSnapshot(record, byQuote.get(record.id) ?? []));
}
