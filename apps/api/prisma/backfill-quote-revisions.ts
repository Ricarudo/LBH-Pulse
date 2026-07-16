import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  LifecycleEntityType,
  Prisma,
  PrismaClient
} from "../src/generated/prisma/client";
import {
  calculateLegacyQuoteFinancials,
  calculatePulseQuoteFinancials,
  exactFinancialSummarySnapshot
} from "../src/modules/quotes/quote-financials";

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: "pulse" }
);
const prisma = new PrismaClient({ adapter });

const quoteLoad = {
  items: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
  contact: { include: { site: { select: { siteName: true } } } },
  project: { select: { id: true } },
  revisions: { select: { id: true, revisionNumber: true } }
} satisfies Prisma.QuoteInclude;

type LoadedQuote = Prisma.QuoteGetPayload<{ include: typeof quoteLoad }>;
type StatusEvent = Awaited<ReturnType<typeof loadEvents>>[number];

function parseQuoteNumber(quoteNumber: string) {
  const match = /R(\d+)$/i.exec(quoteNumber);
  return match
    ? { base: quoteNumber.slice(0, match.index), revision: Number(match[1]) }
    : { base: quoteNumber, revision: 0 };
}

function jsonObject(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.InputJsonObject
    : {};
}

function date(value: Date | null | undefined) {
  return value?.toISOString() ?? "";
}

function itemSnapshot(item: LoadedQuote["items"][number]) {
  return {
    id: item.id,
    quoteId: item.quoteId,
    sourceItemId: item.sourceItemId,
    section: item.section,
    name: item.name,
    description: item.description ?? "",
    itemType: item.itemType,
    sku: item.sku ?? "",
    partNumber: item.partNumber ?? "",
    manufacturer: item.manufacturer ?? "",
    brand: item.brand ?? "",
    quantity: Number(item.quantity),
    unitOfMeasure: item.unitOfMeasure ?? "",
    unitCost: Number(item.unitCost),
    unitPrice: Number(item.unitPrice),
    markupPercent: Number(item.markupPercent),
    discountPercent: Number(item.discountPercent),
    taxable: item.taxable,
    imageUrl: item.imageUrl ?? "",
    productUrl: item.productUrl ?? "",
    lineSubtotal: Number(item.lineSubtotal),
    lineTax: Number(item.lineTax),
    lineTotal: Number(item.lineTotal),
    sortOrder: item.sortOrder,
    createdAt: date(item.createdAt),
    updatedAt: date(item.updatedAt)
  };
}

function quoteSummary(quote: LoadedQuote) {
  return quote.calculationMode === "LEGACY"
    ? calculateLegacyQuoteFinancials({
        materialSale: quote.legacyMaterialSale,
        materialCost: quote.legacyMaterialCost,
        laborSale: quote.legacyLaborSale,
        laborCost: quote.legacyLaborCost,
        taxAmount: quote.legacyTaxAmount,
        estimatedDurationBusinessDays: quote.legacyEstimatedDurationBusinessDays
      })
    : calculatePulseQuoteFinancials(quote.items);
}

function quoteTotalFromItems(quote: LoadedQuote) {
  return quoteSummary(quote).finalCustomerTotal.toNumber();
}

function quoteRevenue(quote: LoadedQuote) {
  return quoteSummary(quote).preTaxContractValue.toNumber();
}

function snapshotItemTotal(snapshot: Prisma.JsonValue) {
  const items = jsonObject(snapshot).items;
  if (!Array.isArray(items) || !items.length) return null;
  return items.reduce((total, item) => {
    const lineTotal = jsonObject(item).lineTotal;
    return total + (typeof lineTotal === "number" ? lineTotal : 0);
  }, 0);
}

function contactSnapshot(contact: LoadedQuote["contact"]) {
  if (!contact) return null;
  return {
    id: contact.id,
    siteId: contact.siteId ?? undefined,
    siteName: contact.site?.siteName ?? undefined,
    role: contact.role ?? "",
    firstName: contact.firstName,
    lastName: contact.lastName,
    name: contact.name?.trim() ||
      [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
      "Not captured",
    title: contact.title ?? "",
    department: contact.department ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    mobile: contact.mobile ?? "",
    preferredContactMethod: contact.preferredContactMethod ?? "",
    isPrimary: contact.isPrimary,
    isBilling: contact.isBilling,
    isPrimaryContact: contact.isPrimary || contact.isPrimaryContact,
    isBillingContact: contact.isBilling || contact.isBillingContact,
    isTechnicalContact: contact.isTechnicalContact,
    isDecisionMaker: contact.isDecisionMaker,
    notes: contact.notes ?? ""
  };
}

function quoteSnapshot(quote: LoadedQuote, baseQuoteNumber: string, dataAvailable = true) {
  const summary = quoteSummary(quote);
  return JSON.parse(JSON.stringify({
    dataAvailable,
    baseQuoteNumber,
    calculationMode: quote.calculationMode,
    legacyFinancials: {
      materialSale: Number(quote.legacyMaterialSale),
      materialCost: Number(quote.legacyMaterialCost),
      laborSale: Number(quote.legacyLaborSale),
      laborCost: Number(quote.legacyLaborCost),
      taxAmount: Number(quote.legacyTaxAmount),
      estimatedDurationBusinessDays: quote.legacyEstimatedDurationBusinessDays
    },
    financialSummary: exactFinancialSummarySnapshot(summary),
    contact: contactSnapshot(quote.contact),
    context: {
      sourceRequestId: quote.sourceRequestIdSnapshot,
      requestNumber: quote.requestNumberSnapshot ?? "",
      requestTitle: quote.requestTitleSnapshot ?? "",
      requestType: quote.requestTypeSnapshot ?? "",
      serviceCategory: quote.serviceCategorySnapshot ?? "",
      contactName: quote.contactNameSnapshot ?? "",
      contactEmail: quote.contactEmailSnapshot ?? "",
      contactPhone: quote.contactPhoneSnapshot ?? "",
      siteName: quote.siteNameSnapshot ?? "",
      siteAddress: quote.siteAddressSnapshot ?? "",
      city: quote.citySnapshot ?? "",
      state: quote.stateSnapshot ?? "",
      scopeDescription: quote.scopeDescriptionSnapshot ?? "",
      internalNotes: quote.internalNotesSnapshot ?? ""
    },
    proposalNotes: quote.proposalNotes ?? "",
    proposalPreparedAt: date(quote.proposalPreparedAt),
    items: dataAvailable ? quote.items.map(itemSnapshot) : [],
    legacyCreatedAt: date(quote.createdAt),
    legacyUpdatedAt: date(quote.updatedAt)
  })) as Prisma.InputJsonObject;
}

async function loadEvents(ids: string[]) {
  return prisma.lifecycleStatusEvent.findMany({
    where: { entityType: LifecycleEntityType.QUOTE, entityId: { in: ids } },
    orderBy: [{ changedAt: "asc" }, { id: "asc" }]
  });
}

function sentAtFor(
  quote: LoadedQuote,
  events: StatusEvent[],
  latest = false,
  requestedAt?: Date
) {
  const sentEvent = events.filter((event) => event.entityId === quote.id && event.toStatus === "Sent").at(-1);
  if (latest && ["Draft", "Review"].includes(quote.status) && !sentEvent && !quote.sentAt) return null;
  const candidate = sentEvent?.changedAt ?? quote.sentAt ?? quote.createdAt;
  return requestedAt && candidate >= requestedAt
    ? new Date(requestedAt.getTime() - 1)
    : candidate;
}

function sentPrecisionFor(quote: LoadedQuote, events: StatusEvent[]) {
  const sentEvent = events.filter((event) => event.entityId === quote.id && event.toStatus === "Sent").at(-1);
  return sentEvent?.precision ?? quote.sentAtPrecision ?? "ESTIMATED";
}

function familyTimings(rows: LoadedQuote[], events: StatusEvent[]) {
  const timings = new Map<string, { openedAt: Date; sentAt: Date | null; requestedAt: Date | null }>();
  let cursor = rows[0]!.versionCreatedAt ?? rows[0]!.createdAt;
  rows.forEach((quote, index) => {
    const rawOpenedAt = quote.versionCreatedAt ?? quote.createdAt;
    const openedAt = new Date(Math.max(rawOpenedAt.getTime(), cursor.getTime()));
    const rawSentAt = sentAtFor(quote, events, index === rows.length - 1);
    const sentAt = rawSentAt
      ? new Date(Math.max(rawSentAt.getTime(), openedAt.getTime()))
      : null;
    const next = rows[index + 1];
    const rawRequestedAt = next ? next.versionCreatedAt ?? next.createdAt : null;
    const requestedAt = rawRequestedAt
      ? new Date(Math.max(
          rawRequestedAt.getTime(),
          (sentAt ?? openedAt).getTime() + 1
        ))
      : null;
    timings.set(quote.id, { openedAt, sentAt, requestedAt });
    cursor = requestedAt ?? sentAt ?? openedAt;
  });
  return timings;
}

function familyGroups(quotes: LoadedQuote[]) {
  const groups = new Map<string, LoadedQuote[]>();
  for (const quote of quotes) {
    const parsed = parseQuoteNumber(quote.quoteNumber);
    const base = quote.baseQuoteNumber || parsed.base;
    const list = groups.get(base) ?? [];
    list.push(quote);
    groups.set(base, list);
  }
  return Array.from(groups, ([base, rows]) => ({
    base,
    rows: rows.sort((left, right) => {
      const a = left.revisionNumber || parseQuoteNumber(left.quoteNumber).revision;
      const b = right.revisionNumber || parseQuoteNumber(right.quoteNumber).revision;
      return a - b;
    })
  })).filter(({ rows }) => {
    const max = Math.max(...rows.map((row) => row.revisionNumber || parseQuoteNumber(row.quoteNumber).revision));
    return max > 0;
  });
}

function revisionOf(quote: LoadedQuote) {
  return quote.revisionNumber || parseQuoteNumber(quote.quoteNumber).revision;
}

function validateFamily(base: string, rows: LoadedQuote[]) {
  const revisions = rows.map(revisionOf);
  if (new Set(revisions).size !== revisions.length) {
    throw new Error(`${base}: duplicate revision numbers (${revisions.join(", ")}).`);
  }
  const min = Math.min(...revisions);
  const max = Math.max(...revisions);
  if (min > 1) throw new Error(`${base}: the earliest available revision is R${min}; only a missing original is supported.`);
  for (let revision = min; revision <= max; revision += 1) {
    if (!revisions.includes(revision)) throw new Error(`${base}: missing R${revision} in the middle of the family.`);
  }
  const clientIds = new Set(rows.map((row) => row.clientId).filter(Boolean));
  if (clientIds.size > 1) throw new Error(`${base}: quote versions belong to different clients.`);
  const projects = rows.flatMap((row) => row.project ? [row.project.id] : []);
  if (new Set(projects).size > 1) throw new Error(`${base}: multiple projects are linked to one revision family.`);
}

async function consolidateFamily(
  tx: Prisma.TransactionClient,
  base: string,
  sourceRows: LoadedQuote[],
  sourceEvents: StatusEvent[]
) {
  const rows = [...sourceRows].sort((a, b) => revisionOf(a) - revisionOf(b));
  const latest = rows.at(-1)!;
  const canonical = rows.find((row) => revisionOf(row) === 0) ?? rows[0]!;
  const latestRevision = revisionOf(latest);
  const duplicateIds = rows.filter((row) => row.id !== canonical.id).map((row) => row.id);
  const historical = rows.filter((row) => row.id !== latest.id);
  const timings = familyTimings(rows, sourceEvents);

  if (revisionOf(rows[0]!) === 1) {
    const requestedAt = rows[0]!.versionCreatedAt ?? rows[0]!.createdAt;
    await tx.quoteRevision.create({
      data: {
        quoteId: canonical.id,
        revisionNumber: 0,
        quoteNumber: base,
        titleSnapshot: `${rows[0]!.title} (original unavailable)`,
        clientIdSnapshot: rows[0]!.clientId,
        clientNameSnapshot: rows[0]!.clientName,
        ownerSnapshot: rows[0]!.owner,
        totalSnapshot: 0,
        priorStatus: "Sent",
        outcome: "Revision Requested",
        versionCreatedAt: requestedAt,
        sentAt: null,
        requestedAt,
        reason: "Original version was not present in the legacy import.",
        snapshot: quoteSnapshot(rows[0]!, base, false),
        source: "LEGACY_IMPORT",
        precision: "ESTIMATED",
        requestedByName: "Pulse migration"
      }
    });
  }

  for (const historicalQuote of historical) {
    const revisionNumber = revisionOf(historicalQuote);
    const timing = timings.get(historicalQuote.id)!;
    const requestedAt = timing.requestedAt!;
    const sentAt = timing.sentAt;
    await tx.quoteRevision.create({
      data: {
        quoteId: canonical.id,
        revisionNumber,
        quoteNumber: historicalQuote.quoteNumber,
        titleSnapshot: historicalQuote.title,
        clientIdSnapshot: historicalQuote.clientId,
        clientNameSnapshot: historicalQuote.clientName,
        ownerSnapshot: historicalQuote.owner,
        totalSnapshot: quoteTotalFromItems(historicalQuote),
        priorStatus: historicalQuote.status,
        outcome: "Revision Requested",
        versionCreatedAt: timing.openedAt,
        sentAt,
        requestedAt,
        reason: "Revision reason was not captured in the legacy import.",
        snapshot: quoteSnapshot(historicalQuote, base),
        legacyQuoteId: historicalQuote.id === canonical.id ? null : historicalQuote.id,
        source: "LEGACY_IMPORT",
        precision: "ESTIMATED",
        requestedByName: "Pulse migration"
      }
    });

    const events = sourceEvents.filter((event) => event.entityId === historicalQuote.id);
    const baseline = events.find((event) => event.precision === "ESTIMATED") ?? events[0];
    const retainedSentEvent = events.find((event) => event.id !== baseline?.id && event.toStatus === "Sent");
    for (const event of events) {
      if (event.id === baseline?.id) continue;
      await tx.lifecycleStatusEvent.update({
        where: { id: event.id },
        data: {
          entityId: canonical.id,
          metadata: {
            ...jsonObject(event.metadata),
            quoteNumber: historicalQuote.quoteNumber,
            revisionNumber,
            supersededVersion: true
          }
        }
      });
    }
    if (baseline) {
      await tx.lifecycleStatusEvent.update({
        where: { id: baseline.id },
        data: {
          entityId: canonical.id,
          fromStatus: "Sent",
          toStatus: "Revision Requested",
          changedAt: requestedAt,
          valueSnapshot: quoteRevenue(historicalQuote),
          source: "LEGACY_IMPORT",
          precision: "ESTIMATED",
          metadata: {
            ...jsonObject(baseline.metadata),
            eventType: "quote_revision_requested",
            quoteNumber: historicalQuote.quoteNumber,
            revisionNumber,
            legacyStatus: baseline.toStatus,
            rawLegacyChangedAt: baseline.changedAt.toISOString(),
            requestedAt: requestedAt.toISOString(),
            supersededVersion: true
          }
        }
      });
    } else {
      await tx.lifecycleStatusEvent.create({
        data: {
          entityType: LifecycleEntityType.QUOTE,
          entityId: canonical.id,
          fromStatus: "Sent",
          toStatus: "Revision Requested",
          changedAt: requestedAt,
          actorNameSnapshot: "Pulse migration",
          valueSnapshot: quoteRevenue(historicalQuote),
          source: "LEGACY_IMPORT",
          precision: "ESTIMATED",
          metadata: {
            eventType: "quote_revision_requested",
            quoteNumber: historicalQuote.quoteNumber,
            revisionNumber,
            legacyStatus: historicalQuote.status,
            supersededVersion: true
          }
        }
      });
    }
    if (sentAt && !retainedSentEvent) {
      await tx.lifecycleStatusEvent.create({
        data: {
          entityType: LifecycleEntityType.QUOTE,
          entityId: canonical.id,
          toStatus: "Sent",
          changedAt: sentAt,
          actorNameSnapshot: "Pulse migration",
          valueSnapshot: quoteRevenue(historicalQuote),
          source: "LEGACY_IMPORT",
          precision: "ESTIMATED",
          metadata: {
            eventType: "quote_sent",
            quoteNumber: historicalQuote.quoteNumber,
            revisionNumber,
            supersededVersion: true
          }
        }
      });
    }
    if (sentAt) {
      const sentPrecision = retainedSentEvent?.precision ?? "ESTIMATED";
      await tx.requestUpdate.create({
        data: {
          quoteId: canonical.id,
          kind: "system",
          title: `${historicalQuote.quoteNumber} sent to client`,
          body: sentPrecision === "ESTIMATED"
            ? "Sent date estimated from the legacy import."
            : "Sent date retained from the exact lifecycle history.",
          authorNameSnapshot: "Pulse migration",
          authorRoleSnapshot: "System",
          metadata: {
            eventType: "quote_sent",
            precision: sentPrecision,
            quoteNumber: historicalQuote.quoteNumber,
            revisionNumber,
            toStatus: "Sent"
          },
          createdAt: sentAt,
          updatedAt: sentAt
        }
      });
    }
    await tx.requestUpdate.create({
      data: {
        quoteId: canonical.id,
        kind: "system",
        title: `Client requested revision R${revisionNumber + 1}`,
        body: "Revision reason was not captured in the legacy import.",
        authorNameSnapshot: "Pulse migration",
        authorRoleSnapshot: "System",
        metadata: {
          eventType: "quote_revision_requested",
          precision: "ESTIMATED",
          quoteNumber: historicalQuote.quoteNumber,
          revisionNumber: revisionNumber + 1,
          fromStatus: historicalQuote.status,
          toStatus: "Revision Requested",
          legacyStatus: historicalQuote.status
        },
        createdAt: requestedAt,
        updatedAt: requestedAt
      }
    });
  }

  const latestEvents = sourceEvents.filter((event) => event.entityId === latest.id);
  for (const event of latestEvents) {
    await tx.lifecycleStatusEvent.update({
      where: { id: event.id },
      data: {
        entityId: canonical.id,
        metadata: {
          ...jsonObject(event.metadata),
          quoteNumber: latest.quoteNumber,
          revisionNumber: latestRevision
        }
      }
    });
  }

  if (duplicateIds.length) {
    await tx.request.updateMany({ where: { relatedQuoteId: { in: duplicateIds } }, data: { relatedQuoteId: canonical.id } });
    await tx.lifecycleDocument.updateMany({ where: { quoteId: { in: duplicateIds } }, data: { quoteId: canonical.id } });
    await tx.requestUpdate.updateMany({ where: { quoteId: { in: duplicateIds } }, data: { quoteId: canonical.id } });
    await tx.activity.updateMany({
      where: { relatedEntityType: "Quote", relatedEntityId: { in: duplicateIds } },
      data: { relatedEntityId: canonical.id }
    });
    const project = rows.find((row) => row.project)?.project;
    if (project) await tx.project.update({ where: { id: project.id }, data: { quoteId: canonical.id } });
    if (latest.id !== canonical.id) {
      await tx.quoteItem.deleteMany({ where: { quoteId: canonical.id } });
      await tx.quoteItem.updateMany({ where: { quoteId: latest.id }, data: { quoteId: canonical.id } });
    }
    await tx.quote.deleteMany({ where: { id: { in: duplicateIds } } });
  }

  const latestTiming = timings.get(latest.id)!;
  const latestSentAt = latestTiming.sentAt;
  await tx.quote.update({
    where: { id: canonical.id },
    data: {
      quoteNumber: latest.quoteNumber,
      baseQuoteNumber: base,
      revisionNumber: latestRevision,
      versionCreatedAt: latestTiming.openedAt,
      sentAt: latestSentAt,
      sentAtPrecision: latestSentAt ? sentPrecisionFor(latest, sourceEvents) : null,
      title: latest.title,
      clientId: latest.clientId,
      contactId: latest.contactId,
      clientName: latest.clientName,
      status: latest.status,
      owner: latest.owner,
      total: quoteTotalFromItems(latest),
      sourceRequestIdSnapshot: latest.sourceRequestIdSnapshot,
      requestNumberSnapshot: latest.requestNumberSnapshot,
      requestTitleSnapshot: latest.requestTitleSnapshot,
      requestTypeSnapshot: latest.requestTypeSnapshot,
      serviceCategorySnapshot: latest.serviceCategorySnapshot,
      contactNameSnapshot: latest.contactNameSnapshot,
      contactEmailSnapshot: latest.contactEmailSnapshot,
      contactPhoneSnapshot: latest.contactPhoneSnapshot,
      siteNameSnapshot: latest.siteNameSnapshot,
      siteAddressSnapshot: latest.siteAddressSnapshot,
      citySnapshot: latest.citySnapshot,
      stateSnapshot: latest.stateSnapshot,
      scopeDescriptionSnapshot: latest.scopeDescriptionSnapshot,
      internalNotesSnapshot: latest.internalNotesSnapshot,
      proposalNotes: latest.proposalNotes,
      proposalPreparedAt: latest.proposalPreparedAt,
      currentStepId: latest.currentStepId,
      archivedAt: latest.archivedAt,
      updatedAt: latest.updatedAt
    }
  });

  for (const latestEvent of latestEvents) {
    await tx.requestUpdate.create({
      data: {
        quoteId: canonical.id,
        kind: "system",
        title: latestEvent.precision === "ESTIMATED"
          ? `${latest.quoteNumber} imported as ${latestEvent.toStatus}`
          : `${latest.quoteNumber} moved to ${latestEvent.toStatus}`,
        body: latestEvent.precision === "ESTIMATED"
          ? "Status and date reconstructed from the legacy import."
          : "Exact status transition retained from Pulse history.",
        authorNameSnapshot: "Pulse migration",
        authorRoleSnapshot: "System",
        metadata: {
          eventType: "quote_status_changed",
          precision: latestEvent.precision,
          quoteNumber: latest.quoteNumber,
          revisionNumber: latestRevision,
          fromStatus: latestEvent.fromStatus,
          toStatus: latestEvent.toStatus,
          legacyStatus: typeof jsonObject(latestEvent.metadata).legacyStatus === "string"
            ? jsonObject(latestEvent.metadata).legacyStatus
            : latestEvent.toStatus
        },
        createdAt: latestEvent.changedAt,
        updatedAt: latestEvent.changedAt
      }
    });
  }
}

async function initializeQuoteVersionFields(
  tx: Prisma.TransactionClient,
  quote: LoadedQuote,
  events: StatusEvent[]
) {
  const parsed = parseQuoteNumber(quote.quoteNumber);
  const quoteEvents = events.filter((event) => event.entityId === quote.id);
  const inferSentAt = !["Draft", "Review"].includes(quote.status);
  const sentAt = quote.sentAt ?? (inferSentAt ? sentAtFor(quote, quoteEvents, true) : null);
  await tx.quote.update({
    where: { id: quote.id },
    data: {
      baseQuoteNumber: quote.baseQuoteNumber || parsed.base,
      revisionNumber: quote.revisionNumber || parsed.revision,
      versionCreatedAt: quote.versionCreatedAt ?? quote.createdAt,
      sentAt,
      sentAtPrecision: sentAt
        ? quote.sentAtPrecision ?? sentPrecisionFor(quote, quoteEvents)
        : null
    }
  });
}

async function reconcileStoredTotals(tx: Prisma.TransactionClient) {
  const [quotes, revisions] = await Promise.all([
    tx.quote.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        total: true,
        items: { select: { lineTotal: true } }
      }
    }),
    tx.quoteRevision.findMany({
      select: { id: true, totalSnapshot: true, snapshot: true }
    })
  ]);
  let quoteTotalsUpdated = 0;
  let revisionTotalsUpdated = 0;
  for (const quote of quotes) {
    if (!quote.items.length) continue;
    const itemTotal = quote.items.reduce((total, item) => total + Number(item.lineTotal), 0);
    if (Math.abs(Number(quote.total) - itemTotal) < 0.005) continue;
    await tx.quote.update({ where: { id: quote.id }, data: { total: itemTotal } });
    quoteTotalsUpdated += 1;
  }
  for (const revision of revisions) {
    const itemTotal = snapshotItemTotal(revision.snapshot);
    if (itemTotal === null || Math.abs(Number(revision.totalSnapshot) - itemTotal) < 0.005) continue;
    await tx.quoteRevision.update({
      where: { id: revision.id },
      data: { totalSnapshot: itemTotal }
    });
    revisionTotalsUpdated += 1;
  }
  return { quoteTotalsUpdated, revisionTotalsUpdated };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const quotes = await prisma.quote.findMany({
    where: { archivedAt: null },
    include: quoteLoad,
    orderBy: { quoteNumber: "asc" }
  });
  const groups = familyGroups(quotes);
  const pending = groups.filter(({ rows }) => rows.length > 1 || rows[0]!.revisions.length === 0);
  for (const group of pending) validateFamily(group.base, group.rows);
  const revisionRequests = groups.reduce((sum, group) => sum + Math.max(...group.rows.map(revisionOf)), 0);
  const duplicateRows = pending.reduce((sum, group) => sum + Math.max(0, group.rows.length - 1), 0);
  const missingOriginals = pending.filter(({ rows }) => revisionOf(rows[0]!) === 1).length;
  const quotesNeedingVersionInitialization = quotes.filter((quote) => {
    const parsed = parseQuoteNumber(quote.quoteNumber);
    return !quote.baseQuoteNumber ||
      quote.revisionNumber !== parsed.revision ||
      !quote.versionCreatedAt;
  }).length;
  const quotesNeedingSentDate = quotes.filter((quote) =>
    !quote.sentAt && !["Draft", "Review"].includes(quote.status)
  ).length;
  const existingRevisions = await prisma.quoteRevision.findMany({
    select: { totalSnapshot: true, snapshot: true }
  });
  const quoteTotalMismatches = quotes.filter((quote) =>
    quote.items.length > 0 && Math.abs(Number(quote.total) - quoteTotalFromItems(quote)) >= 0.005
  ).length;
  const revisionTotalMismatches = existingRevisions.filter((revision) => {
    const itemTotal = snapshotItemTotal(revision.snapshot);
    return itemTotal !== null && Math.abs(Number(revision.totalSnapshot) - itemTotal) >= 0.005;
  }).length;
  const summary = {
    mode: apply ? "apply" : "preview",
    activeQuotesBefore: quotes.filter((quote) => !quote.archivedAt).length,
    revisionFamilies: groups.length,
    pendingFamilies: pending.length,
    revisionRequests,
    duplicateRows,
    missingOriginals,
    quotesNeedingVersionInitialization,
    quotesNeedingSentDate,
    quoteTotalMismatches,
    revisionTotalMismatches,
    expectedActiveQuotesAfter: quotes.filter((quote) => !quote.archivedAt).length - duplicateRows
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) return;

  const events = await loadEvents(quotes.map((quote) => quote.id));
  let totalsReconciled = { quoteTotalsUpdated: 0, revisionTotalsUpdated: 0 };
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pulse-quote-revision-backfill'))`;
    for (const quote of quotes) {
      await initializeQuoteVersionFields(tx, quote, events);
    }
    for (const group of pending) {
      await consolidateFamily(
        tx,
        group.base,
        group.rows,
        events.filter((event) => group.rows.some((row) => row.id === event.entityId))
      );
    }
    totalsReconciled = await reconcileStoredTotals(tx);
  }, { maxWait: 30_000, timeout: 120_000 });

  const [activeQuotesAfter, revisionsAfter] = await Promise.all([
    prisma.quote.count({ where: { archivedAt: null } }),
    prisma.quoteRevision.count()
  ]);
  console.log(JSON.stringify({ applied: true, activeQuotesAfter, revisionsAfter, ...totalsReconciled }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
