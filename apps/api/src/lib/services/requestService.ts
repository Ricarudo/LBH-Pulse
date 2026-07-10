import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { toAuthenticatedUser, type AuthenticatedUser } from "@pulse/contracts/auth";
import { recordActivity } from "@/lib/services/activityService";
import { toInvoiceRecord, toProjectRecord, toQuoteRecord } from "@/lib/services/workService";
import type {
  RequestActivityType,
  RequestAssignee,
  RequestRecord
} from "@pulse/contracts/requests";
import type {
  ConvertRequestInput,
  CreateRequestActivityInput,
  CreateRequestInput,
  CreateRequestTaskInput,
  UpdateRequestChecklistItemInput,
  UpdateRequestInput
} from "@pulse/contracts/requests";

const requestInclude = {
  assignedTo: true,
  createdBy: true,
  client: true,
  contact: true,
  site: true,
  relatedQuote: true,
  checklistTemplate: true,
  trades: {
    orderBy: { serviceCategory: "asc" }
  },
  checklistInstances: {
    include: {
      items: {
        include: { completedBy: true },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }]
      }
    },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }]
  },
  checklistItems: {
    include: {
      completedBy: true
    },
    orderBy: [
      { sortOrder: "asc" },
      { label: "asc" }
    ]
  },
  activities: {
    orderBy: {
      createdAt: "desc"
    }
  },
  tasks: {
    orderBy: {
      createdAt: "desc"
    }
  },
  documents: {
    where: { deletedAt: null },
    orderBy: {
      createdAt: "desc"
    }
  }
} satisfies Prisma.RequestInclude;

type RequestWithRelations = Prisma.RequestGetPayload<{
  include: typeof requestInclude;
}>;

const requestAssigneeWhere = {
  active: true,
  role: {
    in: ["Admin", "Sales", "ProjectManager"]
  }
};

function parseDateInput(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateInput(date?: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function formatDateTime(date?: Date | null) {
  return date?.toISOString() ?? "";
}

function isChecklistItemApplicable(
  item: { appliesWhen: string | null },
  request: { siteVisitNeeded: boolean }
) {
  if (!item.appliesWhen) {
    return true;
  }

  if (item.appliesWhen === "siteVisitRequired") {
    return request.siteVisitNeeded;
  }

  return true;
}

function buildChecklistSummary(request: RequestWithRelations) {
  const activeInstanceItems = request.checklistInstances.length
    ? request.checklistInstances.filter((instance) => instance.active).flatMap((instance) => instance.items)
    : request.checklistItems;
  const applicableItems = activeInstanceItems.filter((item) =>
    isChecklistItemApplicable(item, request)
  );
  const requiredItems = applicableItems.filter((item) => item.required);
  const missingRequired = requiredItems
    .filter((item) => !item.completed)
    .map((item) => item.label);

  if (!request.assignedToId) {
    missingRequired.push("Internal owner assigned");
  }

  if (!request.trades.length && !request.serviceCategory) {
    missingRequired.push("Service category selected");
  }

  if (!request.companyName && !request.clientId) {
    missingRequired.push("Client / company identified");
  }

  if (!request.contactName && !request.contactEmail && !request.contactPhone && !request.contactId) {
    missingRequired.push("Contact information confirmed");
  }

  if (request.siteVisitNeeded && !request.siteVisitCompleted) {
    missingRequired.push("Site visit completed");
  }

  const uniqueMissing = Array.from(new Set(missingRequired));

  return {
    templateName:
      request.checklistInstances.filter((instance) => instance.active).length > 1
        ? "Request checklists"
        : request.checklistInstances.find((instance) => instance.active)?.templateNameSnapshot ??
          request.checklistTemplateNameSnapshot ??
          request.checklistTemplate?.name ??
          "Request Intake",
    completed: applicableItems.filter((item) => item.completed).length,
    total: applicableItems.length,
    requiredCompleted: requiredItems.filter((item) => item.completed).length,
    requiredTotal: requiredItems.length,
    missingRequired: uniqueMissing,
    readyForQuote: uniqueMissing.length === 0
  };
}

function deriveIntakeStatus(request: RequestWithRelations) {
  if (["Converted to Quote", "No Bid", "Cancelled", "Duplicate"].includes(request.status)) {
    return request.status;
  }

  const summary = buildChecklistSummary(request);

  if (summary.readyForQuote) {
    return "Ready for Quote";
  }

  if (request.siteVisitNeeded && !request.siteVisitCompleted) {
    return "Site Visit Required";
  }

  if (summary.missingRequired.length > 0 || request.missingInfo) {
    return "Missing Info";
  }

  return request.status === "Received" ? "Received" : "Reviewing";
}

function isValidRequestAssignee(
  assignee?: { id: string; name: string; email: string; role: string } | null
) {
  return Boolean(
    assignee &&
      (assignee.role === "Admin" ||
        assignee.role === "Sales" ||
        assignee.role === "ProjectManager")
  );
}

async function resolveRequestAssignee(assignedToId?: string | null) {
  if (!assignedToId) {
    return null;
  }

  const assignee = (await prisma.localUser.findUnique({
    where: { id: assignedToId }
  })) as { id: string; name: string; email: string; role: string } | null;

  if (!isValidRequestAssignee(assignee)) {
    throw new Error("REQUEST_ASSIGNEE_INVALID");
  }

  return assignee;
}

function toRequestRecord(request: RequestWithRelations): RequestRecord {
  const assignedToName = request.assignedTo?.name ?? "Unassigned";
  const assignedToRole =
    request.assignedTo?.role === "Admin" ||
    request.assignedTo?.role === "Sales" ||
    request.assignedTo?.role === "ProjectManager" ||
    request.assignedTo?.role === "Technician"
      ? request.assignedTo.role
      : "";

  return {
    id: request.id,
    requestNumber: request.requestNumber,
    title: request.title,
    requestType: request.requestType as RequestRecord["requestType"],
    source: request.source as RequestRecord["source"],
    serviceCategory: request.serviceCategory as RequestRecord["serviceCategory"],
    serviceCategories: (request.trades.length
      ? request.trades.map((trade) => trade.serviceCategory)
      : [request.serviceCategory]) as RequestRecord["serviceCategories"],
    status: request.status as RequestRecord["status"],
    priority: request.priority as RequestRecord["priority"],
    companyName: request.companyName ?? request.client?.displayName ?? "",
    contactName:
      request.contactName ??
      request.contact?.name ??
      [request.contact?.firstName, request.contact?.lastName].filter(Boolean).join(" "),
    contactEmail: request.contactEmail ?? request.contact?.email ?? "",
    contactPhone: request.contactPhone ?? request.contact?.phone ?? "",
    siteName: request.siteName ?? request.site?.siteName ?? "",
    siteAddress: request.siteAddress ?? request.site?.addressLine1 ?? "",
    city: request.city ?? request.site?.city ?? "",
    state: request.state ?? request.site?.state ?? "",
    clientId: request.clientId,
    contactId: request.contactId,
    siteId: request.siteId,
    assignedToId: request.assignedToId,
    assignedToName,
    assignedToRole,
    createdById: request.createdById,
    createdByName: request.createdBy?.name ?? "Pulse System",
    receivedDate: formatDateInput(request.receivedDate),
    dueDate: formatDateInput(request.dueDate),
    nextAction: request.nextAction ?? "",
    nextFollowUpAt: formatDateInput(request.nextFollowUpAt),
    lastActivityAt: formatDateTime(request.lastActivityAt ?? request.updatedAt),
    missingInfo: request.missingInfo ?? "",
    siteVisitNeeded: request.siteVisitNeeded,
    siteVisitCompleted: request.siteVisitCompleted,
    description: request.description ?? "",
    internalNotes: request.internalNotes ?? "",
    relatedQuoteId: request.relatedQuoteId,
    relatedQuoteNumber: request.relatedQuote?.quoteNumber ?? "",
    archivedAt: request.archivedAt ? request.archivedAt.toISOString() : undefined,
    createdAt: formatDateInput(request.createdAt),
    updatedAt: request.updatedAt.toISOString(),
    documents: request.documents.map((document) => {
      const available = document.scanStatus === "Clean" && Boolean(document.objectKey);
      return {
        id: document.id,
        sourceType: "Request" as const,
        sourceId: request.id,
        sourceNumber: request.requestNumber,
        inherited: false,
        canDelete: true,
        originalFileName: document.originalFileName,
        mediaType: document.mediaType ?? "",
        byteSize: Number(document.byteSize),
        category: document.category,
        scanStatus: document.scanStatus,
        available,
        uploadedByName: document.uploadedByName,
        createdAt: document.createdAt.toISOString(),
        downloadUrl: available ? `/api/documents/${document.id}/download` : null,
        previewUrl: available ? `/api/documents/${document.id}/preview` : null
      };
    }),
    activity: request.activities.map((activity) => ({
      id: activity.id,
      type: activity.type as RequestActivityType,
      title: activity.title,
      body: activity.body ?? undefined,
      actor: activity.actor,
      at: formatDateTime(activity.createdAt)
    })),
    tasks: request.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      dueAt: formatDateInput(task.dueAt),
      owner: task.owner,
      completed: Boolean(task.completedAt)
    })),
    checklistItems: request.checklistItems.map((item) => ({
      id: item.id,
      label: item.label,
      description: item.description ?? "",
      required: item.required,
      appliesWhen: item.appliesWhen ?? "",
      group: item.group ?? "Intake",
      sortOrder: item.sortOrder,
      completed: item.completed,
      completedAt: formatDateTime(item.completedAt),
      completedByName: item.completedByNameSnapshot ?? item.completedBy?.name ?? "",
      notes: item.notes ?? "",
      applicable: isChecklistItemApplicable(item, request)
    })),
    checklistInstances: request.checklistInstances.map((instance) => {
      const items = instance.items.map((item) => ({
        id: item.id,
        label: item.label,
        description: item.description ?? "",
        required: item.required,
        appliesWhen: item.appliesWhen ?? "",
        group: item.group ?? "Intake",
        sortOrder: item.sortOrder,
        completed: item.completed,
        completedAt: formatDateTime(item.completedAt),
        completedByName: item.completedByNameSnapshot ?? item.completedBy?.name ?? "",
        notes: item.notes ?? "",
        applicable: isChecklistItemApplicable(item, request)
      }));
      const applicable = items.filter((item) => item.applicable);
      const required = applicable.filter((item) => item.required);
      return {
        id: instance.id,
        templateId: instance.templateId,
        templateKey: instance.templateKeySnapshot,
        templateName: instance.templateNameSnapshot,
        matchType: instance.matchType as "CORE" | "TRADE" | "REQUEST_TYPE",
        matchValue: instance.matchValue ?? "",
        active: instance.active,
        retiredAt: formatDateTime(instance.retiredAt),
        items,
        summary: {
          templateName: instance.templateNameSnapshot,
          completed: applicable.filter((item) => item.completed).length,
          total: applicable.length,
          requiredCompleted: required.filter((item) => item.completed).length,
          requiredTotal: required.length,
          missingRequired: required.filter((item) => !item.completed).map((item) => item.label)
        }
      };
    }),
    checklistSummary: buildChecklistSummary(request)
  };
}

async function generateRequestNumber(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('pulse-number:request'))`;
  const count = await tx.request.count();
  return `RQ-${new Date().getUTCFullYear()}-${String(1001 + count).padStart(4, "0")}`;
}

async function generateQuoteNumber(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('pulse-number:request-quote'))`;
  const count = await tx.quote.count();
  return `QM-${new Date().getUTCFullYear()}-${String(1001 + count).padStart(4, "0")}`;
}

async function getRequestOrThrow(id: string) {
  const request = await prisma.request.findUnique({
    where: { id },
    include: requestInclude
  });

  if (!request || request.archivedAt) {
    throw new Error("REQUEST_NOT_FOUND");
  }

  return request;
}

async function findChecklistTemplates(
  tx: Prisma.TransactionClient,
  serviceCategories: string[],
  requestType: string
) {
  const templates = await tx.requestChecklistTemplate.findMany({
    where: {
      active: true,
      archivedAt: null,
      OR: [
        { key: "general" },
        { serviceCategory: { in: serviceCategories } },
        { requestType }
      ]
    },
    include: {
      items: {
        where: { active: true },
        orderBy: { sortOrder: "asc" }
      }
    }
  });
  return templates
    .map((template) => ({
      template,
      matchType: template.key === "general"
        ? "CORE"
        : template.serviceCategory
          ? "TRADE"
          : "REQUEST_TYPE",
      matchValue: template.serviceCategory ?? template.requestType
    }))
    .sort((left, right) => {
      const order: Record<string, number> = { CORE: 0, TRADE: 1, REQUEST_TYPE: 2 };
      return order[left.matchType] - order[right.matchType] ||
        (left.matchValue ?? "").localeCompare(right.matchValue ?? "");
    });
}

function buildChecklistItemCreateData(
  template: {
    items: Array<{
      id: string;
      label: string;
      description: string | null;
      required: boolean;
      appliesWhen: string | null;
      sortOrder: number;
      group: string | null;
      active?: boolean;
    }>;
  }
) {
  return template.items.filter((item) => item.active !== false).map((item) => ({
    templateItemId: item.id,
    label: item.label,
    description: item.description,
    required: item.required,
    appliesWhen: item.appliesWhen,
    sortOrder: item.sortOrder,
    group: item.group
  }));
}

async function reconcileRequestChecklists(
  tx: Prisma.TransactionClient,
  requestId: string,
  serviceCategories: string[],
  requestType: string
) {
  const desired = await findChecklistTemplates(tx, serviceCategories, requestType);
  const existing = await tx.requestChecklistInstance.findMany({
    where: { requestId },
    include: { items: true }
  });
  const desiredKeys = new Set(desired.map((match) => `${match.matchType}:${match.matchValue ?? ""}`));

  for (const instance of existing.filter((candidate) => candidate.active)) {
    const key = `${instance.matchType}:${instance.matchValue ?? ""}`;
    if (!desiredKeys.has(key)) {
      await tx.requestChecklistInstance.update({
        where: { id: instance.id },
        data: { active: false, retiredAt: new Date() }
      });
    }
  }

  for (const match of desired) {
    const equivalent = existing.find((instance) => instance.templateId === match.template.id);
    if (equivalent) {
      if (!equivalent.active) {
        await tx.requestChecklistInstance.update({
          where: { id: equivalent.id },
          data: { active: true, retiredAt: null }
        });
      }
      continue;
    }
    await tx.requestChecklistInstance.create({
      data: {
        requestId,
        templateId: match.template.id,
        templateKeySnapshot: match.template.key,
        templateNameSnapshot: match.template.name,
        matchType: match.matchType,
        matchValue: match.matchValue,
        items: {
          create: buildChecklistItemCreateData(match.template).map((item) => ({
            ...item,
            requestId
          }))
        }
      }
    });
  }
}

export async function listRequests() {
  const requests = await prisma.request.findMany({
    where: {
      archivedAt: null
    },
    include: requestInclude,
    orderBy: [
      {
        updatedAt: "desc"
      }
    ]
  });

  return requests.map(toRequestRecord);
}

export async function listClientRelatedWork(clientId: string) {
  const client = await prisma.client.findFirst({
    where: {
      archivedAt: null,
      OR: [{ id: clientId }, { clientNumber: clientId }]
    },
    select: { id: true }
  });

  if (!client) {
    throw new Error("CLIENT_NOT_FOUND");
  }

  const [clientRequests, quotes, projects, invoices] = await Promise.all([
    prisma.request.findMany({
      where: { clientId: client.id, archivedAt: null },
      include: requestInclude,
      orderBy: { updatedAt: "desc" }
    }),
    prisma.quote.findMany({
      where: { clientId: client.id, archivedAt: null },
      include: {
        client: { select: { id: true, displayName: true } },
        requests: {
          where: { archivedAt: null },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { id: true, requestNumber: true }
        },
        project: { select: { id: true } }
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.project.findMany({
      where: { clientId: client.id, archivedAt: null },
      include: {
        client: { select: { id: true, displayName: true } },
        quote: { select: { id: true, quoteNumber: true } },
        invoices: { where: { archivedAt: null }, select: { id: true } }
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.invoice.findMany({
      where: { clientId: client.id, archivedAt: null },
      include: {
        client: { select: { id: true, displayName: true } },
        project: { select: { id: true, projectNumber: true } }
      },
      orderBy: { updatedAt: "desc" }
    })
  ]);

  const requestRecords = clientRequests.map(toRequestRecord);
  const quoteRecords = quotes.map((quote) => toQuoteRecord(quote));
  const projectRecords = projects.map((project) => toProjectRecord(project));
  const invoiceRecords = invoices.map(toInvoiceRecord);

  return {
    requests: requestRecords,
    quotes: quoteRecords,
    projects: projectRecords,
    invoices: invoiceRecords,
    summary: {
      activeRequests: requestRecords.filter(
        (request) => !["Converted to Quote", "No Bid", "Cancelled", "Duplicate"].includes(request.status)
      ).length,
      activeQuotes: quoteRecords.filter(
        (quote) => !quote.projectId && !["Rejected", "Expired", "Cancelled"].includes(quote.status)
      ).length,
      activeProjects: projectRecords.filter(
        (project) => !["Completed", "Cancelled"].includes(project.status)
      ).length,
      outstandingInvoiceBalance: invoiceRecords
        .filter((invoice) => !["Paid", "Void"].includes(invoice.status))
        .reduce((total, invoice) => total + invoice.amount, 0)
    }
  };
}

export async function listRequestAssignees() {
  const users = await prisma.localUser.findMany({
    where: requestAssigneeWhere,
    orderBy: [
      {
        name: "asc"
      }
    ]
  });

  return users.map((user) => toAuthenticatedUser(user)) satisfies RequestAssignee[];
}

export async function getRequestById(id: string) {
  return toRequestRecord(await getRequestOrThrow(id));
}

export async function createRequest(input: CreateRequestInput, user?: AuthenticatedUser) {
  const assignedTo = await resolveRequestAssignee(input.assignedToId);
  const request = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const requestNumber = await generateRequestNumber(tx);
    const serviceCategories = input.serviceCategories;
    const matches = await findChecklistTemplates(tx, serviceCategories, input.requestType);
    if (!matches.some((match) => match.matchType === "CORE")) {
      throw new Error("REQUEST_CHECKLIST_TEMPLATE_FALLBACK_REQUIRED");
    }
    const selectedTemplate = matches.find((match) => match.matchType === "TRADE")?.template ??
      matches.find((match) => match.matchType === "CORE")?.template;

    const created = await tx.request.create({
      data: {
        requestNumber,
        title: input.title,
        requestType: input.requestType,
        source: input.source,
        serviceCategory: serviceCategories[0],
        status: input.status,
        priority: input.priority,
        companyName: input.companyName || null,
        contactName: input.contactName || null,
        contactEmail: input.contactEmail || null,
        contactPhone: input.contactPhone || null,
        siteName: input.siteName || null,
        siteAddress: input.siteAddress || null,
        city: input.city || null,
        state: input.state || null,
        clientId: input.clientId || null,
        contactId: input.contactId || null,
        siteId: input.siteId || null,
        assignedToId: assignedTo?.id ?? null,
        createdById: user?.id ?? null,
        receivedDate: parseDateInput(input.receivedDate) ?? now,
        dueDate: parseDateInput(input.dueDate),
        nextAction: input.nextAction || null,
        nextFollowUpAt: parseDateInput(input.nextFollowUpAt),
        missingInfo: input.missingInfo || null,
        siteVisitNeeded: input.siteVisitNeeded,
        siteVisitCompleted: input.siteVisitCompleted,
        description: input.description || null,
        internalNotes: input.internalNotes || null,
        relatedQuoteId: input.relatedQuoteId || null,
        checklistTemplateId: selectedTemplate?.id ?? null,
        checklistTemplateNameSnapshot: selectedTemplate?.name ?? null,
        lastActivityAt: now,
        trades: {
          create: serviceCategories.map((serviceCategory) => ({ serviceCategory }))
        },
        activities: {
          create: {
            type: "Note",
            title: "Request created",
            body: input.description || "New intake request captured in Pulse.",
            actor: user?.name ?? "Pulse System",
            createdAt: now
          }
        },
        notesList: input.internalNotes
          ? {
              create: {
                body: input.internalNotes,
                actor: user?.name ?? "Pulse System",
                createdAt: now
              }
            }
          : undefined
      },
    });

    for (const match of matches) {
      await tx.requestChecklistInstance.create({
        data: {
          requestId: created.id,
          templateId: match.template.id,
          templateKeySnapshot: match.template.key,
          templateNameSnapshot: match.template.name,
          matchType: match.matchType,
          matchValue: match.matchValue,
          items: {
            create: buildChecklistItemCreateData(match.template).map((item) => ({
              ...item,
              requestId: created.id
            }))
          }
        }
      });
    }

    const hydrated = await tx.request.findUniqueOrThrow({
      where: { id: created.id },
      include: requestInclude
    });
    const derivedStatus = deriveIntakeStatus(hydrated);
    if (derivedStatus !== hydrated.status) {
      return tx.request.update({
        where: { id: created.id },
        data: { status: derivedStatus },
        include: requestInclude
      });
    }

    return hydrated;
  });

  await recordActivity({
    user,
    relatedEntityType: "Request",
    relatedEntityId: request.id,
    type: "Created",
    title: `${request.requestNumber} created`,
    detail: request.title,
    metadata: { status: request.status, assignedTo: request.assignedTo?.name ?? "Unassigned" }
  });

  return toRequestRecord(request);
}

export async function updateRequest(
  id: string,
  input: UpdateRequestInput,
  user?: AuthenticatedUser
) {
  const existingRequest = await getRequestOrThrow(id);
  const assignedTo =
    input.assignedToId !== undefined
      ? await resolveRequestAssignee(input.assignedToId)
      : undefined;
  const previousAssigneeName = existingRequest.assignedTo?.name ?? "Unassigned";
  const nextAssigneeName =
    assignedTo === undefined ? previousAssigneeName : assignedTo?.name ?? "Unassigned";
  const now = new Date();
  const requestedCategories = input.serviceCategories ??
    (input.serviceCategory ? [input.serviceCategory] : undefined);
  const checklistRulesChanged = requestedCategories !== undefined || input.requestType !== undefined;

  if (checklistRulesChanged && existingRequest.status === "Converted to Quote") {
    throw new Error("REQUEST_CONVERTED_LOCKED");
  }

  if (checklistRulesChanged) {
    const nextCategories = requestedCategories ??
      (existingRequest.trades.length
        ? existingRequest.trades.map((trade) => trade.serviceCategory)
        : [existingRequest.serviceCategory]);
    const nextRequestType = input.requestType ?? existingRequest.requestType;
    await prisma.$transaction(async (tx) => {
      if (requestedCategories) {
        await tx.requestTrade.deleteMany({ where: { requestId: id } });
        await tx.requestTrade.createMany({
          data: nextCategories.map((serviceCategory) => ({ requestId: id, serviceCategory }))
        });
      }
      await reconcileRequestChecklists(tx, id, nextCategories, nextRequestType);
    });
  }

  const request = await prisma.request.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.requestType !== undefined ? { requestType: input.requestType } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(requestedCategories !== undefined
        ? { serviceCategory: requestedCategories[0] }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.companyName !== undefined
        ? { companyName: input.companyName || null }
        : {}),
      ...(input.contactName !== undefined
        ? { contactName: input.contactName || null }
        : {}),
      ...(input.contactEmail !== undefined
        ? { contactEmail: input.contactEmail || null }
        : {}),
      ...(input.contactPhone !== undefined
        ? { contactPhone: input.contactPhone || null }
        : {}),
      ...(input.siteName !== undefined ? { siteName: input.siteName || null } : {}),
      ...(input.siteAddress !== undefined
        ? { siteAddress: input.siteAddress || null }
        : {}),
      ...(input.city !== undefined ? { city: input.city || null } : {}),
      ...(input.state !== undefined ? { state: input.state || null } : {}),
      ...(input.clientId !== undefined ? { clientId: input.clientId || null } : {}),
      ...(input.contactId !== undefined ? { contactId: input.contactId || null } : {}),
      ...(input.siteId !== undefined ? { siteId: input.siteId || null } : {}),
      ...(input.assignedToId !== undefined
        ? { assignedToId: assignedTo?.id ?? null }
        : {}),
      ...(input.receivedDate !== undefined
        ? { receivedDate: parseDateInput(input.receivedDate) ?? existingRequest.receivedDate }
        : {}),
      ...(input.dueDate !== undefined ? { dueDate: parseDateInput(input.dueDate) } : {}),
      ...(input.nextAction !== undefined
        ? { nextAction: input.nextAction || null }
        : {}),
      ...(input.nextFollowUpAt !== undefined
        ? { nextFollowUpAt: parseDateInput(input.nextFollowUpAt) }
        : {}),
      ...(input.missingInfo !== undefined
        ? { missingInfo: input.missingInfo || null }
        : {}),
      ...(input.siteVisitNeeded !== undefined
        ? { siteVisitNeeded: input.siteVisitNeeded }
        : {}),
      ...(input.siteVisitCompleted !== undefined
        ? { siteVisitCompleted: input.siteVisitCompleted }
        : {}),
      ...(input.description !== undefined
        ? { description: input.description || null }
        : {}),
      ...(input.internalNotes !== undefined
        ? { internalNotes: input.internalNotes || null }
        : {}),
      ...(input.relatedQuoteId !== undefined
        ? { relatedQuoteId: input.relatedQuoteId || null }
        : {}),
      lastActivityAt: now,
      activities: {
        create: {
          type: "Note",
          title: "Request updated",
          body: "Request fields were updated from the edit form.",
          actor: user?.name ?? "Pulse System",
          createdAt: now
        }
      }
    },
    include: requestInclude
  });

  const derivedStatus = deriveIntakeStatus(request);
  const finalRequest =
    derivedStatus !== request.status
      ? await prisma.request.update({
          where: { id },
          data: { status: derivedStatus },
          include: requestInclude
        })
      : request;

  if (
    input.assignedToId !== undefined &&
    previousAssigneeName !== nextAssigneeName
  ) {
    await prisma.requestActivity.create({
      data: {
        requestId: request.id,
        type: "Owner",
        title: `Assigned to ${nextAssigneeName}`,
        body:
          previousAssigneeName === "Unassigned"
            ? "Request assignment was set."
            : `Reassigned from ${previousAssigneeName}.`,
        actor: user?.name ?? "Pulse System",
        createdAt: now
      }
    });
  }

  await recordActivity({
    user,
    relatedEntityType: "Request",
    relatedEntityId: finalRequest.id,
    type: "Updated",
    title: `${finalRequest.requestNumber} updated`,
    detail: "Request fields were updated.",
    metadata: {
      status: finalRequest.status,
      assignedTo: finalRequest.assignedTo?.name ?? "Unassigned"
    }
  });

  return toRequestRecord(finalRequest);
}

export async function archiveRequest(id: string, user?: AuthenticatedUser) {
  await getRequestOrThrow(id);

  const now = new Date();
  const request = await prisma.request.update({
    where: { id },
    data: {
      archivedAt: now,
      lastActivityAt: now,
      activities: {
        create: {
          type: "Status",
          title: "Request archived",
          actor: user?.name ?? "Pulse System",
          createdAt: now
        }
      }
    },
    include: requestInclude
  });

  await recordActivity({
    user,
    relatedEntityType: "Request",
    relatedEntityId: request.id,
    type: "Status Changed",
    title: `${request.requestNumber} archived`,
    detail: request.title
  });

  return toRequestRecord(request);
}

export async function changeRequestStatus(
  id: string,
  status: string,
  user?: AuthenticatedUser,
  reason = ""
) {
  const existingRequest = await getRequestOrThrow(id);
  const terminalStatuses = ["No Bid", "Cancelled", "Duplicate"];
  const normalizedReason = reason.trim();

  if (terminalStatuses.includes(status) && !normalizedReason) {
    throw new Error("REQUEST_CLOSE_REASON_REQUIRED");
  }

  if (
    existingRequest.status === "Converted to Quote" &&
    status !== "Converted to Quote"
  ) {
    throw new Error("REQUEST_CONVERTED_LOCKED");
  }

  if (
    status === "Converted to Quote" &&
    existingRequest.status !== "Converted to Quote"
  ) {
    throw new Error("REQUEST_CONVERSION_REQUIRED");
  }

  if (status === "Ready for Quote" && !buildChecklistSummary(existingRequest).readyForQuote) {
    throw new Error("REQUEST_NOT_READY_FOR_QUOTE");
  }

  const isReopening =
    terminalStatuses.includes(existingRequest.status) &&
    !terminalStatuses.includes(status);
  const nextStatus = isReopening
    ? deriveIntakeStatus({ ...existingRequest, status: "Reviewing" })
    : status;
  const now = new Date();
  const request = await prisma.request.update({
    where: { id },
    data: {
      status: nextStatus,
      lastActivityAt: now,
      activities: {
        create: {
          type: "Status",
          title: isReopening
            ? `Request reopened as ${nextStatus}`
            : `Status changed to ${nextStatus}`,
          body: normalizedReason || (isReopening ? "Request returned to active intake." : null),
          actor: user?.name ?? "Pulse System",
          createdAt: now
        }
      }
    },
    include: requestInclude
  });

  await recordActivity({
    user,
    relatedEntityType: "Request",
    relatedEntityId: request.id,
    type: "Status Changed",
    title: isReopening
      ? `${request.requestNumber} reopened`
      : `${request.requestNumber} moved to ${nextStatus}`,
    detail: normalizedReason || request.title,
    metadata: {
      status: nextStatus,
      requestedStatus: status,
      reason: normalizedReason || undefined
    }
  });

  return toRequestRecord(request);
}

export async function addRequestActivity(
  id: string,
  input: CreateRequestActivityInput,
  user?: AuthenticatedUser
) {
  await getRequestOrThrow(id);

  const now = new Date();
  const request = await prisma.request.update({
    where: { id },
    data: {
      lastActivityAt: now,
      activities: {
        create: {
          type: input.type,
          title: input.title,
          body: input.body || null,
          actor: user?.name ?? input.actor ?? "Pulse System",
          createdAt: now
        }
      },
      notesList:
        input.type === "Note" && input.body
          ? {
              create: {
                body: input.body,
                actor: user?.name ?? input.actor ?? "Pulse System",
                createdAt: now
              }
            }
          : undefined
    },
    include: requestInclude
  });

  await recordActivity({
    user,
    relatedEntityType: "Request",
    relatedEntityId: request.id,
    type: input.type === "Note" ? "Note Added" : input.type,
    title: input.title,
    detail: input.body,
    metadata: { requestNumber: request.requestNumber }
  });

  return toRequestRecord(request);
}

export async function createRequestTask(
  id: string,
  input: CreateRequestTaskInput,
  user?: AuthenticatedUser
) {
  await getRequestOrThrow(id);

  const now = new Date();
  const request = await prisma.request.update({
    where: { id },
    data: {
      lastActivityAt: now,
      tasks: {
        create: {
          title: input.title,
          dueAt: parseDateInput(input.dueAt),
          owner: input.owner || "Unassigned"
        }
      },
      activities: {
        create: {
          type: "Task",
          title: "Task created",
          body: input.title,
          actor: user?.name ?? "Pulse System",
          createdAt: now
        }
      }
    },
    include: requestInclude
  });

  await recordActivity({
    user,
    relatedEntityType: "Request",
    relatedEntityId: request.id,
    type: "Updated",
    title: `Task added to ${request.requestNumber}`,
    detail: input.title
  });

  return toRequestRecord(request);
}

export async function completeRequestTask(
  id: string,
  taskId: string,
  completed: boolean,
  user?: AuthenticatedUser
) {
  await getRequestOrThrow(id);

  const now = new Date();
  const result = await prisma.requestTask.updateMany({
    where: {
      id: taskId,
      requestId: id
    },
    data: {
      completedAt: completed ? now : null
    }
  });

  if (result.count === 0) {
    throw new Error("REQUEST_NOT_FOUND");
  }

  const request = await prisma.request.update({
    where: { id },
    data: {
      lastActivityAt: now,
      activities: {
        create: {
          type: "Task",
          title: completed ? "Task completed" : "Task reopened",
          actor: user?.name ?? "Pulse System",
          createdAt: now
        }
      }
    },
    include: requestInclude
  });

  await recordActivity({
    user,
    relatedEntityType: "Request",
    relatedEntityId: request.id,
    type: "Updated",
    title: completed
      ? `Task completed on ${request.requestNumber}`
      : `Task reopened on ${request.requestNumber}`,
    detail: request.title
  });

  return toRequestRecord(request);
}

export async function updateRequestChecklistItem(
  id: string,
  itemId: string,
  input: UpdateRequestChecklistItemInput,
  user?: AuthenticatedUser
) {
  const currentRequest = await getRequestOrThrow(id);
  if (currentRequest.status === "Converted to Quote") {
    throw new Error("REQUEST_CONVERTED_LOCKED");
  }

  const now = new Date();
  const existingItem = await prisma.requestChecklistItem.findFirst({
    where: {
      id: itemId,
      requestId: id,
      OR: [
        { checklistInstanceId: null },
        { checklistInstance: { active: true } }
      ]
    }
  });

  if (!existingItem) {
    throw new Error("REQUEST_NOT_FOUND");
  }

  const completed =
    input.completed === undefined ? existingItem.completed : input.completed;

  await prisma.requestChecklistItem.update({
    where: { id: itemId },
    data: {
      ...(input.completed !== undefined
        ? {
            completed,
            completedAt: completed ? now : null,
            completedById: completed ? user?.id ?? null : null,
            completedByNameSnapshot: completed ? user?.name ?? "Pulse System" : null
          }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {})
    }
  });

  const marksSiteVisitComplete =
    existingItem.appliesWhen === "siteVisitRequired" ||
    existingItem.label.toLowerCase().includes("site visit completed");

  const updatedRequest = await prisma.request.update({
    where: { id },
    data: {
      ...(marksSiteVisitComplete && input.completed !== undefined
        ? { siteVisitCompleted: completed }
        : {}),
      lastActivityAt: now,
      activities: {
        create: {
          type: "Task",
          title: completed
            ? `Checklist completed: ${existingItem.label}`
            : `Checklist reopened: ${existingItem.label}`,
          body: input.notes || null,
          actor: user?.name ?? "Pulse System",
          createdAt: now
        }
      }
    },
    include: requestInclude
  });

  const derivedStatus = deriveIntakeStatus(updatedRequest);
  const finalRequest =
    derivedStatus !== updatedRequest.status
      ? await prisma.request.update({
          where: { id },
          data: { status: derivedStatus },
          include: requestInclude
        })
      : updatedRequest;

  await recordActivity({
    user,
    relatedEntityType: "Request",
    relatedEntityId: finalRequest.id,
    type: "Checklist Updated",
    title: completed
      ? `Completed ${existingItem.label}`
      : `Reopened ${existingItem.label}`,
    detail: input.notes,
    metadata: {
      itemId,
      itemLabel: existingItem.label,
      completed,
      completedAt: completed ? now.toISOString() : null,
      requestNumber: finalRequest.requestNumber,
      status: finalRequest.status,
      readyForQuote: buildChecklistSummary(finalRequest).readyForQuote
    }
  });

  return toRequestRecord(finalRequest);
}

export async function convertRequest(
  id: string,
  input: ConvertRequestInput,
  user?: AuthenticatedUser
) {
  const now = new Date();

  const request = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Request" WHERE "id" = ${id} FOR UPDATE`;
    const existingRequest = await tx.request.findUnique({
      where: { id },
      include: requestInclude
    });
    if (!existingRequest || existingRequest.archivedAt) {
      throw new Error("REQUEST_NOT_FOUND");
    }
    if (existingRequest.status === "Converted to Quote") {
      throw new Error("REQUEST_CONVERTED_LOCKED");
    }
    if (!buildChecklistSummary(existingRequest).readyForQuote) {
      throw new Error("REQUEST_NOT_READY_FOR_QUOTE");
    }

    const quote = input.createQuote
      ? await tx.quote.create({
          data: {
            quoteNumber: await generateQuoteNumber(tx),
            title: existingRequest.title,
            clientId: existingRequest.clientId,
            clientName: existingRequest.companyName || existingRequest.client?.displayName || null,
            status: "Draft",
            owner: existingRequest.assignedTo?.name ?? "Unassigned",
            total: 0,
            sourceRequestIdSnapshot: existingRequest.id,
            requestNumberSnapshot: existingRequest.requestNumber,
            requestTitleSnapshot: existingRequest.title,
            requestTypeSnapshot: existingRequest.requestType,
            serviceCategorySnapshot: existingRequest.trades.length
              ? existingRequest.trades
                  .map((trade) => trade.serviceCategory)
                  .join(", ")
              : existingRequest.serviceCategory,
            contactNameSnapshot:
              existingRequest.contactName || existingRequest.contact?.name || null,
            contactEmailSnapshot:
              existingRequest.contactEmail || existingRequest.contact?.email || null,
            contactPhoneSnapshot:
              existingRequest.contactPhone || existingRequest.contact?.phone || null,
            siteNameSnapshot:
              existingRequest.siteName || existingRequest.site?.siteName || null,
            siteAddressSnapshot:
              existingRequest.siteAddress || existingRequest.site?.addressLine1 || null,
            citySnapshot: existingRequest.city || existingRequest.site?.city || null,
            stateSnapshot: existingRequest.state || existingRequest.site?.state || null,
            scopeDescriptionSnapshot: existingRequest.description,
            internalNotesSnapshot: existingRequest.internalNotes
          }
        })
      : null;

    return tx.request.update({
      where: { id },
      data: {
        status: "Converted to Quote",
        relatedQuoteId: quote?.id ?? existingRequest.relatedQuoteId,
        lastActivityAt: now,
        activities: {
          create: {
            type: "Conversion",
            title: "Request converted",
            body: quote
              ? `Created quote workspace ${quote.quoteNumber}.`
              : "Request marked as converted to quote.",
            actor: user?.name ?? "Pulse System",
            createdAt: now
          }
        }
      },
      include: requestInclude
    });
  });

  await recordActivity({
    user,
    relatedEntityType: "Request",
    relatedEntityId: request.id,
    type: "Status Changed",
    title: `${request.requestNumber} converted`,
    detail: request.relatedQuote
      ? `Created quote workspace ${request.relatedQuote.quoteNumber}.`
      : "Request marked as converted to quote.",
    metadata: { quoteId: request.relatedQuoteId }
  });

  if (request.relatedQuote) {
    await recordActivity({
      user,
      relatedEntityType: "Quote",
      relatedEntityId: request.relatedQuote.id,
      type: "Quote Created",
      title: `${request.relatedQuote.quoteNumber} created`,
      detail: `Created from ${request.requestNumber}`
    });
  }

  return toRequestRecord(request);
}
