import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { toAuthenticatedUser, type AuthenticatedUser } from "@/lib/auth/permissions";
import { recordActivity } from "@/lib/services/activityService";
import { toInvoiceRecord, toProjectRecord, toQuoteRecord } from "@/lib/services/workService";
import type {
  RequestActivityType,
  RequestAssignee,
  RequestRecord
} from "@/types/request";
import type {
  ConvertRequestInput,
  CreateRequestActivityInput,
  CreateRequestInput,
  CreateRequestTaskInput,
  UpdateRequestChecklistItemInput,
  UpdateRequestInput
} from "@/lib/validations/request";

const requestInclude = {
  assignedTo: true,
  createdBy: true,
  client: true,
  contact: true,
  site: true,
  relatedQuote: true,
  checklistTemplate: true,
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
  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
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
  const applicableItems = request.checklistItems.filter((item) =>
    isChecklistItemApplicable(item, request)
  );
  const requiredItems = applicableItems.filter((item) => item.required);
  const missingRequired = requiredItems
    .filter((item) => !item.completed)
    .map((item) => item.label);

  if (!request.assignedToId) {
    missingRequired.push("Internal owner assigned");
  }

  if (!request.serviceCategory) {
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
    checklistSummary: buildChecklistSummary(request)
  };
}

async function generateRequestNumber(tx: Prisma.TransactionClient) {
  const count = await tx.request.count();
  return `RQ-2026-${String(1001 + count).padStart(4, "0")}`;
}

async function generateQuoteNumber(tx: Prisma.TransactionClient) {
  const count = await tx.quote.count();
  return `QM-2026-${String(1001 + count).padStart(4, "0")}`;
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

async function findChecklistTemplate(
  tx: Prisma.TransactionClient,
  serviceCategory: string,
  requestType: string
) {
  let template = serviceCategory
    ? await tx.requestChecklistTemplate.findFirst({
        where: {
          active: true,
          serviceCategory
        },
        include: {
          items: {
            where: { active: true },
            orderBy: { sortOrder: "asc" }
          }
        },
        orderBy: { updatedAt: "desc" }
      })
    : null;

  if (!template && requestType) {
    template = await tx.requestChecklistTemplate.findFirst({
      where: {
        active: true,
        requestType
      },
      include: {
        items: {
          where: { active: true },
          orderBy: { sortOrder: "asc" }
        }
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  if (!template) {
    template = await tx.requestChecklistTemplate.findFirst({
      where: {
        active: true,
        key: "general"
      },
      include: {
        items: {
          where: { active: true },
          orderBy: { sortOrder: "asc" }
        }
      }
    });
  }

  return template;
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
  } | null
) {
  return template?.items.filter((item) => item.active !== false).map((item) => ({
    templateItemId: item.id,
    label: item.label,
    description: item.description,
    required: item.required,
    appliesWhen: item.appliesWhen,
    sortOrder: item.sortOrder,
    group: item.group
  })) ?? [];
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
    const template = await findChecklistTemplate(
      tx,
      input.serviceCategory,
      input.requestType
    );

    const created = await tx.request.create({
      data: {
        requestNumber,
        title: input.title,
        requestType: input.requestType,
        source: input.source,
        serviceCategory: input.serviceCategory,
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
        checklistTemplateId: template?.id ?? null,
        checklistTemplateNameSnapshot: template?.name ?? null,
        lastActivityAt: now,
        checklistItems: {
          create: buildChecklistItemCreateData(template)
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
      include: requestInclude
    });

    const derivedStatus = deriveIntakeStatus(created);
    if (derivedStatus !== created.status) {
      return tx.request.update({
        where: { id: created.id },
        data: { status: derivedStatus },
        include: requestInclude
      });
    }

    return created;
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

  const request = await prisma.request.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.requestType !== undefined ? { requestType: input.requestType } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.serviceCategory !== undefined
        ? { serviceCategory: input.serviceCategory }
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
  await getRequestOrThrow(id);

  const now = new Date();
  const existingItem = await prisma.requestChecklistItem.findFirst({
    where: {
      id: itemId,
      requestId: id
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
  const existingRequest = await getRequestOrThrow(id);
  const readiness = buildChecklistSummary(existingRequest);

  if (!readiness.readyForQuote) {
    throw new Error("REQUEST_NOT_READY_FOR_QUOTE");
  }

  const now = new Date();

  const request = await prisma.$transaction(async (tx) => {
    const quote = input.createQuote
      ? await tx.quote.create({
          data: {
            quoteNumber: await generateQuoteNumber(tx),
            title: existingRequest.title,
            clientId: existingRequest.clientId,
            clientName: existingRequest.companyName || existingRequest.client?.displayName || null,
            status: "Draft",
            owner: existingRequest.assignedTo?.name ?? "Unassigned",
            total: 0
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
