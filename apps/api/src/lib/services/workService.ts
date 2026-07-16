import { LifecycleEntityType, Prisma } from "@/generated/prisma/client";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/services/activityService";
import { recordLifecycleStatusEvent } from "@/lib/services/lifecycleEventService";
import {
  createQuoteSystemUpdate,
  listQuoteUpdates
} from "@/lib/services/quoteUpdateService";
import {
  listInvoiceDocuments,
  listProjectDocuments,
  listQuoteDocuments
} from "@/lib/services/documentService";
import {
  createWorkSystemUpdate,
  findEligibleWorkAssignee,
  listWorkUpdates,
  resolveLegacyWorkAssignee,
  resolveWorkAssignee
} from "@/lib/services/workUpdateService";
import type {
  AddAdHocQuoteItemInput,
  AddQuoteItemInput,
  AddQuoteKitInput,
  ItemType,
  QuoteBomSection,
  QuoteItemRecord,
  ReorderQuoteItemsInput,
  UpdateQuoteItemInput,
  UpdateQuoteProposalInput
} from "@pulse/contracts/items";
import type { LifecycleDocumentRecord } from "@pulse/contracts/documents";
import type { ClientContact } from "@pulse/contracts/clients";
import type {
  ConvertQuoteInput,
  CreateQuoteRevisionInput,
  CreateInvoiceInput,
  CreateProjectInput,
  CreateProjectInvoiceInput,
  CreateQuoteInput,
  ReplaceLegacyQuoteFinancialsInput,
  SwitchQuoteCalculationModeInput,
  UpdateInvoiceInput,
  UpdateProjectInput,
  UpdateQuoteInput,
  InvoiceRecord,
  BillingProjectSummary,
  LifecycleContextSummary,
  LifecycleRelationshipWarning,
  LifecycleSiteSummary,
  ProjectRecord,
  ProjectQuoteFinancialSnapshot,
  ProjectProgress,
  ProjectTaskRecord,
  QuoteContextSnapshot,
  QuoteDetailRecord,
  QuoteRevisionDetailRecord,
  QuoteRecord,
  QuoteCalculationMode
} from "@pulse/contracts/work";
import {
  planQuoteBomSources,
  type QuoteBomCatalogItem
} from "@/modules/quote-items/quote-bom";
import {
  calculateMarkupPercent,
  calculateQuoteLine
} from "@/modules/quote-items/quote-calculations";
import {
  calculateLegacyQuoteFinancials,
  calculatePulseQuoteFinancials,
  exactFinancialSummarySnapshot,
  legacyFinancialsRecord,
  quoteFinancialsAreEmpty,
  toQuoteFinancialSummary,
  type QuoteFinancialSummaryDecimal
} from "@/modules/quotes/quote-financials";

const quoteContactSelect = {
  id: true,
  siteId: true,
  role: true,
  name: true,
  firstName: true,
  lastName: true,
  title: true,
  department: true,
  email: true,
  phone: true,
  mobile: true,
  preferredContactMethod: true,
  isPrimary: true,
  isBilling: true,
  isPrimaryContact: true,
  isBillingContact: true,
  isTechnicalContact: true,
  isDecisionMaker: true,
  notes: true,
  site: { select: { siteName: true } }
} satisfies Prisma.PointOfContactSelect;

const lifecycleSiteSelect = {
  id: true,
  siteName: true,
  address: true,
  addressLine1: true,
  city: true,
  state: true
} satisfies Prisma.ClientSiteSelect;

const lifecycleContextInclude = {
  updatedBy: { include: { accessRole: true } }
} satisfies Prisma.LifecycleContextInclude;

export const quoteInclude = {
  client: { select: { id: true, displayName: true } },
  contact: { select: quoteContactSelect },
  site: { select: lifecycleSiteSelect },
  assignedTo: { include: { accessRole: true } },
  lifecycleContext: { include: lifecycleContextInclude },
  items: {
    select: {
      itemType: true,
      quantity: true,
      unitCost: true,
      lineSubtotal: true,
      lineTax: true
    }
  },
  requests: {
    where: { archivedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 1,
    select: {
      id: true,
      requestNumber: true,
      title: true,
      requestType: true,
      serviceCategory: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      siteName: true,
      siteAddress: true,
      city: true,
      state: true,
      description: true,
      internalNotes: true,
      trades: { select: { serviceCategory: true } },
      contact: { select: { name: true, email: true, phone: true } },
      site: {
        select: {
          siteName: true,
          addressLine1: true,
          city: true,
          state: true
        }
      }
    }
  },
  project: { select: { id: true } }
} satisfies Prisma.QuoteInclude;

const quoteItemsOrderBy = [
  { sortOrder: "asc" },
  { createdAt: "asc" }
] satisfies Prisma.QuoteItemOrderByWithRelationInput[];

const quoteDetailInclude = {
  ...quoteInclude,
  items: { orderBy: quoteItemsOrderBy },
  revisions: { orderBy: { revisionNumber: "asc" } }
} satisfies Prisma.QuoteInclude;

const itemForQuoteInclude = {
  outgoingRelations: {
    include: { childItem: true },
    orderBy: [{ sortOrder: "asc" }]
  },
  defaultLaborItem: true
} satisfies Prisma.ItemInclude;

export const projectInclude = {
  client: { select: { id: true, displayName: true } },
  quote: { select: { id: true, quoteNumber: true } },
  contact: { select: quoteContactSelect },
  site: { select: lifecycleSiteSelect },
  assignedTo: { include: { accessRole: true } },
  lifecycleContext: { include: lifecycleContextInclude },
  tasks: {
    where: { archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { assignedTo: { include: { accessRole: true } } }
  },
  invoices: {
    where: { archivedAt: null },
    select: { id: true }
  }
} satisfies Prisma.ProjectInclude;

export const invoiceInclude = {
  client: { select: { id: true, displayName: true } },
  project: {
    select: {
      id: true,
      projectNumber: true,
      budget: true,
      invoices: {
        where: { archivedAt: null },
        orderBy: [{ issuedDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          invoiceNumber: true,
          title: true,
          status: true,
          amount: true,
          issuedDate: true,
          dueDate: true
        }
      }
    }
  },
  contact: { select: quoteContactSelect },
  site: { select: lifecycleSiteSelect },
  assignedTo: { include: { accessRole: true } },
  lifecycleContext: { include: lifecycleContextInclude }
} satisfies Prisma.InvoiceInclude;

type QuoteWithRelations = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;
type QuoteRecordSource = Omit<QuoteWithRelations, "requests"> & {
  requests: Array<{
    id: string;
    requestNumber: string;
    serviceCategory?: string | null;
    trades?: Array<{ serviceCategory: string }>;
  }>;
};
type QuoteDetailWithRelations = Prisma.QuoteGetPayload<{
  include: typeof quoteDetailInclude;
}>;
type QuoteContactWithSite = Prisma.PointOfContactGetPayload<{
  select: typeof quoteContactSelect;
}>;
type ItemForQuote = Prisma.ItemGetPayload<{ include: typeof itemForQuoteInclude }>;
type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;
type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;
type LifecycleSiteSource = Prisma.ClientSiteGetPayload<{ select: typeof lifecycleSiteSelect }>;
type LifecycleContextSource = Prisma.LifecycleContextGetPayload<{ include: typeof lifecycleContextInclude }>;
export const projectTaskInclude = {
  assignedTo: { include: { accessRole: true } }
} satisfies Prisma.ProjectTaskInclude;
type ProjectTaskWithAssignee = Prisma.ProjectTaskGetPayload<{ include: typeof projectTaskInclude }>;

function dateInput(value?: string | null) {
  return value ? new Date(`${value}T12:00:00.000Z`) : null;
}

function dateOutput(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function dateTimeOutput(value?: Date | null) {
  return value ? value.toISOString() : "";
}

function empty(value?: string | null) {
  return value ?? "";
}

function pointOfContactName(contact: {
  name: string | null;
  firstName: string;
  lastName: string;
}) {
  return contact.name?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    "Not captured";
}

function toQuoteContact(contact?: QuoteContactWithSite | null): ClientContact | null {
  if (!contact) return null;
  return {
    id: contact.id,
    siteId: contact.siteId ?? undefined,
    siteName: contact.site?.siteName ?? undefined,
    role: empty(contact.role),
    firstName: contact.firstName,
    lastName: contact.lastName,
    name: pointOfContactName(contact),
    title: empty(contact.title),
    department: empty(contact.department),
    email: empty(contact.email),
    phone: empty(contact.phone),
    mobile: empty(contact.mobile),
    preferredContactMethod: empty(contact.preferredContactMethod),
    isPrimary: contact.isPrimary,
    isBilling: contact.isBilling,
    isPrimaryContact: contact.isPrimary || contact.isPrimaryContact,
    isBillingContact: contact.isBilling || contact.isBillingContact,
    isTechnicalContact: contact.isTechnicalContact,
    isDecisionMaker: contact.isDecisionMaker,
    notes: empty(contact.notes)
  };
}

function categoriesFromSnapshot(value?: string | null) {
  return (value ?? "")
    .split(",")
    .map((category) => category.trim())
    .filter(Boolean);
}

function nullable(value?: string) {
  return value ? value : null;
}

function toWorkAssignee(user: {
  id: string;
  name: string;
  email: string;
  accessRole: { id: string; name: string; color: string };
} | null) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.accessRole.id,
    roleLabel: user.accessRole.name,
    roleColor: user.accessRole.color
  };
}

function toLifecycleSite(site?: LifecycleSiteSource | null): LifecycleSiteSummary | null {
  if (!site) return null;
  return {
    id: site.id,
    siteName: site.siteName,
    address: site.addressLine1 ?? site.address ?? "",
    city: site.city ?? "",
    state: site.state ?? ""
  };
}

function toLifecycleContext(
  context?: LifecycleContextSource | null,
  fallbackDetails = ""
): LifecycleContextSummary {
  return {
    id: context?.id ?? "",
    details: context?.details ?? fallbackDetails,
    updatedAt: dateTimeOutput(context?.updatedAt),
    updatedBy: toWorkAssignee(context?.updatedBy ?? null),
    updatedByName: context?.updatedBy?.name ?? context?.updatedByNameSnapshot ?? "Pulse System"
  };
}

function unresolvedWarning(
  field: LifecycleRelationshipWarning["field"],
  legacyValue?: string | null
): LifecycleRelationshipWarning | null {
  const value = legacyValue?.trim();
  if (!value || value.toLowerCase() === "unassigned") return null;
  return {
    field,
    legacyValue: value,
    message: `Legacy ${field} could not be matched uniquely. Select a linked record to resolve it.`
  };
}

export function calculateProjectProgress(
  tasks: Array<{ status: string; weight: number; archivedAt?: Date | null }>
): ProjectProgress {
  const active = tasks.filter((task) => !task.archivedAt);
  const totalWeight = active.reduce((sum, task) => sum + task.weight, 0);
  const completedWeight = active
    .filter((task) => task.status === "DONE")
    .reduce((sum, task) => sum + task.weight, 0);
  return {
    percent: totalWeight === 0 ? 0 : Math.round((completedWeight / totalWeight) * 100),
    completedWeight,
    totalWeight,
    completedTasks: active.filter((task) => task.status === "DONE").length,
    totalTasks: active.length
  };
}

export function toProjectTask(task: ProjectTaskWithAssignee): ProjectTaskRecord {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    status: task.status as ProjectTaskRecord["status"],
    weight: task.weight,
    assignedToId: task.assignedToId,
    assignedTo: toWorkAssignee(task.assignedTo),
    dueDate: dateOutput(task.dueDate),
    notes: empty(task.notes),
    sortOrder: task.sortOrder,
    completedAt: dateTimeOutput(task.completedAt),
    createdAt: dateTimeOutput(task.createdAt),
    updatedAt: dateTimeOutput(task.updatedAt)
  };
}

export function calculateBillingSummary(
  invoice: InvoiceWithRelations
): BillingProjectSummary {
  const source = invoice.project?.invoices ?? [{
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    title: invoice.title,
    status: invoice.status,
    amount: invoice.amount,
    issuedDate: invoice.issuedDate,
    dueDate: invoice.dueDate
  }];
  const budget = Number(invoice.project?.budget ?? 0);
  const totals = calculateBillingTotals(
    budget,
    source.map((milestone) => ({ status: milestone.status, amount: Number(milestone.amount) })),
    Boolean(invoice.project)
  );
  return {
    projectId: invoice.project?.id ?? null,
    projectNumber: invoice.project?.projectNumber ?? "",
    projectBudget: budget,
    ...totals,
    milestones: source.map((milestone) => ({
      invoiceId: milestone.id,
      invoiceNumber: milestone.invoiceNumber,
      title: milestone.title,
      status: milestone.status as InvoiceRecord["status"],
      amount: Number(milestone.amount),
      issuedDate: dateOutput(milestone.issuedDate),
      dueDate: dateOutput(milestone.dueDate),
      isCurrent: milestone.id === invoice.id
    }))
  };
}

export function calculateBillingTotals(
  projectBudget: number,
  milestones: Array<{ status: string; amount: number }>,
  hasProject = true
) {
  const active = milestones.filter((milestone) => milestone.status !== "Void");
  const sum = (statuses?: Set<string>) => active
    .filter((milestone) => !statuses || statuses.has(milestone.status))
    .reduce((total, milestone) => total + milestone.amount, 0);
  const planned = sum();
  return {
    planned,
    invoiced: sum(new Set(["Sent", "Paid", "Overdue"])),
    paid: sum(new Set(["Paid"])),
    outstanding: sum(new Set(["Sent", "Overdue"])),
    remaining: hasProject ? Math.max(projectBudget - planned, 0) : 0
  };
}

export function parseQuoteVersionNumber(quoteNumber: string) {
  const trimmed = quoteNumber.trim();
  const match = /R(\d+)$/i.exec(trimmed);
  if (!match) return { baseQuoteNumber: trimmed, revisionNumber: 0 };
  return {
    baseQuoteNumber: trimmed.slice(0, match.index),
    revisionNumber: Number(match[1])
  };
}

function quoteVersionFields(quote: {
  quoteNumber: string;
  baseQuoteNumber: string | null;
  revisionNumber: number;
  versionCreatedAt: Date | null;
  createdAt: Date;
  sentAt: Date | null;
  sentAtPrecision: "EXACT" | "ESTIMATED" | null;
}) {
  const parsed = parseQuoteVersionNumber(quote.quoteNumber);
  return {
    baseQuoteNumber: quote.baseQuoteNumber || parsed.baseQuoteNumber,
    revisionNumber: quote.revisionNumber || parsed.revisionNumber,
    versionCreatedAt: quote.versionCreatedAt ?? quote.createdAt,
    sentAt: quote.sentAt,
    sentAtPrecision: quote.sentAtPrecision
  };
}

function revisionSnapshotObject(snapshot: Prisma.JsonValue) {
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? snapshot as Record<string, Prisma.JsonValue>
    : {};
}

function revisionSnapshotAvailable(snapshot: Prisma.JsonValue) {
  return revisionSnapshotObject(snapshot).dataAvailable !== false;
}

function emptyQuoteContext(): QuoteContextSnapshot {
  return {
    sourceRequestId: null,
    requestNumber: "",
    requestTitle: "",
    requestType: "",
    serviceCategory: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    siteName: "",
    siteAddress: "",
    city: "",
    state: "",
    scopeDescription: "",
    internalNotes: ""
  };
}

function quoteItemSection(itemType: ItemType): QuoteBomSection {
  if (itemType === "LABOR") return "Labor";
  if (itemType === "SERVICE") return "Services";
  return "Materials";
}

type QuoteFinancialSource = {
  calculationMode: QuoteCalculationMode;
  legacyMaterialSale: Prisma.Decimal;
  legacyMaterialCost: Prisma.Decimal;
  legacyLaborSale: Prisma.Decimal;
  legacyLaborCost: Prisma.Decimal;
  legacyTaxAmount: Prisma.Decimal;
  legacyEstimatedDurationBusinessDays: number | null;
  items: Array<{
    itemType: ItemType;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    lineSubtotal: Prisma.Decimal;
    lineTax: Prisma.Decimal;
  }>;
};

function quoteFinancialSummaryDecimal(quote: QuoteFinancialSource) {
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

function quoteFinancialSummary(quote: QuoteFinancialSource) {
  return toQuoteFinancialSummary(quoteFinancialSummaryDecimal(quote));
}

export function toQuoteRecord(
  quote: QuoteRecordSource,
  documents: LifecycleDocumentRecord[] = []
): QuoteRecord {
  const request = quote.requests[0];
  const version = quoteVersionFields(quote);
  const financialSummary = quoteFinancialSummary(quote);
  const trades = quote.serviceCategorySnapshot !== null
    ? categoriesFromSnapshot(quote.serviceCategorySnapshot)
    : request?.trades?.length
      ? request.trades.map((trade) => trade.serviceCategory)
      : categoriesFromSnapshot(request?.serviceCategory);
  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    baseQuoteNumber: version.baseQuoteNumber,
    revisionNumber: version.revisionNumber,
    versionCreatedAt: dateTimeOutput(version.versionCreatedAt),
    sentAt: dateTimeOutput(version.sentAt),
    sentAtPrecision: version.sentAtPrecision,
    title: quote.title,
    clientId: quote.clientId,
    clientName: quote.client?.displayName ?? quote.clientName ?? "",
    contactId: quote.contactId,
    contact: toQuoteContact(quote.contact),
    siteId: quote.siteId,
    site: toLifecycleSite(quote.site),
    assignedToId: quote.assignedToId,
    assignedTo: toWorkAssignee(quote.assignedTo),
    status: quote.status as QuoteRecord["status"],
    owner: quote.assignedTo?.name ?? quote.owner,
    calculationMode: quote.calculationMode,
    total: financialSummary.finalCustomerTotal,
    legacyFinancials: legacyFinancialsRecord(quote),
    financialSummary,
    requestId: request?.id ?? null,
    requestNumber: request?.requestNumber ?? "",
    trades,
    projectId: quote.project?.id ?? null,
    createdAt: dateOutput(quote.createdAt),
    updatedAt: quote.updatedAt.toISOString(),
    documents,
    lifecycleContext: toLifecycleContext(
      quote.lifecycleContext,
      quote.scopeDescriptionSnapshot ?? ""
    ),
    relationshipWarnings: [
      !quote.clientId ? unresolvedWarning("client", quote.clientName) : null,
      !quote.contactId ? unresolvedWarning("contact", quote.contactNameSnapshot) : null,
      !quote.siteId
        ? unresolvedWarning("site", quote.siteNameSnapshot ?? quote.siteAddressSnapshot)
        : null,
      !quote.assignedToId ? unresolvedWarning("assignedTo", quote.owner) : null
    ].filter((warning): warning is LifecycleRelationshipWarning => Boolean(warning))
  };
}

function toQuoteContextSnapshot(
  quote: QuoteDetailWithRelations
): QuoteContextSnapshot {
  const request = quote.requests[0];
  const liveCategories = request?.trades.length
    ? request.trades.map((trade) => trade.serviceCategory).join(", ")
    : request?.serviceCategory;

  return {
    sourceRequestId: quote.sourceRequestIdSnapshot ?? request?.id ?? null,
    requestNumber: empty(quote.requestNumberSnapshot ?? request?.requestNumber),
    requestTitle: empty(quote.requestTitleSnapshot ?? request?.title),
    requestType: empty(quote.requestTypeSnapshot ?? request?.requestType),
    serviceCategory: empty(
      quote.serviceCategorySnapshot ?? liveCategories
    ),
    contactName: empty(
      quote.contactNameSnapshot ??
        (quote.contact ? pointOfContactName(quote.contact) : null) ??
        request?.contactName ??
        request?.contact?.name
    ),
    contactEmail: empty(
      quote.contactEmailSnapshot ?? quote.contact?.email ?? request?.contactEmail ?? request?.contact?.email
    ),
    contactPhone: empty(
      quote.contactPhoneSnapshot ?? quote.contact?.phone ?? quote.contact?.mobile ?? request?.contactPhone ?? request?.contact?.phone
    ),
    siteName: empty(
      quote.siteNameSnapshot ?? request?.siteName ?? request?.site?.siteName
    ),
    siteAddress: empty(
      quote.siteAddressSnapshot ?? request?.siteAddress ?? request?.site?.addressLine1
    ),
    city: empty(quote.citySnapshot ?? request?.city ?? request?.site?.city),
    state: empty(quote.stateSnapshot ?? request?.state ?? request?.site?.state),
    scopeDescription: empty(
      quote.scopeDescriptionSnapshot ?? request?.description
    ),
    internalNotes: empty(
      quote.internalNotesSnapshot ?? request?.internalNotes
    )
  };
}

export function toQuoteItemRecord(
  item: QuoteDetailWithRelations["items"][number]
): QuoteItemRecord {
  return {
    id: item.id,
    quoteId: item.quoteId,
    sourceItemId: item.sourceItemId,
    section: item.section as QuoteBomSection,
    name: item.name,
    description: empty(item.description),
    itemType: item.itemType as ItemType,
    sku: empty(item.sku),
    partNumber: empty(item.partNumber),
    manufacturer: empty(item.manufacturer),
    brand: empty(item.brand),
    quantity: Number(item.quantity),
    unitOfMeasure: empty(item.unitOfMeasure),
    unitCost: Number(item.unitCost),
    unitPrice: Number(item.unitPrice),
    markupPercent: Number(item.markupPercent),
    discountPercent: Number(item.discountPercent),
    taxable: item.taxable,
    imageUrl: empty(item.imageUrl),
    productUrl: empty(item.productUrl),
    lineSubtotal: Number(item.lineSubtotal),
    lineTax: Number(item.lineTax),
    lineTotal: Number(item.lineTotal),
    sortOrder: item.sortOrder,
    createdAt: dateTimeOutput(item.createdAt),
    updatedAt: dateTimeOutput(item.updatedAt)
  };
}

export function toQuoteDetailRecord(
  quote: QuoteDetailWithRelations,
  documents: LifecycleDocumentRecord[] = [],
  updateState?: Awaited<ReturnType<typeof listQuoteUpdates>>
): QuoteDetailRecord {
  const version = quoteVersionFields(quote);
  return {
    ...toQuoteRecord(quote, documents),
    context: toQuoteContextSnapshot(quote),
    proposalNotes: empty(quote.proposalNotes),
    proposalPreparedAt: dateTimeOutput(quote.proposalPreparedAt),
    items: quote.items.map(toQuoteItemRecord),
    currentStep: updateState?.currentStep ?? null,
    unreadMentionCount: updateState?.unreadMentionCount ?? 0,
    updates: updateState?.updates ?? [],
    versions: [
      ...quote.revisions.map((revision) => ({
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        quoteNumber: revision.quoteNumber,
        outcome: "Revision Requested" as const,
        priorStatus: revision.priorStatus as QuoteRecord["status"],
        title: revision.titleSnapshot,
        owner: revision.ownerSnapshot,
        total: Number(revision.totalSnapshot),
        versionCreatedAt: dateTimeOutput(revision.versionCreatedAt),
        sentAt: dateTimeOutput(revision.sentAt),
        requestedAt: dateTimeOutput(revision.requestedAt),
        reason: revision.reason,
        precision: revision.precision,
        isCurrent: false,
        dataAvailable: revisionSnapshotAvailable(revision.snapshot)
      })),
      {
        id: quote.id,
        revisionNumber: version.revisionNumber,
        quoteNumber: quote.quoteNumber,
        outcome: quote.status as QuoteRecord["status"],
        priorStatus: "" as const,
        title: quote.title,
        owner: quote.assignedTo?.name ?? quote.owner,
        total: quoteFinancialSummary(quote).finalCustomerTotal,
        versionCreatedAt: dateTimeOutput(version.versionCreatedAt),
        sentAt: dateTimeOutput(version.sentAt),
        requestedAt: "",
        reason: "",
        precision: version.sentAtPrecision ?? "EXACT",
        isCurrent: true,
        dataAvailable: true
      }
    ]
  };
}

function toQuoteRevisionDetailRecord(
  revision: Prisma.QuoteRevisionGetPayload<{}>
): QuoteRevisionDetailRecord {
  const snapshot = revisionSnapshotObject(revision.snapshot);
  const context = snapshot.context && typeof snapshot.context === "object" && !Array.isArray(snapshot.context)
    ? snapshot.context as unknown as QuoteContextSnapshot
    : emptyQuoteContext();
  const items = Array.isArray(snapshot.items)
    ? snapshot.items as unknown as QuoteItemRecord[]
    : [];
  const contact = snapshot.contact && typeof snapshot.contact === "object" && !Array.isArray(snapshot.contact)
    ? snapshot.contact as unknown as ClientContact
    : null;
  const calculationMode = snapshot.calculationMode === "LEGACY" ? "LEGACY" : "PULSE";
  const legacySnapshot = snapshot.legacyFinancials && typeof snapshot.legacyFinancials === "object" && !Array.isArray(snapshot.legacyFinancials)
    ? snapshot.legacyFinancials as Record<string, Prisma.JsonValue>
    : {};
  const legacyFinancials = {
    materialSale: Number(legacySnapshot.materialSale ?? (calculationMode === "LEGACY" ? revision.totalSnapshot : 0)),
    materialCost: Number(legacySnapshot.materialCost ?? 0),
    laborSale: Number(legacySnapshot.laborSale ?? 0),
    laborCost: Number(legacySnapshot.laborCost ?? 0),
    taxAmount: Number(legacySnapshot.taxAmount ?? 0),
    estimatedDurationBusinessDays: typeof legacySnapshot.estimatedDurationBusinessDays === "number"
      ? legacySnapshot.estimatedDurationBusinessDays
      : null
  };
  const calculated = calculationMode === "LEGACY"
    ? calculateLegacyQuoteFinancials(legacyFinancials)
    : calculatePulseQuoteFinancials(items.map((item) => ({
        itemType: item.itemType,
        quantity: item.quantity,
        unitCost: item.unitCost,
        lineSubtotal: item.lineSubtotal,
        lineTax: item.lineTax
      })));
  return {
    quoteId: revision.quoteId,
    baseQuoteNumber: typeof snapshot.baseQuoteNumber === "string"
      ? snapshot.baseQuoteNumber
      : parseQuoteVersionNumber(revision.quoteNumber).baseQuoteNumber,
    clientId: revision.clientIdSnapshot,
    clientName: revision.clientNameSnapshot ?? "",
    revision: {
      id: revision.id,
      revisionNumber: revision.revisionNumber,
      quoteNumber: revision.quoteNumber,
      outcome: "Revision Requested",
      priorStatus: revision.priorStatus as QuoteRecord["status"],
      title: revision.titleSnapshot,
      owner: revision.ownerSnapshot,
      total: Number(revision.totalSnapshot),
      versionCreatedAt: dateTimeOutput(revision.versionCreatedAt),
      sentAt: dateTimeOutput(revision.sentAt),
      requestedAt: dateTimeOutput(revision.requestedAt),
      reason: revision.reason,
      precision: revision.precision,
      isCurrent: false,
      dataAvailable: revisionSnapshotAvailable(revision.snapshot)
    },
    contact,
    context,
    proposalNotes: typeof snapshot.proposalNotes === "string" ? snapshot.proposalNotes : "",
    proposalPreparedAt: typeof snapshot.proposalPreparedAt === "string" ? snapshot.proposalPreparedAt : "",
    calculationMode,
    legacyFinancials,
    financialSummary: toQuoteFinancialSummary(calculated),
    items
  };
}

function toProjectQuoteFinancialSnapshot(
  value: Prisma.JsonValue | null
): ProjectQuoteFinancialSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, Prisma.JsonValue>;
  const financial = source.financialSummary;
  if (!financial || typeof financial !== "object" || Array.isArray(financial)) return null;
  const summary = financial as Record<string, Prisma.JsonValue>;
  const calculationMode = source.calculationMode === "LEGACY" ? "LEGACY" : "PULSE";
  const amount = (key: string) => Number(summary[key] ?? 0);
  const nullableAmount = (key: string) => summary[key] === null || summary[key] === undefined
    ? null
    : Number(summary[key]);
  return {
    sourceQuoteId: String(source.sourceQuoteId ?? ""),
    sourceQuoteNumber: String(source.sourceQuoteNumber ?? ""),
    sourceQuoteRevisionNumber: Number(source.sourceQuoteRevisionNumber ?? 0),
    calculationMode,
    financialSummary: {
      materialRevenue: amount("materialRevenue"),
      laborRevenue: amount("laborRevenue"),
      serviceRevenue: amount("serviceRevenue"),
      preTaxContractValue: amount("preTaxContractValue"),
      taxAmount: amount("taxAmount"),
      finalCustomerTotal: amount("finalCustomerTotal"),
      materialCost: amount("materialCost"),
      laborCost: amount("laborCost"),
      serviceCost: amount("serviceCost"),
      totalEstimatedCost: amount("totalEstimatedCost"),
      grossProfit: amount("grossProfit"),
      grossMarginPercent: nullableAmount("grossMarginPercent"),
      markupPercent: nullableAmount("markupPercent"),
      estimatedDurationBusinessDays: summary.estimatedDurationBusinessDays === null || summary.estimatedDurationBusinessDays === undefined
        ? null
        : Number(summary.estimatedDurationBusinessDays)
    }
  };
}

export function toProjectRecord(
  project: ProjectWithRelations,
  documents: LifecycleDocumentRecord[] = []
): ProjectRecord {
  return {
    id: project.id,
    projectNumber: project.projectNumber,
    title: project.title,
    clientId: project.clientId,
    clientName: project.client.displayName,
    quoteId: project.quoteId,
    quoteNumber: project.quote?.quoteNumber ?? "",
    contactId: project.contactId,
    contact: toQuoteContact(project.contact),
    siteId: project.siteId,
    site: toLifecycleSite(project.site),
    assignedToId: project.assignedToId,
    assignedTo: toWorkAssignee(project.assignedTo),
    status: project.status as ProjectRecord["status"],
    budget: Number(project.budget),
    sourceQuoteRevisionNumber: project.sourceQuoteRevisionNumber,
    sourceQuoteCalculationMode: project.sourceQuoteCalculationMode,
    quoteFinancialSnapshot: toProjectQuoteFinancialSnapshot(project.quoteFinancialSnapshot),
    startDate: dateOutput(project.startDate),
    dueDate: dateOutput(project.dueDate),
    invoiceCount: project.invoices.length,
    createdAt: dateOutput(project.createdAt),
    updatedAt: project.updatedAt.toISOString(),
    documents,
    lifecycleContext: toLifecycleContext(project.lifecycleContext),
    relationshipWarnings: [
      !project.assignedToId ? unresolvedWarning("assignedTo", project.ownerSnapshot) : null
    ].filter((warning): warning is LifecycleRelationshipWarning => Boolean(warning))
  };
}

export function toInvoiceRecord(
  invoice: InvoiceWithRelations,
  documents: LifecycleDocumentRecord[] = []
): InvoiceRecord {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    title: invoice.title,
    clientId: invoice.clientId,
    clientName: invoice.client.displayName,
    projectId: invoice.projectId,
    projectNumber: invoice.project?.projectNumber ?? "",
    contactId: invoice.contactId,
    contact: toQuoteContact(invoice.contact),
    siteId: invoice.siteId,
    site: toLifecycleSite(invoice.site),
    assignedToId: invoice.assignedToId,
    assignedTo: toWorkAssignee(invoice.assignedTo),
    status: invoice.status as InvoiceRecord["status"],
    amount: Number(invoice.amount),
    issuedDate: dateOutput(invoice.issuedDate),
    dueDate: dateOutput(invoice.dueDate),
    createdAt: dateOutput(invoice.createdAt),
    updatedAt: invoice.updatedAt.toISOString(),
    documents,
    lifecycleContext: toLifecycleContext(invoice.lifecycleContext),
    relationshipWarnings: [
      !invoice.assignedToId ? unresolvedWarning("assignedTo", invoice.ownerSnapshot) : null
    ].filter((warning): warning is LifecycleRelationshipWarning => Boolean(warning))
  };
}

async function clientOrThrow(clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, archivedAt: null },
    select: { id: true, displayName: true }
  });
  if (!client) throw new Error("CLIENT_NOT_FOUND");
  return client;
}

async function contactForClientOrThrow(contactId: string, clientId: string) {
  const contact = await prisma.pointOfContact.findUnique({
    where: { id: contactId },
    select: {
      ...quoteContactSelect,
      clientId: true,
      ownerType: true,
      ownerId: true
    }
  });
  if (!contact) throw new Error("CONTACT_NOT_FOUND");
  if (
    contact.clientId !== clientId ||
    contact.ownerType !== "Client" ||
    contact.ownerId !== clientId
  ) {
    throw new Error("WORK_CLIENT_MISMATCH");
  }
  return contact;
}

async function siteForClientOrThrow(
  siteId: string,
  clientId: string,
  db: typeof prisma | Prisma.TransactionClient = prisma
) {
  const site = await db.clientSite.findFirst({
    where: { id: siteId, clientId },
    select: lifecycleSiteSelect
  });
  if (!site) throw new Error("WORK_CLIENT_MISMATCH");
  return site;
}

async function activeUserOrThrow(
  userId: string,
  db: typeof prisma | Prisma.TransactionClient = prisma
) {
  const user = await db.localUser.findFirst({
    where: { id: userId, active: true },
    include: { accessRole: true }
  });
  if (!user || user.accessRole.archivedAt) throw new Error("WORK_ASSIGNEE_INVALID");
  return user;
}

async function createLifecycleContext(
  tx: Prisma.TransactionClient,
  details: string | undefined,
  user?: AuthenticatedUser
) {
  return tx.lifecycleContext.create({
    data: {
      details: details ?? "",
      updatedById: user?.id ?? null,
      updatedByNameSnapshot: user?.name ?? "Pulse System"
    }
  });
}

async function updateLifecycleDetails(
  tx: Prisma.TransactionClient,
  lifecycleContextId: string | null,
  details: string | undefined,
  user?: AuthenticatedUser
) {
  if (details === undefined) return lifecycleContextId;
  if (!lifecycleContextId) {
    return (await createLifecycleContext(tx, details, user)).id;
  }
  await tx.lifecycleContext.update({
    where: { id: lifecycleContextId },
    data: {
      details,
      updatedById: user?.id ?? null,
      updatedByNameSnapshot: user?.name ?? "Pulse System"
    }
  });
  return lifecycleContextId;
}

async function nextNumber(
  tx: Prisma.TransactionClient,
  kind: "quote" | "project" | "invoice"
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pulse-number:${kind}`}))`;
  const year = new Date().getUTCFullYear();
  const prefix = kind === "quote" ? "QT" : kind === "project" ? "PRJ" : "INV";
  const count =
    kind === "quote"
      ? await tx.quote.count()
      : kind === "project"
        ? await tx.project.count()
        : await tx.invoice.count();
  return `${prefix}-${year}-${String(count + 1001).padStart(4, "0")}`;
}

async function quoteOrThrow(id: string) {
  const quote = await prisma.quote.findFirst({
    where: { archivedAt: null, OR: [{ id }, { quoteNumber: id }, { baseQuoteNumber: id }] },
    include: quoteInclude
  });
  if (!quote) throw new Error("QUOTE_NOT_FOUND");
  return quote;
}

async function quoteDetailOrThrow(id: string) {
  let quote = await prisma.quote.findFirst({
    where: { archivedAt: null, OR: [{ id }, { quoteNumber: id }, { baseQuoteNumber: id }] },
    include: quoteDetailInclude
  });
  if (!quote) {
    const alias = await prisma.quoteRevision.findFirst({
      where: { OR: [{ id }, { quoteNumber: id }, { legacyQuoteId: id }] },
      select: { quoteId: true }
    });
    if (alias) {
      quote = await prisma.quote.findFirst({
        where: { id: alias.quoteId, archivedAt: null },
        include: quoteDetailInclude
      });
    }
  }
  if (!quote) throw new Error("QUOTE_NOT_FOUND");
  return quote;
}

async function activeItemOrThrow(
  tx: Prisma.TransactionClient,
  id: string
) {
  const item = await tx.item.findFirst({
    where: { id, status: "ACTIVE" },
    include: itemForQuoteInclude
  });
  if (!item) throw new Error("ITEM_NOT_FOUND");
  return item;
}

async function projectOrThrow(id: string) {
  const project = await prisma.project.findFirst({
    where: { archivedAt: null, OR: [{ id }, { projectNumber: id }] },
    include: projectInclude
  });
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  return project;
}

async function invoiceOrThrow(id: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { archivedAt: null, OR: [{ id }, { invoiceNumber: id }] },
    include: invoiceInclude
  });
  if (!invoice) throw new Error("INVOICE_NOT_FOUND");
  return invoice;
}

export async function listQuotes() {
  const quotes = await prisma.quote.findMany({
      where: { archivedAt: null },
      include: quoteInclude,
      orderBy: { updatedAt: "desc" }
    });
  return Promise.all(
    quotes.map(async (quote) => toQuoteRecord(quote, await listQuoteDocuments(quote.id)))
  );
}

export async function getQuoteById(id: string, viewerId?: string) {
  const quote = await quoteDetailOrThrow(id);
  const [documents, updateState] = await Promise.all([
    listQuoteDocuments(quote.id),
    listQuoteUpdates(quote.id, "all", undefined, 25, viewerId)
  ]);
  return toQuoteDetailRecord(quote, documents, updateState);
}

export async function getQuoteRevision(id: string, version: string) {
  const quote = await quoteOrThrow(id);
  const parsedVersion = /^\d+$/.test(version) ? Number(version) : null;
  if (parsedVersion === quoteVersionFields(quote).revisionNumber) {
    throw new Error("QUOTE_REVISION_IS_CURRENT");
  }
  const revision = await prisma.quoteRevision.findFirst({
    where: {
      quoteId: quote.id,
      OR: [
        { id: version },
        { quoteNumber: version },
        { legacyQuoteId: version },
        ...(parsedVersion === null ? [] : [{ revisionNumber: parsedVersion }])
      ]
    }
  });
  if (!revision) throw new Error("QUOTE_REVISION_NOT_FOUND");
  return toQuoteRevisionDetailRecord(revision);
}

async function nextQuoteItemSortOrder(
  tx: Prisma.TransactionClient,
  quoteId: string
) {
  const aggregate = await tx.quoteItem.aggregate({
    where: { quoteId },
    _max: { sortOrder: true }
  });
  return (aggregate._max.sortOrder ?? -1) + 1;
}

async function recalculateQuoteTotal(
  tx: Prisma.TransactionClient,
  quoteId: string
) {
  const quote = await tx.quote.findUniqueOrThrow({
    where: { id: quoteId },
    select: {
      calculationMode: true,
      legacyMaterialSale: true,
      legacyMaterialCost: true,
      legacyLaborSale: true,
      legacyLaborCost: true,
      legacyTaxAmount: true,
      legacyEstimatedDurationBusinessDays: true,
      items: {
        select: {
          itemType: true,
          quantity: true,
          unitCost: true,
          lineSubtotal: true,
          lineTax: true
        }
      }
    }
  });
  const summary = quoteFinancialSummaryDecimal(quote);
  return tx.quote.update({
    where: { id: quoteId },
    data: { total: summary.finalCustomerTotal }
  });
}

async function quoteAnalyticsSnapshot(
  tx: Prisma.TransactionClient,
  quoteId: string,
  eventType: string
): Promise<Prisma.InputJsonObject> {
  const quote = await tx.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: {
      items: {
        select: {
          itemType: true,
          quantity: true,
          unitCost: true,
          lineSubtotal: true,
          lineTax: true
        }
      }
    }
  });
  const summary = quoteFinancialSummaryDecimal(quote);
  return {
    eventType,
    calculationMode: quote.calculationMode,
    revenueSnapshot: summary.preTaxContractValue.toNumber(),
    costSnapshot: summary.totalEstimatedCost.toNumber(),
    taxSnapshot: summary.taxAmount.toNumber(),
    finalCustomerTotalSnapshot: summary.finalCustomerTotal.toNumber(),
    financialSummary: exactFinancialSummarySnapshot(summary),
    revenueBearingLineCount: quote.items.filter((item) => Number(item.lineSubtotal) > 0).length,
    lineCount: quote.items.length
  };
}

async function recordQuoteValueSnapshot(
  tx: Prisma.TransactionClient,
  quoteId: string,
  eventType: string,
  user?: AuthenticatedUser
) {
  const quote = await tx.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: {
      items: {
        select: {
          itemType: true,
          quantity: true,
          unitCost: true,
          lineSubtotal: true,
          lineTax: true
        }
      }
    }
  });
  const summary = quoteFinancialSummaryDecimal(quote);
  return recordLifecycleStatusEvent(tx, {
    entityType: LifecycleEntityType.QUOTE,
    entityId: quote.id,
    fromStatus: quote.status,
    toStatus: quote.status,
    valueSnapshot: summary.preTaxContractValue.toNumber(),
    metadata: await quoteAnalyticsSnapshot(tx, quote.id, eventType),
    recordWhenUnchanged: true,
    user
  });
}

function quoteItemDataFromItem(
  item: ItemForQuote,
  quantity: number,
  sortOrder: number
) {
  const itemType = item.itemType as ItemType;
  const unitCost = Number(item.cost);
  const unitPrice = Number(item.sellPrice);
  const discountPercent = 0;
  const line = calculateQuoteLine({ quantity, unitPrice, discountPercent });
  return {
    sourceItemId: item.id,
    section: quoteItemSection(itemType),
    name: item.name,
    description: item.quoteDescription || item.description || null,
    itemType,
    sku: item.sku,
    partNumber: item.partNumber,
    manufacturer: item.manufacturer,
    brand: item.brand,
    quantity,
    unitOfMeasure: item.unitOfMeasure,
    unitCost,
    unitPrice,
    markupPercent: Number(item.markupPercent) || calculateMarkupPercent(unitCost, unitPrice),
    discountPercent,
    taxable: item.taxable,
    imageUrl: item.primaryImageUrl,
    productUrl: item.productUrl,
    ...line,
    sortOrder
  };
}

async function quoteIdOrThrow(tx: Prisma.TransactionClient, id: string) {
  const quote = await tx.quote.findFirst({
    where: { archivedAt: null, OR: [{ id }, { quoteNumber: id }] },
    select: { id: true, quoteNumber: true, calculationMode: true }
  });
  if (!quote) throw new Error("QUOTE_NOT_FOUND");
  return quote;
}

async function lockQuoteOrThrow(tx: Prisma.TransactionClient, id: string) {
  const quote = await quoteIdOrThrow(tx, id);
  await tx.$queryRaw`SELECT "id" FROM "Quote" WHERE "id" = ${quote.id} FOR UPDATE`;
  return tx.quote.findUniqueOrThrow({
    where: { id: quote.id },
    select: { id: true, quoteNumber: true, calculationMode: true }
  });
}

async function lockPulseQuoteOrThrow(tx: Prisma.TransactionClient, id: string) {
  const quote = await lockQuoteOrThrow(tx, id);
  if (quote.calculationMode !== "PULSE") throw new Error("QUOTE_ITEMS_REQUIRE_PULSE_MODE");
  return quote;
}

function toQuoteBomCatalogItem(item: ItemForQuote): QuoteBomCatalogItem {
  return {
    id: item.id,
    itemType: item.itemType as ItemType,
    status: item.status,
    defaultLaborHours: Number(item.defaultLaborHours),
    defaultLaborItemId: item.defaultLaborItemId,
    relations: item.outgoingRelations.map((relation) => ({
      childItemId: relation.childItemId,
      relationType: relation.relationType,
      defaultQuantity: Number(relation.defaultQuantity),
      sortOrder: relation.sortOrder
    }))
  };
}

async function loadQuoteBomCatalog(
  tx: Prisma.TransactionClient,
  parent: ItemForQuote
) {
  const catalog = new Map<string, ItemForQuote>([[parent.id, parent]]);
  const processed = new Set<string>();
  const pending = new Set<string>(
    parent.outgoingRelations.map((relation) => relation.childItemId)
  );
  if (parent.defaultLaborItemId) pending.add(parent.defaultLaborItemId);

  while (true) {
    for (const item of catalog.values()) {
      if (processed.has(item.id)) continue;
      processed.add(item.id);
      if (item.itemType !== "LABOR") {
        if (item.defaultLaborItemId) pending.add(item.defaultLaborItemId);
        for (const relation of item.outgoingRelations) {
          if (relation.relationType === "REQUIRED") {
            pending.add(relation.childItemId);
          }
        }
      }
    }
    for (const itemId of catalog.keys()) pending.delete(itemId);
    if (!pending.size) break;

    const itemIds = [...pending];
    pending.clear();
    const items = await tx.item.findMany({
      where: { id: { in: itemIds } },
      include: itemForQuoteInclude
    });
    for (const item of items) catalog.set(item.id, item);
  }

  return catalog;
}

async function planQuoteSources(
  tx: Prisma.TransactionClient,
  parent: ItemForQuote,
  input: AddQuoteItemInput | AddQuoteKitInput,
  mode: "ITEM" | "KIT"
) {
  const catalog = await loadQuoteBomCatalog(tx, parent);
  const planned = planQuoteBomSources({
    parentItemId: parent.id,
    quantity: input.quantity,
    mode,
    suggestionItemIds: input.suggestionItemIds,
    catalog: [...catalog.values()].map(toQuoteBomCatalogItem)
  });
  return planned.map((source) => {
    const item = catalog.get(source.itemId);
    if (!item) throw new Error("ITEM_BOM_DEPENDENCY_INACTIVE");
    return { item, quantity: source.quantity };
  });
}

async function createQuoteItemsFromSources(
  tx: Prisma.TransactionClient,
  quoteId: string,
  sources: Array<{ item: ItemForQuote; quantity: number }>,
  firstSortOrder?: number
) {
  let sortOrder = firstSortOrder ?? (await nextQuoteItemSortOrder(tx, quoteId));
  for (const source of sources) {
    await tx.quoteItem.create({
      data: {
        quoteId,
        ...quoteItemDataFromItem(source.item, source.quantity, sortOrder)
      }
    });
    sortOrder += 1;
  }
}

export async function addQuoteItem(
  quoteId: string,
  input: AddQuoteItemInput,
  user?: AuthenticatedUser
) {
  const result = await prisma.$transaction(async (tx) => {
    const quote = await lockPulseQuoteOrThrow(tx, quoteId);
    const item = await activeItemOrThrow(tx, input.itemId);
    const sources = await planQuoteSources(tx, item, input, "ITEM");

    await createQuoteItemsFromSources(tx, quote.id, sources);
    await recalculateQuoteTotal(tx, quote.id);
    await recordQuoteValueSnapshot(tx, quote.id, "quote_bom_value_changed", user);
    const updatedQuote = await tx.quote.findUniqueOrThrow({
      where: { id: quote.id },
      include: quoteDetailInclude
    });
    return { quote: updatedQuote, addedLineCount: sources.length };
  });
  const { quote } = result;

  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: "Updated",
    title: `${quote.quoteNumber} BOM updated`,
    detail: `Added ${result.addedLineCount} expanded BOM line${result.addedLineCount === 1 ? "" : "s"}.`,
    metadata: { sourceItemId: input.itemId, mode: "item", addedLineCount: result.addedLineCount }
  });
  return toQuoteDetailRecord(quote, await listQuoteDocuments(quote.id));
}

export async function addQuoteKit(
  quoteId: string,
  input: AddQuoteKitInput,
  user?: AuthenticatedUser
) {
  const result = await prisma.$transaction(async (tx) => {
    const quote = await lockPulseQuoteOrThrow(tx, quoteId);
    const item = await activeItemOrThrow(tx, input.itemId);
    const sources = await planQuoteSources(tx, item, input, "KIT");

    await createQuoteItemsFromSources(tx, quote.id, sources);
    await recalculateQuoteTotal(tx, quote.id);
    await recordQuoteValueSnapshot(tx, quote.id, "quote_bom_value_changed", user);
    const updatedQuote = await tx.quote.findUniqueOrThrow({
      where: { id: quote.id },
      include: quoteDetailInclude
    });
    return { quote: updatedQuote, addedLineCount: sources.length };
  });
  const { quote } = result;

  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: "Updated",
    title: `${quote.quoteNumber} kit added`,
    detail: `Expanded kit into ${result.addedLineCount} BOM line${result.addedLineCount === 1 ? "" : "s"}.`,
    metadata: { sourceItemId: input.itemId, mode: "kit", addedLineCount: result.addedLineCount }
  });
  return toQuoteDetailRecord(quote, await listQuoteDocuments(quote.id));
}

export async function addAdHocQuoteItem(
  quoteId: string,
  input: AddAdHocQuoteItemInput,
  user?: AuthenticatedUser
) {
  const quote = await prisma.$transaction(async (tx) => {
    const quote = await lockPulseQuoteOrThrow(tx, quoteId);
    const quantity = input.quantity;
    const unitCost = input.unitCost;
    const unitPrice = input.unitPrice;
    const line = calculateQuoteLine({
      quantity,
      unitPrice,
      discountPercent: input.discountPercent
    });
    await tx.quoteItem.create({
      data: {
        quoteId: quote.id,
        sourceItemId: null,
        section: input.section,
        name: input.name,
        description: nullable(input.description),
        itemType: input.itemType,
        sku: nullable(input.sku),
        partNumber: nullable(input.partNumber),
        manufacturer: nullable(input.manufacturer),
        brand: nullable(input.brand),
        quantity,
        unitOfMeasure: nullable(input.unitOfMeasure),
        unitCost,
        unitPrice,
        markupPercent: calculateMarkupPercent(unitCost, unitPrice),
        discountPercent: input.discountPercent,
        taxable: input.taxable,
        imageUrl: nullable(input.imageUrl),
        productUrl: nullable(input.productUrl),
        ...line,
        sortOrder: input.sortOrder ?? (await nextQuoteItemSortOrder(tx, quote.id))
      }
    });
    await recalculateQuoteTotal(tx, quote.id);
    await recordQuoteValueSnapshot(tx, quote.id, "quote_bom_value_changed", user);
    return tx.quote.findUniqueOrThrow({
      where: { id: quote.id },
      include: quoteDetailInclude
    });
  });

  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: "Updated",
    title: `${quote.quoteNumber} BOM updated`,
    detail: "Added ad hoc BOM line."
  });
  return toQuoteDetailRecord(quote, await listQuoteDocuments(quote.id));
}

export async function updateQuoteItem(
  quoteId: string,
  quoteItemId: string,
  input: UpdateQuoteItemInput,
  user?: AuthenticatedUser
) {
  const quote = await prisma.$transaction(async (tx) => {
    const quote = await lockPulseQuoteOrThrow(tx, quoteId);
    const existing = await tx.quoteItem.findFirst({
      where: { id: quoteItemId, quoteId: quote.id }
    });
    if (!existing) throw new Error("QUOTE_ITEM_NOT_FOUND");

    const quantity =
      input.quantity !== undefined ? input.quantity : Number(existing.quantity);
    const unitCost =
      input.unitCost !== undefined ? input.unitCost : Number(existing.unitCost);
    const unitPrice =
      input.unitPrice !== undefined ? input.unitPrice : Number(existing.unitPrice);
    const discountPercent =
      input.discountPercent !== undefined
        ? input.discountPercent
        : Number(existing.discountPercent);
    const line = calculateQuoteLine({ quantity, unitPrice, discountPercent });

    await tx.quoteItem.update({
      where: { id: existing.id },
      data: {
        ...(input.section !== undefined ? { section: input.section } : {}),
        ...(input.name !== undefined ? { name: input.name || existing.name } : {}),
        ...(input.description !== undefined ? { description: nullable(input.description) } : {}),
        ...(input.itemType !== undefined ? { itemType: input.itemType } : {}),
        ...(input.sku !== undefined ? { sku: nullable(input.sku) } : {}),
        ...(input.partNumber !== undefined ? { partNumber: nullable(input.partNumber) } : {}),
        ...(input.manufacturer !== undefined ? { manufacturer: nullable(input.manufacturer) } : {}),
        ...(input.brand !== undefined ? { brand: nullable(input.brand) } : {}),
        quantity,
        ...(input.unitOfMeasure !== undefined ? { unitOfMeasure: nullable(input.unitOfMeasure) } : {}),
        unitCost,
        unitPrice,
        markupPercent: calculateMarkupPercent(unitCost, unitPrice),
        discountPercent,
        ...(input.taxable !== undefined ? { taxable: input.taxable } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...line
      }
    });
    await recalculateQuoteTotal(tx, quote.id);
    await recordQuoteValueSnapshot(tx, quote.id, "quote_bom_value_changed", user);
    return tx.quote.findUniqueOrThrow({
      where: { id: quote.id },
      include: quoteDetailInclude
    });
  });

  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: "Updated",
    title: `${quote.quoteNumber} BOM line updated`
  });
  return toQuoteDetailRecord(quote, await listQuoteDocuments(quote.id));
}

export async function removeQuoteItem(
  quoteId: string,
  quoteItemId: string,
  user?: AuthenticatedUser
) {
  const quote = await prisma.$transaction(async (tx) => {
    const quote = await lockPulseQuoteOrThrow(tx, quoteId);
    const existing = await tx.quoteItem.findFirst({
      where: { id: quoteItemId, quoteId: quote.id },
      select: { id: true }
    });
    if (!existing) throw new Error("QUOTE_ITEM_NOT_FOUND");
    await tx.quoteItem.delete({ where: { id: existing.id } });
    await recalculateQuoteTotal(tx, quote.id);
    await recordQuoteValueSnapshot(tx, quote.id, "quote_bom_value_changed", user);
    return tx.quote.findUniqueOrThrow({
      where: { id: quote.id },
      include: quoteDetailInclude
    });
  });

  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: "Updated",
    title: `${quote.quoteNumber} BOM line removed`
  });
  return toQuoteDetailRecord(quote, await listQuoteDocuments(quote.id));
}

export async function reorderQuoteItems(
  quoteId: string,
  input: ReorderQuoteItemsInput,
  user?: AuthenticatedUser
) {
  const quote = await prisma.$transaction(async (tx) => {
    const lockedQuote = await lockPulseQuoteOrThrow(tx, quoteId);
    const existing = await tx.quoteItem.findMany({
      where: { quoteId: lockedQuote.id },
      select: { id: true }
    });
    const currentIds = new Set(existing.map((item) => item.id));
    if (
      input.quoteItemIds.length !== currentIds.size ||
      input.quoteItemIds.some((id) => !currentIds.has(id))
    ) {
      throw new Error("QUOTE_ITEM_REORDER_STALE");
    }

    for (const [sortOrder, id] of input.quoteItemIds.entries()) {
      await tx.quoteItem.update({
        where: { id },
        data: { sortOrder }
      });
    }

    return tx.quote.findUniqueOrThrow({
      where: { id: lockedQuote.id },
      include: quoteDetailInclude
    });
  });

  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: "Updated",
    title: `${quote.quoteNumber} BOM reordered`
  });
  return toQuoteDetailRecord(quote, await listQuoteDocuments(quote.id));
}

export async function updateQuoteProposal(
  quoteId: string,
  input: UpdateQuoteProposalInput,
  user?: AuthenticatedUser
) {
  const existing = await quoteOrThrow(quoteId);
  const quote = await prisma.quote.update({
    where: { id: existing.id },
    data: {
      proposalNotes: input.proposalNotes || null,
      proposalPreparedAt: input.proposalNotes ? new Date() : null
    },
    include: quoteDetailInclude
  });
  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: "Updated",
    title: `${quote.quoteNumber} proposal prep updated`
  });
  return toQuoteDetailRecord(quote, await listQuoteDocuments(quote.id));
}

function quoteRevisionSnapshot(quote: QuoteDetailWithRelations): Prisma.InputJsonObject {
  const version = quoteVersionFields(quote);
  const summary = quoteFinancialSummaryDecimal(quote);
  return JSON.parse(JSON.stringify({
    dataAvailable: true,
    baseQuoteNumber: version.baseQuoteNumber,
    calculationMode: quote.calculationMode,
    legacyFinancials: legacyFinancialsRecord(quote),
    financialSummary: exactFinancialSummarySnapshot(summary),
    contact: toQuoteContact(quote.contact),
    context: toQuoteContextSnapshot(quote),
    proposalNotes: empty(quote.proposalNotes),
    proposalPreparedAt: dateTimeOutput(quote.proposalPreparedAt),
    items: quote.calculationMode === "PULSE" ? quote.items.map(toQuoteItemRecord) : [],
    legacyCreatedAt: dateTimeOutput(quote.createdAt),
    legacyUpdatedAt: dateTimeOutput(quote.updatedAt)
  })) as Prisma.InputJsonObject;
}

function mergedEventMetadata(
  current: Prisma.JsonValue | null,
  additions: Prisma.InputJsonObject
) {
  const base = current && typeof current === "object" && !Array.isArray(current)
    ? current as Prisma.InputJsonObject
    : {};
  return { ...base, ...additions } satisfies Prisma.InputJsonObject;
}


export async function createQuote(input: CreateQuoteInput, user?: AuthenticatedUser) {
  const client = await clientOrThrow(input.clientId);
  const contact = await contactForClientOrThrow(input.contactId, client.id);
  const site = input.siteId ? await siteForClientOrThrow(input.siteId, client.id) : null;
  const assignedTo = input.assignedToId ? await activeUserOrThrow(input.assignedToId) : null;
  const quote = await prisma.$transaction(async (tx) => {
    const quoteNumber = await nextNumber(tx, "quote");
    const versionCreatedAt = new Date();
    const lifecycleContext = await createLifecycleContext(tx, input.lifecycleDetails, user);
    const created = await tx.quote.create({
      data: {
        quoteNumber,
        baseQuoteNumber: quoteNumber,
        revisionNumber: 0,
        versionCreatedAt,
        title: input.title,
        clientId: client.id,
        contactId: contact.id,
        siteId: site?.id ?? null,
        assignedToId: assignedTo?.id ?? null,
        lifecycleContextId: lifecycleContext.id,
        clientName: client.displayName,
        owner: assignedTo?.name ?? "Unassigned",
        status: input.status,
        calculationMode: input.calculationMode,
        total: 0,
        serviceCategorySnapshot: input.trades?.join(", "),
        contactNameSnapshot: pointOfContactName(contact),
        contactEmailSnapshot: contact.email,
        contactPhoneSnapshot: contact.phone ?? contact.mobile
      },
      include: quoteInclude
    });
    const summary = quoteFinancialSummaryDecimal(created);
    await recordLifecycleStatusEvent(tx, {
      entityType: LifecycleEntityType.QUOTE,
      entityId: created.id,
      toStatus: created.status,
      changedAt: created.createdAt,
      valueSnapshot: summary.preTaxContractValue.toNumber(),
      metadata: {
        eventType: "quote_created",
        calculationMode: created.calculationMode,
        revenueSnapshot: summary.preTaxContractValue.toNumber(),
        costSnapshot: summary.totalEstimatedCost.toNumber(),
        taxSnapshot: summary.taxAmount.toNumber(),
        finalCustomerTotalSnapshot: summary.finalCustomerTotal.toNumber(),
        financialSummary: exactFinancialSummarySnapshot(summary),
        revenueBearingLineCount: 0,
        lineCount: 0
      },
      user
    });
    return created;
  });
  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: "Created",
    title: `${quote.quoteNumber} created`,
    detail: quote.title
  });
  return toQuoteRecord(quote, await listQuoteDocuments(quote.id));
}

export async function updateQuote(id: string, input: UpdateQuoteInput, user?: AuthenticatedUser) {
  const existing = await quoteOrThrow(id);
  const statusChanged = input.status !== undefined && input.status !== existing.status;
  const statusChangedAt = new Date();
  const client = input.clientId ? await clientOrThrow(input.clientId) : null;
  const effectiveClientId = client?.id ?? existing.clientId;
  if (client && client.id !== existing.clientId && !input.contactId) {
    throw new Error("QUOTE_CONTACT_REQUIRED");
  }
  if (input.contactId === null) throw new Error("QUOTE_CONTACT_REQUIRED");
  if (input.contactId && !effectiveClientId) {
    throw new Error("QUOTE_POINT_OF_CONTACT_CLIENT_REQUIRED");
  }
  const contact = input.contactId && effectiveClientId
    ? await contactForClientOrThrow(input.contactId, effectiveClientId)
    : null;
  const site = input.siteId && effectiveClientId
    ? await siteForClientOrThrow(input.siteId, effectiveClientId)
    : null;
  const assignedTo = input.assignedToId
    ? await activeUserOrThrow(input.assignedToId)
    : null;
  if (client && existing.project?.id) {
    const project = await prisma.project.findUnique({ where: { id: existing.project.id }, select: { clientId: true } });
    if (project && project.clientId !== client.id) throw new Error("WORK_CLIENT_MISMATCH");
  }
  const quote = await prisma.$transaction(async (tx) => {
    const lifecycleContextId = await updateLifecycleDetails(
      tx,
      existing.lifecycleContextId,
      input.lifecycleDetails,
      user
    );
    const updated = await tx.quote.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(client ? { clientId: client.id, clientName: client.displayName } : {}),
        ...(contact
          ? {
              contactId: contact.id,
              contactNameSnapshot: pointOfContactName(contact),
              contactEmailSnapshot: contact.email,
              contactPhoneSnapshot: contact.phone ?? contact.mobile
            }
          : {}),
        ...(input.clientId !== undefined && input.siteId === undefined ? { siteId: null } : {}),
        ...(input.siteId !== undefined ? { siteId: site?.id ?? null } : {}),
        ...(input.assignedToId !== undefined
          ? { assignedToId: assignedTo?.id ?? null, owner: assignedTo?.name ?? "Unassigned" }
          : {}),
        ...(lifecycleContextId !== existing.lifecycleContextId ? { lifecycleContextId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(statusChanged && input.status === "Sent"
          ? { sentAt: statusChangedAt, sentAtPrecision: "EXACT" as const }
          : {}),
        ...(input.trades !== undefined
          ? { serviceCategorySnapshot: input.trades.join(", ") }
          : {})
      },
      include: quoteInclude
    });
    await recordLifecycleStatusEvent(tx, {
      entityType: LifecycleEntityType.QUOTE,
      entityId: updated.id,
      fromStatus: existing.status,
      toStatus: updated.status,
      changedAt: statusChanged ? statusChangedAt : undefined,
      valueSnapshot: quoteFinancialSummaryDecimal(updated).preTaxContractValue.toNumber(),
      metadata: await quoteAnalyticsSnapshot(
        tx,
        updated.id,
        statusChanged ? "quote_status_changed" : "quote_value_changed"
      ),
      recordWhenUnchanged: false,
      user
    });
    if (statusChanged) {
      await createQuoteSystemUpdate(tx, {
        quoteId: updated.id,
        title: `${updated.quoteNumber} moved to ${updated.status}`,
        body: `Status changed from ${existing.status} to ${updated.status}.`,
        user,
        createdAt: statusChangedAt,
        metadata: {
          eventType: "quote_status_changed",
          precision: "EXACT",
          quoteNumber: updated.quoteNumber,
          revisionNumber: quoteVersionFields(updated).revisionNumber,
          fromStatus: existing.status,
          toStatus: updated.status
        }
      });
    }
    if (input.lifecycleDetails !== undefined) {
      await createQuoteSystemUpdate(tx, {
        quoteId: updated.id,
        title: "Lifecycle details updated",
        body: "The shared details for this lifecycle were updated.",
        user,
        metadata: { eventType: "lifecycle_details_updated" }
      });
    }
    return updated;
  });
  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: "Updated",
    title: `${quote.quoteNumber} updated`,
    metadata: { status: quote.status, total: Number(quote.total) }
  });
  return toQuoteRecord(quote, await listQuoteDocuments(quote.id));
}

export async function replaceLegacyQuoteFinancials(
  id: string,
  input: ReplaceLegacyQuoteFinancialsInput,
  user?: AuthenticatedUser
) {
  const quote = await prisma.$transaction(async (tx) => {
    const locked = await lockQuoteOrThrow(tx, id);
    if (locked.calculationMode !== "LEGACY") {
      throw new Error("QUOTE_LEGACY_FINANCIALS_REQUIRE_LEGACY_MODE");
    }
    await tx.quote.update({
      where: { id: locked.id },
      data: {
        legacyMaterialSale: input.materialSale,
        legacyMaterialCost: input.materialCost,
        legacyLaborSale: input.laborSale,
        legacyLaborCost: input.laborCost,
        legacyTaxAmount: input.taxAmount,
        legacyEstimatedDurationBusinessDays: input.estimatedDurationBusinessDays
      }
    });
    await recalculateQuoteTotal(tx, locked.id);
    await recordQuoteValueSnapshot(tx, locked.id, "quote_legacy_financials_changed", user);
    return tx.quote.findUniqueOrThrow({
      where: { id: locked.id },
      include: quoteDetailInclude
    });
  });
  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: "Updated",
    title: `${quote.quoteNumber} Legacy financials updated`,
    metadata: { calculationMode: quote.calculationMode, total: Number(quote.total) }
  });
  return toQuoteDetailRecord(quote, await listQuoteDocuments(quote.id));
}

export async function switchQuoteCalculationMode(
  id: string,
  input: SwitchQuoteCalculationModeInput,
  user?: AuthenticatedUser
) {
  const result = await prisma.$transaction(async (tx) => {
    const locked = await lockQuoteOrThrow(tx, id);
    const existing = await tx.quote.findUniqueOrThrow({
      where: { id: locked.id },
      include: quoteDetailInclude
    });
    if (existing.status !== "Draft") throw new Error("QUOTE_MODE_SWITCH_DRAFT_REQUIRED");
    if (existing.project) throw new Error("QUOTE_MODE_SWITCH_PROJECT_EXISTS");
    if (existing.calculationMode === input.calculationMode) {
      return { quote: existing, previousMode: existing.calculationMode, discarded: false };
    }
    const empty = quoteFinancialsAreEmpty({
      calculationMode: existing.calculationMode,
      itemCount: existing.items.length,
      legacyMaterialSale: existing.legacyMaterialSale,
      legacyMaterialCost: existing.legacyMaterialCost,
      legacyLaborSale: existing.legacyLaborSale,
      legacyLaborCost: existing.legacyLaborCost,
      legacyTaxAmount: existing.legacyTaxAmount,
      legacyEstimatedDurationBusinessDays: existing.legacyEstimatedDurationBusinessDays
    });
    if (!empty && !input.discardFinancialData) {
      throw new Error("QUOTE_MODE_SWITCH_CONFIRMATION_REQUIRED");
    }
    if (existing.items.length) {
      await tx.quoteItem.deleteMany({ where: { quoteId: existing.id } });
    }
    await tx.quote.update({
      where: { id: existing.id },
      data: {
        calculationMode: input.calculationMode,
        legacyMaterialSale: 0,
        legacyMaterialCost: 0,
        legacyLaborSale: 0,
        legacyLaborCost: 0,
        legacyTaxAmount: 0,
        legacyEstimatedDurationBusinessDays: null,
        total: 0
      }
    });
    await recordQuoteValueSnapshot(tx, existing.id, "quote_calculation_mode_changed", user);
    const updated = await tx.quote.findUniqueOrThrow({
      where: { id: existing.id },
      include: quoteDetailInclude
    });
    return { quote: updated, previousMode: existing.calculationMode, discarded: !empty };
  });
  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: result.quote.id,
    type: "Updated",
    title: `${result.quote.quoteNumber} changed to ${result.quote.calculationMode} mode`,
    metadata: {
      previousMode: result.previousMode,
      calculationMode: result.quote.calculationMode,
      discardedFinancialData: result.discarded
    }
  });
  return toQuoteDetailRecord(result.quote, await listQuoteDocuments(result.quote.id));
}

const revisionEligibleStatuses = new Set(["Sent", "Approved", "Rejected", "Cancelled"]);

export async function createQuoteRevision(
  id: string,
  input: CreateQuoteRevisionInput,
  user?: AuthenticatedUser
) {
  const requestedAt = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const locked = await lockQuoteOrThrow(tx, id);
    const quote = await tx.quote.findUniqueOrThrow({
      where: { id: locked.id },
      include: quoteDetailInclude
    });
    if (!revisionEligibleStatuses.has(quote.status)) {
      throw new Error("QUOTE_REVISION_STATUS_INVALID");
    }
    if (quote.project) throw new Error("QUOTE_REVISION_PROJECT_EXISTS");

    const version = quoteVersionFields(quote);
    const nextRevisionNumber = version.revisionNumber + 1;
    const nextQuoteNumber = `${version.baseQuoteNumber}R${nextRevisionNumber}`;
    const snapshot = quoteRevisionSnapshot(quote);
    const revisionAnalyticsSnapshot = await quoteAnalyticsSnapshot(
      tx,
      quote.id,
      "quote_revision_requested"
    );

    const revision = await tx.quoteRevision.create({
      data: {
        quoteId: quote.id,
        revisionNumber: version.revisionNumber,
        quoteNumber: quote.quoteNumber,
        titleSnapshot: quote.title,
        clientIdSnapshot: quote.clientId,
        clientNameSnapshot: quote.client?.displayName ?? quote.clientName,
        ownerSnapshot: quote.owner,
        totalSnapshot: quote.total,
        priorStatus: quote.status,
        outcome: "Revision Requested",
        versionCreatedAt: version.versionCreatedAt,
        sentAt: version.sentAt,
        requestedAt,
        reason: input.reason,
        snapshot,
        source: "APPLICATION",
        precision: "EXACT",
        requestedById: user?.id,
        requestedByName: user?.name ?? "Pulse System"
      }
    });

    if (["Approved", "Rejected", "Cancelled"].includes(quote.status)) {
      const decision = await tx.lifecycleStatusEvent.findFirst({
        where: {
          entityType: LifecycleEntityType.QUOTE,
          entityId: quote.id,
          toStatus: quote.status
        },
        orderBy: [{ changedAt: "desc" }, { id: "desc" }]
      });
      if (decision) {
        await tx.lifecycleStatusEvent.update({
          where: { id: decision.id },
          data: {
            metadata: mergedEventMetadata(decision.metadata, {
              supersededByRevisionId: revision.id,
              supersededByRevisionNumber: nextRevisionNumber
            })
          }
        });
      }
    }

    await recordLifecycleStatusEvent(tx, {
      entityType: LifecycleEntityType.QUOTE,
      entityId: quote.id,
      fromStatus: quote.status,
      toStatus: "Revision Requested",
      changedAt: requestedAt,
      valueSnapshot: quoteFinancialSummaryDecimal(quote).preTaxContractValue.toNumber(),
      metadata: {
        ...revisionAnalyticsSnapshot,
        quoteNumber: quote.quoteNumber,
        revisionNumber: version.revisionNumber,
        nextQuoteNumber,
        nextRevisionNumber,
        reason: input.reason,
        precision: "EXACT"
      },
      user
    });
    await recordLifecycleStatusEvent(tx, {
      entityType: LifecycleEntityType.QUOTE,
      entityId: quote.id,
      fromStatus: "Revision Requested",
      toStatus: "Draft",
      changedAt: requestedAt,
      valueSnapshot: quoteFinancialSummaryDecimal(quote).preTaxContractValue.toNumber(),
      metadata: {
        ...revisionAnalyticsSnapshot,
        eventType: "quote_revision_opened",
        quoteNumber: nextQuoteNumber,
        revisionNumber: nextRevisionNumber,
        precision: "EXACT"
      },
      user
    });
    await createQuoteSystemUpdate(tx, {
      quoteId: quote.id,
      title: `Client requested ${nextQuoteNumber}`,
      body: input.reason,
      user,
      createdAt: requestedAt,
      metadata: {
        eventType: "quote_revision_requested",
        precision: "EXACT",
        quoteNumber: quote.quoteNumber,
        revisionNumber: nextRevisionNumber,
        fromStatus: quote.status,
        toStatus: "Revision Requested"
      }
    });

    await tx.quote.update({
      where: { id: quote.id },
      data: {
        quoteNumber: nextQuoteNumber,
        baseQuoteNumber: version.baseQuoteNumber,
        revisionNumber: nextRevisionNumber,
        versionCreatedAt: requestedAt,
        sentAt: null,
        sentAtPrecision: null,
        status: "Draft"
      }
    });
    return {
      quoteId: quote.id,
      previousQuoteNumber: quote.quoteNumber,
      nextQuoteNumber,
      revisionId: revision.id
    };
  });

  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: result.quoteId,
    type: "Revision Requested",
    title: `${result.previousQuoteNumber} returned as ${result.nextQuoteNumber}`,
    detail: input.reason,
    metadata: {
      revisionId: result.revisionId,
      previousQuoteNumber: result.previousQuoteNumber,
      nextQuoteNumber: result.nextQuoteNumber
    }
  });
  return getQuoteById(result.quoteId, user?.id);
}

export async function archiveQuote(id: string, user?: AuthenticatedUser) {
  const existing = await quoteOrThrow(id);
  const quote = await prisma.quote.update({
    where: { id: existing.id },
    data: { archivedAt: new Date() },
    include: quoteInclude
  });
  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: "Archived",
    title: `${quote.quoteNumber} archived`
  });
  return toQuoteRecord(quote, await listQuoteDocuments(quote.id));
}

export async function listProjects() {
  const projects = await prisma.project.findMany({
      where: { archivedAt: null },
      include: projectInclude,
      orderBy: { updatedAt: "desc" }
    });
  return Promise.all(
    projects.map(async (project) =>
      toProjectRecord(project, await listProjectDocuments(project.id))
    )
  );
}

export async function getProjectById(id: string, viewerId?: string) {
  const project = await projectOrThrow(id);
  const [documents, updateState] = await Promise.all([
    listProjectDocuments(project.id),
    listWorkUpdates("project", project.id, "all", undefined, 25, viewerId)
  ]);
  return {
    ...toProjectRecord(project, documents),
    tasks: project.tasks.map(toProjectTask),
    progress: calculateProjectProgress(project.tasks),
    currentStep: updateState.currentStep,
    unreadMentionCount: updateState.unreadMentionCount,
    updates: updateState.updates
  };
}

async function createProjectData(
  input: CreateProjectInput,
  tx: Prisma.TransactionClient,
  user?: AuthenticatedUser
) {
  const client = await tx.client.findFirst({
    where: { id: input.clientId, archivedAt: null },
    select: { id: true }
  });
  if (!client) throw new Error("CLIENT_NOT_FOUND");

  let sourceQuote: {
    id: string;
    status: string;
    clientId: string | null;
    contactId: string | null;
    siteId: string | null;
    assignedToId: string | null;
    lifecycleContextId: string | null;
    project: { id: string } | null;
  } | null = null;
  if (input.quoteId) {
    // A handoff keeps one client lineage and permits only one project per quote.
    const quote = await tx.quote.findFirst({
      where: { id: input.quoteId, archivedAt: null },
      select: {
        id: true,
        status: true,
        clientId: true,
        contactId: true,
        siteId: true,
        assignedToId: true,
        lifecycleContextId: true,
        project: { select: { id: true } }
      }
    });
    if (!quote) throw new Error("QUOTE_NOT_FOUND");
    if (quote.project) throw new Error("QUOTE_ALREADY_CONVERTED");
    if (quote.status !== "Approved") throw new Error("QUOTE_NOT_APPROVED");
    if (quote.clientId !== input.clientId) throw new Error("WORK_CLIENT_MISMATCH");
    sourceQuote = quote;
  }

  const contactId = input.contactId ?? sourceQuote?.contactId ?? null;
  const siteId = input.siteId ?? sourceQuote?.siteId ?? null;
  const assignedToId = input.assignedToId ?? sourceQuote?.assignedToId ?? null;
  if (contactId) await contactForClientOrThrow(contactId, input.clientId);
  if (siteId) await siteForClientOrThrow(siteId, input.clientId, tx);
  const assignedTo = await resolveWorkAssignee("project", assignedToId, tx);
  const lifecycleContextId = sourceQuote?.lifecycleContextId
    ? await updateLifecycleDetails(
        tx,
        sourceQuote.lifecycleContextId,
        input.lifecycleDetails,
        user
      )
    : (await createLifecycleContext(tx, input.lifecycleDetails, user)).id;

  return tx.project.create({
    data: {
      projectNumber: await nextNumber(tx, "project"),
      title: input.title,
      clientId: input.clientId,
      quoteId: input.quoteId,
      contactId,
      siteId,
      assignedToId: assignedTo?.id ?? null,
      lifecycleContextId,
      ownerSnapshot: assignedTo?.name ?? "Unassigned",
      status: input.status,
      budget: input.budget,
      startDate: dateInput(input.startDate),
      dueDate: dateInput(input.dueDate)
    },
    include: projectInclude
  });
}

export async function createProject(input: CreateProjectInput, user?: AuthenticatedUser) {
  const project = await prisma.$transaction(async (tx) => {
    const created = await createProjectData(input, tx, user);
    await recordLifecycleStatusEvent(tx, {
      entityType: LifecycleEntityType.PROJECT,
      entityId: created.id,
      toStatus: created.status,
      changedAt: created.createdAt,
      valueSnapshot: Number(created.budget),
      metadata: {
        eventType: "project_created",
        startDate: created.startDate?.toISOString() ?? null,
        dueDate: created.dueDate?.toISOString() ?? null
      },
      user
    });
    await createWorkSystemUpdate(tx, {
      stage: "project",
      recordId: created.id,
      title: `${created.projectNumber} created`,
      body: created.quote?.quoteNumber
        ? `Project created from ${created.quote.quoteNumber}.`
        : "Project created by direct entry.",
      user,
      createdAt: created.createdAt,
      metadata: { eventType: "project_created", toStatus: created.status }
    });
    return created;
  });
  await recordActivity({
    user,
    relatedEntityType: "Project",
    relatedEntityId: project.id,
    type: "Created",
    title: `${project.projectNumber} created`,
    detail: project.title
  });
  return toProjectRecord(project, await listProjectDocuments(project.id));
}

export async function convertQuoteToProject(
  id: string,
  input: ConvertQuoteInput,
  user?: AuthenticatedUser
) {
  const result = await prisma.$transaction(async (tx) => {
    const lockedQuote = await lockQuoteOrThrow(tx, id);
    const quote = await tx.quote.findUniqueOrThrow({
      where: { id: lockedQuote.id },
      include: quoteInclude
    });
    if (!quote.clientId) throw new Error("QUOTE_CLIENT_REQUIRED");
    const financialSummary = quoteFinancialSummaryDecimal(quote);
    const version = quoteVersionFields(quote);
    const assignedTo = quote.assignedToId
      ? await findEligibleWorkAssignee("project", quote.assignedToId, tx)
      : await resolveLegacyWorkAssignee("project", quote.owner, tx);
    const createdProject = await createProjectData(
      {
        title: quote.title,
        clientId: quote.clientId,
        quoteId: quote.id,
        assignedToId: assignedTo?.id ?? null,
        contactId: quote.contactId,
        siteId: quote.siteId,
        lifecycleDetails: undefined,
        status: "Ready",
        budget: financialSummary.preTaxContractValue.toNumber(),
        startDate: input.startDate,
        dueDate: input.dueDate
      },
      tx,
      user
    );
    const project = await tx.project.update({
      where: { id: createdProject.id },
      data: {
        sourceQuoteRevisionNumber: version.revisionNumber,
        sourceQuoteCalculationMode: quote.calculationMode,
        quoteFinancialSnapshot: {
          sourceQuoteId: quote.id,
          sourceQuoteNumber: quote.quoteNumber,
          sourceQuoteRevisionNumber: version.revisionNumber,
          calculationMode: quote.calculationMode,
          financialSummary: exactFinancialSummarySnapshot(financialSummary)
        }
      },
      include: projectInclude
    });
    await recordLifecycleStatusEvent(tx, {
      entityType: LifecycleEntityType.PROJECT,
      entityId: project.id,
      toStatus: project.status,
      changedAt: project.createdAt,
      valueSnapshot: Number(project.budget),
      metadata: {
        eventType: "project_created_from_quote",
        startDate: project.startDate?.toISOString() ?? null,
        dueDate: project.dueDate?.toISOString() ?? null
      },
      user
    });
    await createWorkSystemUpdate(tx, {
      stage: "project",
      recordId: project.id,
      title: `${project.projectNumber} created from ${quote.quoteNumber}`,
      body: `Approved quote ${quote.quoteNumber} entered project delivery.`,
      user,
      createdAt: project.createdAt,
      metadata: { eventType: "project_created_from_quote", toStatus: project.status }
    });
    return { project, quote };
  });
  const { project, quote } = result;
  await Promise.all([
    recordActivity({
      user,
      relatedEntityType: "Quote",
      relatedEntityId: quote.id,
      type: "Converted",
      title: `${quote.quoteNumber} converted to ${project.projectNumber}`
    }),
    recordActivity({
      user,
      relatedEntityType: "Project",
      relatedEntityId: project.id,
      type: "Created",
      title: `${project.projectNumber} created from ${quote.quoteNumber}`
    })
  ]);
  return toProjectRecord(project, await listProjectDocuments(project.id));
}

export async function updateProject(id: string, input: UpdateProjectInput, user?: AuthenticatedUser) {
  const existing = await projectOrThrow(id);
  const assignedTo = input.assignedToId !== undefined
    ? await resolveWorkAssignee("project", input.assignedToId)
    : undefined;
  const snapshotChanged =
    (input.budget !== undefined && input.budget !== Number(existing.budget)) ||
    (input.startDate !== undefined && (dateInput(input.startDate)?.getTime() ?? null) !== (existing.startDate?.getTime() ?? null)) ||
    (input.dueDate !== undefined && (dateInput(input.dueDate)?.getTime() ?? null) !== (existing.dueDate?.getTime() ?? null));
  if (input.clientId) await clientOrThrow(input.clientId);
  if (input.clientId && existing.quoteId) {
    const quote = await prisma.quote.findUnique({ where: { id: existing.quoteId }, select: { clientId: true } });
    if (quote?.clientId && quote.clientId !== input.clientId) throw new Error("WORK_CLIENT_MISMATCH");
  }
  const effectiveClientId = input.clientId ?? existing.clientId;
  if (input.contactId) await contactForClientOrThrow(input.contactId, effectiveClientId);
  if (input.siteId) await siteForClientOrThrow(input.siteId, effectiveClientId);
  const project = await prisma.$transaction(async (tx) => {
    const lifecycleContextId = await updateLifecycleDetails(
      tx,
      existing.lifecycleContextId,
      input.lifecycleDetails,
      user
    );
    const updated = await tx.project.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
        ...(input.clientId !== undefined && input.contactId === undefined ? { contactId: null } : {}),
        ...(input.clientId !== undefined && input.siteId === undefined ? { siteId: null } : {}),
        ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
        ...(input.siteId !== undefined ? { siteId: input.siteId } : {}),
        ...(input.assignedToId !== undefined
          ? {
              assignedToId: assignedTo?.id ?? null,
              ownerSnapshot: assignedTo?.name ?? "Unassigned"
            }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.budget !== undefined ? { budget: input.budget } : {}),
        ...(input.startDate !== undefined ? { startDate: dateInput(input.startDate) } : {}),
        ...(input.dueDate !== undefined ? { dueDate: dateInput(input.dueDate) } : {}),
        ...(lifecycleContextId !== existing.lifecycleContextId ? { lifecycleContextId } : {})
      },
      include: projectInclude
    });
    await recordLifecycleStatusEvent(tx, {
      entityType: LifecycleEntityType.PROJECT,
      entityId: updated.id,
      fromStatus: existing.status,
      toStatus: updated.status,
      valueSnapshot: Number(updated.budget),
      metadata: {
        eventType: input.status !== undefined && input.status !== existing.status
          ? "project_status_changed"
          : "project_snapshot_changed",
        startDate: updated.startDate?.toISOString() ?? null,
        dueDate: updated.dueDate?.toISOString() ?? null
      },
      recordWhenUnchanged: snapshotChanged,
      user
    });
    if (input.status !== undefined && input.status !== existing.status) {
      await createWorkSystemUpdate(tx, {
        stage: "project",
        recordId: updated.id,
        title: `${updated.projectNumber} moved to ${updated.status}`,
        body: `Status changed from ${existing.status} to ${updated.status}.`,
        user,
        metadata: {
          eventType: "project_status_changed",
          fromStatus: existing.status,
          toStatus: updated.status
        }
      });
    }
    if (
      input.assignedToId !== undefined &&
      (assignedTo?.id ?? null) !== existing.assignedToId
    ) {
      await createWorkSystemUpdate(tx, {
        stage: "project",
        recordId: updated.id,
        title: "Assigned person changed",
        body: `${existing.assignedTo?.name ?? "Unassigned"} → ${assignedTo?.name ?? "Unassigned"}`,
        user,
        metadata: { eventType: "project_assignee_changed" }
      });
    }
    if (input.lifecycleDetails !== undefined) {
      await createWorkSystemUpdate(tx, {
        stage: "project",
        recordId: updated.id,
        title: "Lifecycle details updated",
        body: "The shared details for this lifecycle were updated.",
        user,
        metadata: { eventType: "lifecycle_details_updated" }
      });
    }
    return updated;
  });
  await recordActivity({
    user,
    relatedEntityType: "Project",
    relatedEntityId: project.id,
    type: "Updated",
    title: `${project.projectNumber} updated`,
    metadata: { status: project.status, budget: Number(project.budget) }
  });
  return toProjectRecord(project, await listProjectDocuments(project.id));
}

export async function archiveProject(id: string, user?: AuthenticatedUser) {
  const existing = await projectOrThrow(id);
  const project = await prisma.project.update({
    where: { id: existing.id },
    data: { archivedAt: new Date() },
    include: projectInclude
  });
  await recordActivity({
    user,
    relatedEntityType: "Project",
    relatedEntityId: project.id,
    type: "Archived",
    title: `${project.projectNumber} archived`
  });
  return toProjectRecord(project, await listProjectDocuments(project.id));
}

export async function listInvoices() {
  const invoices = await prisma.invoice.findMany({
      where: { archivedAt: null },
      include: invoiceInclude,
      orderBy: { updatedAt: "desc" }
    });
  return Promise.all(
    invoices.map(async (invoice) =>
      toInvoiceRecord(invoice, await listInvoiceDocuments(invoice.id))
    )
  );
}

export async function getInvoiceById(id: string, viewerId?: string) {
  const invoice = await invoiceOrThrow(id);
  const [documents, updateState] = await Promise.all([
    listInvoiceDocuments(invoice.id),
    listWorkUpdates("invoice", invoice.id, "all", undefined, 25, viewerId)
  ]);
  return {
    ...toInvoiceRecord(invoice, documents),
    billingSummary: calculateBillingSummary(invoice),
    currentStep: updateState.currentStep,
    unreadMentionCount: updateState.unreadMentionCount,
    updates: updateState.updates
  };
}

async function createInvoiceData(
  input: CreateInvoiceInput,
  tx: Prisma.TransactionClient,
  user?: AuthenticatedUser
) {
  const client = await tx.client.findFirst({
    where: { id: input.clientId, archivedAt: null },
    select: { id: true }
  });
  if (!client) throw new Error("CLIENT_NOT_FOUND");

  let sourceProject: {
    clientId: string;
    contactId: string | null;
    siteId: string | null;
    assignedToId: string | null;
    lifecycleContextId: string | null;
  } | null = null;
  if (input.projectId) {
    // Project invoices inherit the project account; cross-client billing is rejected.
    const project = await tx.project.findFirst({
      where: { id: input.projectId, archivedAt: null },
      select: {
        clientId: true,
        contactId: true,
        siteId: true,
        assignedToId: true,
        lifecycleContextId: true
      }
    });
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    if (project.clientId !== input.clientId) throw new Error("WORK_CLIENT_MISMATCH");
    sourceProject = project;
  }

  const contactId = input.contactId ?? sourceProject?.contactId ?? null;
  const siteId = input.siteId ?? sourceProject?.siteId ?? null;
  const assignedToId = input.assignedToId ?? sourceProject?.assignedToId ?? null;
  if (contactId) await contactForClientOrThrow(contactId, input.clientId);
  if (siteId) await siteForClientOrThrow(siteId, input.clientId, tx);
  const assignedTo = await resolveWorkAssignee("invoice", assignedToId, tx);
  const lifecycleContextId = sourceProject?.lifecycleContextId
    ? await updateLifecycleDetails(
        tx,
        sourceProject.lifecycleContextId,
        input.lifecycleDetails,
        user
      )
    : (await createLifecycleContext(tx, input.lifecycleDetails, user)).id;

  return tx.invoice.create({
    data: {
      invoiceNumber: await nextNumber(tx, "invoice"),
      title: input.title,
      clientId: input.clientId,
      projectId: input.projectId,
      contactId,
      siteId,
      assignedToId: assignedTo?.id ?? null,
      lifecycleContextId,
      ownerSnapshot: assignedTo?.name ?? "Unassigned",
      status: input.status,
      amount: input.amount,
      issuedDate: dateInput(input.issuedDate),
      dueDate: dateInput(input.dueDate)
    },
    include: invoiceInclude
  });
}

export async function createInvoice(input: CreateInvoiceInput, user?: AuthenticatedUser) {
  const invoice = await prisma.$transaction(async (tx) => {
    const created = await createInvoiceData(input, tx, user);
    await recordLifecycleStatusEvent(tx, {
      entityType: LifecycleEntityType.INVOICE,
      entityId: created.id,
      toStatus: created.status,
      changedAt: created.createdAt,
      valueSnapshot: Number(created.amount),
      metadata: {
        eventType: "invoice_created",
        issuedDate: created.issuedDate?.toISOString() ?? null,
        dueDate: created.dueDate?.toISOString() ?? null
      },
      user
    });
    await createWorkSystemUpdate(tx, {
      stage: "invoice",
      recordId: created.id,
      title: `${created.invoiceNumber} created`,
      body: created.project?.projectNumber
        ? `Invoice created from ${created.project.projectNumber}.`
        : "Invoice created by direct entry.",
      user,
      createdAt: created.createdAt,
      metadata: { eventType: "invoice_created", toStatus: created.status }
    });
    return created;
  });
  await recordActivity({
    user,
    relatedEntityType: "Invoice",
    relatedEntityId: invoice.id,
    type: "Created",
    title: `${invoice.invoiceNumber} created`,
    detail: invoice.title
  });
  return toInvoiceRecord(invoice, await listInvoiceDocuments(invoice.id));
}

export async function createInvoiceFromProject(
  id: string,
  input: CreateProjectInvoiceInput,
  user?: AuthenticatedUser
) {
  const project = await projectOrThrow(id);
  if (project.status === "Cancelled") throw new Error("PROJECT_CANCELLED");
  const invoice = await prisma.$transaction(async (tx) => {
    const inheritedAssignee = input.assignedToId === undefined
      ? await findEligibleWorkAssignee("invoice", project.assignedToId, tx)
      : undefined;
    const created = await createInvoiceData(
      {
        title: input.title || `${project.title} milestone invoice`,
        clientId: project.clientId,
        projectId: project.id,
        assignedToId: input.assignedToId === undefined
          ? inheritedAssignee?.id ?? null
          : input.assignedToId,
        contactId: project.contactId,
        siteId: project.siteId,
        lifecycleDetails: undefined,
        status: "Draft",
        amount: input.amount ?? Number(project.budget),
        issuedDate: input.issuedDate,
        dueDate: input.dueDate
      },
      tx,
      user
    );
    await recordLifecycleStatusEvent(tx, {
      entityType: LifecycleEntityType.INVOICE,
      entityId: created.id,
      toStatus: created.status,
      changedAt: created.createdAt,
      valueSnapshot: Number(created.amount),
      metadata: {
        eventType: "invoice_created_from_project",
        issuedDate: created.issuedDate?.toISOString() ?? null,
        dueDate: created.dueDate?.toISOString() ?? null
      },
      user
    });
    await createWorkSystemUpdate(tx, {
      stage: "invoice",
      recordId: created.id,
      title: `${created.invoiceNumber} created from ${project.projectNumber}`,
      body: `Billing record opened for ${project.projectNumber}.`,
      user,
      createdAt: created.createdAt,
      metadata: { eventType: "invoice_created_from_project", toStatus: created.status }
    });
    await createWorkSystemUpdate(tx, {
      stage: "project",
      recordId: project.id,
      title: `${created.invoiceNumber} created`,
      body: `Invoice ${created.invoiceNumber} was created from this project.`,
      user,
      createdAt: created.createdAt,
      metadata: { eventType: "project_invoice_created" }
    });
    return created;
  });
  await Promise.all([
    recordActivity({
      user,
      relatedEntityType: "Project",
      relatedEntityId: project.id,
      type: "Invoice Created",
      title: `${invoice.invoiceNumber} created from ${project.projectNumber}`
    }),
    recordActivity({
      user,
      relatedEntityType: "Invoice",
      relatedEntityId: invoice.id,
      type: "Created",
      title: `${invoice.invoiceNumber} created from ${project.projectNumber}`
    })
  ]);
  return toInvoiceRecord(invoice, await listInvoiceDocuments(invoice.id));
}

export async function updateInvoice(id: string, input: UpdateInvoiceInput, user?: AuthenticatedUser) {
  const existing = await invoiceOrThrow(id);
  const assignedTo = input.assignedToId !== undefined
    ? await resolveWorkAssignee("invoice", input.assignedToId)
    : undefined;
  const snapshotChanged =
    (input.amount !== undefined && input.amount !== Number(existing.amount)) ||
    (input.issuedDate !== undefined && (dateInput(input.issuedDate)?.getTime() ?? null) !== (existing.issuedDate?.getTime() ?? null)) ||
    (input.dueDate !== undefined && (dateInput(input.dueDate)?.getTime() ?? null) !== (existing.dueDate?.getTime() ?? null));
  if (input.clientId) await clientOrThrow(input.clientId);
  const effectiveProjectId = input.projectId ?? existing.projectId;
  const effectiveClientId = input.clientId ?? existing.clientId;
  // Validate the resulting relationship, including partial updates that change only one side.
  if (effectiveProjectId) {
    const project = await projectOrThrow(effectiveProjectId);
    if (project.clientId !== effectiveClientId) throw new Error("WORK_CLIENT_MISMATCH");
  }
  if (input.contactId) await contactForClientOrThrow(input.contactId, effectiveClientId);
  if (input.siteId) await siteForClientOrThrow(input.siteId, effectiveClientId);
  const invoice = await prisma.$transaction(async (tx) => {
    const lifecycleContextId = await updateLifecycleDetails(
      tx,
      existing.lifecycleContextId,
      input.lifecycleDetails,
      user
    );
    const updated = await tx.invoice.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        ...(input.clientId !== undefined && input.contactId === undefined ? { contactId: null } : {}),
        ...(input.clientId !== undefined && input.siteId === undefined ? { siteId: null } : {}),
        ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
        ...(input.siteId !== undefined ? { siteId: input.siteId } : {}),
        ...(input.assignedToId !== undefined
          ? {
              assignedToId: assignedTo?.id ?? null,
              ownerSnapshot: assignedTo?.name ?? "Unassigned"
            }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.issuedDate !== undefined ? { issuedDate: dateInput(input.issuedDate) } : {}),
        ...(input.dueDate !== undefined ? { dueDate: dateInput(input.dueDate) } : {}),
        ...(lifecycleContextId !== existing.lifecycleContextId ? { lifecycleContextId } : {})
      },
      include: invoiceInclude
    });
    await recordLifecycleStatusEvent(tx, {
      entityType: LifecycleEntityType.INVOICE,
      entityId: updated.id,
      fromStatus: existing.status,
      toStatus: updated.status,
      valueSnapshot: Number(updated.amount),
      metadata: {
        eventType: input.status !== undefined && input.status !== existing.status
          ? "invoice_status_changed"
          : "invoice_snapshot_changed",
        issuedDate: updated.issuedDate?.toISOString() ?? null,
        dueDate: updated.dueDate?.toISOString() ?? null
      },
      recordWhenUnchanged: snapshotChanged,
      user
    });
    if (input.status !== undefined && input.status !== existing.status) {
      await createWorkSystemUpdate(tx, {
        stage: "invoice",
        recordId: updated.id,
        title: `${updated.invoiceNumber} moved to ${updated.status}`,
        body: `Status changed from ${existing.status} to ${updated.status}.`,
        user,
        metadata: {
          eventType: "invoice_status_changed",
          fromStatus: existing.status,
          toStatus: updated.status
        }
      });
    }
    if (
      input.assignedToId !== undefined &&
      (assignedTo?.id ?? null) !== existing.assignedToId
    ) {
      await createWorkSystemUpdate(tx, {
        stage: "invoice",
        recordId: updated.id,
        title: "Assigned person changed",
        body: `${existing.assignedTo?.name ?? "Unassigned"} → ${assignedTo?.name ?? "Unassigned"}`,
        user,
        metadata: { eventType: "invoice_assignee_changed" }
      });
    }
    if (input.lifecycleDetails !== undefined) {
      await createWorkSystemUpdate(tx, {
        stage: "invoice",
        recordId: updated.id,
        title: "Lifecycle details updated",
        body: "The shared details for this lifecycle were updated.",
        user,
        metadata: { eventType: "lifecycle_details_updated" }
      });
    }
    return updated;
  });
  await recordActivity({
    user,
    relatedEntityType: "Invoice",
    relatedEntityId: invoice.id,
    type: "Updated",
    title: `${invoice.invoiceNumber} updated`,
    metadata: { status: invoice.status, amount: Number(invoice.amount) }
  });
  return toInvoiceRecord(invoice, await listInvoiceDocuments(invoice.id));
}

export async function archiveInvoice(id: string, user?: AuthenticatedUser) {
  const existing = await invoiceOrThrow(id);
  const invoice = await prisma.invoice.update({
    where: { id: existing.id },
    data: { archivedAt: new Date() },
    include: invoiceInclude
  });
  await recordActivity({
    user,
    relatedEntityType: "Invoice",
    relatedEntityId: invoice.id,
    type: "Archived",
    title: `${invoice.invoiceNumber} archived`
  });
  return toInvoiceRecord(invoice, await listInvoiceDocuments(invoice.id));
}
