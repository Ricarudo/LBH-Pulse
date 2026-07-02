import { Prisma } from "@/generated/prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
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
import type { InvoiceRecord, ProjectRecord, QuoteRecord } from "@/types/work";

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
type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;
type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

function dateInput(value?: string | null) {
  return value ? new Date(`${value}T12:00:00.000Z`) : null;
}

function dateOutput(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
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
  return toQuoteRecord(await quoteOrThrow(id));
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
    include: quoteInclude
  });
  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: "Updated",
    title: `${quote.quoteNumber} updated`,
    metadata: { status: quote.status, total: Number(quote.total) }
  });
  return toQuoteRecord(quote);
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
  const quote = await quoteOrThrow(id);
  if (!quote.clientId) throw new Error("QUOTE_CLIENT_REQUIRED");
  const project = await prisma.$transaction((tx) =>
    createProjectData(
      {
        title: quote.title,
        clientId: quote.clientId!,
        quoteId: quote.id,
        owner: quote.owner,
        status: "Ready",
        budget: Number(quote.total),
        startDate: input.startDate,
        dueDate: input.dueDate
      },
      tx
    )
  );
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
