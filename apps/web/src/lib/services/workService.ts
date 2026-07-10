import { Prisma } from "@/generated/prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import {
  planQuoteBomSources,
  type QuoteBomCatalogItem
} from "@/lib/quoteBom";
import { calculateMarkupPercent, calculateQuoteLine } from "@/lib/quoteMath";
import { recordActivity } from "@/lib/services/activityService";
import type {
  ConvertQuoteInput,
  CreateInvoiceInput,
  CreateProjectInput,
  CreateProjectInvoiceInput,
  CreateQuoteInput,
  UpdateInvoiceInput,
  UpdateProjectInput,
  UpdateQuoteInput
} from "@/lib/validations/work";
import type {
  AddAdHocQuoteItemInput,
  AddQuoteItemInput,
  AddQuoteKitInput,
  UpdateQuoteItemInput,
  UpdateQuoteProposalInput
} from "@/lib/validations/item";
import type { ItemType, QuoteBomSection, QuoteItemRecord } from "@/types/item";
import type {
  InvoiceRecord,
  ProjectRecord,
  QuoteContextSnapshot,
  QuoteDetailRecord,
  QuoteRecord
} from "@/types/work";

const quoteInclude = {
  client: { select: { id: true, displayName: true } },
  requests: {
    where: { archivedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 1,
    select: { id: true, requestNumber: true }
  },
  project: { select: { id: true } }
} satisfies Prisma.QuoteInclude;

const quoteItemsOrderBy = [
  { sortOrder: "asc" },
  { createdAt: "asc" }
] satisfies Prisma.QuoteItemOrderByWithRelationInput[];

const quoteDetailInclude = {
  ...quoteInclude,
  items: {
    orderBy: quoteItemsOrderBy
  }
} satisfies Prisma.QuoteInclude;

const itemForQuoteInclude = {
  outgoingRelations: {
    include: { childItem: true },
    orderBy: [{ sortOrder: "asc" }]
  },
  defaultLaborItem: true
} satisfies Prisma.ItemInclude;

const projectInclude = {
  client: { select: { id: true, displayName: true } },
  quote: { select: { id: true, quoteNumber: true } },
  invoices: {
    where: { archivedAt: null },
    select: { id: true }
  }
} satisfies Prisma.ProjectInclude;

const invoiceInclude = {
  client: { select: { id: true, displayName: true } },
  project: { select: { id: true, projectNumber: true } }
} satisfies Prisma.InvoiceInclude;

type QuoteWithRelations = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;
type QuoteDetailWithRelations = Prisma.QuoteGetPayload<{ include: typeof quoteDetailInclude }>;
type ItemForQuote = Prisma.ItemGetPayload<{ include: typeof itemForQuoteInclude }>;
type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;
type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

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

function nullable(value?: string) {
  return value ? value : null;
}

function quoteItemSection(itemType: ItemType): QuoteBomSection {
  if (itemType === "LABOR") return "Labor";
  if (itemType === "SERVICE") return "Services";
  return "Materials";
}

export function toQuoteRecord(quote: QuoteWithRelations): QuoteRecord {
  const request = quote.requests[0];
  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    title: quote.title,
    clientId: quote.clientId,
    clientName: quote.client?.displayName ?? quote.clientName ?? "",
    status: quote.status as QuoteRecord["status"],
    owner: quote.owner,
    total: Number(quote.total),
    requestId: request?.id ?? null,
    requestNumber: request?.requestNumber ?? "",
    projectId: quote.project?.id ?? null,
    createdAt: dateOutput(quote.createdAt),
    updatedAt: quote.updatedAt.toISOString(),
    documents: []
  };
}

function toQuoteContextSnapshot(quote: QuoteDetailWithRelations): QuoteContextSnapshot {
  return {
    sourceRequestId: quote.sourceRequestIdSnapshot,
    requestNumber: empty(quote.requestNumberSnapshot),
    requestTitle: empty(quote.requestTitleSnapshot),
    requestType: empty(quote.requestTypeSnapshot),
    serviceCategory: empty(quote.serviceCategorySnapshot),
    contactName: empty(quote.contactNameSnapshot),
    contactEmail: empty(quote.contactEmailSnapshot),
    contactPhone: empty(quote.contactPhoneSnapshot),
    siteName: empty(quote.siteNameSnapshot),
    siteAddress: empty(quote.siteAddressSnapshot),
    city: empty(quote.citySnapshot),
    state: empty(quote.stateSnapshot),
    scopeDescription: empty(quote.scopeDescriptionSnapshot),
    internalNotes: empty(quote.internalNotesSnapshot)
  };
}

export function toQuoteItemRecord(item: QuoteDetailWithRelations["items"][number]): QuoteItemRecord {
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

export function toQuoteDetailRecord(quote: QuoteDetailWithRelations): QuoteDetailRecord {
  return {
    ...toQuoteRecord(quote),
    context: toQuoteContextSnapshot(quote),
    proposalNotes: empty(quote.proposalNotes),
    proposalPreparedAt: dateTimeOutput(quote.proposalPreparedAt),
    items: quote.items.map(toQuoteItemRecord)
  };
}

export function toProjectRecord(project: ProjectWithRelations): ProjectRecord {
  return {
    id: project.id,
    projectNumber: project.projectNumber,
    title: project.title,
    clientId: project.clientId,
    clientName: project.client.displayName,
    quoteId: project.quoteId,
    quoteNumber: project.quote?.quoteNumber ?? "",
    owner: project.owner,
    status: project.status as ProjectRecord["status"],
    budget: Number(project.budget),
    startDate: dateOutput(project.startDate),
    dueDate: dateOutput(project.dueDate),
    invoiceCount: project.invoices.length,
    createdAt: dateOutput(project.createdAt),
    updatedAt: project.updatedAt.toISOString(),
    documents: []
  };
}

export function toInvoiceRecord(invoice: InvoiceWithRelations): InvoiceRecord {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    title: invoice.title,
    clientId: invoice.clientId,
    clientName: invoice.client.displayName,
    projectId: invoice.projectId,
    projectNumber: invoice.project?.projectNumber ?? "",
    owner: invoice.owner,
    status: invoice.status as InvoiceRecord["status"],
    amount: Number(invoice.amount),
    issuedDate: dateOutput(invoice.issuedDate),
    dueDate: dateOutput(invoice.dueDate),
    createdAt: dateOutput(invoice.createdAt),
    updatedAt: invoice.updatedAt.toISOString()
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

async function nextNumber(
  tx: Prisma.TransactionClient,
  kind: "quote" | "project" | "invoice"
) {
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
    where: { archivedAt: null, OR: [{ id }, { quoteNumber: id }] },
    include: quoteInclude
  });
  if (!quote) throw new Error("QUOTE_NOT_FOUND");
  return quote;
}

async function quoteDetailOrThrow(id: string) {
  const quote = await prisma.quote.findFirst({
    where: { archivedAt: null, OR: [{ id }, { quoteNumber: id }] },
    include: quoteDetailInclude
  });
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
  return (
    await prisma.quote.findMany({
      where: { archivedAt: null },
      include: quoteInclude,
      orderBy: { updatedAt: "desc" }
    })
  ).map(toQuoteRecord);
}

export async function getQuoteById(id: string) {
  return toQuoteDetailRecord(await quoteDetailOrThrow(id));
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
  const aggregate = await tx.quoteItem.aggregate({
    where: { quoteId },
    _sum: { lineTotal: true }
  });
  return tx.quote.update({
    where: { id: quoteId },
    data: { total: aggregate._sum.lineTotal ?? 0 }
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
    select: { id: true, quoteNumber: true }
  });
  if (!quote) throw new Error("QUOTE_NOT_FOUND");
  return quote;
}

async function lockQuoteOrThrow(tx: Prisma.TransactionClient, id: string) {
  const quote = await quoteIdOrThrow(tx, id);
  await tx.$queryRaw`SELECT "id" FROM "Quote" WHERE "id" = ${quote.id} FOR UPDATE`;
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
    const quote = await lockQuoteOrThrow(tx, quoteId);
    const item = await activeItemOrThrow(tx, input.itemId);
    const sources = await planQuoteSources(tx, item, input, "ITEM");

    await createQuoteItemsFromSources(tx, quote.id, sources);
    await recalculateQuoteTotal(tx, quote.id);
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
  return toQuoteDetailRecord(quote);
}

export async function addQuoteKit(
  quoteId: string,
  input: AddQuoteKitInput,
  user?: AuthenticatedUser
) {
  const result = await prisma.$transaction(async (tx) => {
    const quote = await lockQuoteOrThrow(tx, quoteId);
    const item = await activeItemOrThrow(tx, input.itemId);
    const sources = await planQuoteSources(tx, item, input, "KIT");

    await createQuoteItemsFromSources(tx, quote.id, sources);
    await recalculateQuoteTotal(tx, quote.id);
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
  return toQuoteDetailRecord(quote);
}

export async function addAdHocQuoteItem(
  quoteId: string,
  input: AddAdHocQuoteItemInput,
  user?: AuthenticatedUser
) {
  const quote = await prisma.$transaction(async (tx) => {
    const quote = await lockQuoteOrThrow(tx, quoteId);
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
  return toQuoteDetailRecord(quote);
}

export async function updateQuoteItem(
  quoteId: string,
  quoteItemId: string,
  input: UpdateQuoteItemInput,
  user?: AuthenticatedUser
) {
  const quote = await prisma.$transaction(async (tx) => {
    const quote = await lockQuoteOrThrow(tx, quoteId);
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
  return toQuoteDetailRecord(quote);
}

export async function removeQuoteItem(
  quoteId: string,
  quoteItemId: string,
  user?: AuthenticatedUser
) {
  const quote = await prisma.$transaction(async (tx) => {
    const quote = await lockQuoteOrThrow(tx, quoteId);
    const existing = await tx.quoteItem.findFirst({
      where: { id: quoteItemId, quoteId: quote.id },
      select: { id: true }
    });
    if (!existing) throw new Error("QUOTE_ITEM_NOT_FOUND");
    await tx.quoteItem.delete({ where: { id: existing.id } });
    await recalculateQuoteTotal(tx, quote.id);
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
  return toQuoteDetailRecord(quote);
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
  return toQuoteDetailRecord(quote);
}

export async function createQuote(input: CreateQuoteInput, user?: AuthenticatedUser) {
  const client = input.clientId ? await clientOrThrow(input.clientId) : null;
  const quote = await prisma.$transaction(async (tx) =>
    tx.quote.create({
      data: {
        quoteNumber: await nextNumber(tx, "quote"),
        title: input.title,
        clientId: client?.id,
        clientName: client?.displayName,
        owner: input.owner || "Unassigned",
        status: input.status,
        total: input.total
      },
      include: quoteInclude
    })
  );
  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: "Created",
    title: `${quote.quoteNumber} created`,
    detail: quote.title
  });
  return toQuoteRecord(quote);
}

export async function updateQuote(id: string, input: UpdateQuoteInput, user?: AuthenticatedUser) {
  const existing = await quoteOrThrow(id);
  const client = input.clientId ? await clientOrThrow(input.clientId) : null;
  if (client && existing.project?.id) {
    const project = await prisma.project.findUnique({ where: { id: existing.project.id }, select: { clientId: true } });
    if (project && project.clientId !== client.id) throw new Error("WORK_CLIENT_MISMATCH");
  }
  const quote = await prisma.quote.update({
    where: { id: existing.id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(client ? { clientId: client.id, clientName: client.displayName } : {}),
      ...(input.owner !== undefined ? { owner: input.owner || "Unassigned" } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.total !== undefined ? { total: input.total } : {})
    },
    include: quoteDetailInclude
  });
  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: "Updated",
    title: `${quote.quoteNumber} updated`,
    metadata: { status: quote.status, total: Number(quote.total) }
  });
  return toQuoteDetailRecord(quote);
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
  return toQuoteRecord(quote);
}

export async function listProjects() {
  return (
    await prisma.project.findMany({
      where: { archivedAt: null },
      include: projectInclude,
      orderBy: { updatedAt: "desc" }
    })
  ).map(toProjectRecord);
}

export async function getProjectById(id: string) {
  return toProjectRecord(await projectOrThrow(id));
}

async function createProjectData(
  input: CreateProjectInput,
  tx: Prisma.TransactionClient
) {
  const client = await tx.client.findFirst({
    where: { id: input.clientId, archivedAt: null },
    select: { id: true }
  });
  if (!client) throw new Error("CLIENT_NOT_FOUND");

  if (input.quoteId) {
    // A handoff keeps one client lineage and permits only one project per quote.
    const quote = await tx.quote.findFirst({
      where: { id: input.quoteId, archivedAt: null },
      include: { project: { select: { id: true } } }
    });
    if (!quote) throw new Error("QUOTE_NOT_FOUND");
    if (quote.project) throw new Error("QUOTE_ALREADY_CONVERTED");
    if (quote.status !== "Approved") throw new Error("QUOTE_NOT_APPROVED");
    if (quote.clientId !== input.clientId) throw new Error("WORK_CLIENT_MISMATCH");
  }

  return tx.project.create({
    data: {
      projectNumber: await nextNumber(tx, "project"),
      title: input.title,
      clientId: input.clientId,
      quoteId: input.quoteId,
      owner: input.owner || "Unassigned",
      status: input.status,
      budget: input.budget,
      startDate: dateInput(input.startDate),
      dueDate: dateInput(input.dueDate)
    },
    include: projectInclude
  });
}

export async function createProject(input: CreateProjectInput, user?: AuthenticatedUser) {
  const project = await prisma.$transaction((tx) => createProjectData(input, tx));
  await recordActivity({
    user,
    relatedEntityType: "Project",
    relatedEntityId: project.id,
    type: "Created",
    title: `${project.projectNumber} created`,
    detail: project.title
  });
  return toProjectRecord(project);
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
    const project = await createProjectData(
      {
        title: quote.title,
        clientId: quote.clientId,
        quoteId: quote.id,
        owner: quote.owner,
        status: "Ready",
        budget: Number(quote.total),
        startDate: input.startDate,
        dueDate: input.dueDate
      },
      tx
    );
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
  return toProjectRecord(project);
}

export async function updateProject(id: string, input: UpdateProjectInput, user?: AuthenticatedUser) {
  const existing = await projectOrThrow(id);
  if (input.clientId) await clientOrThrow(input.clientId);
  if (input.clientId && existing.quoteId) {
    const quote = await prisma.quote.findUnique({ where: { id: existing.quoteId }, select: { clientId: true } });
    if (quote?.clientId && quote.clientId !== input.clientId) throw new Error("WORK_CLIENT_MISMATCH");
  }
  const project = await prisma.project.update({
    where: { id: existing.id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
      ...(input.owner !== undefined ? { owner: input.owner || "Unassigned" } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.budget !== undefined ? { budget: input.budget } : {}),
      ...(input.startDate !== undefined ? { startDate: dateInput(input.startDate) } : {}),
      ...(input.dueDate !== undefined ? { dueDate: dateInput(input.dueDate) } : {})
    },
    include: projectInclude
  });
  await recordActivity({
    user,
    relatedEntityType: "Project",
    relatedEntityId: project.id,
    type: "Updated",
    title: `${project.projectNumber} updated`,
    metadata: { status: project.status, budget: Number(project.budget) }
  });
  return toProjectRecord(project);
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
  return toProjectRecord(project);
}

export async function listInvoices() {
  return (
    await prisma.invoice.findMany({
      where: { archivedAt: null },
      include: invoiceInclude,
      orderBy: { updatedAt: "desc" }
    })
  ).map(toInvoiceRecord);
}

export async function getInvoiceById(id: string) {
  return toInvoiceRecord(await invoiceOrThrow(id));
}

async function createInvoiceData(
  input: CreateInvoiceInput,
  tx: Prisma.TransactionClient
) {
  const client = await tx.client.findFirst({
    where: { id: input.clientId, archivedAt: null },
    select: { id: true }
  });
  if (!client) throw new Error("CLIENT_NOT_FOUND");

  if (input.projectId) {
    // Project invoices inherit the project account; cross-client billing is rejected.
    const project = await tx.project.findFirst({
      where: { id: input.projectId, archivedAt: null },
      select: { clientId: true }
    });
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    if (project.clientId !== input.clientId) throw new Error("WORK_CLIENT_MISMATCH");
  }

  return tx.invoice.create({
    data: {
      invoiceNumber: await nextNumber(tx, "invoice"),
      title: input.title,
      clientId: input.clientId,
      projectId: input.projectId,
      owner: input.owner || "Unassigned",
      status: input.status,
      amount: input.amount,
      issuedDate: dateInput(input.issuedDate),
      dueDate: dateInput(input.dueDate)
    },
    include: invoiceInclude
  });
}

export async function createInvoice(input: CreateInvoiceInput, user?: AuthenticatedUser) {
  const invoice = await prisma.$transaction((tx) => createInvoiceData(input, tx));
  await recordActivity({
    user,
    relatedEntityType: "Invoice",
    relatedEntityId: invoice.id,
    type: "Created",
    title: `${invoice.invoiceNumber} created`,
    detail: invoice.title
  });
  return toInvoiceRecord(invoice);
}

export async function createInvoiceFromProject(
  id: string,
  input: CreateProjectInvoiceInput,
  user?: AuthenticatedUser
) {
  const project = await projectOrThrow(id);
  if (project.status === "Cancelled") throw new Error("PROJECT_CANCELLED");
  const invoice = await prisma.$transaction((tx) =>
    createInvoiceData(
      {
        title: input.title || `${project.title} milestone invoice`,
        clientId: project.clientId,
        projectId: project.id,
        owner: input.owner || project.owner,
        status: "Draft",
        amount: input.amount ?? Number(project.budget),
        issuedDate: input.issuedDate,
        dueDate: input.dueDate
      },
      tx
    )
  );
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
  return toInvoiceRecord(invoice);
}

export async function updateInvoice(id: string, input: UpdateInvoiceInput, user?: AuthenticatedUser) {
  const existing = await invoiceOrThrow(id);
  if (input.clientId) await clientOrThrow(input.clientId);
  const effectiveProjectId = input.projectId ?? existing.projectId;
  const effectiveClientId = input.clientId ?? existing.clientId;
  // Validate the resulting relationship, including partial updates that change only one side.
  if (effectiveProjectId) {
    const project = await projectOrThrow(effectiveProjectId);
    if (project.clientId !== effectiveClientId) throw new Error("WORK_CLIENT_MISMATCH");
  }
  const invoice = await prisma.invoice.update({
    where: { id: existing.id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.owner !== undefined ? { owner: input.owner || "Unassigned" } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.issuedDate !== undefined ? { issuedDate: dateInput(input.issuedDate) } : {}),
      ...(input.dueDate !== undefined ? { dueDate: dateInput(input.dueDate) } : {})
    },
    include: invoiceInclude
  });
  await recordActivity({
    user,
    relatedEntityType: "Invoice",
    relatedEntityId: invoice.id,
    type: "Updated",
    title: `${invoice.invoiceNumber} updated`,
    metadata: { status: invoice.status, amount: Number(invoice.amount) }
  });
  return toInvoiceRecord(invoice);
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
  return toInvoiceRecord(invoice);
}
