import { LifecycleEntityType, type LifecycleEventPrecision } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { canUser, type AuthenticatedUser } from "@pulse/contracts/auth";
import type {
  AnalyticsChart,
  AnalyticsDataQuality,
  AnalyticsDetailRow,
  AnalyticsDetailsQuery,
  AnalyticsDetailsResponse,
  AnalyticsKpi,
  AnalyticsQuery,
  AnalyticsRange,
  AnalyticsResponse,
  AnalyticsView
} from "@pulse/contracts/analytics";

const dayMs = 86_400_000;
const activeQuoteStatuses = new Set(["Draft", "Review", "Sent"]);
const activeProjectStatuses = new Set(["Ready", "In Progress", "Field Work", "On Hold"]);
const receivableStatuses = new Set(["Sent", "Overdue"]);
const decisionStatuses = new Set(["Approved", "Rejected", "Expired"]);

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

function daysBetween(start: Date, end: Date) {
  return Math.max(0, (end.getTime() - start.getTime()) / dayMs);
}

function inRange(date: Date | null | undefined, range: Pick<AnalyticsRange, "from" | "to">, timeZone: string) {
  if (!date) return false;
  const local = analyticsLocalDate(date, timeZone);
  return local >= range.from && local <= range.to;
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
  const length = Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / dayMs) + 1;
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

export function calculateQuotedMargin(lines: Array<{ lineSubtotal: number; quantity: number; unitCost: number }>) {
  const usable = lines.filter((line) => line.lineSubtotal > 0 && line.unitCost >= 0 && line.quantity >= 0);
  const revenue = usable.reduce((sum, line) => sum + line.lineSubtotal, 0);
  if (!revenue) return null;
  const cost = usable.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  return (revenue - cost) / revenue;
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

type EventRecord = {
  entityType: LifecycleEntityType;
  entityId: string;
  toStatus: string;
  changedAt: Date;
  precision: LifecycleEventPrecision;
  valueSnapshot: { toNumber(): number } | null;
  metadata: unknown;
};

function metadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function isSupersededLifecycleDecision(value: unknown) {
  const metadata = metadataObject(value);
  return Boolean(metadata.supersededByRevisionId || metadata.supersededVersion);
}

function isSupersededDecision(event: EventRecord) {
  return isSupersededLifecycleDecision(event.metadata);
}

function eventMap(events: EventRecord[]) {
  const map = new Map<string, EventRecord[]>();
  for (const event of events) {
    const key = `${event.entityType}:${event.entityId}`;
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  return map;
}

function lastEvent(
  map: Map<string, EventRecord[]>,
  entityType: LifecycleEntityType,
  entityId: string,
  statuses: Set<string>,
  range?: Pick<AnalyticsRange, "from" | "to">,
  timeZone?: string
) {
  const matches = (map.get(`${entityType}:${entityId}`) ?? []).filter((event) =>
    statuses.has(event.toStatus) && (!range || !timeZone || inRange(event.changedAt, range, timeZone))
  );
  return matches.at(-1);
}

type NormalizedRecord = AnalyticsDetailRow & {
  clientId?: string | null;
  createdAt: Date;
  dueDate: Date | null;
  source?: string;
  margin?: number | null;
  completion?: EventRecord;
  paid?: EventRecord;
  requestReceivedAt?: Date;
  quoteCreatedAt?: Date;
  projectStartAt?: Date;
  sentAt?: Date;
  precision?: LifecycleEventPrecision;
  quoteId?: string;
};

type SentVersionRecord = {
  quoteId: string;
  client: string;
  clientId: string | null;
  owner: string;
  trades: string[];
  sentAt: Date;
  returnedAt: Date | null;
  precision: LifecycleEventPrecision;
};

function matchesFilters(record: NormalizedRecord, query: AnalyticsQuery | AnalyticsDetailsQuery) {
  if (query.trade && !record.trades.includes(query.trade)) return false;
  if (query.owner && record.owner !== query.owner) return false;
  if (query.clientId && record.clientId !== query.clientId) return false;
  return true;
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

function matchesSentVersionFilters(
  record: SentVersionRecord,
  query: AnalyticsQuery | AnalyticsDetailsQuery
) {
  if (query.trade && !record.trades.includes(query.trade)) return false;
  if (query.owner && record.owner !== query.owner) return false;
  if (query.clientId && record.clientId !== query.clientId) return false;
  return true;
}

function valueOf(value: { toNumber(): number } | number) {
  return typeof value === "number" ? value : value.toNumber();
}

function percentDelta(current: number | null, comparison: number | null) {
  return current === null || comparison === null ? null : analyticsDelta(current, comparison);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function calculateAverageRevisions(quoteIds: Array<string | undefined>) {
  const revisions = quoteIds.filter((quoteId): quoteId is string => Boolean(quoteId));
  const affectedQuotes = new Set(revisions);
  return affectedQuotes.size ? revisions.length / affectedQuotes.size : null;
}

export function calculateRevisionReturnRate(records: Array<{ returnedAt: Date | null }>) {
  return records.length
    ? records.filter((record) => Boolean(record.returnedAt)).length / records.length
    : null;
}

function kpi(input: AnalyticsKpi): AnalyticsKpi {
  return input;
}

function durationKpi(
  base: Omit<AnalyticsKpi, "value" | "format" | "estimated" | "exactSampleCount" | "estimatedSampleCount">,
  exact: number[],
  estimated: number[],
  comparisonExact: number[] = [],
  comparisonEstimated: number[] = []
) {
  const useEstimated = !exact.length && estimated.length > 0;
  const currentValues = useEstimated ? estimated : exact;
  const comparisonValues = comparisonExact.length
    ? comparisonExact
    : useEstimated ? comparisonEstimated : [];
  const value = average(currentValues);
  return kpi({
    ...base,
    value,
    format: "duration",
    deltaPercent: percentDelta(value, average(comparisonValues)),
    estimated: useEstimated,
    exactSampleCount: exact.length,
    estimatedSampleCount: estimated.length
  });
}

function bucketPoints(
  range: AnalyticsRange,
  series: Array<{ date: Date; value: number; secondary?: number; tertiary?: number }>,
  timeZone: string
) {
  const rangeDays = Math.round((new Date(`${range.to}T12:00:00Z`).getTime() - new Date(`${range.from}T12:00:00Z`).getTime()) / dayMs) + 1;
  const size = rangeDays <= 45 ? 7 : rangeDays <= 180 ? 14 : 30;
  const buckets: Array<{ key: string; label: string; value: number; secondaryValue: number; tertiaryValue: number; secondaryCount: number }> = [];
  for (let offset = 0; offset < rangeDays; offset += size) {
    const key = addDays(range.from, offset);
    buckets.push({
      key,
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`)),
      value: 0,
      secondaryValue: 0,
      tertiaryValue: 0,
      secondaryCount: 0
    });
  }
  for (const item of series) {
    const local = analyticsLocalDate(item.date, timeZone);
    if (local < range.from || local > range.to) continue;
    const index = Math.min(
      buckets.length - 1,
      Math.floor((new Date(`${local}T12:00:00Z`).getTime() - new Date(`${range.from}T12:00:00Z`).getTime()) / dayMs / size)
    );
    const bucket = buckets[index];
    if (!bucket) continue;
    bucket.value += item.value;
    if (item.secondary !== undefined) {
      bucket.secondaryValue += item.secondary;
      bucket.secondaryCount += 1;
    }
    if (item.tertiary !== undefined) bucket.tertiaryValue += item.tertiary;
  }
  return buckets.map(({ secondaryCount, ...bucket }) => ({
    ...bucket,
    secondaryValue: secondaryCount ? bucket.secondaryValue / secondaryCount : bucket.secondaryValue
  }));
}

async function loadAnalyticsData(user: AuthenticatedUser, query: AnalyticsQuery | AnalyticsDetailsQuery) {
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
      where: { archivedAt: null },
      include: {
        trades: { select: { serviceCategory: true } },
        assignedTo: { select: { name: true } },
        client: { select: { id: true, displayName: true } },
        relatedQuote: { select: { id: true, createdAt: true } }
      }
    }) : [],
    canUser(user, "quotes:read") ? prisma.quote.findMany({
      where: { archivedAt: null },
      include: {
        client: { select: { id: true, displayName: true } },
        items: { select: { lineSubtotal: true, quantity: true, unitCost: true } },
        requests: {
          where: { archivedAt: null },
          take: 1,
          include: { trades: { select: { serviceCategory: true } } }
        },
        project: { select: { id: true } },
        revisions: { orderBy: { revisionNumber: "asc" } }
      }
    }) : [],
    canUser(user, "projects:read") ? prisma.project.findMany({
      where: { archivedAt: null },
      include: {
        client: { select: { id: true, displayName: true } },
        quote: {
          include: {
            requests: {
              where: { archivedAt: null },
              take: 1,
              include: { trades: { select: { serviceCategory: true } } }
            }
          }
        }
      }
    }) : [],
    canUser(user, "billing:read") ? prisma.invoice.findMany({
      where: { archivedAt: null },
      include: {
        client: { select: { id: true, displayName: true } },
        project: {
          include: {
            quote: {
              include: {
                requests: {
                  where: { archivedAt: null },
                  take: 1,
                  include: { trades: { select: { serviceCategory: true } } }
                }
              }
            }
          }
        }
      }
    }) : [],
    prisma.lifecycleStatusEvent.findMany({ where: { entityType: { in: allowedEventTypes } }, orderBy: { changedAt: "asc" } }),
    canUser(user, "clients:read")
      ? prisma.client.findMany({ where: { archivedAt: null }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } })
      : []
  ]);
  const eventsByEntity = eventMap(events);

  const requestRecords: NormalizedRecord[] = requests.map((request) => ({
    id: request.id,
    kind: "Request" as const,
    reference: request.requestNumber,
    title: request.title,
    client: request.client?.displayName ?? request.companyName ?? "Unclassified",
    clientId: request.client?.id ?? request.clientId,
    trades: request.trades.length ? request.trades.map((trade) => trade.serviceCategory) : tradesFromSnapshot(request.serviceCategory),
    status: request.status,
    owner: request.assignedTo?.name ?? "Unassigned",
    date: request.receivedDate.toISOString(),
    createdAt: request.receivedDate,
    dueDate: request.dueDate,
    source: request.source,
    requestReceivedAt: request.receivedDate,
    quoteCreatedAt: request.relatedQuote?.createdAt,
    href: `/requests/${request.id}`
  })).filter((record) => matchesFilters(record, query));

  const quoteRecords: NormalizedRecord[] = quotes.map((quote) => {
    const request = quote.requests[0];
    const trades = quote.serviceCategorySnapshot !== null
      ? tradesFromSnapshot(quote.serviceCategorySnapshot)
      : request?.trades.length
        ? request.trades.map((trade) => trade.serviceCategory)
        : tradesFromSnapshot(request?.serviceCategory);
    return {
      id: quote.id,
      kind: "Quote" as const,
      reference: quote.quoteNumber,
      title: quote.title,
      client: quote.client?.displayName ?? quote.clientName ?? "Unclassified",
      clientId: quote.client?.id ?? quote.clientId,
      trades,
      status: quote.status,
      owner: quote.owner,
      date: quote.createdAt.toISOString(),
      createdAt: quote.createdAt,
      dueDate: null,
      value: valueOf(quote.total),
      margin: calculateQuotedMargin(quote.items.map((line) => ({
        lineSubtotal: valueOf(line.lineSubtotal),
        quantity: valueOf(line.quantity),
        unitCost: valueOf(line.unitCost)
      }))),
      requestReceivedAt: request?.receivedDate,
      quoteCreatedAt: quote.createdAt,
      href: `/quotes?record=${encodeURIComponent(quote.id)}`
    };
  }).filter((record) => matchesFilters(record, query));

  const revisionRecords: NormalizedRecord[] = quotes.flatMap((quote) => {
    const request = quote.requests[0];
    const fallbackTrades = quote.serviceCategorySnapshot !== null
      ? tradesFromSnapshot(quote.serviceCategorySnapshot)
      : request?.trades.length
        ? request.trades.map((trade) => trade.serviceCategory)
        : tradesFromSnapshot(request?.serviceCategory);
    return quote.revisions.map((revision) => ({
      id: revision.id,
      kind: "Quote" as const,
      reference: revision.quoteNumber,
      title: revision.titleSnapshot,
      client: revision.clientNameSnapshot ?? quote.client?.displayName ?? quote.clientName ?? "Unclassified",
      clientId: revision.clientIdSnapshot ?? quote.clientId,
      trades: revisionTrades(revision.snapshot, fallbackTrades),
      status: "Revision Requested",
      owner: revision.ownerSnapshot,
      date: revision.requestedAt.toISOString(),
      createdAt: revision.requestedAt,
      dueDate: null,
      value: valueOf(revision.totalSnapshot),
      sentAt: revision.sentAt ?? undefined,
      precision: revision.precision,
      quoteId: quote.id,
      href: `/quotes/${encodeURIComponent(quote.id)}`
    }));
  }).filter((record) => matchesFilters(record, query));

  const sentVersionRecords: SentVersionRecord[] = quotes.flatMap((quote) => {
    const request = quote.requests[0];
    const fallbackTrades = quote.serviceCategorySnapshot !== null
      ? tradesFromSnapshot(quote.serviceCategorySnapshot)
      : request?.trades.length
        ? request.trades.map((trade) => trade.serviceCategory)
        : tradesFromSnapshot(request?.serviceCategory);
    const historical = quote.revisions.flatMap((revision) => revision.sentAt ? [{
      quoteId: quote.id,
      client: revision.clientNameSnapshot ?? quote.client?.displayName ?? quote.clientName ?? "Unclassified",
      clientId: revision.clientIdSnapshot ?? quote.clientId,
      owner: revision.ownerSnapshot,
      trades: revisionTrades(revision.snapshot, fallbackTrades),
      sentAt: revision.sentAt,
      returnedAt: revision.requestedAt,
      precision: revision.precision
    }] : []);
    const current = quote.sentAt ? [{
      quoteId: quote.id,
      client: quote.client?.displayName ?? quote.clientName ?? "Unclassified",
      clientId: quote.clientId,
      owner: quote.owner,
      trades: fallbackTrades,
      sentAt: quote.sentAt,
      returnedAt: null,
      precision: quote.sentAtPrecision ?? ("EXACT" as const)
    }] : [];
    return [...historical, ...current];
  }).filter((record) => matchesSentVersionFilters(record, query));

  const projectRecords: NormalizedRecord[] = projects.map((project) => {
    const request = project.quote?.requests[0];
    const completion = lastEvent(eventsByEntity, LifecycleEntityType.PROJECT, project.id, new Set(["Completed"]));
    const start = project.startDate ?? project.createdAt;
    const trades = project.quote?.serviceCategorySnapshot != null
      ? tradesFromSnapshot(project.quote.serviceCategorySnapshot)
      : request?.trades.length
        ? request.trades.map((trade) => trade.serviceCategory)
        : tradesFromSnapshot(request?.serviceCategory);
    return {
      id: project.id,
      kind: "Project" as const,
      reference: project.projectNumber,
      title: project.title,
      client: project.client.displayName,
      clientId: project.client.id,
      trades,
      status: project.status,
      owner: project.owner,
      date: (completion?.changedAt ?? project.createdAt).toISOString(),
      createdAt: project.createdAt,
      dueDate: project.dueDate,
      value: valueOf(project.budget),
      durationDays: completion ? daysBetween(start, completion.changedAt) : undefined,
      completion,
      requestReceivedAt: request?.receivedDate,
      projectStartAt: start,
      href: `/projects?record=${encodeURIComponent(project.id)}`
    };
  }).filter((record) => matchesFilters(record, query));

  const invoiceRecords: NormalizedRecord[] = invoices.map((invoice) => {
    const request = invoice.project?.quote?.requests[0];
    const paid = lastEvent(eventsByEntity, LifecycleEntityType.INVOICE, invoice.id, new Set(["Paid"]));
    const trades = invoice.project?.quote?.serviceCategorySnapshot != null
      ? tradesFromSnapshot(invoice.project.quote.serviceCategorySnapshot)
      : request?.trades.length
        ? request.trades.map((trade) => trade.serviceCategory)
        : tradesFromSnapshot(request?.serviceCategory);
    return {
      id: invoice.id,
      kind: "Invoice" as const,
      reference: invoice.invoiceNumber,
      title: invoice.title,
      client: invoice.client.displayName,
      clientId: invoice.client.id,
      trades,
      status: invoice.status,
      owner: invoice.owner,
      date: (invoice.issuedDate ?? invoice.createdAt).toISOString(),
      createdAt: invoice.issuedDate ?? invoice.createdAt,
      dueDate: invoice.dueDate,
      value: valueOf(invoice.amount),
      durationDays: paid ? daysBetween(invoice.issuedDate ?? invoice.createdAt, paid.changedAt) : undefined,
      paid,
      href: `/billing?record=${encodeURIComponent(invoice.id)}`
    };
  }).filter((record) => matchesFilters(record, query));

  return {
    range,
    timeZone,
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

function decisionEvents(records: NormalizedRecord[], events: Map<string, EventRecord[]>, range: Pick<AnalyticsRange, "from" | "to">, timeZone: string) {
  return records.flatMap((record) => {
    const event = (events.get(`${LifecycleEntityType.QUOTE}:${record.id}`) ?? [])
      .filter((candidate) =>
        decisionStatuses.has(candidate.toStatus) &&
        inRange(candidate.changedAt, range, timeZone) &&
        !isSupersededDecision(candidate)
      )
      .at(-1);
    return event ? [{ record, event }] : [];
  });
}

function completionEvents(records: NormalizedRecord[], range: Pick<AnalyticsRange, "from" | "to">, timeZone: string) {
  return records.filter((record) => record.completion && inRange(record.completion.changedAt, range, timeZone));
}

function billedInvoices(records: NormalizedRecord[], range: Pick<AnalyticsRange, "from" | "to">, timeZone: string) {
  return records.filter((record) => !["Draft", "Review", "Void"].includes(record.status) && inRange(record.createdAt, range, timeZone));
}

function paidInvoices(records: NormalizedRecord[], range: Pick<AnalyticsRange, "from" | "to">, timeZone: string) {
  return records.filter((record) => record.paid && inRange(record.paid.changedAt, range, timeZone));
}

function activeProjectValue(records: NormalizedRecord[]) {
  return sum(records.filter((record) => activeProjectStatuses.has(record.status)).map((record) => record.value ?? 0));
}

function onTimeRate(records: NormalizedRecord[]) {
  const eligible = records.filter((record) => record.completion && record.dueDate);
  if (!eligible.length) return null;
  return eligible.filter((record) => record.completion!.changedAt <= record.dueDate!).length / eligible.length;
}

function lifecycleDurations(records: NormalizedRecord[], field: "project" | "endToEnd") {
  const exact: number[] = [];
  const estimated: number[] = [];
  for (const record of records) {
    if (!record.completion) continue;
    const start = field === "project" ? record.projectStartAt : record.requestReceivedAt;
    if (!start || start > record.completion.changedAt) continue;
    const bucket = record.completion.precision === "EXACT" ? exact : estimated;
    bucket.push(daysBetween(start, record.completion.changedAt));
  }
  return { exact, estimated };
}

function filterOptions(records: NormalizedRecord[], clients: Array<{ id: string; displayName: string }>) {
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

export async function getAnalytics(user: AuthenticatedUser, query: AnalyticsQuery): Promise<AnalyticsResponse> {
  const data = await loadAnalyticsData(user, query);
  const {
    range,
    timeZone,
    eventsByEntity,
    requestRecords,
    quoteRecords,
    revisionRecords,
    sentVersionRecords,
    projectRecords,
    invoiceRecords
  } = data;
  const comparison = previousRange(range);
  const currentDecisions = decisionEvents(quoteRecords, eventsByEntity, range, timeZone);
  const comparisonDecisions = decisionEvents(quoteRecords, eventsByEntity, comparison, timeZone);
  const currentCompleted = completionEvents(projectRecords, range, timeZone);
  const comparisonCompleted = completionEvents(projectRecords, comparison, timeZone);
  const currentBilled = billedInvoices(invoiceRecords, range, timeZone);
  const comparisonBilled = billedInvoices(invoiceRecords, comparison, timeZone);
  const currentPaid = paidInvoices(invoiceRecords, range, timeZone);
  const comparisonPaid = paidInvoices(invoiceRecords, comparison, timeZone);
  const newRequests = requestRecords.filter((record) => inRange(record.createdAt, range, timeZone));
  const comparisonRequests = requestRecords.filter((record) => inRange(record.createdAt, comparison, timeZone));
  const createdQuotes = quoteRecords.filter((record) => inRange(record.createdAt, range, timeZone));
  const comparisonQuotes = quoteRecords.filter((record) => inRange(record.createdAt, comparison, timeZone));
  const currentRevisions = revisionRecords.filter((record) => inRange(record.createdAt, range, timeZone));
  const comparisonRevisions = revisionRecords.filter((record) => inRange(record.createdAt, comparison, timeZone));
  const currentSentVersions = sentVersionRecords.filter((record) => inRange(record.sentAt, range, timeZone));
  const comparisonSentVersions = sentVersionRecords.filter((record) => inRange(record.sentAt, comparison, timeZone));
  const currentRevisionRate = calculateRevisionReturnRate(currentSentVersions);
  const comparisonRevisionRate = calculateRevisionReturnRate(comparisonSentVersions);
  const currentRevisionAverage = calculateAverageRevisions(currentRevisions.map((record) => record.quoteId));
  const comparisonRevisionAverage = calculateAverageRevisions(comparisonRevisions.map((record) => record.quoteId));
  const currentWinRate = calculateWinRate(currentDecisions.map(({ event }) => event.toStatus));
  const comparisonWinRate = calculateWinRate(comparisonDecisions.map(({ event }) => event.toStatus));
  const currentOnTime = onTimeRate(currentCompleted);
  const comparisonOnTime = onTimeRate(comparisonCompleted);
  const asOf = new Date(`${range.to}T23:59:59.999Z`);
  const receivables = invoiceRecords.filter((record) => receivableStatuses.has(record.status));
  const overdue = receivables.filter((record) => record.status === "Overdue" || Boolean(record.dueDate && record.dueDate < asOf));
  const projectDurations = lifecycleDurations(currentCompleted, "project");
  const comparisonProjectDurations = lifecycleDurations(comparisonCompleted, "project");
  const endToEndDurations = lifecycleDurations(currentCompleted, "endToEnd");
  const comparisonEndToEnd = lifecycleDurations(comparisonCompleted, "endToEnd");

  let kpis: AnalyticsKpi[] = [];
  let charts: AnalyticsChart[] = [];

  const lifecycleChart: AnalyticsChart = {
    id: "lifecycle-flow",
    title: "Business lifecycle",
    description: "Work entering and advancing through the selected period.",
    type: "funnel",
    format: "number",
    valueLabel: "Records",
    metric: "lifecycle",
    points: [
      { key: "requests", label: "New requests", value: newRequests.length, segment: "Request" },
      { key: "quotes", label: "Quotes created", value: createdQuotes.length, segment: "Quote" },
      { key: "approved", label: "Quotes approved", value: currentDecisions.filter(({ event }) => event.toStatus === "Approved").length, segment: "Approved" },
      { key: "completed", label: "Projects completed", value: currentCompleted.length, segment: "Completed" }
    ]
  };

  const financialPoints = bucketPoints(range, [
    ...currentDecisions.filter(({ event }) => event.toStatus === "Approved").map(({ record, event }) => ({ date: event.changedAt, value: record.value ?? 0 })),
    ...currentCompleted.map((record) => ({ date: record.completion!.changedAt, value: 0, secondary: record.value ?? 0 })),
    ...currentBilled.map((record) => ({ date: record.createdAt, value: 0, tertiary: record.value ?? 0 }))
  ], timeZone);

  const financialChart: AnalyticsChart = {
    id: "financial-trend",
    title: "Value moving through Pulse",
    description: "Approved quotes, completed project budget, and invoices issued.",
    type: "area",
    format: "currency",
    secondaryFormat: "currency",
    valueLabel: "Approved quote value",
    secondaryLabel: "Completed project value",
    metric: "financial",
    points: financialPoints
  };

  if (query.view === "overview") {
    kpis = [
      kpi({ id: "open-pipeline", label: "Open quote pipeline", description: "Draft, review, and sent quotes", value: sum(quoteRecords.filter((record) => activeQuoteStatuses.has(record.status)).map((record) => record.value ?? 0)), format: "currency", snapshot: true, metric: "open-pipeline" }),
      kpi({ id: "win-rate", label: "Quote win rate", description: "Approved versus decided quotes", value: currentWinRate, format: "percent", deltaPercent: percentDelta(currentWinRate, comparisonWinRate), metric: "win-rate" }),
      kpi({ id: "active-project-value", label: "Active project budget", description: "Current active project portfolio", value: activeProjectValue(projectRecords), format: "currency", snapshot: true, metric: "active-projects" }),
      kpi({ id: "on-time", label: "On-time completion", description: "Completed by recorded due date", value: currentOnTime, format: "percent", deltaPercent: percentDelta(currentOnTime, comparisonOnTime), exactSampleCount: currentCompleted.filter((record) => record.completion?.precision === "EXACT" && record.dueDate).length, estimatedSampleCount: currentCompleted.filter((record) => record.completion?.precision === "ESTIMATED" && record.dueDate).length, metric: "completed-projects" }),
      kpi({ id: "invoiced", label: "Invoiced", description: "Invoices issued in this period", value: sum(currentBilled.map((record) => record.value ?? 0)), format: "currency", deltaPercent: analyticsDelta(sum(currentBilled.map((record) => record.value ?? 0)), sum(comparisonBilled.map((record) => record.value ?? 0))), metric: "billed" }),
      kpi({ id: "overdue-ar", label: "Overdue receivables", description: "Current unpaid amount past due", value: sum(overdue.map((record) => record.value ?? 0)), format: "currency", snapshot: true, metric: "overdue-ar" })
    ];
    charts = [lifecycleChart, financialChart, tradeChart(requestRecords, quoteRecords, currentCompleted)];
  }

  if (query.view === "sales") {
    const quoteTurnaroundCurrent = createdQuotes.flatMap((record) => record.requestReceivedAt ? [daysBetween(record.requestReceivedAt, record.createdAt)] : []);
    const quoteTurnaroundComparison = comparisonQuotes.flatMap((record) => record.requestReceivedAt ? [daysBetween(record.requestReceivedAt, record.createdAt)] : []);
    const approvedQuotes = currentDecisions.filter(({ event }) => event.toStatus === "Approved").map(({ record }) => record);
    const comparisonApproved = comparisonDecisions.filter(({ event }) => event.toStatus === "Approved").map(({ record }) => record);
    const revisionClients = new Map<string, { count: number; sent: number; returned: number }>();
    for (const record of currentRevisions) {
      const group = revisionClients.get(record.client) ?? { count: 0, sent: 0, returned: 0 };
      group.count += 1;
      revisionClients.set(record.client, group);
    }
    for (const version of currentSentVersions) {
      const group = revisionClients.get(version.client);
      if (!group) continue;
      group.sent += 1;
      if (version.returnedAt) group.returned += 1;
    }
    kpis = [
      kpi({ id: "new-requests", label: "New requests", description: "Requests received in this period", value: newRequests.length, format: "number", deltaPercent: analyticsDelta(newRequests.length, comparisonRequests.length), metric: "new-requests" }),
      kpi({ id: "active-quote-value", label: "Active quote value", description: "Current draft, review, and sent quotes", value: sum(quoteRecords.filter((record) => activeQuoteStatuses.has(record.status)).map((record) => record.value ?? 0)), format: "currency", snapshot: true, metric: "open-pipeline" }),
      kpi({ id: "sales-win-rate", label: "Win rate", description: "Approved versus decided quotes", value: currentWinRate, format: "percent", deltaPercent: percentDelta(currentWinRate, comparisonWinRate), metric: "win-rate" }),
      kpi({ id: "request-to-quote", label: "Request to quote", description: "Average intake-to-quote time", value: average(quoteTurnaroundCurrent), format: "duration", deltaPercent: percentDelta(average(quoteTurnaroundCurrent), average(quoteTurnaroundComparison)), exactSampleCount: quoteTurnaroundCurrent.length, metric: "quote-turnaround" }),
      kpi({ id: "average-approved", label: "Average approved quote", description: "Average value of approved decisions", value: average(approvedQuotes.map((record) => record.value ?? 0)), format: "currency", deltaPercent: percentDelta(average(approvedQuotes.map((record) => record.value ?? 0)), average(comparisonApproved.map((record) => record.value ?? 0))), metric: "approved-quotes" }),
      kpi({ id: "quoted-margin", label: "Estimated quoted margin", description: "Pre-tax margin from quoted line costs", value: average(approvedQuotes.flatMap((record) => record.margin === null || record.margin === undefined ? [] : [record.margin])), format: "percent", deltaPercent: percentDelta(average(approvedQuotes.flatMap((record) => record.margin === null || record.margin === undefined ? [] : [record.margin])), average(comparisonApproved.flatMap((record) => record.margin === null || record.margin === undefined ? [] : [record.margin]))), metric: "quote-margin" }),
      kpi({ id: "revision-requests", label: "Revision requests", description: "Client-requested quote returns in this period", value: currentRevisions.length, format: "number", deltaPercent: analyticsDelta(currentRevisions.length, comparisonRevisions.length), estimated: currentRevisions.length > 0 && currentRevisions.every((record) => record.precision === "ESTIMATED"), exactSampleCount: currentRevisions.filter((record) => record.precision === "EXACT").length, estimatedSampleCount: currentRevisions.filter((record) => record.precision === "ESTIMATED").length, metric: "revision-requests" }),
      kpi({ id: "revision-rate", label: "Revision return rate", description: "Versions sent in this period that were later returned", value: currentRevisionRate, format: "percent", deltaPercent: percentDelta(currentRevisionRate, comparisonRevisionRate), estimated: currentSentVersions.length > 0 && currentSentVersions.every((record) => record.precision === "ESTIMATED"), exactSampleCount: currentSentVersions.filter((record) => record.precision === "EXACT").length, estimatedSampleCount: currentSentVersions.filter((record) => record.precision === "ESTIMATED").length, metric: "revision-rate" }),
      kpi({ id: "revision-average", label: "Revisions per affected quote", description: "Average returns for quote families revised in this period", value: currentRevisionAverage, format: "number", deltaPercent: percentDelta(currentRevisionAverage, comparisonRevisionAverage), estimated: currentRevisions.length > 0 && currentRevisions.every((record) => record.precision === "ESTIMATED"), exactSampleCount: currentRevisions.filter((record) => record.precision === "EXACT").length, estimatedSampleCount: currentRevisions.filter((record) => record.precision === "ESTIMATED").length, metric: "revision-average" })
    ];
    const sourceGroups = new Map<string, { requests: number; converted: number }>();
    for (const record of newRequests) {
      const source = record.source || "Other";
      const group = sourceGroups.get(source) ?? { requests: 0, converted: 0 };
      group.requests += 1;
      if (record.status === "Converted to Quote") group.converted += 1;
      sourceGroups.set(source, group);
    }
    charts = [
      { ...lifecycleChart, title: "Sales funnel", description: "Requests advancing from intake through an approved quote." },
      { ...financialChart, id: "quote-value-trend", title: "Quote value trend", description: "Approved quote value across the selected period.", metric: "approved-quotes" },
      {
        id: "source-conversion", title: "Request sources", description: "Volume and converted requests by source.", type: "bar", format: "number", valueLabel: "Requests", secondaryLabel: "Converted", metric: "request-source",
        points: Array.from(sourceGroups, ([key, group]) => ({ key, label: key, value: group.requests, secondaryValue: group.converted, segment: key })).sort((a, b) => b.value - a.value)
      },
      {
        id: "client-revisions", title: "Client revision behavior", description: "Revision requests and sent-version return rate by client.", type: "bar", format: "number", secondaryFormat: "percent", valueLabel: "Revision requests", secondaryLabel: "Return rate", metric: "revision-requests",
        points: Array.from(revisionClients, ([key, group]) => ({ key, label: key, value: group.count, secondaryValue: group.sent ? group.returned / group.sent : 0, segment: key })).sort((a, b) => b.value - a.value).slice(0, 8)
      },
      tradeChart(requestRecords, quoteRecords, currentCompleted)
    ];
  }

  if (query.view === "operations") {
    kpis = [
      kpi({ id: "active-projects", label: "Active projects", description: "Ready, in progress, field work, and hold", value: projectRecords.filter((record) => activeProjectStatuses.has(record.status)).length, format: "number", snapshot: true, metric: "active-projects" }),
      kpi({ id: "completed-projects", label: "Projects completed", description: "Completion events in this period", value: currentCompleted.length, format: "number", deltaPercent: analyticsDelta(currentCompleted.length, comparisonCompleted.length), metric: "completed-projects" }),
      kpi({ id: "operations-on-time", label: "On-time completion", description: "Completed by recorded due date", value: currentOnTime, format: "percent", deltaPercent: percentDelta(currentOnTime, comparisonOnTime), metric: "completed-projects" }),
      durationKpi({ id: "project-duration", label: "Project duration", description: "Start to completion", metric: "project-duration" }, projectDurations.exact, projectDurations.estimated, comparisonProjectDurations.exact, comparisonProjectDurations.estimated),
      durationKpi({ id: "end-to-end", label: "Request to completion", description: "Intake through linked project completion", metric: "end-to-end" }, endToEndDurations.exact, endToEndDurations.estimated, comparisonEndToEnd.exact, comparisonEndToEnd.estimated),
      kpi({ id: "overdue-projects", label: "Overdue projects", description: "Active projects past their due date", value: projectRecords.filter((record) => activeProjectStatuses.has(record.status) && Boolean(record.dueDate && record.dueDate < asOf)).length, format: "number", snapshot: true, metric: "overdue-projects" })
    ];
    const completionTrend = bucketPoints(range, currentCompleted.map((record) => ({
      date: record.completion!.changedAt,
      value: 1,
      secondary: record.durationDays
    })), timeZone);
    const statuses = new Map<string, number>();
    for (const record of projectRecords.filter((record) => activeProjectStatuses.has(record.status))) statuses.set(record.status, (statuses.get(record.status) ?? 0) + 1);
    charts = [
      { id: "completion-trend", title: "Completion velocity", description: "Weekly completions and average project duration.", type: "line", format: "number", secondaryFormat: "duration", valueLabel: "Completed", secondaryLabel: "Average days", metric: "completed-projects", points: completionTrend },
      { id: "project-workload", title: "Current project workload", description: "Active portfolio by delivery status.", type: "bar", format: "number", valueLabel: "Projects", metric: "active-projects", points: Array.from(statuses, ([key, value]) => ({ key, label: key, value, segment: key })) },
      tradeChart(requestRecords, quoteRecords, currentCompleted, true)
    ];
  }

  if (query.view === "billing") {
    const paidDurations = currentPaid.flatMap((record) => record.durationDays === undefined ? [] : [record.durationDays]);
    const comparisonPaidDurations = comparisonPaid.flatMap((record) => record.durationDays === undefined ? [] : [record.durationDays]);
    const agingOrder = ["Current", "1–30", "31–60", "61–90", "90+", "No due date"];
    const aging = new Map(agingOrder.map((key) => [key, 0]));
    for (const record of receivables) aging.set(agingBucket(record.dueDate, asOf), (aging.get(agingBucket(record.dueDate, asOf)) ?? 0) + (record.value ?? 0));
    const clientBalances = new Map<string, number>();
    for (const record of receivables) clientBalances.set(record.client, (clientBalances.get(record.client) ?? 0) + (record.value ?? 0));
    kpis = [
      kpi({ id: "billing-invoiced", label: "Invoiced", description: "Invoices issued in this period", value: sum(currentBilled.map((record) => record.value ?? 0)), format: "currency", deltaPercent: analyticsDelta(sum(currentBilled.map((record) => record.value ?? 0)), sum(comparisonBilled.map((record) => record.value ?? 0))), metric: "billed" }),
      kpi({ id: "marked-paid", label: "Marked paid", description: "Invoices moved to Paid", value: sum(currentPaid.map((record) => record.paid?.valueSnapshot?.toNumber() ?? record.value ?? 0)), format: "currency", deltaPercent: analyticsDelta(sum(currentPaid.map((record) => record.value ?? 0)), sum(comparisonPaid.map((record) => record.value ?? 0))), metric: "paid" }),
      kpi({ id: "outstanding-ar", label: "Outstanding AR", description: "Current sent and overdue invoices", value: sum(receivables.map((record) => record.value ?? 0)), format: "currency", snapshot: true, metric: "outstanding-ar" }),
      kpi({ id: "billing-overdue-ar", label: "Overdue AR", description: "Current unpaid amount past due", value: sum(overdue.map((record) => record.value ?? 0)), format: "currency", snapshot: true, metric: "overdue-ar" }),
      kpi({ id: "days-to-pay", label: "Issue to paid", description: "Average days for paid invoices", value: average(paidDurations), format: "duration", deltaPercent: percentDelta(average(paidDurations), average(comparisonPaidDurations)), exactSampleCount: currentPaid.filter((record) => record.paid?.precision === "EXACT").length, estimatedSampleCount: currentPaid.filter((record) => record.paid?.precision === "ESTIMATED").length, estimated: !currentPaid.some((record) => record.paid?.precision === "EXACT") && currentPaid.some((record) => record.paid?.precision === "ESTIMATED"), metric: "paid" }),
      kpi({ id: "overdue-count", label: "Overdue invoices", description: "Invoices requiring collection attention", value: overdue.length, format: "number", snapshot: true, metric: "overdue-ar" })
    ];
    const billingTrend = bucketPoints(range, [
      ...currentBilled.map((record) => ({ date: record.createdAt, value: record.value ?? 0 })),
      ...currentPaid.map((record) => ({ date: record.paid!.changedAt, value: 0, secondary: record.paid?.valueSnapshot?.toNumber() ?? record.value ?? 0 }))
    ], timeZone);
    charts = [
      { id: "billing-trend", title: "Billing movement", description: "Invoices issued versus invoices marked paid.", type: "area", format: "currency", secondaryFormat: "currency", valueLabel: "Invoiced", secondaryLabel: "Marked paid", metric: "billing-trend", points: billingTrend },
      { id: "ar-aging", title: "Receivables aging", description: "Outstanding balance grouped by days past due.", type: "bar", format: "currency", valueLabel: "Outstanding", metric: "ar-aging", points: agingOrder.map((key) => ({ key, label: key, value: aging.get(key) ?? 0, segment: key })) },
      { id: "client-balances", title: "Outstanding by client", description: "Clients with the largest current receivable balances.", type: "bar", format: "currency", valueLabel: "Outstanding", metric: "outstanding-client", points: Array.from(clientBalances, ([key, value]) => ({ key, label: key, value, segment: key })).sort((a, b) => b.value - a.value).slice(0, 8) }
    ];
  }

  const records = [...requestRecords, ...quoteRecords, ...revisionRecords, ...projectRecords, ...invoiceRecords];
  const dataQuality: AnalyticsDataQuality = {
    exactLifecycleEvents: data.events.filter((event) => event.precision === "EXACT").length,
    estimatedLifecycleEvents: data.events.filter((event) => event.precision === "ESTIMATED").length,
    message: data.events.some((event) => event.precision === "ESTIMATED") || revisionRecords.some((record) => record.precision === "ESTIMATED")
      ? "Historical lifecycle and revision dates may be estimated from the import; new transitions are exact."
      : undefined
  };

  return {
    view: query.view,
    availableViews: availableViews(user),
    range,
    kpis,
    charts,
    filters: filterOptions(records, data.clients),
    dataQuality,
    generatedAt: new Date().toISOString()
  };
}

function tradeChart(requests: NormalizedRecord[], quotes: NormalizedRecord[], completed: NormalizedRecord[], operations = false): AnalyticsChart {
  const trades = Array.from(new Set([...requests, ...quotes, ...completed].flatMap((record) => record.trades))).sort();
  return {
    id: operations ? "trade-delivery" : "trade-performance",
    title: operations ? "Delivery by trade" : "Performance by trade",
    description: operations ? "Completed projects and average delivery duration." : "Request volume and quote value by applicable trade.",
    type: "bar",
    format: "number",
    secondaryFormat: operations ? "duration" : "currency",
    valueLabel: operations ? "Completed" : "Requests",
    secondaryLabel: operations ? "Average days" : "Quote value",
    metric: operations ? "trade-completion" : "trade-performance",
    overlapNotice: true,
    points: trades.map((trade) => {
      const tradeCompleted = completed.filter((record) => record.trades.includes(trade));
      return {
        key: trade,
        label: trade,
        value: operations ? tradeCompleted.length : requests.filter((record) => record.trades.includes(trade)).length,
        secondaryValue: operations
          ? average(tradeCompleted.flatMap((record) => record.durationDays === undefined ? [] : [record.durationDays])) ?? 0
          : sum(quotes.filter((record) => record.trades.includes(trade)).map((record) => record.value ?? 0)),
        segment: trade
      };
    }).sort((a, b) => b.value - a.value)
  };
}

export async function getAnalyticsDetails(user: AuthenticatedUser, query: AnalyticsDetailsQuery): Promise<AnalyticsDetailsResponse> {
  const data = await loadAnalyticsData(user, query);
  let records: NormalizedRecord[];
  if (/revision/i.test(query.metric)) {
    records = data.revisionRecords.filter((record) =>
      /revision-rate/i.test(query.metric)
        ? inRange(record.sentAt, data.range, data.timeZone)
        : inRange(record.createdAt, data.range, data.timeZone)
    );
  }
  else if (/invoice|billing|paid|ar-aging|outstanding|billed/i.test(query.metric)) records = data.invoiceRecords;
  else if (/project|completion|active-project|end-to-end|overdue-project|trade-completion/i.test(query.metric)) records = data.projectRecords;
  else if (/request|source/i.test(query.metric)) records = data.requestRecords;
  else if (/quote|pipeline|win-rate|margin|approved/i.test(query.metric)) records = data.quoteRecords;
  else if (query.view === "sales") records = [...data.requestRecords, ...data.quoteRecords];
  else if (query.view === "operations") records = data.projectRecords;
  else if (query.view === "billing") records = data.invoiceRecords;
  else records = [...data.requestRecords, ...data.quoteRecords, ...data.projectRecords, ...data.invoiceRecords];

  if (query.segment) {
    records = records.filter((record) =>
      record.trades.includes(query.segment!) ||
      record.status === query.segment ||
      record.kind === query.segment ||
      record.client === query.segment ||
      record.source === query.segment
    );
  }
  if (/overdue/i.test(query.metric)) {
    const asOf = new Date(`${data.range.to}T23:59:59.999Z`);
    records = records.filter((record) => record.status === "Overdue" || Boolean(record.dueDate && record.dueDate < asOf));
  }
  if (/active-project/i.test(query.metric)) records = records.filter((record) => activeProjectStatuses.has(record.status));
  if (/open-pipeline/i.test(query.metric)) records = records.filter((record) => activeQuoteStatuses.has(record.status));
  if (/completed|duration|end-to-end/i.test(query.metric)) records = records.filter((record) => Boolean(record.completion));
  if (/paid/i.test(query.metric)) records = records.filter((record) => Boolean(record.paid));

  records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const offset = Math.max(0, Number(query.cursor) || 0);
  const page = records.slice(offset, offset + query.take);
  return {
    metric: query.metric,
    segment: query.segment,
    summary: `${records.length} ${records.length === 1 ? "record" : "records"} match this selection`,
    rows: page.map(({ clientId: _clientId, createdAt: _createdAt, dueDate: _dueDate, source: _source, margin: _margin, completion: _completion, paid: _paid, requestReceivedAt: _requestReceivedAt, quoteCreatedAt: _quoteCreatedAt, projectStartAt: _projectStartAt, sentAt: _sentAt, precision: _precision, quoteId: _quoteId, ...record }) => record),
    nextCursor: offset + query.take < records.length ? String(offset + query.take) : undefined
  };
}
