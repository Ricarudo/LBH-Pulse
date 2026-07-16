import { LifecycleEntityType, type LifecycleEventPrecision } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  calculateLegacyQuoteFinancials,
  calculatePulseQuoteFinancials
} from "@/modules/quotes/quote-financials";
import { canUser, type AuthenticatedUser } from "@pulse/contracts/auth";
import type {
  AnalyticsCalculation,
  AnalyticsChart,
  AnalyticsChartSeries,
  AnalyticsDataQuality,
  AnalyticsDetailRow,
  AnalyticsDetailsQuery,
  AnalyticsDetailsResponse,
  AnalyticsDrilldown,
  AnalyticsKpi,
  AnalyticsMetricQuality,
  AnalyticsPoint,
  AnalyticsQuery,
  AnalyticsRange,
  AnalyticsResponse,
  AnalyticsValueFormat,
  AnalyticsView
} from "@pulse/contracts/analytics";

const dayMs = 86_400_000;
const activeQuoteStatuses = new Set(["Draft", "Review", "Sent"]);
const activeProjectStatuses = new Set(["Ready", "In Progress", "Field Work", "On Hold"]);
const receivableStatuses = new Set(["Sent", "Overdue"]);
const decisionStatuses = new Set(["Approved", "Rejected", "Expired"]);
const seriesColors = {
  blue: "#2563eb",
  violet: "#7c3aed",
  green: "#16a34a",
  teal: "#0f9f8f",
  amber: "#d97706",
  red: "#dc2626",
  slate: "#64748b"
} as const;

export function analyticsLocalDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addDays(date: string, days: number) {
  const instant = new Date(`${date}T12:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

function rangeLength(range: Pick<AnalyticsRange, "from" | "to">) {
  return Math.round(
    (new Date(`${range.to}T12:00:00Z`).getTime() - new Date(`${range.from}T12:00:00Z`).getTime()) / dayMs
  ) + 1;
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, (end.getTime() - start.getTime()) / dayMs);
}

function inRange(
  date: Date | null | undefined,
  range: Pick<AnalyticsRange, "from" | "to">,
  timeZone: string
) {
  if (!date) return false;
  const local = analyticsLocalDate(date, timeZone);
  return local >= range.from && local <= range.to;
}

function onOrBefore(date: Date, to: string, timeZone: string) {
  return analyticsLocalDate(date, timeZone) <= to;
}

function previousRange(range: AnalyticsRange) {
  return { from: range.compareFrom, to: range.compareTo };
}

export function resolveAnalyticsRange(
  input: Pick<AnalyticsQuery, "from" | "to">,
  timeZone: string,
  now = new Date()
): AnalyticsRange {
  const to = input.to ?? analyticsLocalDate(now, timeZone);
  const from = input.from ?? addDays(to, -29);
  const length = rangeLength({ from, to });
  const compareTo = addDays(from, -1);
  const compareFrom = addDays(compareTo, -(length - 1));
  return {
    from,
    to,
    compareFrom,
    compareTo,
    timeZone,
    label: `${from} – ${to}`,
    comparisonLabel: `${compareFrom} – ${compareTo}`
  };
}

export function analyticsDelta(current: number, comparison: number) {
  if (comparison === 0) return current === 0 ? 0 : null;
  return ((current - comparison) / Math.abs(comparison)) * 100;
}

export function calculateWinRate(statuses: string[]) {
  const decisions = statuses.filter((status) => decisionStatuses.has(status));
  if (!decisions.length) return null;
  return decisions.filter((status) => status === "Approved").length / decisions.length;
}

type MarginLine = { lineSubtotal: number; quantity: number; unitCost: number };

function quotedMarginParts(lines: MarginLine[]) {
  const usable = lines.filter((line) =>
    Number.isFinite(line.lineSubtotal) &&
    Number.isFinite(line.quantity) &&
    Number.isFinite(line.unitCost) &&
    line.lineSubtotal > 0 &&
    line.quantity >= 0 &&
    line.unitCost >= 0
  );
  const revenue = usable.reduce((total, line) => total + line.lineSubtotal, 0);
  if (!revenue) return null;
  const cost = usable.reduce((total, line) => total + line.quantity * line.unitCost, 0);
  return { revenue, cost };
}

export function calculateQuotedMargin(lines: MarginLine[]) {
  const parts = quotedMarginParts(lines);
  return parts ? (parts.revenue - parts.cost) / parts.revenue : null;
}

export function calculateWeightedQuotedMargin(groups: MarginLine[][]) {
  const parts = groups.flatMap((lines) => {
    const value = quotedMarginParts(lines);
    return value ? [value] : [];
  });
  const revenue = parts.reduce((total, part) => total + part.revenue, 0);
  const cost = parts.reduce((total, part) => total + part.cost, 0);
  return revenue ? (revenue - cost) / revenue : null;
}

export function canUseCurrentQuoteMarginFallback(source: string) {
  return source !== "LEGACY_IMPORT";
}

export function agingBucket(dueDate: Date | null, asOf: Date) {
  if (!dueDate) return "No due date";
  const days = Math.floor((asOf.getTime() - dueDate.getTime()) / dayMs);
  if (days <= 0) return "Current";
  if (days <= 30) return "1–30";
  if (days <= 60) return "31–60";
  if (days <= 90) return "61–90";
  return "90+";
}

export function isOnTimeLocalDate(completedAt: Date, dueDate: Date, timeZone: string) {
  return analyticsLocalDate(completedAt, timeZone) <= analyticsLocalDate(dueDate, timeZone);
}

type EventRecord = {
  id: string;
  entityType: LifecycleEntityType;
  entityId: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: Date;
  source: string;
  precision: LifecycleEventPrecision;
  valueSnapshot: { toNumber(): number } | null;
  metadata: unknown;
};

function metadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function metadataNumber(value: unknown, key: string) {
  const candidate = metadataObject(value)[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

function metadataDate(value: unknown, key: string) {
  const metadata = metadataObject(value);
  if (!(key in metadata)) return undefined;
  if (metadata[key] === null) return null;
  if (typeof metadata[key] !== "string") return undefined;
  const date = new Date(metadata[key]);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function isSupersededLifecycleDecision(value: unknown) {
  const metadata = metadataObject(value);
  return Boolean(metadata.supersededByRevisionId || metadata.supersededVersion);
}

function eventMap(events: EventRecord[]) {
  const map = new Map<string, EventRecord[]>();
  for (const event of events) {
    const key = `${event.entityType}:${event.entityId}`;
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  }
  return map;
}

function valueOf(value: { toNumber(): number } | number) {
  return typeof value === "number" ? value : value.toNumber();
}

function tradesFromSnapshot(value: string | null | undefined) {
  const trades = (value ?? "").split(",").map((trade) => trade.trim()).filter(Boolean);
  return trades.length ? trades : ["Unclassified"];
}

function revisionTrades(snapshot: unknown, fallback: string[]) {
  const context = metadataObject(metadataObject(snapshot).context);
  const serviceCategory = context.serviceCategory;
  return typeof serviceCategory === "string" && serviceCategory.trim()
    ? tradesFromSnapshot(serviceCategory)
    : fallback;
}

function revisionMarginLines(snapshot: unknown): MarginLine[] | null {
  const items = metadataObject(snapshot).items;
  if (!Array.isArray(items)) return null;
  return items.flatMap((item) => {
    const value = metadataObject(item);
    const lineSubtotal = Number(value.lineSubtotal);
    const quantity = Number(value.quantity);
    const unitCost = Number(value.unitCost);
    return [lineSubtotal, quantity, unitCost].every(Number.isFinite)
      ? [{ lineSubtotal, quantity, unitCost }]
      : [];
  });
}

type BaseRecord = {
  id: string;
  kind: AnalyticsDetailRow["kind"];
  entityType: LifecycleEntityType;
  reference: string;
  title: string;
  client: string;
  clientId: string | null;
  trades: string[];
  status: string;
  owner: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  dueDate: Date | null;
  value: number | null;
  href: string;
  source?: string;
  requestReceivedAt?: Date;
  quoteCreatedAt?: Date;
  projectStartAt?: Date | null;
  issuedDate?: Date | null;
};

type QuoteRecord = BaseRecord & {
  entityType: typeof LifecycleEntityType.QUOTE;
  calculationMode: "LEGACY" | "PULSE";
  revisionNumber: number;
  items: MarginLine[];
  marginParts: { revenue: number; cost: number } | null;
  revisions: Array<{
    id: string;
    revisionNumber: number;
    quoteNumber: string;
    titleSnapshot: string;
    clientIdSnapshot: string | null;
    clientNameSnapshot: string | null;
    ownerSnapshot: string;
    totalSnapshot: { toNumber(): number };
    sentAt: Date | null;
    requestedAt: Date;
    precision: LifecycleEventPrecision;
    snapshot: unknown;
  }>;
};

type RevisionRecord = BaseRecord & {
  kind: "QuoteVersion";
  quoteId: string;
  sentAt: Date | null;
  requestedAt: Date;
  precision: LifecycleEventPrecision;
  marginLines: MarginLine[] | null;
};

type SentVersionRecord = {
  id: string;
  quoteId: string;
  reference: string;
  title: string;
  client: string;
  clientId: string | null;
  owner: string;
  trades: string[];
  sentAt: Date;
  returnedAt: Date | null;
  value: number;
  precision: LifecycleEventPrecision;
  href: string;
};

function matchesFilters(record: Pick<BaseRecord, "trades" | "owner" | "clientId">, query: AnalyticsQuery | AnalyticsDetailsQuery) {
  if (query.trade && !record.trades.includes(query.trade)) return false;
  if (query.owner && record.owner !== query.owner) return false;
  if (query.clientId && record.clientId !== query.clientId) return false;
  return true;
}

function matchesSentVersionFilters(record: SentVersionRecord, query: AnalyticsQuery | AnalyticsDetailsQuery) {
  if (query.trade && !record.trades.includes(query.trade)) return false;
  if (query.owner && record.owner !== query.owner) return false;
  if (query.clientId && record.clientId !== query.clientId) return false;
  return true;
}

type AnalyticsData = {
  range: AnalyticsRange;
  timeZone: string;
  today: string;
  events: EventRecord[];
  eventsByEntity: Map<string, EventRecord[]>;
  clients: Array<{ id: string; displayName: string }>;
  requestRecords: BaseRecord[];
  quoteRecords: QuoteRecord[];
  revisionRecords: RevisionRecord[];
  sentVersionRecords: SentVersionRecord[];
  projectRecords: BaseRecord[];
  invoiceRecords: BaseRecord[];
};

async function loadAnalyticsData(
  user: AuthenticatedUser,
  query: AnalyticsQuery | AnalyticsDetailsQuery
): Promise<AnalyticsData> {
  const workspace = await prisma.workspaceSettings.findUnique({
    where: { id: "default" },
    select: { timeZone: true }
  });
  const timeZone = workspace?.timeZone ?? "America/Puerto_Rico";
  const range = resolveAnalyticsRange(query, timeZone);
  const allowedEventTypes = [
    canUser(user, "requests:read") ? LifecycleEntityType.REQUEST : null,
    canUser(user, "quotes:read") ? LifecycleEntityType.QUOTE : null,
    canUser(user, "projects:read") ? LifecycleEntityType.PROJECT : null,
    canUser(user, "billing:read") ? LifecycleEntityType.INVOICE : null
  ].filter((value): value is LifecycleEntityType => value !== null);

  const [requests, quotes, projects, invoices, events, clients] = await Promise.all([
    canUser(user, "requests:read") ? prisma.request.findMany({
      include: {
        trades: { select: { serviceCategory: true } },
        assignedTo: { select: { name: true } },
        client: { select: { id: true, displayName: true } },
        relatedQuote: { select: { id: true, createdAt: true } }
      }
    }) : [],
    canUser(user, "quotes:read") ? prisma.quote.findMany({
      include: {
        client: { select: { id: true, displayName: true } },
        items: { select: { itemType: true, lineSubtotal: true, lineTax: true, quantity: true, unitCost: true } },
        requests: {
          take: 1,
          include: { trades: { select: { serviceCategory: true } } }
        },
        revisions: { orderBy: { revisionNumber: "asc" } }
      }
    }) : [],
    canUser(user, "projects:read") ? prisma.project.findMany({
      include: {
        client: { select: { id: true, displayName: true } },
        assignedTo: { select: { name: true } },
        quote: {
          include: {
            requests: {
              take: 1,
              include: { trades: { select: { serviceCategory: true } } }
            }
          }
        }
      }
    }) : [],
    canUser(user, "billing:read") ? prisma.invoice.findMany({
      include: {
        client: { select: { id: true, displayName: true } },
        assignedTo: { select: { name: true } },
        project: {
          include: {
            quote: {
              include: {
                requests: {
                  take: 1,
                  include: { trades: { select: { serviceCategory: true } } }
                }
              }
            }
          }
        }
      }
    }) : [],
    prisma.lifecycleStatusEvent.findMany({
      where: { entityType: { in: allowedEventTypes } },
      orderBy: [{ changedAt: "asc" }, { id: "asc" }]
    }),
    canUser(user, "clients:read")
      ? prisma.client.findMany({
          where: { archivedAt: null },
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" }
        })
      : []
  ]);

  const eventsByEntity = eventMap(events);
  const requestRecords: BaseRecord[] = requests.map((request) => ({
    id: request.id,
    kind: "Request" as const,
    entityType: LifecycleEntityType.REQUEST,
    reference: request.requestNumber,
    title: request.title,
    client: request.client?.displayName ?? request.companyName ?? "Unclassified",
    clientId: request.client?.id ?? request.clientId,
    trades: request.trades.length
      ? request.trades.map((trade) => trade.serviceCategory)
      : tradesFromSnapshot(request.serviceCategory),
    status: request.status,
    owner: request.assignedTo?.name ?? "Unassigned",
    createdAt: request.receivedDate,
    updatedAt: request.updatedAt,
    archivedAt: request.archivedAt,
    dueDate: request.dueDate,
    value: null,
    source: request.source,
    requestReceivedAt: request.receivedDate,
    quoteCreatedAt: request.relatedQuote?.createdAt,
    href: `/requests/${request.id}`
  })).filter((record) => matchesFilters(record, query));

  const quoteRecords: QuoteRecord[] = quotes.map((quote) => {
    const request = quote.requests[0];
    const trades = quote.serviceCategorySnapshot !== null
      ? tradesFromSnapshot(quote.serviceCategorySnapshot)
      : request?.trades.length
        ? request.trades.map((trade) => trade.serviceCategory)
        : tradesFromSnapshot(request?.serviceCategory);
    const financialSummary = quote.calculationMode === "LEGACY"
      ? calculateLegacyQuoteFinancials({
          materialSale: quote.legacyMaterialSale,
          materialCost: quote.legacyMaterialCost,
          laborSale: quote.legacyLaborSale,
          laborCost: quote.legacyLaborCost,
          taxAmount: quote.legacyTaxAmount,
          estimatedDurationBusinessDays: quote.legacyEstimatedDurationBusinessDays
        })
      : calculatePulseQuoteFinancials(quote.items);
    return {
      id: quote.id,
      kind: "Quote" as const,
      entityType: LifecycleEntityType.QUOTE,
      reference: quote.quoteNumber,
      title: quote.title,
      client: quote.client?.displayName ?? quote.clientName ?? "Unclassified",
      clientId: quote.client?.id ?? quote.clientId,
      trades,
      status: quote.status,
      owner: quote.owner,
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt,
      archivedAt: quote.archivedAt,
      dueDate: null,
      value: financialSummary.preTaxContractValue.toNumber(),
      requestReceivedAt: request?.receivedDate,
      quoteCreatedAt: quote.createdAt,
      revisionNumber: quote.revisionNumber,
      calculationMode: quote.calculationMode,
      items: quote.items.map((line) => ({
        lineSubtotal: valueOf(line.lineSubtotal),
        quantity: valueOf(line.quantity),
        unitCost: valueOf(line.unitCost)
      })),
      marginParts: financialSummary.preTaxContractValue.isZero()
        ? null
        : {
            revenue: financialSummary.preTaxContractValue.toNumber(),
            cost: financialSummary.totalEstimatedCost.toNumber()
          },
      revisions: quote.revisions,
      href: `/quotes?record=${encodeURIComponent(quote.id)}`
    };
  }).filter((record) => matchesFilters(record, query));

  const revisionRecords: RevisionRecord[] = quoteRecords.flatMap((quote) =>
    quote.revisions.map((revision) => ({
      id: revision.id,
      kind: "QuoteVersion" as const,
      entityType: LifecycleEntityType.QUOTE,
      reference: revision.quoteNumber,
      title: revision.titleSnapshot,
      client: revision.clientNameSnapshot ?? quote.client,
      clientId: revision.clientIdSnapshot ?? quote.clientId,
      trades: revisionTrades(revision.snapshot, quote.trades),
      status: "Revision Requested",
      owner: revision.ownerSnapshot,
      createdAt: revision.requestedAt,
      updatedAt: revision.requestedAt,
      archivedAt: null,
      dueDate: null,
      value: valueOf(revision.totalSnapshot),
      quoteId: quote.id,
      sentAt: revision.sentAt,
      requestedAt: revision.requestedAt,
      precision: revision.precision,
      marginLines: revisionMarginLines(revision.snapshot),
      href: `/quotes?record=${encodeURIComponent(quote.id)}`
    }))
  ).filter((record) => matchesFilters(record, query));

  const sentVersionRecords: SentVersionRecord[] = quoteRecords.flatMap((quote) => {
    const historical = quote.revisions.flatMap((revision) => revision.sentAt ? [{
      id: revision.id,
      quoteId: quote.id,
      reference: revision.quoteNumber,
      title: revision.titleSnapshot,
      client: revision.clientNameSnapshot ?? quote.client,
      clientId: revision.clientIdSnapshot ?? quote.clientId,
      owner: revision.ownerSnapshot,
      trades: revisionTrades(revision.snapshot, quote.trades),
      sentAt: revision.sentAt,
      returnedAt: revision.requestedAt,
      value: valueOf(revision.totalSnapshot),
      precision: revision.precision,
      href: `/quotes?record=${encodeURIComponent(quote.id)}`
    }] : []);
    const current = quotes.find((candidate) => candidate.id === quote.id);
    return [
      ...historical,
      ...(current?.sentAt ? [{
        id: `current:${quote.id}`,
        quoteId: quote.id,
        reference: quote.reference,
        title: quote.title,
        client: quote.client,
        clientId: quote.clientId,
        owner: quote.owner,
        trades: quote.trades,
        sentAt: current.sentAt,
        returnedAt: null,
        value: quote.value ?? 0,
        precision: current.sentAtPrecision ?? ("EXACT" as const),
        href: quote.href
      }] : [])
    ];
  }).filter((record) => matchesSentVersionFilters(record, query));

  const projectRecords: BaseRecord[] = projects.map((project) => {
    const request = project.quote?.requests[0];
    const trades = project.quote?.serviceCategorySnapshot != null
      ? tradesFromSnapshot(project.quote.serviceCategorySnapshot)
      : request?.trades.length
        ? request.trades.map((trade) => trade.serviceCategory)
        : tradesFromSnapshot(request?.serviceCategory);
    return {
      id: project.id,
      kind: "Project" as const,
      entityType: LifecycleEntityType.PROJECT,
      reference: project.projectNumber,
      title: project.title,
      client: project.client.displayName,
      clientId: project.client.id,
      trades,
      status: project.status,
      owner: project.assignedTo?.name ?? "Unassigned",
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      archivedAt: project.archivedAt,
      dueDate: project.dueDate,
      value: valueOf(project.budget),
      requestReceivedAt: request?.receivedDate,
      projectStartAt: project.startDate,
      href: `/projects/${encodeURIComponent(project.id)}`
    };
  }).filter((record) => matchesFilters(record, query));

  const invoiceRecords: BaseRecord[] = invoices.map((invoice) => {
    const request = invoice.project?.quote?.requests[0];
    const trades = invoice.project?.quote?.serviceCategorySnapshot != null
      ? tradesFromSnapshot(invoice.project.quote.serviceCategorySnapshot)
      : request?.trades.length
        ? request.trades.map((trade) => trade.serviceCategory)
        : tradesFromSnapshot(request?.serviceCategory);
    return {
      id: invoice.id,
      kind: "Invoice" as const,
      entityType: LifecycleEntityType.INVOICE,
      reference: invoice.invoiceNumber,
      title: invoice.title,
      client: invoice.client.displayName,
      clientId: invoice.client.id,
      trades,
      status: invoice.status,
      owner: invoice.assignedTo?.name ?? "Unassigned",
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      archivedAt: invoice.archivedAt,
      dueDate: invoice.dueDate,
      value: valueOf(invoice.amount),
      issuedDate: invoice.issuedDate,
      href: `/billing/${encodeURIComponent(invoice.id)}`
    };
  }).filter((record) => matchesFilters(record, query));

  return {
    range,
    timeZone,
    today: analyticsLocalDate(new Date(), timeZone),
    events,
    eventsByEntity,
    clients,
    requestRecords,
    quoteRecords,
    revisionRecords,
    sentVersionRecords,
    projectRecords,
    invoiceRecords
  };
}

type SnapshotRecord = {
  record: BaseRecord;
  status: string | null;
  value: number | null;
  dueDate: Date | null | undefined;
  startDate: Date | null | undefined;
  event: EventRecord | null;
  precision: LifecycleEventPrecision | null;
  statusKnown: boolean;
  valueKnown: boolean;
};

function visibleAt(record: BaseRecord, to: string, timeZone: string) {
  if (analyticsLocalDate(record.createdAt, timeZone) > to) return false;
  return !record.archivedAt || analyticsLocalDate(record.archivedAt, timeZone) > to;
}

function snapshotAt(data: AnalyticsData, record: BaseRecord, to: string): SnapshotRecord | null {
  if (!visibleAt(record, to, data.timeZone)) return null;
  if (to >= data.today) {
    return {
      record,
      status: record.status,
      value: record.value,
      dueDate: record.dueDate,
      startDate: record.projectStartAt,
      event: null,
      precision: "EXACT",
      statusKnown: true,
      valueKnown: record.value !== null
    };
  }
  const events = data.eventsByEntity.get(`${record.entityType}:${record.id}`) ?? [];
  const event = events.filter((candidate) => onOrBefore(candidate.changedAt, to, data.timeZone)).at(-1) ?? null;
  if (!event) {
    return {
      record,
      status: null,
      value: null,
      dueDate: undefined,
      startDate: undefined,
      event: null,
      precision: null,
      statusKnown: false,
      valueKnown: false
    };
  }
  return {
    record,
    status: event.toStatus,
    value: event.valueSnapshot?.toNumber() ?? null,
    dueDate: metadataDate(event.metadata, "dueDate"),
    startDate: metadataDate(event.metadata, "startDate"),
    event,
    precision: event.precision,
    statusKnown: true,
    valueKnown: event.valueSnapshot !== null
  };
}

function snapshotsAt(data: AnalyticsData, records: BaseRecord[], to: string) {
  return records.flatMap((record) => {
    const snapshot = snapshotAt(data, record, to);
    return snapshot ? [snapshot] : [];
  });
}

type DecisionFact = {
  record: QuoteRecord;
  event: EventRecord;
  value: number | null;
  margin: { revenue: number; cost: number } | null;
  marginKnown: boolean;
};

type CompletionFact = {
  record: BaseRecord;
  event: EventRecord;
  value: number | null;
  dueDate: Date | null | undefined;
  startDate: Date | null | undefined;
  projectDuration: number | null;
  endToEndDuration: number | null;
};

type InvoiceFact = {
  record: BaseRecord;
  date: Date;
  event: EventRecord | null;
  value: number | null;
  precision: LifecycleEventPrecision | null;
  eligibilityKnown: boolean;
};

function decisionSupersededAsOf(data: AnalyticsData, event: EventRecord, to: string) {
  const laterRevision = (data.eventsByEntity.get(`${LifecycleEntityType.QUOTE}:${event.entityId}`) ?? [])
    .find((candidate) =>
      candidate.changedAt > event.changedAt &&
      candidate.toStatus === "Revision Requested" &&
      onOrBefore(candidate.changedAt, to, data.timeZone)
    );
  return Boolean(laterRevision);
}

function decisionMargin(data: AnalyticsData, record: QuoteRecord, event: EventRecord, asOfTo: string) {
  const revenue = metadataNumber(event.metadata, "revenueSnapshot");
  const cost = metadataNumber(event.metadata, "costSnapshot");
  if (revenue !== null && cost !== null && revenue > 0) {
    return { margin: { revenue, cost }, known: true };
  }

  const isCurrentVersion = !decisionSupersededAsOf(data, event, asOfTo);
  if (
    asOfTo >= data.today &&
    isCurrentVersion &&
    (record.calculationMode === "LEGACY" || canUseCurrentQuoteMarginFallback(event.source))
  ) {
    return { margin: record.marginParts, known: true };
  }
  return { margin: null, known: false };
}

function decisionFacts(
  data: AnalyticsData,
  activityRange: Pick<AnalyticsRange, "from" | "to">,
  asOfTo: string
): DecisionFact[] {
  return data.quoteRecords.flatMap((record) => {
    const candidates = (data.eventsByEntity.get(`${LifecycleEntityType.QUOTE}:${record.id}`) ?? [])
      .filter((event) =>
        decisionStatuses.has(event.toStatus) &&
        event.fromStatus !== event.toStatus &&
        inRange(event.changedAt, activityRange, data.timeZone) &&
        !decisionSupersededAsOf(data, event, asOfTo)
      );
    const event = candidates.at(-1);
    if (!event) return [];
    const margin = decisionMargin(data, record, event, asOfTo);
    const canUseNormalizedCurrentValue =
      asOfTo >= data.today &&
      record.calculationMode === "LEGACY" &&
      !decisionSupersededAsOf(data, event, asOfTo);
    return [{
      record,
      event,
      value: canUseNormalizedCurrentValue
        ? record.value
        : event.valueSnapshot?.toNumber() ?? null,
      margin: margin.margin,
      marginKnown: margin.known
    }];
  });
}

function completionFacts(
  data: AnalyticsData,
  activityRange: Pick<AnalyticsRange, "from" | "to">
): CompletionFact[] {
  return data.projectRecords.flatMap((record) => {
    const event = (data.eventsByEntity.get(`${LifecycleEntityType.PROJECT}:${record.id}`) ?? [])
      .filter((candidate) =>
        candidate.toStatus === "Completed" &&
        candidate.fromStatus !== candidate.toStatus &&
        inRange(candidate.changedAt, activityRange, data.timeZone)
      )
      .at(-1);
    if (!event) return [];

    let dueDate = metadataDate(event.metadata, "dueDate");
    let startDate = metadataDate(event.metadata, "startDate");
    const eventMatchesCurrent = Math.abs(record.updatedAt.getTime() - event.changedAt.getTime()) < 2_000;
    if (eventMatchesCurrent) {
      if (dueDate === undefined) dueDate = record.dueDate;
      if (startDate === undefined) startDate = record.projectStartAt;
    }
    return [{
      record,
      event,
      value: event.valueSnapshot?.toNumber() ?? null,
      dueDate,
      startDate,
      projectDuration: startDate ? daysBetween(startDate, event.changedAt) : null,
      endToEndDuration: record.requestReceivedAt
        ? daysBetween(record.requestReceivedAt, event.changedAt)
        : null
    }];
  });
}

function eventValueAtIssue(data: AnalyticsData, record: BaseRecord, issuedDate: Date) {
  const events = data.eventsByEntity.get(`${LifecycleEntityType.INVOICE}:${record.id}`) ?? [];
  const issueLocal = analyticsLocalDate(issuedDate, data.timeZone);
  const event = events.filter((candidate) => {
    if (candidate.valueSnapshot === null) return false;
    const capturedIssuedDate = metadataDate(candidate.metadata, "issuedDate");
    return analyticsLocalDate(candidate.changedAt, data.timeZone) === issueLocal ||
      (capturedIssuedDate instanceof Date && analyticsLocalDate(capturedIssuedDate, data.timeZone) === issueLocal);
  }).at(-1) ?? null;
  return { event, value: event?.valueSnapshot?.toNumber() ?? null };
}

function invoiceIssueFacts(
  data: AnalyticsData,
  activityRange: Pick<AnalyticsRange, "from" | "to">,
  asOfTo: string
): InvoiceFact[] {
  return data.invoiceRecords.flatMap<InvoiceFact>((record) => {
    const events = data.eventsByEntity.get(`${LifecycleEntityType.INVOICE}:${record.id}`) ?? [];
    const issueEvent = events.find((event) =>
      ["Sent", "Overdue", "Paid"].includes(event.toStatus) && event.fromStatus !== event.toStatus
    ) ?? null;
    const issueDate = record.issuedDate ?? issueEvent?.changedAt ?? null;
    if (!issueDate || !inRange(issueDate, activityRange, data.timeZone)) return [];
    const state = snapshotAt(data, record, asOfTo);
    if (!state || !state.statusKnown) {
      return [{
        record,
        date: issueDate,
        event: null,
        value: null,
        precision: null,
        eligibilityKnown: false
      }];
    }
    if (state.status === "Void") return [];
    const captured = record.issuedDate
      ? eventValueAtIssue(data, record, record.issuedDate)
      : { event: issueEvent, value: issueEvent?.valueSnapshot?.toNumber() ?? null };
    return [{
      record,
      date: issueDate,
      event: captured.event,
      value: captured.value,
      precision: captured.event?.precision ?? null,
      eligibilityKnown: true
    }];
  });
}

function paidFacts(
  data: AnalyticsData,
  activityRange: Pick<AnalyticsRange, "from" | "to">
): InvoiceFact[] {
  return data.invoiceRecords.flatMap((record) => {
    const event = (data.eventsByEntity.get(`${LifecycleEntityType.INVOICE}:${record.id}`) ?? [])
      .filter((candidate) =>
        candidate.toStatus === "Paid" &&
        candidate.fromStatus !== candidate.toStatus &&
        inRange(candidate.changedAt, activityRange, data.timeZone)
      )
      .at(-1);
    return event ? [{
      record,
      date: event.changedAt,
      event,
      value: event.valueSnapshot?.toNumber() ?? null,
      precision: event.precision,
      eligibilityKnown: true
    }] : [];
  });
}

type PeriodFacts = {
  requests: BaseRecord[];
  quotesCreated: QuoteRecord[];
  decisions: DecisionFact[];
  approved: DecisionFact[];
  revisions: RevisionRecord[];
  sentVersions: SentVersionRecord[];
  completions: CompletionFact[];
  issued: InvoiceFact[];
  paid: InvoiceFact[];
};

function periodFacts(
  data: AnalyticsData,
  activityRange: Pick<AnalyticsRange, "from" | "to">,
  asOfTo = activityRange.to
): PeriodFacts {
  const decisions = decisionFacts(data, activityRange, asOfTo);
  return {
    requests: data.requestRecords.filter((record) => inRange(record.createdAt, activityRange, data.timeZone)),
    quotesCreated: data.quoteRecords.filter((record) => inRange(record.createdAt, activityRange, data.timeZone)),
    decisions,
    approved: decisions.filter((fact) => fact.event.toStatus === "Approved"),
    revisions: data.revisionRecords.filter((record) => inRange(record.requestedAt, activityRange, data.timeZone)),
    sentVersions: data.sentVersionRecords.filter((record) => inRange(record.sentAt, activityRange, data.timeZone)),
    completions: completionFacts(data, activityRange),
    issued: invoiceIssueFacts(data, activityRange, asOfTo),
    paid: paidFacts(data, activityRange)
  };
}

function sum(values: Array<number | null | undefined>) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : null;
}

function percentDelta(current: number | null, comparison: number | null) {
  return current === null || comparison === null ? null : analyticsDelta(current, comparison);
}

function qualityFrom(
  knownCount: number,
  eligibleCount: number,
  precisions: Array<LifecycleEventPrecision | null | undefined> = [],
  note?: string,
  partialIsUnavailable = false
): AnalyticsMetricQuality {
  const exactCount = precisions.filter((precision) => precision === "EXACT").length;
  const estimatedCount = precisions.filter((precision) => precision === "ESTIMATED").length;
  let status: AnalyticsMetricQuality["status"];
  if (knownCount < eligibleCount) {
    status = partialIsUnavailable ? "unavailable" : "partial";
  } else if (estimatedCount && exactCount) {
    status = "mixed";
  } else if (estimatedCount) {
    status = "estimated";
  } else {
    status = "exact";
  }
  return { status, knownCount, eligibleCount, exactCount, estimatedCount, note };
}

function exactQuality(count: number, note?: string): AnalyticsMetricQuality {
  return qualityFrom(count, count, Array.from({ length: count }, () => "EXACT" as const), note);
}

function calculation(
  formula: string,
  scopeLabel: string,
  components: AnalyticsCalculation["components"],
  includes?: string[],
  excludes?: string[]
): AnalyticsCalculation {
  return { formula, scopeLabel, components, includes, excludes };
}

function makeKpi(input: AnalyticsKpi) {
  if (input.value !== null || input.quality.status === "unavailable") return input;
  return {
    ...input,
    quality: {
      ...input.quality,
      status: "unavailable" as const,
      note: input.quality.note ?? "No eligible records are available for this calculation in the selected period."
    }
  };
}

function series(
  key: string,
  label: string,
  format: AnalyticsValueFormat,
  color: string,
  mark: AnalyticsChartSeries["mark"] = "bar",
  axis: AnalyticsChartSeries["axis"] = "left",
  decimals?: number,
  stackId?: string
): AnalyticsChartSeries {
  return { key, label, format, color, mark, axis, decimals, stackId };
}

type BucketDatum = {
  seriesKey: string;
  date: Date;
  value: number;
  aggregate?: "sum" | "average";
  drilldown: Omit<AnalyticsDrilldown, "bucketFrom" | "bucketTo">;
};

function bucketPoints(
  range: Pick<AnalyticsRange, "from" | "to">,
  data: BucketDatum[],
  timeZone: string
): AnalyticsPoint[] {
  const length = rangeLength(range);
  const size = length <= 45 ? 7 : length <= 180 ? 14 : 30;
  const buckets: Array<{
    key: string;
    to: string;
    label: string;
    sums: Record<string, number>;
    counts: Record<string, number>;
    drilldowns: Record<string, AnalyticsDrilldown>;
  }> = [];
  for (let offset = 0; offset < length; offset += size) {
    const key = addDays(range.from, offset);
    const to = addDays(key, Math.min(size - 1, length - offset - 1));
    buckets.push({
      key,
      to,
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC"
      }).format(new Date(`${key}T12:00:00Z`)),
      sums: {},
      counts: {},
      drilldowns: {}
    });
  }
  for (const item of data) {
    const local = analyticsLocalDate(item.date, timeZone);
    if (local < range.from || local > range.to) continue;
    const index = Math.min(
      buckets.length - 1,
      Math.floor(
        (new Date(`${local}T12:00:00Z`).getTime() - new Date(`${range.from}T12:00:00Z`).getTime()) /
        dayMs /
        size
      )
    );
    const bucket = buckets[index];
    if (!bucket) continue;
    bucket.sums[item.seriesKey] = (bucket.sums[item.seriesKey] ?? 0) + item.value;
    bucket.counts[item.seriesKey] = (bucket.counts[item.seriesKey] ?? 0) + 1;
    bucket.drilldowns[item.seriesKey] = {
      ...item.drilldown,
      bucketFrom: bucket.key,
      bucketTo: bucket.to
    };
  }
  const averageKeys = new Set(data.filter((item) => item.aggregate === "average").map((item) => item.seriesKey));
  const seriesKeys = new Set(data.map((item) => item.seriesKey));
  return buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    values: Object.fromEntries([...seriesKeys].map((key) => [
      key,
      averageKeys.has(key)
        ? bucket.counts[key] ? bucket.sums[key] / bucket.counts[key] : null
        : bucket.sums[key] ?? 0
    ])),
    drilldowns: bucket.drilldowns
  }));
}

function activityChart(facts: PeriodFacts): AnalyticsChart {
  const stages = [
    { key: "requests", label: "New requests", value: facts.requests.length, metric: "requests.received" },
    { key: "quotes", label: "Quotes created", value: facts.quotesCreated.length, metric: "quotes.created" },
    { key: "approved", label: "Quotes approved", value: facts.approved.length, metric: "quotes.approved" },
    { key: "completed", label: "Projects completed", value: facts.completions.length, metric: "projects.completed" }
  ];
  return {
    id: "period-activity",
    title: "Period activity",
    description: "Independent activity totals in the selected period — not a sequential conversion funnel.",
    type: "column",
    layout: "standard",
    series: [series("count", "Records", "number", seriesColors.blue)],
    points: stages.map((stage) => ({
      key: stage.key,
      label: stage.label,
      values: { count: stage.value },
      drilldowns: { count: { metric: stage.metric, label: stage.label } }
    }))
  };
}

function valueMovementChart(data: AnalyticsData, facts: PeriodFacts): AnalyticsChart {
  const points = bucketPoints(data.range, [
    ...facts.approved.flatMap((fact) => fact.value === null ? [] : [{
      seriesKey: "approved",
      date: fact.event.changedAt,
      value: fact.value,
      drilldown: { metric: "quotes.approved", label: "Approved quote value" }
    }]),
    ...facts.completions.flatMap((fact) => fact.value === null ? [] : [{
      seriesKey: "completed",
      date: fact.event.changedAt,
      value: fact.value,
      drilldown: { metric: "projects.completed", label: "Completed project budget" }
    }]),
    ...facts.issued.flatMap((fact) => fact.value === null ? [] : [{
      seriesKey: "invoiced",
      date: fact.date,
      value: fact.value,
      drilldown: { metric: "invoices.issued", label: "Invoices issued" }
    }])
  ], data.timeZone);
  return {
    id: "value-movement",
    title: "Value moving through Pulse",
    description: "Captured values at approval, project completion, and invoice issue.",
    type: "column",
    layout: "wide",
    series: [
      series("approved", "Approved quotes", "currency", seriesColors.green),
      series("completed", "Completed budget", "currency", seriesColors.teal),
      series("invoiced", "Invoiced", "currency", seriesColors.amber)
    ],
    points
  };
}

function tradeDemandChart(
  facts: PeriodFacts,
  operations = false
): AnalyticsChart {
  const source = operations
    ? facts.completions.map((fact) => fact.record)
    : facts.requests;
  const trades = Array.from(new Set(source.flatMap((record) => record.trades)));
  const points: AnalyticsPoint[] = trades.map((trade): AnalyticsPoint => {
    const requests = facts.requests.filter((record) => record.trades.includes(trade));
    const approved = facts.approved.filter((fact) => fact.record.trades.includes(trade));
    const completed = facts.completions.filter((fact) => fact.record.trades.includes(trade));
    return operations ? {
      key: trade,
      label: trade,
      values: {
        completed: completed.length,
        duration: average(completed.flatMap((fact) => fact.projectDuration === null ? [] : [fact.projectDuration]))
      },
      drilldowns: {
        completed: { metric: "projects.trade", segment: trade, label: `${trade} completions` },
        duration: { metric: "projects.trade", segment: trade, label: `${trade} delivery duration` }
      }
    } : {
      key: trade,
      label: trade,
      values: {
        requests: requests.length,
        approvedValue: sum(approved.map((fact) => fact.value))
      },
      drilldowns: {
        requests: { metric: "requests.trade", segment: trade, label: `${trade} requests` },
        approvedValue: { metric: "quotes.approved.trade", segment: trade, label: `${trade} approved quotes` }
      }
    };
  }).filter((point) => Object.values(point.values).some((value) => value !== null && value !== 0))
    .sort((a, b) => (Number(b.values[operations ? "completed" : "requests"]) || 0) - (Number(a.values[operations ? "completed" : "requests"]) || 0))
    .slice(0, 10);

  return {
    id: operations ? "delivery-by-trade" : "demand-by-trade",
    title: operations ? "Delivery by trade" : "Demand by trade",
    description: operations
      ? "Completed projects with average recorded delivery duration."
      : "Selected-period request volume with captured approved quote value.",
    type: "combo",
    layout: "standard",
    orientation: "horizontal",
    series: operations
      ? [
          series("completed", "Completed", "number", seriesColors.teal),
          series("duration", "Average days", "duration", seriesColors.violet, "dot", "right", 1)
        ]
      : [
          series("requests", "Requests", "number", seriesColors.blue),
          series("approvedValue", "Approved value", "currency", seriesColors.violet, "dot", "right")
        ],
    points,
    overlapNotice: "Multi-trade records appear once in each applicable trade."
  };
}

function sourceChart(data: AnalyticsData, facts: PeriodFacts): AnalyticsChart {
  const groups = new Map<string, { requests: BaseRecord[]; converted: number }>();
  for (const record of facts.requests) {
    const key = record.source || "Other";
    const group = groups.get(key) ?? { requests: [], converted: 0 };
    group.requests.push(record);
    const converted = Boolean(record.quoteCreatedAt && onOrBefore(record.quoteCreatedAt, data.range.to, data.timeZone));
    if (converted) group.converted += 1;
    groups.set(key, group);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].requests.length - a[1].requests.length);
  const visible: Array<readonly [string, { requests: BaseRecord[]; converted: number }, string]> = sorted.length > 6
    ? [
        ...sorted.slice(0, 5).map(([key, group]) => [key, group, key] as const),
        ["__other__", {
          requests: sorted.slice(5).flatMap((entry) => entry[1].requests),
          converted: sum(sorted.slice(5).map((entry) => entry[1].converted))
        }, "__other__"] as const
      ]
    : sorted.map(([key, group]) => [key, group, key] as const);
  return {
    id: "request-sources",
    title: "Request sources",
    description: "A part-to-whole view of where selected-period demand originated.",
    type: "donut",
    layout: "standard",
    series: [
      series("requests", "Requests", "number", seriesColors.blue),
      series("converted", "Converted", "number", seriesColors.green, "dot")
    ],
    points: visible.map(([key, group, segment]) => ({
      key,
      label: key === "__other__" ? "Other" : key,
      values: { requests: group.requests.length, converted: group.converted },
      drilldowns: {
        requests: { metric: "requests.source", segment, label: `${key === "__other__" ? "Other" : key} requests` },
        converted: { metric: "requests.source_converted", segment, label: `${key === "__other__" ? "Other" : key} converted requests` }
      }
    }))
  };
}

function snapshotQuality(
  snapshots: SnapshotRecord[],
  qualifies: (snapshot: SnapshotRecord) => boolean,
  requiresValue: boolean,
  label: string
) {
  const fullyKnown = snapshots.filter((snapshot) =>
    snapshot.statusKnown && (!qualifies(snapshot) || !requiresValue || snapshot.valueKnown)
  );
  const precisions = fullyKnown.map((snapshot) => snapshot.precision);
  const partial = fullyKnown.length < snapshots.length;
  return qualityFrom(
    fullyKnown.length,
    snapshots.length,
    precisions,
    partial ? `${label} is a known lower bound; some historical states were not captured.` : undefined
  );
}

function viewPresentation(data: AnalyticsData, query: AnalyticsQuery | AnalyticsDetailsQuery) {
  const facts = periodFacts(data, data.range);
  const comparisonFacts = periodFacts(data, previousRange(data.range), data.range.compareTo);
  const quoteSnapshots = snapshotsAt(data, data.quoteRecords, data.range.to);
  const projectSnapshots = snapshotsAt(data, data.projectRecords, data.range.to);
  const invoiceSnapshots = snapshotsAt(data, data.invoiceRecords, data.range.to);

  const pipeline = quoteSnapshots.filter((snapshot) => snapshot.statusKnown && activeQuoteStatuses.has(snapshot.status ?? ""));
  const pipelineQuality = snapshotQuality(quoteSnapshots, (snapshot) => activeQuoteStatuses.has(snapshot.status ?? ""), true, "Open pipeline");
  const activeProjects = projectSnapshots.filter((snapshot) => snapshot.statusKnown && activeProjectStatuses.has(snapshot.status ?? ""));
  const activeProjectQuality = snapshotQuality(projectSnapshots, (snapshot) => activeProjectStatuses.has(snapshot.status ?? ""), true, "Active project budget");
  const receivables = invoiceSnapshots.filter((snapshot) => snapshot.statusKnown && receivableStatuses.has(snapshot.status ?? ""));
  const receivableQuality = snapshotQuality(invoiceSnapshots, (snapshot) => receivableStatuses.has(snapshot.status ?? ""), true, "Outstanding receivables");
  const asOf = new Date(`${data.range.to}T12:00:00Z`);
  const overdue = receivables.filter((snapshot) =>
    snapshot.dueDate !== undefined && snapshot.dueDate !== null &&
    analyticsLocalDate(snapshot.dueDate, data.timeZone) < data.range.to
  );
  const overdueKnown = invoiceSnapshots.filter((snapshot) => {
    if (!snapshot.statusKnown) return false;
    if (!receivableStatuses.has(snapshot.status ?? "")) return true;
    if (snapshot.dueDate === undefined) return false;
    if (snapshot.dueDate === null || analyticsLocalDate(snapshot.dueDate, data.timeZone) >= data.range.to) return true;
    return snapshot.valueKnown;
  });
  const overdueQuality = qualityFrom(
    overdueKnown.length,
    invoiceSnapshots.length,
    overdueKnown.map((snapshot) => snapshot.precision),
    overdueKnown.length < invoiceSnapshots.length
      ? "Overdue AR is a known lower bound because some historical due dates or states were not captured."
      : undefined
  );

  const currentWinRate = calculateWinRate(facts.decisions.map((fact) => fact.event.toStatus));
  const comparisonWinRate = calculateWinRate(comparisonFacts.decisions.map((fact) => fact.event.toStatus));
  const winQuality = qualityFrom(
    facts.decisions.length,
    facts.decisions.length,
    facts.decisions.map((fact) => fact.event.precision)
  );

  const onTimeEligible = facts.completions.filter((fact) => fact.dueDate !== null && fact.dueDate !== undefined);
  const onTimeUnknown = facts.completions.filter((fact) => fact.dueDate === undefined);
  const onTimeValue = onTimeUnknown.length
    ? null
    : onTimeEligible.length
      ? onTimeEligible.filter((fact) => isOnTimeLocalDate(fact.event.changedAt, fact.dueDate!, data.timeZone)).length / onTimeEligible.length
      : null;
  const comparisonOnTimeEligible = comparisonFacts.completions.filter((fact) => fact.dueDate !== null && fact.dueDate !== undefined);
  const comparisonOnTimeUnknown = comparisonFacts.completions.filter((fact) => fact.dueDate === undefined);
  const comparisonOnTime = comparisonOnTimeUnknown.length || !comparisonOnTimeEligible.length
    ? null
    : comparisonOnTimeEligible.filter((fact) => isOnTimeLocalDate(fact.event.changedAt, fact.dueDate!, data.timeZone)).length / comparisonOnTimeEligible.length;
  const onTimeQuality: AnalyticsMetricQuality = !onTimeEligible.length && !onTimeUnknown.length
    ? {
        status: "unavailable",
        knownCount: facts.completions.length,
        eligibleCount: facts.completions.length,
        exactCount: 0,
        estimatedCount: 0,
        note: "No completed project with a due date is available in this period."
      }
    : qualityFrom(
        facts.completions.length - onTimeUnknown.length,
        facts.completions.length,
        facts.completions.map((fact) => fact.event.precision),
        onTimeUnknown.length
          ? "Unavailable because uncaptured due dates could change the rate. Projects with an explicitly missing due date are excluded."
          : "Projects with no due date are excluded from the denominator.",
        true
      );

  const issuedKnown = facts.issued.filter((fact) => fact.eligibilityKnown && fact.value !== null);
  const comparisonIssuedKnown = comparisonFacts.issued.filter((fact) => fact.eligibilityKnown && fact.value !== null);
  const invoicedValue = sum(issuedKnown.map((fact) => fact.value));
  const comparisonInvoicedValue = sum(comparisonIssuedKnown.map((fact) => fact.value));
  const invoicedQuality = qualityFrom(
    issuedKnown.length,
    facts.issued.length,
    issuedKnown.map((fact) => fact.precision),
    issuedKnown.length < facts.issued.length
      ? "This is a known lower bound; one or more issue-time values or historical states were not captured."
      : undefined
  );

  const approvedKnownValues = facts.approved.filter((fact) => fact.value !== null);
  const comparisonApprovedKnown = comparisonFacts.approved.filter((fact) => fact.value !== null);
  const averageApproved = approvedKnownValues.length === facts.approved.length
    ? average(approvedKnownValues.map((fact) => fact.value!))
    : null;
  const comparisonAverageApproved = comparisonApprovedKnown.length === comparisonFacts.approved.length
    ? average(comparisonApprovedKnown.map((fact) => fact.value!))
    : null;
  const approvedAverageQuality = qualityFrom(
    approvedKnownValues.length,
    facts.approved.length,
    facts.approved.map((fact) => fact.event.precision),
    approvedKnownValues.length < facts.approved.length
      ? "Unavailable because missing approval snapshots could change the average."
      : undefined,
    true
  );

  const marginKnown = facts.approved.filter((fact) => fact.marginKnown);
  const marginParts = marginKnown.flatMap((fact) => fact.margin ? [fact.margin] : []);
  const marginUnknown = facts.approved.filter((fact) => !fact.marginKnown);
  const marginRevenue = sum(marginParts.map((part) => part.revenue));
  const marginCost = sum(marginParts.map((part) => part.cost));
  const marginValue = marginUnknown.length || !marginRevenue ? null : (marginRevenue - marginCost) / marginRevenue;
  const comparisonMarginKnown = comparisonFacts.approved.filter((fact) => fact.marginKnown);
  const comparisonMarginParts = comparisonMarginKnown.flatMap((fact) => fact.margin ? [fact.margin] : []);
  const comparisonMarginRevenue = sum(comparisonMarginParts.map((part) => part.revenue));
  const comparisonMarginCost = sum(comparisonMarginParts.map((part) => part.cost));
  const comparisonMargin = comparisonMarginKnown.length !== comparisonFacts.approved.length || !comparisonMarginRevenue
    ? null
    : (comparisonMarginRevenue - comparisonMarginCost) / comparisonMarginRevenue;
  const marginQuality: AnalyticsMetricQuality = !marginRevenue && !marginUnknown.length
    ? {
        status: "unavailable",
        knownCount: marginKnown.length,
        eligibleCount: facts.approved.length,
        exactCount: facts.approved.filter((fact) => fact.event.precision === "EXACT").length,
        estimatedCount: facts.approved.filter((fact) => fact.event.precision === "ESTIMATED").length,
        note: "No approved quote with revenue-bearing lines is available in this period. Zero unit cost is treated as a valid cost."
      }
    : qualityFrom(
        marginKnown.length,
        facts.approved.length,
        facts.approved.map((fact) => fact.event.precision),
        marginUnknown.length
          ? "Unavailable because uncaptured line-cost snapshots could change the weighted margin. Zero unit cost is treated as a valid cost."
          : `${marginParts.length} of ${facts.approved.length} approved quotes had revenue-bearing lines; zero unit cost is treated as valid.`,
        true
      );

  const quoteTurnaround = facts.quotesCreated.flatMap((record) =>
    record.requestReceivedAt ? [daysBetween(record.requestReceivedAt, record.createdAt)] : []
  );
  const comparisonTurnaround = comparisonFacts.quotesCreated.flatMap((record) =>
    record.requestReceivedAt ? [daysBetween(record.requestReceivedAt, record.createdAt)] : []
  );

  const revisionReturnCount = facts.sentVersions.filter((version) =>
    version.returnedAt && onOrBefore(version.returnedAt, data.range.to, data.timeZone)
  ).length;
  const comparisonRevisionReturnCount = comparisonFacts.sentVersions.filter((version) =>
    version.returnedAt && onOrBefore(version.returnedAt, data.range.compareTo, data.timeZone)
  ).length;
  const revisionRate = facts.sentVersions.length ? revisionReturnCount / facts.sentVersions.length : null;
  const comparisonRevisionRate = comparisonFacts.sentVersions.length
    ? comparisonRevisionReturnCount / comparisonFacts.sentVersions.length
    : null;
  const revisionAverage = calculateAverageRevisions(facts.revisions.map((record) => record.quoteId));
  const comparisonRevisionAverage = calculateAverageRevisions(comparisonFacts.revisions.map((record) => record.quoteId));

  const projectDurations = facts.completions.flatMap((fact) => fact.projectDuration === null ? [] : [fact.projectDuration]);
  const comparisonProjectDurations = comparisonFacts.completions.flatMap((fact) => fact.projectDuration === null ? [] : [fact.projectDuration]);
  const projectDurationUnknown = facts.completions.filter((fact) => fact.startDate === undefined).length;
  const comparisonProjectDurationUnknown = comparisonFacts.completions.filter((fact) => fact.startDate === undefined).length;
  const projectDurationValue = projectDurationUnknown ? null : average(projectDurations);
  const comparisonProjectDurationValue = comparisonProjectDurationUnknown ? null : average(comparisonProjectDurations);
  const endToEndDurations = facts.completions.flatMap((fact) => fact.endToEndDuration === null ? [] : [fact.endToEndDuration]);
  const comparisonEndToEndDurations = comparisonFacts.completions.flatMap((fact) => fact.endToEndDuration === null ? [] : [fact.endToEndDuration]);

  const paidKnown = facts.paid.filter((fact) => fact.value !== null);
  const comparisonPaidKnown = comparisonFacts.paid.filter((fact) => fact.value !== null);
  const paidDurations = facts.paid.flatMap((fact) => {
    const issued = fact.event ? metadataDate(fact.event.metadata, "issuedDate") : undefined;
    return fact.event && issued instanceof Date ? [daysBetween(issued, fact.event.changedAt)] : [];
  });
  const comparisonPaidDurations = comparisonFacts.paid.flatMap((fact) => {
    const issued = fact.event ? metadataDate(fact.event.metadata, "issuedDate") : undefined;
    return fact.event && issued instanceof Date ? [daysBetween(issued, fact.event.changedAt)] : [];
  });
  const paidDurationUnknown = paidDurations.length < facts.paid.length;
  const comparisonPaidDurationUnknown = comparisonPaidDurations.length < comparisonFacts.paid.length;
  const paidDurationValue = paidDurationUnknown ? null : average(paidDurations);
  const comparisonPaidDurationValue = comparisonPaidDurationUnknown ? null : average(comparisonPaidDurations);

  const activeProjectCountQuality = snapshotQuality(projectSnapshots, (snapshot) => activeProjectStatuses.has(snapshot.status ?? ""), false, "Active projects");
  const overdueProjectKnown = projectSnapshots.filter((snapshot) =>
    snapshot.statusKnown &&
    (!activeProjectStatuses.has(snapshot.status ?? "") || snapshot.dueDate !== undefined)
  );
  const overdueProjects = projectSnapshots.filter((snapshot) =>
    snapshot.statusKnown &&
    activeProjectStatuses.has(snapshot.status ?? "") &&
    snapshot.dueDate !== undefined &&
    snapshot.dueDate !== null &&
    analyticsLocalDate(snapshot.dueDate, data.timeZone) < data.range.to
  );

  const commonActivity = activityChart(facts);
  const commonValue = valueMovementChart(data, facts);
  let kpis: AnalyticsKpi[] = [];
  let charts: AnalyticsChart[] = [];

  if (query.view === "overview") {
    kpis = [
      makeKpi({
        id: "open-pipeline",
        label: "Open quote pipeline",
        description: "Draft, review, and sent quote value",
        value: sum(pipeline.map((snapshot) => snapshot.value)),
        format: "currency",
        scope: "asOf",
        favorableDirection: "up",
        metric: "quotes.pipeline",
        calculation: calculation(
          "Sum of captured quote value in Draft, Review, or Sent",
          `As of ${data.range.to}`,
          [
            { label: "Open quotes", value: pipeline.length, format: "number" },
            { label: "Captured value", value: sum(pipeline.map((snapshot) => snapshot.value)), format: "currency" }
          ],
          ["Quotes created by the selected end date, including records archived later"],
          ["Approved, rejected, expired, and cancelled quotes"]
        ),
        quality: pipelineQuality
      }),
      makeKpi({
        id: "win-rate",
        label: "Quote win rate",
        description: "Approved share of final quote decisions",
        value: currentWinRate,
        comparisonValue: comparisonWinRate,
        deltaPercent: percentDelta(currentWinRate, comparisonWinRate),
        format: "percent",
        decimals: 1,
        scope: "period",
        favorableDirection: "up",
        metric: "quotes.decisions",
        calculation: calculation(
          "Approved ÷ (Approved + Rejected + Expired)",
          data.range.label,
          [
            { label: "Approved", value: facts.approved.length, format: "number" },
            { label: "Decisions", value: facts.decisions.length, format: "number" }
          ],
          ["Latest eligible quote-family decision in the period"],
          ["Cancelled decisions", "Decisions superseded by a revision by period end"]
        ),
        quality: winQuality
      }),
      makeKpi({
        id: "active-project-value",
        label: "Active project budget",
        description: "Ready, in-progress, field-work, and held budget",
        value: sum(activeProjects.map((snapshot) => snapshot.value)),
        format: "currency",
        scope: "asOf",
        favorableDirection: "neutral",
        metric: "projects.active",
        calculation: calculation(
          "Sum of captured budget for active project statuses",
          `As of ${data.range.to}`,
          [
            { label: "Active projects", value: activeProjects.length, format: "number" },
            { label: "Captured budget", value: sum(activeProjects.map((snapshot) => snapshot.value)), format: "currency" }
          ],
          ["Ready, In Progress, Field Work, and On Hold"],
          ["Completed and cancelled projects"]
        ),
        quality: activeProjectQuality
      }),
      makeKpi({
        id: "on-time",
        label: "On-time completion",
        description: "Completed on or before the local due date",
        value: onTimeValue,
        comparisonValue: comparisonOnTime,
        deltaPercent: percentDelta(onTimeValue, comparisonOnTime),
        format: "percent",
        decimals: 1,
        scope: "period",
        favorableDirection: "up",
        metric: "projects.on_time",
        calculation: calculation(
          "On-time completions ÷ completions with a due date",
          data.range.label,
          [
            { label: "On time", value: onTimeValue === null ? null : Math.round(onTimeValue * onTimeEligible.length), format: "number" },
            { label: "With due date", value: onTimeEligible.length, format: "number" }
          ],
          ["Workspace-local completion and due calendar dates"],
          ["Projects explicitly recorded without a due date"]
        ),
        quality: onTimeQuality
      }),
      makeKpi({
        id: "invoiced",
        label: "Invoiced",
        description: "Captured value when invoices were issued",
        value: invoicedValue,
        comparisonValue: comparisonInvoicedValue,
        deltaPercent: analyticsDelta(invoicedValue, comparisonInvoicedValue),
        format: "currency",
        scope: "period",
        favorableDirection: "up",
        metric: "invoices.issued",
        calculation: calculation(
          "Sum of issue-time invoice value",
          data.range.label,
          [
            { label: "Issued invoices", value: facts.issued.length, format: "number" },
            { label: "Captured value", value: invoicedValue, format: "currency" }
          ],
          ["Invoices issued in the period and not void as of period end"],
          ["Draft invoices without an issue date", "Invoices void by period end"]
        ),
        quality: invoicedQuality
      }),
      makeKpi({
        id: "overdue-ar",
        label: "Overdue receivables",
        description: "Unpaid value past its local due date",
        value: sum(overdue.map((snapshot) => snapshot.value)),
        format: "currency",
        scope: "asOf",
        favorableDirection: "down",
        metric: "invoices.overdue",
        calculation: calculation(
          "Sum of Sent or Overdue invoice value with due date before period end",
          `As of ${data.range.to}`,
          [
            { label: "Overdue invoices", value: overdue.length, format: "number" },
            { label: "Overdue value", value: sum(overdue.map((snapshot) => snapshot.value)), format: "currency" }
          ]
        ),
        quality: overdueQuality
      })
    ];
    charts = [commonActivity, commonValue, tradeDemandChart(facts)];
  }

  if (query.view === "sales") {
    kpis = [
      makeKpi({
        id: "new-requests",
        label: "New requests",
        description: "Requests received in the selected period",
        value: facts.requests.length,
        comparisonValue: comparisonFacts.requests.length,
        deltaPercent: analyticsDelta(facts.requests.length, comparisonFacts.requests.length),
        format: "number",
        scope: "period",
        favorableDirection: "up",
        metric: "requests.received",
        calculation: calculation("Count of requests by received date", data.range.label, [
          { label: "Requests", value: facts.requests.length, format: "number" }
        ], ["Archived requests remain in historical activity"]),
        quality: exactQuality(facts.requests.length)
      }),
      makeKpi({
        id: "active-quote-value",
        label: "Active quote value",
        description: "Draft, review, and sent quote value",
        value: sum(pipeline.map((snapshot) => snapshot.value)),
        format: "currency",
        scope: "asOf",
        favorableDirection: "up",
        metric: "quotes.pipeline",
        calculation: calculation("Sum of captured value in active quote statuses", `As of ${data.range.to}`, [
          { label: "Open quotes", value: pipeline.length, format: "number" },
          { label: "Captured value", value: sum(pipeline.map((snapshot) => snapshot.value)), format: "currency" }
        ]),
        quality: pipelineQuality
      }),
      makeKpi({
        id: "sales-win-rate",
        label: "Win rate",
        description: "Approved share of final decisions",
        value: currentWinRate,
        comparisonValue: comparisonWinRate,
        deltaPercent: percentDelta(currentWinRate, comparisonWinRate),
        format: "percent",
        decimals: 1,
        scope: "period",
        favorableDirection: "up",
        metric: "quotes.decisions",
        calculation: calculation("Approved ÷ (Approved + Rejected + Expired)", data.range.label, [
          { label: "Approved", value: facts.approved.length, format: "number" },
          { label: "Decisions", value: facts.decisions.length, format: "number" }
        ], ["Latest eligible quote-family decisions"], ["Cancelled and revision-superseded decisions"]),
        quality: winQuality
      }),
      makeKpi({
        id: "request-to-quote",
        label: "Request to quote",
        description: "Average intake-to-original-quote time",
        value: average(quoteTurnaround),
        comparisonValue: average(comparisonTurnaround),
        deltaPercent: percentDelta(average(quoteTurnaround), average(comparisonTurnaround)),
        format: "duration",
        decimals: 1,
        scope: "period",
        favorableDirection: "down",
        metric: "quotes.turnaround",
        calculation: calculation("Average of original quote created date − linked request received date", data.range.label, [
          { label: "Linked quotes", value: quoteTurnaround.length, format: "number" },
          { label: "Average days", value: average(quoteTurnaround), format: "duration", decimals: 1 }
        ], ["Original quote-family creation only"], ["Quotes without a linked request"]),
        quality: exactQuality(quoteTurnaround.length)
      }),
      makeKpi({
        id: "average-approved",
        label: "Average approved quote",
        description: "Mean captured value at final approval",
        value: averageApproved,
        comparisonValue: comparisonAverageApproved,
        deltaPercent: percentDelta(averageApproved, comparisonAverageApproved),
        format: "currency",
        scope: "period",
        favorableDirection: "up",
        metric: "quotes.approved",
        calculation: calculation("Captured approved value ÷ approved quote families", data.range.label, [
          { label: "Approved quotes", value: facts.approved.length, format: "number" },
          { label: "Captured value", value: sum(approvedKnownValues.map((fact) => fact.value)), format: "currency" }
        ]),
        quality: approvedAverageQuality
      }),
      makeKpi({
        id: "quoted-margin",
        label: "Quoted margin",
        description: "Revenue-weighted pre-tax line margin",
        value: marginValue,
        comparisonValue: comparisonMargin,
        deltaPercent: percentDelta(marginValue, comparisonMargin),
        format: "percent",
        decimals: 1,
        scope: "period",
        favorableDirection: "up",
        metric: "quotes.margin",
        calculation: calculation("(Revenue − quantity × unit cost) ÷ revenue", data.range.label, [
          { label: "Revenue-bearing quotes", value: marginParts.length, format: "number" },
          { label: "Captured revenue", value: marginRevenue, format: "currency" },
          { label: "Captured cost", value: marginCost, format: "currency" }
        ], ["Positive-revenue lines", "$0 unit cost as a valid recorded cost"], [
          "Quotes without revenue-bearing lines",
          "Legacy-imported quotes without captured cost snapshots"
        ]),
        quality: marginQuality
      }),
      makeKpi({
        id: "revision-requests",
        label: "Revision requests",
        description: "Client-requested quote returns",
        value: facts.revisions.length,
        comparisonValue: comparisonFacts.revisions.length,
        deltaPercent: analyticsDelta(facts.revisions.length, comparisonFacts.revisions.length),
        format: "number",
        scope: "period",
        favorableDirection: "down",
        metric: "quotes.revisions.requested",
        calculation: calculation("Count of revision-request timestamps", data.range.label, [
          { label: "Revision requests", value: facts.revisions.length, format: "number" }
        ]),
        quality: qualityFrom(facts.revisions.length, facts.revisions.length, facts.revisions.map((record) => record.precision))
      }),
      makeKpi({
        id: "revision-rate",
        label: "Revision return rate",
        description: "Sent versions returned by period end",
        value: revisionRate,
        comparisonValue: comparisonRevisionRate,
        deltaPercent: percentDelta(revisionRate, comparisonRevisionRate),
        format: "percent",
        decimals: 1,
        scope: "period",
        favorableDirection: "down",
        metric: "quotes.revisions.sent",
        calculation: calculation("Sent quote versions later returned by period end ÷ versions sent in the period", data.range.label, [
          { label: "Returned", value: revisionReturnCount, format: "number" },
          { label: "Sent versions", value: facts.sentVersions.length, format: "number" }
        ]),
        quality: qualityFrom(facts.sentVersions.length, facts.sentVersions.length, facts.sentVersions.map((record) => record.precision))
      }),
      makeKpi({
        id: "revision-average",
        label: "Revisions per affected quote",
        description: "Return frequency among revised quote families",
        value: revisionAverage,
        comparisonValue: comparisonRevisionAverage,
        deltaPercent: percentDelta(revisionAverage, comparisonRevisionAverage),
        format: "number",
        decimals: 1,
        scope: "period",
        favorableDirection: "down",
        metric: "quotes.revisions.requested",
        calculation: calculation("Revision requests ÷ distinct affected quote families", data.range.label, [
          { label: "Revision requests", value: facts.revisions.length, format: "number" },
          { label: "Affected families", value: new Set(facts.revisions.map((record) => record.quoteId)).size, format: "number" }
        ]),
        quality: qualityFrom(facts.revisions.length, facts.revisions.length, facts.revisions.map((record) => record.precision))
      })
    ];

    const salesActivity = bucketPoints(data.range, [
      ...facts.requests.map((record) => ({ seriesKey: "requests", date: record.createdAt, value: 1, drilldown: { metric: "requests.received", label: "Requests received" } })),
      ...facts.quotesCreated.map((record) => ({ seriesKey: "quotes", date: record.createdAt, value: 1, drilldown: { metric: "quotes.created", label: "Quotes created" } })),
      ...facts.approved.map((fact) => ({ seriesKey: "approved", date: fact.event.changedAt, value: 1, drilldown: { metric: "quotes.approved", label: "Quotes approved" } })),
      ...facts.revisions.map((record) => ({ seriesKey: "revisions", date: record.requestedAt, value: 1, drilldown: { metric: "quotes.revisions.requested", label: "Revision requests" } }))
    ], data.timeZone);
    const approvedValue = bucketPoints(data.range, facts.approved.flatMap((fact) => fact.value === null ? [] : [{
      seriesKey: "value",
      date: fact.event.changedAt,
      value: fact.value,
      drilldown: { metric: "quotes.approved", label: "Approved quote value" }
    }]), data.timeZone);

    const revisionClients = new Map<string, { revisions: number; sent: number; returned: number }>();
    for (const record of facts.revisions) {
      const group = revisionClients.get(record.client) ?? { revisions: 0, sent: 0, returned: 0 };
      group.revisions += 1;
      revisionClients.set(record.client, group);
    }
    for (const version of facts.sentVersions) {
      const group = revisionClients.get(version.client) ?? { revisions: 0, sent: 0, returned: 0 };
      group.sent += 1;
      if (version.returnedAt && onOrBefore(version.returnedAt, data.range.to, data.timeZone)) group.returned += 1;
      revisionClients.set(version.client, group);
    }
    charts = [
      {
        id: "sales-activity",
        title: "Sales activity",
        description: "Independent request, original quote, approval, and revision activity by period bucket.",
        type: "column",
        layout: "wide",
        series: [
          series("requests", "Requests", "number", seriesColors.blue),
          series("quotes", "Quotes", "number", seriesColors.violet),
          series("approved", "Approvals", "number", seriesColors.green),
          series("revisions", "Revisions", "number", seriesColors.amber)
        ],
        points: salesActivity
      },
      {
        id: "approved-value",
        title: "Approved quote value",
        description: "Captured quote value at final approval.",
        type: "column",
        layout: "standard",
        series: [series("value", "Approved value", "currency", seriesColors.green)],
        points: approvedValue
      },
      sourceChart(data, facts),
      {
        id: "client-revisions",
        title: "Client revision behavior",
        description: "Revision requests with sent-version return rate on a separate scale.",
        type: "combo",
        layout: "standard",
        orientation: "horizontal",
        series: [
          series("revisions", "Revision requests", "number", seriesColors.amber),
          series("rate", "Return rate", "percent", seriesColors.violet, "dot", "right", 1)
        ],
        points: [...revisionClients.entries()]
          .map(([key, group]) => ({
            key,
            label: key,
            values: { revisions: group.revisions, rate: group.sent ? group.returned / group.sent : null },
            drilldowns: {
              revisions: { metric: "quotes.revisions.client", segment: key, label: `${key} revisions` },
              rate: { metric: "quotes.revisions.sent_client", segment: key, label: `${key} sent versions` }
            }
          }))
          .filter((point) => point.values.revisions > 0 || point.values.rate !== null)
          .sort((a, b) => b.values.revisions - a.values.revisions)
          .slice(0, 8)
      },
      tradeDemandChart(facts)
    ];
  }

  if (query.view === "operations") {
    const completedQuality = qualityFrom(facts.completions.length, facts.completions.length, facts.completions.map((fact) => fact.event.precision));
    const projectDurationQuality = qualityFrom(
      projectDurations.length,
      projectDurations.length + projectDurationUnknown,
      facts.completions.filter((fact) => fact.startDate !== null).map((fact) => fact.event.precision),
      projectDurationUnknown
        ? "Unavailable because an uncaptured project start could change the average. Projects explicitly recorded without a start are excluded."
        : "Projects explicitly recorded without a start are excluded.",
      true
    );
    const endToEndQuality = qualityFrom(
      endToEndDurations.length,
      facts.completions.length,
      facts.completions.map((fact) => fact.event.precision),
      endToEndDurations.length < facts.completions.length ? "Completions without a linked request are excluded." : undefined
    );
    const overdueProjectQuality = qualityFrom(
      overdueProjectKnown.length,
      projectSnapshots.length,
      overdueProjectKnown.map((snapshot) => snapshot.precision),
      overdueProjectKnown.length < projectSnapshots.length
        ? "This is a known lower bound because some historical due dates or states were not captured."
        : undefined
    );
    kpis = [
      makeKpi({
        id: "active-projects",
        label: "Active projects",
        description: "Ready, in progress, field work, and on hold",
        value: activeProjects.length,
        format: "number",
        scope: "asOf",
        favorableDirection: "neutral",
        metric: "projects.active",
        calculation: calculation("Count of projects in active delivery statuses", `As of ${data.range.to}`, [
          { label: "Active projects", value: activeProjects.length, format: "number" }
        ]),
        quality: activeProjectCountQuality
      }),
      makeKpi({
        id: "completed-projects",
        label: "Projects completed",
        description: "Completion transitions in the period",
        value: facts.completions.length,
        comparisonValue: comparisonFacts.completions.length,
        deltaPercent: analyticsDelta(facts.completions.length, comparisonFacts.completions.length),
        format: "number",
        scope: "period",
        favorableDirection: "up",
        metric: "projects.completed",
        calculation: calculation("Count of projects entering Completed", data.range.label, [
          { label: "Completed", value: facts.completions.length, format: "number" }
        ]),
        quality: completedQuality
      }),
      makeKpi({
        id: "operations-on-time",
        label: "On-time completion",
        description: "Completed on or before the local due date",
        value: onTimeValue,
        comparisonValue: comparisonOnTime,
        deltaPercent: percentDelta(onTimeValue, comparisonOnTime),
        format: "percent",
        decimals: 1,
        scope: "period",
        favorableDirection: "up",
        metric: "projects.on_time",
        calculation: calculation("On-time completions ÷ completions with a due date", data.range.label, [
          { label: "With due date", value: onTimeEligible.length, format: "number" },
          { label: "Completion rate", value: onTimeValue, format: "percent", decimals: 1 }
        ], ["Workspace-local calendar dates"], ["Projects explicitly recorded without a due date"]),
        quality: onTimeQuality
      }),
      makeKpi({
        id: "project-duration",
        label: "Project duration",
        description: "Recorded project start to completion",
        value: projectDurationValue,
        comparisonValue: comparisonProjectDurationValue,
        deltaPercent: percentDelta(projectDurationValue, comparisonProjectDurationValue),
        format: "duration",
        decimals: 1,
        scope: "period",
        favorableDirection: "down",
        metric: "projects.duration",
        calculation: calculation("Average completion time − recorded project start", data.range.label, [
          { label: "Measured projects", value: projectDurations.length, format: "number" },
          { label: "Average days", value: average(projectDurations), format: "duration", decimals: 1 }
        ]),
        quality: projectDurationQuality
      }),
      makeKpi({
        id: "end-to-end",
        label: "Request to completion",
        description: "Linked intake through project completion",
        value: average(endToEndDurations),
        comparisonValue: average(comparisonEndToEndDurations),
        deltaPercent: percentDelta(average(endToEndDurations), average(comparisonEndToEndDurations)),
        format: "duration",
        decimals: 1,
        scope: "period",
        favorableDirection: "down",
        metric: "projects.end_to_end",
        calculation: calculation("Average completion time − linked request received time", data.range.label, [
          { label: "Linked projects", value: endToEndDurations.length, format: "number" },
          { label: "Average days", value: average(endToEndDurations), format: "duration", decimals: 1 }
        ]),
        quality: endToEndQuality
      }),
      makeKpi({
        id: "overdue-projects",
        label: "Overdue projects",
        description: "Active work past its local due date",
        value: overdueProjects.length,
        format: "number",
        scope: "asOf",
        favorableDirection: "down",
        metric: "projects.overdue",
        calculation: calculation("Count of active projects with due date before period end", `As of ${data.range.to}`, [
          { label: "Overdue projects", value: overdueProjects.length, format: "number" }
        ]),
        quality: overdueProjectQuality
      })
    ];

    const completionTrend = bucketPoints(data.range, [
      ...facts.completions.map((fact) => ({
        seriesKey: "completed",
        date: fact.event.changedAt,
        value: 1,
        drilldown: { metric: "projects.completed", label: "Completed projects" }
      })),
      ...facts.completions.flatMap((fact) => fact.projectDuration === null ? [] : [{
        seriesKey: "duration",
        date: fact.event.changedAt,
        value: fact.projectDuration,
        aggregate: "average" as const,
        drilldown: { metric: "projects.duration", label: "Project duration" }
      }])
    ], data.timeZone);
    const statuses = new Map<string, number>();
    for (const snapshot of activeProjects) {
      const status = snapshot.status ?? "Unknown";
      statuses.set(status, (statuses.get(status) ?? 0) + 1);
    }
    charts = [
      {
        id: "completion-velocity",
        title: "Completion velocity",
        description: "Completion count and average duration use separate scales.",
        type: "combo",
        layout: "wide",
        series: [
          series("completed", "Completed", "number", seriesColors.teal),
          series("duration", "Average days", "duration", seriesColors.violet, "line", "right", 1)
        ],
        points: completionTrend
      },
      {
        id: "project-status",
        title: "Active project status",
        description: `Portfolio composition as of ${data.range.to}.`,
        type: "donut",
        layout: "standard",
        series: [series("projects", "Projects", "number", seriesColors.teal)],
        points: [...statuses.entries()].map(([key, value]) => ({
          key,
          label: key,
          values: { projects: value },
          drilldowns: { projects: { metric: "projects.status", segment: key, label: `${key} projects` } }
        }))
      },
      tradeDemandChart(facts, true)
    ];
  }

  if (query.view === "billing") {
    const paidQuality = qualityFrom(
      paidKnown.length,
      facts.paid.length,
      facts.paid.map((fact) => fact.precision),
      paidKnown.length < facts.paid.length ? "This is a known lower bound because some paid-value snapshots are missing." : undefined
    );
    kpis = [
      makeKpi({
        id: "billing-invoiced",
        label: "Invoiced",
        description: "Captured value when invoices were issued",
        value: invoicedValue,
        comparisonValue: comparisonInvoicedValue,
        deltaPercent: analyticsDelta(invoicedValue, comparisonInvoicedValue),
        format: "currency",
        scope: "period",
        favorableDirection: "up",
        metric: "invoices.issued",
        calculation: calculation("Sum of issue-time invoice value", data.range.label, [
          { label: "Issued invoices", value: facts.issued.length, format: "number" },
          { label: "Captured value", value: invoicedValue, format: "currency" }
        ], ["Not void as of period end"]),
        quality: invoicedQuality
      }),
      makeKpi({
        id: "marked-paid",
        label: "Marked paid",
        description: "Captured value entering Paid",
        value: sum(paidKnown.map((fact) => fact.value)),
        comparisonValue: sum(comparisonPaidKnown.map((fact) => fact.value)),
        deltaPercent: analyticsDelta(sum(paidKnown.map((fact) => fact.value)), sum(comparisonPaidKnown.map((fact) => fact.value))),
        format: "currency",
        scope: "period",
        favorableDirection: "up",
        metric: "invoices.paid",
        calculation: calculation("Sum of invoice value captured at Paid transition", data.range.label, [
          { label: "Paid invoices", value: facts.paid.length, format: "number" },
          { label: "Captured value", value: sum(paidKnown.map((fact) => fact.value)), format: "currency" }
        ]),
        quality: paidQuality
      }),
      makeKpi({
        id: "outstanding-ar",
        label: "Outstanding AR",
        description: "Sent and overdue invoice value",
        value: sum(receivables.map((snapshot) => snapshot.value)),
        format: "currency",
        scope: "asOf",
        favorableDirection: "down",
        metric: "invoices.outstanding",
        calculation: calculation("Sum of captured value for Sent and Overdue invoices", `As of ${data.range.to}`, [
          { label: "Open invoices", value: receivables.length, format: "number" },
          { label: "Outstanding", value: sum(receivables.map((snapshot) => snapshot.value)), format: "currency" }
        ]),
        quality: receivableQuality
      }),
      makeKpi({
        id: "billing-overdue-ar",
        label: "Overdue AR",
        description: "Outstanding value past due",
        value: sum(overdue.map((snapshot) => snapshot.value)),
        format: "currency",
        scope: "asOf",
        favorableDirection: "down",
        metric: "invoices.overdue",
        calculation: calculation("Outstanding value with due date before period end", `As of ${data.range.to}`, [
          { label: "Overdue invoices", value: overdue.length, format: "number" },
          { label: "Overdue value", value: sum(overdue.map((snapshot) => snapshot.value)), format: "currency" }
        ]),
        quality: overdueQuality
      }),
      makeKpi({
        id: "days-to-pay",
        label: "Issue to paid",
        description: "Average elapsed days for paid invoices",
        value: paidDurationValue,
        comparisonValue: comparisonPaidDurationValue,
        deltaPercent: percentDelta(paidDurationValue, comparisonPaidDurationValue),
        format: "duration",
        decimals: 1,
        scope: "period",
        favorableDirection: "down",
        metric: "invoices.paid",
        calculation: calculation("Average Paid transition − issued date", data.range.label, [
          { label: "Paid invoices", value: paidDurations.length, format: "number" },
          { label: "Average days", value: average(paidDurations), format: "duration", decimals: 1 }
        ]),
        quality: qualityFrom(
          paidDurations.length,
          facts.paid.length,
          facts.paid.map((fact) => fact.precision),
          paidDurationUnknown ? "Unavailable because one or more paid invoices lack a captured issue date." : undefined,
          true
        )
      }),
      makeKpi({
        id: "overdue-count",
        label: "Overdue invoices",
        description: "Invoices requiring collection attention",
        value: overdue.length,
        format: "number",
        scope: "asOf",
        favorableDirection: "down",
        metric: "invoices.overdue",
        calculation: calculation("Count of outstanding invoices past due", `As of ${data.range.to}`, [
          { label: "Overdue invoices", value: overdue.length, format: "number" }
        ]),
        quality: overdueQuality
      })
    ];

    const billingMovement = bucketPoints(data.range, [
      ...facts.issued.flatMap((fact) => fact.value === null ? [] : [{
        seriesKey: "invoiced",
        date: fact.date,
        value: fact.value,
        drilldown: { metric: "invoices.issued", label: "Invoices issued" }
      }]),
      ...facts.paid.flatMap((fact) => fact.value === null ? [] : [{
        seriesKey: "paid",
        date: fact.date,
        value: fact.value,
        drilldown: { metric: "invoices.paid", label: "Invoices paid" }
      }])
    ], data.timeZone);

    const agingOrder = ["Current", "1–30", "31–60", "61–90", "90+", "No due date"];
    const aging = new Map(agingOrder.map((key) => [key, 0]));
    const agingColors = [seriesColors.blue, seriesColors.teal, seriesColors.amber, "#f97316", seriesColors.red, seriesColors.slate];
    for (const snapshot of receivables) {
      if (snapshot.dueDate === undefined) continue;
      const bucket = agingBucket(snapshot.dueDate ?? null, asOf);
      aging.set(bucket, (aging.get(bucket) ?? 0) + (snapshot.value ?? 0));
    }
    const clientBalances = new Map<string, number>();
    for (const snapshot of receivables) {
      clientBalances.set(snapshot.record.client, (clientBalances.get(snapshot.record.client) ?? 0) + (snapshot.value ?? 0));
    }
    charts = [
      {
        id: "billing-movement",
        title: "Billing movement",
        description: "Issue-time invoice value versus value captured when marked paid.",
        type: "column",
        layout: "wide",
        series: [
          series("invoiced", "Invoiced", "currency", seriesColors.amber),
          series("paid", "Paid", "currency", seriesColors.green)
        ],
        points: billingMovement
      },
      {
        id: "ar-aging",
        title: "Receivables aging",
        description: `Outstanding value by days past due as of ${data.range.to}.`,
        type: "stackedBar",
        layout: "standard",
        series: agingOrder.map((key, index) => series(key, key, "currency", agingColors[index]!, "bar", "left", undefined, "aging")),
        points: [{
          key: "outstanding",
          label: "Outstanding AR",
          values: Object.fromEntries(agingOrder.map((key) => [key, aging.get(key) ?? 0])),
          drilldowns: Object.fromEntries(agingOrder.map((key) => [key, {
            metric: "invoices.aging",
            segment: key,
            label: `${key} receivables`
          }]))
        }]
      },
      {
        id: "client-balances",
        title: "Outstanding by client",
        description: "Clients with the largest captured receivable balances.",
        type: "bar",
        layout: "standard",
        orientation: "horizontal",
        series: [series("outstanding", "Outstanding", "currency", seriesColors.blue)],
        points: [...clientBalances.entries()]
          .filter((entry) => entry[1] !== 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([key, value]) => ({
            key,
            label: key,
            values: { outstanding: value },
            drilldowns: { outstanding: { metric: "invoices.client", segment: key, label: `${key} receivables` } }
          }))
      }
    ];
  }

  return { kpis, charts, facts };
}

function filterOptions(records: BaseRecord[], clients: Array<{ id: string; displayName: string }>) {
  const trades = Array.from(new Set(records.flatMap((record) => record.trades))).sort();
  const owners = Array.from(new Set(records.map((record) => record.owner))).sort();
  return {
    trades: trades.map((trade) => ({ value: trade, label: trade })),
    owners: owners.map((owner) => ({ value: owner, label: owner })),
    clients: clients.map((client) => ({ value: client.id, label: client.displayName }))
  };
}

function availableViews(user: AuthenticatedUser): AnalyticsView[] {
  const views: AnalyticsView[] = ["overview"];
  if (canUser(user, "requests:read") || canUser(user, "quotes:read")) views.push("sales");
  if (canUser(user, "projects:read")) views.push("operations");
  if (canUser(user, "billing:read")) views.push("billing");
  return views;
}

export function calculateAverageRevisions(quoteIds: Array<string | undefined>) {
  const revisions = quoteIds.filter((quoteId): quoteId is string => Boolean(quoteId));
  const affectedQuotes = new Set(revisions);
  return affectedQuotes.size ? revisions.length / affectedQuotes.size : null;
}

export function calculateRevisionReturnRate(
  records: Array<{ returnedAt: Date | null }>,
  asOf?: Date
) {
  return records.length
    ? records.filter((record) => Boolean(record.returnedAt && (!asOf || record.returnedAt <= asOf))).length / records.length
    : null;
}

export async function getAnalytics(user: AuthenticatedUser, query: AnalyticsQuery): Promise<AnalyticsResponse> {
  const data = await loadAnalyticsData(user, query);
  const presentation = viewPresentation(data, query);
  const scopedRecordKeys = new Set([
    ...data.requestRecords,
    ...data.quoteRecords,
    ...data.projectRecords,
    ...data.invoiceRecords
  ].map((record) => `${record.entityType}:${record.id}`));
  const scopedEvents = data.events.filter((event) =>
    scopedRecordKeys.has(`${event.entityType}:${event.entityId}`) &&
    inRange(event.changedAt, data.range, data.timeZone)
  );
  const partialMetricCount = presentation.kpis.filter((item) =>
    item.quality.status === "partial" || item.quality.status === "unavailable"
  ).length;
  const dataQuality: AnalyticsDataQuality = {
    exactLifecycleEvents: scopedEvents.filter((event) => event.precision === "EXACT").length,
    estimatedLifecycleEvents: scopedEvents.filter((event) => event.precision === "ESTIMATED").length,
    partialMetricCount,
    message: partialMetricCount
      ? `${partialMetricCount} metric${partialMetricCount === 1 ? " is" : "s are"} partial or unavailable; each KPI explains its own coverage.`
      : scopedEvents.some((event) => event.precision === "ESTIMATED")
        ? "Imported lifecycle dates are marked as estimated; newer application transitions are exact."
        : undefined
  };
  const records = [
    ...data.requestRecords,
    ...data.quoteRecords,
    ...data.revisionRecords,
    ...data.projectRecords,
    ...data.invoiceRecords
  ];
  return {
    view: query.view,
    availableViews: availableViews(user),
    range: data.range,
    kpis: presentation.kpis,
    charts: presentation.charts,
    filters: filterOptions(records, data.clients),
    dataQuality,
    generatedAt: new Date().toISOString()
  };
}

function baseDetail(record: BaseRecord, overrides: Partial<AnalyticsDetailRow> = {}): AnalyticsDetailRow {
  return {
    id: record.id,
    kind: record.kind,
    reference: record.reference,
    title: record.title,
    client: record.client,
    trades: record.trades,
    status: record.status,
    owner: record.owner,
    date: record.createdAt.toISOString(),
    value: record.value,
    valueFormat: record.value === null ? undefined : "currency",
    href: record.href,
    ...overrides
  };
}

function decisionDetail(fact: DecisionFact, valueAsMargin = false): AnalyticsDetailRow {
  const margin = fact.margin ? (fact.margin.revenue - fact.margin.cost) / fact.margin.revenue : null;
  const metadata = metadataObject(fact.event.metadata);
  return baseDetail(fact.record, {
    id: fact.event.id,
    reference: typeof metadata.quoteNumber === "string" ? metadata.quoteNumber : fact.record.reference,
    status: fact.event.toStatus,
    date: fact.event.changedAt.toISOString(),
    value: valueAsMargin ? margin : fact.value,
    valueFormat: valueAsMargin ? "percent" : "currency",
    context: valueAsMargin
      ? fact.marginKnown
        ? fact.margin ? `${fact.margin.revenue.toFixed(2)} revenue · ${fact.margin.cost.toFixed(2)} cost` : "No revenue-bearing lines"
        : "Line-cost snapshot unavailable"
      : "Value captured at decision",
    precision: fact.event.precision
  });
}

function completionDetail(fact: CompletionFact, metric: string, timeZone: string): AnalyticsDetailRow {
  const onTime = fact.dueDate instanceof Date
    ? isOnTimeLocalDate(fact.event.changedAt, fact.dueDate, timeZone)
    : null;
  const duration = metric === "projects.end_to_end" ? fact.endToEndDuration : fact.projectDuration;
  return baseDetail(fact.record, {
    id: fact.event.id,
    status: metric === "projects.on_time" ? onTime === null ? "Due date unavailable" : onTime ? "On time" : "Late" : "Completed",
    date: fact.event.changedAt.toISOString(),
    value: metric === "projects.completed" || metric === "projects.trade" ? fact.value : duration,
    valueFormat: metric === "projects.completed" || metric === "projects.trade" ? "currency" : "duration",
    durationDays: duration ?? undefined,
    context: fact.dueDate instanceof Date
      ? `Due ${analyticsLocalDate(fact.dueDate, timeZone)}`
      : fact.dueDate === null ? "No due date" : "Due date snapshot unavailable",
    precision: fact.event.precision
  });
}

function invoiceFactDetail(fact: InvoiceFact, status: string): AnalyticsDetailRow {
  return baseDetail(fact.record, {
    id: fact.event?.id ?? `${status}:${fact.record.id}`,
    status,
    date: fact.date.toISOString(),
    value: fact.value,
    valueFormat: "currency",
    context: status === "Issued" ? "Value captured at issue" : "Value captured at Paid transition",
    precision: fact.precision ?? undefined
  });
}

function snapshotDetail(snapshot: SnapshotRecord, to: string): AnalyticsDetailRow {
  return baseDetail(snapshot.record, {
    id: `${to}:${snapshot.record.id}`,
    status: snapshot.status ?? "Historical state unavailable",
    date: snapshot.event?.changedAt.toISOString() ?? snapshot.record.updatedAt.toISOString(),
    value: snapshot.value,
    valueFormat: snapshot.value === null ? undefined : "currency",
    context: `Snapshot as of ${to}`,
    precision: snapshot.precision ?? undefined
  });
}

function detailSelection(data: AnalyticsData, query: AnalyticsDetailsQuery) {
  const activityRange = query.bucketFrom && query.bucketTo
    ? { from: query.bucketFrom, to: query.bucketTo }
    : data.range;
  const facts = periodFacts(data, activityRange, data.range.to);
  const quoteSnapshots = snapshotsAt(data, data.quoteRecords, data.range.to);
  const projectSnapshots = snapshotsAt(data, data.projectRecords, data.range.to);
  const invoiceSnapshots = snapshotsAt(data, data.invoiceRecords, data.range.to);
  const segment = query.segment;
  let label = "Analytics records";
  let valueLabel: string | undefined;
  let rows: AnalyticsDetailRow[] = [];

  switch (query.metric) {
    case "requests.received":
      label = "Requests received";
      rows = facts.requests.map((record) => baseDetail(record, { value: null, valueFormat: undefined }));
      break;
    case "requests.source":
    case "requests.source_converted": {
      label = segment ? `${segment === "__other__" ? "Other" : segment} requests` : "Requests by source";
      const sourceCounts = new Map<string, number>();
      for (const record of facts.requests) sourceCounts.set(record.source || "Other", (sourceCounts.get(record.source || "Other") ?? 0) + 1);
      const top = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key]) => key);
      rows = facts.requests
        .filter((record) => segment === "__other__" ? !top.includes(record.source || "Other") : !segment || (record.source || "Other") === segment)
        .filter((record) => query.metric !== "requests.source_converted" || Boolean(record.quoteCreatedAt && onOrBefore(record.quoteCreatedAt, data.range.to, data.timeZone)))
        .map((record) => baseDetail(record, { value: null, valueFormat: undefined, context: record.source || "Other" }));
      break;
    }
    case "requests.trade":
      label = segment ? `${segment} requests` : "Requests by trade";
      rows = facts.requests.filter((record) => !segment || record.trades.includes(segment)).map((record) => baseDetail(record, { value: null, valueFormat: undefined }));
      break;
    case "quotes.created":
      label = "Original quotes created";
      valueLabel = "Quote value";
      rows = facts.quotesCreated.map((record) => baseDetail(record));
      break;
    case "quotes.decisions":
      label = "Final quote decisions";
      valueLabel = "Decision value";
      rows = facts.decisions.filter((fact) => !segment || fact.event.toStatus === segment).map((fact) => decisionDetail(fact));
      break;
    case "quotes.approved":
      label = "Approved quotes";
      valueLabel = "Approved value";
      rows = facts.approved.map((fact) => decisionDetail(fact));
      break;
    case "quotes.approved.trade":
      label = segment ? `${segment} approved quotes` : "Approved quotes by trade";
      valueLabel = "Approved value";
      rows = facts.approved.filter((fact) => !segment || fact.record.trades.includes(segment)).map((fact) => decisionDetail(fact));
      break;
    case "quotes.pipeline":
      label = `Open quote pipeline as of ${data.range.to}`;
      valueLabel = "Snapshot value";
      rows = quoteSnapshots.filter((snapshot) => snapshot.statusKnown && activeQuoteStatuses.has(snapshot.status ?? "")).map((snapshot) => snapshotDetail(snapshot, data.range.to));
      break;
    case "quotes.turnaround":
      label = "Request-to-quote turnaround";
      valueLabel = "Elapsed time";
      rows = facts.quotesCreated.flatMap((record) => record.requestReceivedAt ? [baseDetail(record, {
        value: daysBetween(record.requestReceivedAt, record.createdAt),
        valueFormat: "duration",
        durationDays: daysBetween(record.requestReceivedAt, record.createdAt),
        context: "Request received to original quote creation"
      })] : []);
      break;
    case "quotes.margin":
      label = "Quoted margin evidence";
      valueLabel = "Quoted margin";
      rows = facts.approved.map((fact) => decisionDetail(fact, true));
      break;
    case "quotes.revisions.requested":
    case "quotes.revisions.client":
      label = segment ? `${segment} revision requests` : "Revision requests";
      valueLabel = "Version value";
      rows = facts.revisions.filter((record) => !segment || record.client === segment).map((record) => baseDetail(record, {
        date: record.requestedAt.toISOString(),
        status: "Revision Requested",
        precision: record.precision,
        context: record.sentAt ? `Previously sent ${record.sentAt.toISOString().slice(0, 10)}` : "No sent timestamp recorded"
      }));
      break;
    case "quotes.revisions.sent":
    case "quotes.revisions.sent_client":
      label = segment ? `${segment} sent quote versions` : "Sent quote versions";
      valueLabel = "Version value";
      rows = facts.sentVersions.filter((record) => !segment || record.client === segment).map((record) => ({
        id: record.id,
        kind: "QuoteVersion",
        reference: record.reference,
        title: record.title,
        client: record.client,
        trades: record.trades,
        status: record.returnedAt && onOrBefore(record.returnedAt, data.range.to, data.timeZone) ? "Returned for revision" : "Not returned by period end",
        owner: record.owner,
        date: record.sentAt.toISOString(),
        value: record.value,
        valueFormat: "currency",
        context: record.returnedAt ? `Returned ${record.returnedAt.toISOString().slice(0, 10)}` : "No revision return recorded",
        precision: record.precision,
        href: record.href
      }));
      break;
    case "projects.active":
      label = `Active projects as of ${data.range.to}`;
      valueLabel = "Budget";
      rows = projectSnapshots.filter((snapshot) => snapshot.statusKnown && activeProjectStatuses.has(snapshot.status ?? "")).map((snapshot) => snapshotDetail(snapshot, data.range.to));
      break;
    case "projects.completed":
    case "projects.duration":
    case "projects.end_to_end":
    case "projects.on_time":
      label = query.metric === "projects.completed" ? "Completed projects" : query.metric === "projects.on_time" ? "On-time completion evidence" : query.metric === "projects.end_to_end" ? "Request-to-completion duration" : "Project duration";
      valueLabel = query.metric === "projects.completed" ? "Completed budget" : "Elapsed time";
      rows = facts.completions.map((fact) => completionDetail(fact, query.metric, data.timeZone));
      break;
    case "projects.overdue":
      label = `Overdue projects as of ${data.range.to}`;
      valueLabel = "Budget";
      rows = projectSnapshots.filter((snapshot) =>
        snapshot.statusKnown &&
        activeProjectStatuses.has(snapshot.status ?? "") &&
        snapshot.dueDate instanceof Date &&
        analyticsLocalDate(snapshot.dueDate, data.timeZone) < data.range.to
      ).map((snapshot) => snapshotDetail(snapshot, data.range.to));
      break;
    case "projects.status":
      label = segment ? `${segment} projects` : "Projects by status";
      valueLabel = "Budget";
      rows = projectSnapshots.filter((snapshot) => !segment || snapshot.status === segment).map((snapshot) => snapshotDetail(snapshot, data.range.to));
      break;
    case "projects.trade":
      label = segment ? `${segment} completed projects` : "Completed projects by trade";
      valueLabel = "Completed budget";
      rows = facts.completions.filter((fact) => !segment || fact.record.trades.includes(segment)).map((fact) => completionDetail(fact, "projects.trade", data.timeZone));
      break;
    case "invoices.issued":
      label = "Invoices issued";
      valueLabel = "Issue-time value";
      rows = facts.issued.filter((fact) => fact.eligibilityKnown).map((fact) => invoiceFactDetail(fact, "Issued"));
      break;
    case "invoices.paid":
      label = "Invoices marked paid";
      valueLabel = "Paid-transition value";
      rows = facts.paid.map((fact) => invoiceFactDetail(fact, "Paid"));
      break;
    case "invoices.outstanding":
      label = `Outstanding receivables as of ${data.range.to}`;
      valueLabel = "Outstanding";
      rows = invoiceSnapshots.filter((snapshot) => snapshot.statusKnown && receivableStatuses.has(snapshot.status ?? "")).map((snapshot) => snapshotDetail(snapshot, data.range.to));
      break;
    case "invoices.overdue":
      label = `Overdue receivables as of ${data.range.to}`;
      valueLabel = "Outstanding";
      rows = invoiceSnapshots.filter((snapshot) =>
        snapshot.statusKnown && receivableStatuses.has(snapshot.status ?? "") &&
        snapshot.dueDate instanceof Date && analyticsLocalDate(snapshot.dueDate, data.timeZone) < data.range.to
      ).map((snapshot) => snapshotDetail(snapshot, data.range.to));
      break;
    case "invoices.aging":
      label = segment ? `${segment} receivables` : "Receivables aging";
      valueLabel = "Outstanding";
      rows = invoiceSnapshots.filter((snapshot) =>
        snapshot.statusKnown && receivableStatuses.has(snapshot.status ?? "") &&
        snapshot.dueDate !== undefined &&
        (!segment || agingBucket(snapshot.dueDate ?? null, new Date(`${data.range.to}T12:00:00Z`)) === segment)
      ).map((snapshot) => snapshotDetail(snapshot, data.range.to));
      break;
    case "invoices.client":
      label = segment ? `${segment} receivables` : "Receivables by client";
      valueLabel = "Outstanding";
      rows = invoiceSnapshots.filter((snapshot) =>
        snapshot.statusKnown && receivableStatuses.has(snapshot.status ?? "") && (!segment || snapshot.record.client === segment)
      ).map((snapshot) => snapshotDetail(snapshot, data.range.to));
      break;
    default:
      label = "Recent records";
      rows = [
        ...facts.requests.map((record) => baseDetail(record, { value: null, valueFormat: undefined })),
        ...facts.quotesCreated.map((record) => baseDetail(record)),
        ...facts.completions.map((fact) => completionDetail(fact, "projects.completed", data.timeZone)),
        ...facts.issued.filter((fact) => fact.eligibilityKnown).map((fact) => invoiceFactDetail(fact, "Issued"))
      ];
  }
  return { label, valueLabel, rows };
}

function compareDetailRows(
  a: AnalyticsDetailRow,
  b: AnalyticsDetailRow,
  sort: AnalyticsDetailsQuery["sort"]
) {
  if (sort === "date") return new Date(a.date).getTime() - new Date(b.date).getTime();
  if (sort === "value") return (a.value ?? Number.NEGATIVE_INFINITY) - (b.value ?? Number.NEGATIVE_INFINITY);
  return String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

export async function getAnalyticsDetails(
  user: AuthenticatedUser,
  query: AnalyticsDetailsQuery
): Promise<AnalyticsDetailsResponse> {
  const data = await loadAnalyticsData(user, query);
  const selection = detailSelection(data, query);
  const rows = selection.rows.sort((a, b) => {
    const result = compareDetailRows(a, b, query.sort);
    return query.direction === "asc" ? result : -result;
  });
  const offset = Math.max(0, Number(query.cursor) || 0);
  const page = rows.slice(offset, offset + query.take);
  const presentation = viewPresentation(data, query);
  const matchingKpi = presentation.kpis.find((item) => item.metric === query.metric);
  return {
    metric: query.metric,
    segment: query.segment,
    label: selection.label,
    total: rows.length,
    summary: `${rows.length} ${rows.length === 1 ? "record" : "records"} match this selection`,
    valueLabel: selection.valueLabel,
    calculation: matchingKpi?.calculation,
    rows: page,
    nextCursor: offset + query.take < rows.length ? String(offset + query.take) : undefined
  };
}
