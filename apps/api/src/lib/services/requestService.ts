import { LifecycleEntityType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  canUser,
  type AuthenticatedUser,
} from "@pulse/contracts/auth";
import { effectiveRolePermissions } from "@/lib/services/roleAccessService";
import { recordActivity } from "@/lib/services/activityService";
import { recordLifecycleStatusEvent } from "@/lib/services/lifecycleEventService";
import { toInvoiceRecord, toProjectRecord, toQuoteRecord } from "@/lib/services/workService";
import type {
  CreateRequestUpdateInput,
  RequestActivityType,
  RequestAssignee,
  RequestRecord,
  RequestStepStatus,
  RequestUpdate
} from "@pulse/contracts/requests";
import type {
  ConvertRequestInput,
  CreateRequestActivityInput,
  CreateRequestInput,
  CreateRequestTaskInput,
  RequestUpdateFilter,
  UpdateRequestChecklistItemInput,
  UpdateRequestInput
} from "@pulse/contracts/requests";

const requestUpdateInclude = {
  author: { include: { accessRole: true } },
  assignee: { include: { accessRole: true } },
  mentions: {
    include: { user: true },
    orderBy: { createdAt: "asc" }
  }
} satisfies Prisma.RequestUpdateInclude;

const requestInclude = {
  assignedTo: { include: { accessRole: true } },
  createdBy: { include: { accessRole: true } },
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
  updates: {
    include: requestUpdateInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100
  },
  collaborators: {
    include: { user: { include: { accessRole: true } } },
    orderBy: { createdAt: "asc" }
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
  assignee?: {
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
    accessRole: {
      archivedAt: Date | null;
      protected: boolean;
      systemKey: string | null;
      permissions: Array<{ permission: string }>;
    };
  } | null
) {
  if (!assignee || !assignee.active || assignee.accessRole.archivedAt) return false;
  const permissions = effectiveRolePermissions(assignee.accessRole);
  return permissions.includes("requests:read") && permissions.includes("activity:write");
}

async function resolveRequestAssignee(assignedToId?: string | null) {
  if (!assignedToId) {
    return null;
  }

  const assignee = await prisma.localUser.findUnique({
    where: { id: assignedToId },
    include: { accessRole: { include: { permissions: true } } }
  });

  if (!isValidRequestAssignee(assignee)) {
    throw new Error("REQUEST_ASSIGNEE_INVALID");
  }

  return assignee;
}

function toAuthorSnapshot(user: {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  accessRole?: { id: string; name: string; color: string } | null;
} | null, fallbackName = "Pulse System", fallbackRole = ""): {
  id: string | null;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  roleColor: string;
} {
  const role = user?.accessRole?.id ?? user?.role ?? "";
  return {
    id: user?.id ?? null,
    name: user?.name || fallbackName,
    email: user?.email ?? "",
    role,
    roleLabel: user?.accessRole?.name ?? (fallbackRole || "Pulse System"),
    roleColor: user?.accessRole?.color ?? "#64748B"
  };
}

function toAssigneeSnapshot(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  accessRole: { id: string; name: string; color: string };
} | null | undefined): RequestAssignee | null {
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

function toRequestUpdateRecord(
  update: RequestWithRelations["updates"][number],
  viewerId?: string
): RequestUpdate {
  const author = toAuthorSnapshot(
    update.author,
    update.authorNameSnapshot,
    update.authorRoleSnapshot ?? ""
  );
  const assignee = update.assignee
    ? toAssigneeSnapshot(update.assignee)
    : update.assigneeId && update.assigneeNameSnapshot
      ? {
          id: update.assigneeId,
          name: update.assigneeNameSnapshot,
          email: update.assigneeEmailSnapshot ?? "",
          role: "",
          roleLabel: "Former assignee",
          roleColor: "#64748B"
        }
      : null;
  const stepStatus: RequestStepStatus | null = update.stepStatus === "open" ||
    update.stepStatus === "completed" ||
    update.stepStatus === "superseded"
    ? update.stepStatus
    : null;

  return {
    id: update.id,
    requestId: update.requestId,
    kind: (update.kind === "comment" || update.kind === "step" || update.kind === "system"
      ? update.kind
      : "system") as "comment" | "step" | "system",
    title: update.title || (update.kind === "step" ? "Current step" : "Update"),
    body: update.body ?? "",
    author,
    assignee,
    targetDate: formatDateInput(update.targetDate),
    stepStatus,
    supersedesId: update.supersedesId,
    createdAt: formatDateTime(update.createdAt),
    updatedAt: formatDateTime(update.updatedAt),
    mentions: update.mentions.map((mention) => ({
      id: mention.id,
      userId: mention.userId,
      userName: mention.user.name,
      readAt: formatDateTime(mention.readAt)
    }))
  };
}

function toRequestRecord(request: RequestWithRelations, viewerId?: string): RequestRecord {
  const assignedToName = request.assignedTo?.name ?? "Unassigned";
  const assignedToRole = request.assignedTo?.role ?? "";

  const updates = request.updates.map((update) => toRequestUpdateRecord(update, viewerId));
  const currentStep = updates.find((update) => update.id === request.currentStepId) ?? null;
  const lead = toAssigneeSnapshot(request.assignedTo);
  const collaborators = request.collaborators
    .map((collaborator) => toAssigneeSnapshot(collaborator.user))
    .filter((collaborator): collaborator is RequestAssignee => Boolean(collaborator));
  const unreadMentionCount = viewerId
    ? request.updates.reduce(
        (count, update) =>
          count + update.mentions.filter(
            (mention) => mention.userId === viewerId && !mention.readAt
          ).length,
        0
      )
    : 0;
  const compatibilityActivity = updates
    .filter((update) => update.kind !== "step")
    .map((update) => ({
      id: update.id,
      type: (update.kind === "comment" ? "Note" : "Status") as RequestActivityType,
      title: update.title,
      body: update.body || undefined,
      actor: update.author.name,
      at: update.createdAt
    }));
  const compatibilityTasks = updates
    .filter((update) => update.kind === "step")
    .map((update) => ({
      id: update.id,
      title: update.title,
      dueAt: update.targetDate,
      owner: update.assignee?.name ?? update.author.name ?? "Unassigned",
      completed: update.stepStatus === "completed"
    }));

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
    nextAction: currentStep?.body ?? "",
    nextFollowUpAt: currentStep?.targetDate ?? "",
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
    lead,
    collaborators,
    currentStep,
    unreadMentionCount,
    updates,
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
        tags: document.tags,
        scanStatus: document.scanStatus,
        available,
        uploadedByName: document.uploadedByName,
        createdAt: document.createdAt.toISOString(),
        downloadUrl: available ? `/api/documents/${document.id}/download` : null,
        previewUrl: available ? `/api/documents/${document.id}/preview` : null
      };
    }),
    activity: compatibilityActivity,
    tasks: compatibilityTasks,
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

type RequestDb = typeof prisma | Prisma.TransactionClient;

function updateActorFields(user?: AuthenticatedUser) {
  return {
    authorId: user?.id ?? null,
    authorNameSnapshot: user?.name ?? "Pulse System",
    authorEmailSnapshot: user?.email ?? null,
    authorRoleSnapshot: user?.roleLabel ?? "System"
  };
}

async function createRequestSystemUpdate(
  db: RequestDb,
  requestId: string,
  title: string,
  body: string | null,
  user?: AuthenticatedUser,
  createdAt = new Date()
) {
  const update = await db.requestUpdate.create({
    data: {
      requestId,
      kind: "system",
      title,
      body,
      ...updateActorFields(user),
      createdAt,
      updatedAt: createdAt
    }
  });
  await db.request.update({
    where: { id: requestId },
    data: { lastActivityAt: createdAt }
  });
  return update;
}

function isClosedOrConverted(status: string) {
  return ["No Bid", "Cancelled", "Duplicate", "Converted to Quote"].includes(status);
}

async function resolveRequestUpdateAssignee(assigneeId?: string | null) {
  if (!assigneeId) return null;
  const assignee = await prisma.localUser.findFirst({
    where: { id: assigneeId, active: true },
    include: { accessRole: { include: { permissions: true } } }
  });
  if (!isValidRequestAssignee(assignee)) throw new Error("REQUEST_UPDATE_ASSIGNEE_INVALID");
  return assignee;
}

async function resolveRequestMentionIds(mentionIds: string[]) {
  const uniqueIds = Array.from(new Set(mentionIds));
  if (!uniqueIds.length) return [];
  const users = await prisma.localUser.findMany({
    where: { id: { in: uniqueIds }, active: true },
    include: { accessRole: { include: { permissions: true } } }
  });
  if (
    users.length !== uniqueIds.length ||
    users.some((user) =>
      user.accessRole.archivedAt ||
      !effectiveRolePermissions(user.accessRole).includes("requests:read")
    )
  ) {
    throw new Error("REQUEST_MENTION_USER_INVALID");
  }
  return uniqueIds;
}

type CreateRequestUpdateOptions = {
  allowNullableAssignee?: boolean;
  legacyTaskId?: string;
};

async function createRequestUpdateInternal(
  id: string,
  input: CreateRequestUpdateInput,
  user?: AuthenticatedUser,
  options: CreateRequestUpdateOptions = {}
) {
  const existingRequest = await getRequestOrThrow(id);
  if (input.kind === "step" && isClosedOrConverted(existingRequest.status)) {
    throw new Error("REQUEST_STEP_CLOSED");
  }

  const assignee = await resolveRequestUpdateAssignee(input.assigneeId);
  if (input.kind === "step" && !assignee && !options.allowNullableAssignee) {
    throw new Error("REQUEST_UPDATE_ASSIGNEE_REQUIRED");
  }
  const mentionIds = await resolveRequestMentionIds(input.mentionIds);
  const now = new Date();
  const request = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Request" WHERE "id" = ${id} FOR UPDATE`;
    const locked = await tx.request.findUnique({
      where: { id },
      select: { id: true, status: true, currentStepId: true, assignedToId: true, requestNumber: true, title: true }
    });
    if (!locked) throw new Error("REQUEST_NOT_FOUND");
    if (input.kind === "step" && isClosedOrConverted(locked.status)) {
      throw new Error("REQUEST_STEP_CLOSED");
    }

    const previousStep = locked.currentStepId
      ? await tx.requestUpdate.findUnique({ where: { id: locked.currentStepId } })
      : null;
    if (input.kind === "step" && previousStep?.stepStatus === "open") {
      await tx.requestUpdate.update({
        where: { id: previousStep.id },
        data: { stepStatus: "superseded" }
      });
    }

    const created = await tx.requestUpdate.create({
      data: {
        requestId: id,
        kind: input.kind,
        title: input.title || (input.kind === "step" ? input.body : "Comment"),
        body: input.body,
        ...updateActorFields(user),
        assigneeId: assignee?.id ?? null,
        assigneeNameSnapshot: assignee?.name ?? null,
        assigneeEmailSnapshot: assignee?.email ?? null,
        targetDate: parseDateInput(input.targetDate),
        stepStatus: input.kind === "step" ? "open" : null,
        supersedesId: input.kind === "step" ? previousStep?.id ?? null : null,
        legacyTaskId: options.legacyTaskId,
        createdAt: now,
        updatedAt: now,
        mentions: mentionIds.length
          ? { create: mentionIds.map((userId) => ({ userId })) }
          : undefined
      },
      include: requestUpdateInclude
    });

    if (input.kind === "step" && assignee) {
      const existingCollaborator = await tx.requestCollaborator.findUnique({
        where: { requestId_userId: { requestId: id, userId: assignee.id } }
      });
      if (!existingCollaborator && locked.assignedToId !== assignee.id) {
        await tx.requestCollaborator.create({
          data: { requestId: id, userId: assignee.id, addedById: user?.id ?? null }
        });
      }
    }

    await tx.request.update({
      where: { id },
      data: {
        lastActivityAt: now,
        ...(input.kind === "step" ? { currentStepId: created.id } : {})
      }
    });

    if (input.kind === "step" && previousStep?.stepStatus === "open") {
      await createRequestSystemUpdate(
        tx,
        id,
        "Current step replaced",
        `${previousStep.title || previousStep.body || "Previous step"} was superseded.`,
        user,
        now
      );
    }

    return tx.request.findUniqueOrThrow({
      where: { id },
      include: requestInclude
    });
  });

  await recordActivity({
    user,
    relatedEntityType: "Request",
    relatedEntityId: id,
    type: input.kind === "step" ? "Current Step Posted" : "Request Update Posted",
    title: input.title || input.body,
    detail: input.body,
    metadata: { requestNumber: request.requestNumber, kind: input.kind }
  });

  return toRequestRecord(request, user?.id);
}

export async function createRequestUpdate(
  id: string,
  input: CreateRequestUpdateInput,
  user?: AuthenticatedUser
) {
  return createRequestUpdateInternal(id, input, user);
}

export async function listRequestUpdates(
  id: string,
  filter: RequestUpdateFilter = "all",
  cursor?: string,
  take = 25,
  viewerId?: string
) {
  await getRequestOrThrow(id);
  const limit = Math.min(Math.max(take, 1), 50);
  const updates = await prisma.requestUpdate.findMany({
    where: {
      requestId: id,
      ...(filter !== "all" ? { kind: filter } : {})
    },
    include: requestUpdateInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1
  });
  const hasMore = updates.length > limit;
  const page = hasMore ? updates.slice(0, limit) : updates;
  return {
    updates: page.map((update) => toRequestUpdateRecord(update, viewerId)),
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    hasMore
  };
}

export async function completeRequestUpdate(
  id: string,
  updateId: string,
  user?: AuthenticatedUser
) {
  const now = new Date();
  const request = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Request" WHERE "id" = ${id} FOR UPDATE`;
    const update = await tx.requestUpdate.findFirst({
      where: { id: updateId, requestId: id, kind: "step" }
    });
    if (!update) throw new Error("REQUEST_UPDATE_NOT_FOUND");
    if (update.stepStatus !== "open") throw new Error("REQUEST_UPDATE_NOT_OPEN");
    await tx.requestUpdate.update({
      where: { id: updateId },
      data: { stepStatus: "completed" }
    });
    const lockedRequest = await tx.request.findUniqueOrThrow({
      where: { id },
      select: { currentStepId: true }
    });
    await tx.request.update({
      where: { id },
      data: {
        ...(lockedRequest.currentStepId === updateId ? { currentStepId: null } : {}),
        lastActivityAt: now
      }
    });
    await createRequestSystemUpdate(
      tx,
      id,
      "Current step completed",
      update.title || update.body,
      user,
      now
    );
    return tx.request.findUniqueOrThrow({ where: { id }, include: requestInclude });
  });
  await recordActivity({
    user,
    relatedEntityType: "Request",
    relatedEntityId: id,
    type: "Current Step Completed",
    title: `Current step completed on ${request.requestNumber}`,
    detail: request.title,
    metadata: { updateId }
  });
  return toRequestRecord(request, user?.id);
}

export async function undoRequestUpdate(
  id: string,
  updateId: string,
  user?: AuthenticatedUser
) {
  const now = new Date();
  const request = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Request" WHERE "id" = ${id} FOR UPDATE`;
    const locked = await tx.request.findUniqueOrThrow({
      where: { id },
      select: { currentStepId: true }
    });
    const update = await tx.requestUpdate.findFirst({
      where: { id: updateId, requestId: id, kind: "step" }
    });
    if (!update) throw new Error("REQUEST_UPDATE_NOT_FOUND");

    if (update.stepStatus === "open" && update.supersedesId) {
      if (locked.currentStepId !== update.id) throw new Error("REQUEST_UPDATE_UNDO_CONFLICT");
      await tx.requestUpdate.update({
        where: { id: update.id },
        data: { stepStatus: "superseded" }
      });
      await tx.requestUpdate.update({
        where: { id: update.supersedesId },
        data: { stepStatus: "open" }
      });
      await tx.request.update({
        where: { id },
        data: { currentStepId: update.supersedesId, lastActivityAt: now }
      });
      await createRequestSystemUpdate(
        tx,
        id,
        "Step replacement undone",
        update.title || update.body,
        user,
        now
      );
    } else if (update.stepStatus === "completed") {
      if (locked.currentStepId) throw new Error("REQUEST_UPDATE_UNDO_CONFLICT");
      await tx.requestUpdate.update({
        where: { id: update.id },
        data: { stepStatus: "open" }
      });
      await tx.request.update({
        where: { id },
        data: { currentStepId: update.id, lastActivityAt: now }
      });
      await createRequestSystemUpdate(
        tx,
        id,
        "Step completion undone",
        update.title || update.body,
        user,
        now
      );
    } else {
      throw new Error("REQUEST_UPDATE_NOT_UNDOABLE");
    }

    return tx.request.findUniqueOrThrow({ where: { id }, include: requestInclude });
  });
  await recordActivity({
    user,
    relatedEntityType: "Request",
    relatedEntityId: id,
    type: "Current Step Undo",
    title: `Current step change undone on ${request.requestNumber}`,
    detail: request.title,
    metadata: { updateId }
  });
  return toRequestRecord(request, user?.id);
}

export async function markRequestMentionsRead(id: string, userId: string) {
  await getRequestOrThrow(id);
  const result = await prisma.requestUpdateMention.updateMany({
    where: {
      userId,
      readAt: null,
      update: { requestId: id }
    },
    data: { readAt: new Date() }
  });
  return { marked: result.count };
}

export async function updateRequestLead(
  id: string,
  leadId: string | null,
  user?: AuthenticatedUser
) {
  return updateRequest(id, { assignedToId: leadId ?? "" }, user);
}

export async function addRequestCollaborator(
  id: string,
  userId: string,
  actor?: AuthenticatedUser
) {
  await getRequestOrThrow(id);
  const collaborator = await resolveRequestUpdateAssignee(userId);
  if (!collaborator) throw new Error("REQUEST_COLLABORATOR_INVALID");
  await prisma.requestCollaborator.upsert({
    where: { requestId_userId: { requestId: id, userId } },
    create: { requestId: id, userId, addedById: actor?.id ?? null },
    update: {}
  });
  await createRequestSystemUpdate(
    prisma,
    id,
    "Collaborator added",
    `${collaborator.name} joined the request team.`,
    actor
  );
  await recordActivity({
    user: actor,
    relatedEntityType: "Request",
    relatedEntityId: id,
    type: "Collaborator Added",
    title: `${collaborator.name} added to request team`,
    detail: `Collaborator ${collaborator.name} was added to the request.`,
    metadata: { collaboratorId: collaborator.id }
  });
  return getRequestById(id, actor?.id);
}

export async function removeRequestCollaborator(
  id: string,
  userId: string,
  actor?: AuthenticatedUser
) {
  const request = await getRequestOrThrow(id);
  const currentStep = request.updates.find((update) => update.id === request.currentStepId);
  if (currentStep?.assignee?.id === userId && currentStep.stepStatus === "open") {
    throw new Error("REQUEST_CURRENT_ASSIGNEE_REQUIRED");
  }
  const result = await prisma.requestCollaborator.deleteMany({
    where: { requestId: id, userId }
  });
  if (!result.count) throw new Error("REQUEST_COLLABORATOR_NOT_FOUND");
  await createRequestSystemUpdate(
    prisma,
    id,
    "Collaborator removed",
    "A collaborator left the request team.",
    actor
  );
  await recordActivity({
    user: actor,
    relatedEntityType: "Request",
    relatedEntityId: id,
    type: "Collaborator Removed",
    title: "Collaborator removed from request team",
    detail: `Collaborator ${userId} was removed from the request.`,
    metadata: { collaboratorId: userId }
  });
  return getRequestById(id, actor?.id);
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

export async function listRequests(viewerId?: string) {
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

  return requests.map((request) => toRequestRecord(request, viewerId));
}

export async function listClientRelatedWork(clientId: string, user: AuthenticatedUser) {
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

  const requestRecords = canUser(user, "requests:read")
    ? clientRequests.map((request) => toRequestRecord(request, user.id))
    : [];
  const quoteRecords = canUser(user, "quotes:read") ? quotes.map((quote) => toQuoteRecord(quote)) : [];
  const projectRecords = canUser(user, "projects:read")
    ? projects.map((project) => toProjectRecord(project))
    : [];
  const invoiceRecords = canUser(user, "billing:read") ? invoices.map(toInvoiceRecord) : [];

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
    where: { active: true },
    include: { accessRole: { include: { permissions: true } } },
    orderBy: [
      {
        name: "asc"
      }
    ]
  });

  return users
    .filter((user) => isValidRequestAssignee(user))
    .map((user) => toAssigneeSnapshot(user)!) satisfies RequestAssignee[];
}

export async function listRequestTeamMembers() {
  const users = await prisma.localUser.findMany({
    where: { active: true },
    include: { accessRole: { include: { permissions: true } } },
    orderBy: { name: "asc" }
  });

  return users
    .filter((user) =>
      !user.accessRole.archivedAt &&
      effectiveRolePermissions(user.accessRole).includes("requests:read")
    )
    .map((user) => toAssigneeSnapshot(user)!) satisfies RequestAssignee[];
}

export async function getRequestById(id: string, viewerId?: string) {
  return toRequestRecord(await getRequestOrThrow(id), viewerId);
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
        updates: {
          create: {
            kind: "system",
            title: "Request created",
            body: input.description || "New intake request captured in Pulse.",
            ...updateActorFields(user),
            createdAt: now
          }
        }
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

    if (input.nextAction?.trim()) {
      const legacyStep = await tx.requestUpdate.create({
        data: {
          requestId: created.id,
          kind: "step",
          title: input.nextAction.trim(),
          body: input.nextAction.trim(),
          ...updateActorFields(user),
          assigneeId: assignedTo?.id ?? null,
          assigneeNameSnapshot: assignedTo?.name ?? null,
          assigneeEmailSnapshot: assignedTo?.email ?? null,
          targetDate: parseDateInput(input.nextFollowUpAt),
          stepStatus: isClosedOrConverted(input.status) ? "superseded" : "open",
          createdAt: now,
          updatedAt: now
        }
      });
      if (!isClosedOrConverted(input.status)) {
        await tx.request.update({
          where: { id: created.id },
          data: { currentStepId: legacyStep.id }
        });
      }
    }

    const hydrated = await tx.request.findUniqueOrThrow({
      where: { id: created.id },
      include: requestInclude
    });
    const derivedStatus = deriveIntakeStatus(hydrated);
    if (derivedStatus !== hydrated.status) {
      const finalRequest = await tx.request.update({
        where: { id: created.id },
        data: { status: derivedStatus },
        include: requestInclude
      });
      await recordLifecycleStatusEvent(tx, {
        entityType: LifecycleEntityType.REQUEST,
        entityId: finalRequest.id,
        toStatus: finalRequest.status,
        changedAt: finalRequest.createdAt,
        metadata: {
          receivedDate: finalRequest.receivedDate.toISOString(),
          dueDate: finalRequest.dueDate?.toISOString() ?? null
        },
        user
      });
      return finalRequest;
    }

    await recordLifecycleStatusEvent(tx, {
      entityType: LifecycleEntityType.REQUEST,
      entityId: hydrated.id,
      toStatus: hydrated.status,
      changedAt: hydrated.createdAt,
      metadata: {
        receivedDate: hydrated.receivedDate.toISOString(),
        dueDate: hydrated.dueDate?.toISOString() ?? null
      },
      user
    });
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

  const request = await prisma.$transaction(async (tx) => {
    const updatedRequest = await tx.request.update({
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
      },
      include: requestInclude
    });

    const derivedStatus = deriveIntakeStatus(updatedRequest);
    const transitionedRequest =
      derivedStatus !== updatedRequest.status
        ? await tx.request.update({
          where: { id },
          data: { status: derivedStatus },
          include: requestInclude
        })
        : updatedRequest;

    await recordLifecycleStatusEvent(tx, {
      entityType: LifecycleEntityType.REQUEST,
      entityId: transitionedRequest.id,
      fromStatus: existingRequest.status,
      toStatus: transitionedRequest.status,
      changedAt: now,
      metadata: {
        receivedDate: transitionedRequest.receivedDate.toISOString(),
        dueDate: transitionedRequest.dueDate?.toISOString() ?? null
      },
      user
    });

    return transitionedRequest;
  });

  let finalRequest = request;

  if (
    input.assignedToId !== undefined &&
    previousAssigneeName !== nextAssigneeName
  ) {
    await createRequestSystemUpdate(
      prisma,
      request.id,
      `Lead assigned to ${nextAssigneeName}`,
      previousAssigneeName === "Unassigned"
        ? "Request lead was set."
        : `Reassigned from ${previousAssigneeName}.`,
      user,
      now
    );
  } else if (!input.nextAction?.trim()) {
    await createRequestSystemUpdate(
      prisma,
      request.id,
      "Request updated",
      "Request fields were updated.",
      user,
      now
    );
  }

  finalRequest = await getRequestOrThrow(id);
  if (input.nextAction?.trim() && !isClosedOrConverted(finalRequest.status)) {
    finalRequest = await createRequestUpdateInternal(
      id,
      {
        kind: "step",
        title: input.nextAction.trim(),
        body: input.nextAction.trim(),
        assigneeId: input.assignedToId || finalRequest.assignedTo?.id || "",
        targetDate: input.nextFollowUpAt ?? "",
        mentionIds: []
      },
      user,
      { allowNullableAssignee: true }
    ).then(async () => getRequestOrThrow(id));
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

  return toRequestRecord(finalRequest, user?.id);
}

export async function archiveRequest(id: string, user?: AuthenticatedUser) {
  await getRequestOrThrow(id);

  const now = new Date();
  const request = await prisma.request.update({
    where: { id },
    data: {
      archivedAt: now,
      lastActivityAt: now
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

  await createRequestSystemUpdate(prisma, request.id, "Request archived", request.title, user, now);
  const archivedRequest = await prisma.request.findUniqueOrThrow({
    where: { id },
    include: requestInclude
  });
  return toRequestRecord(archivedRequest, user?.id);
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
  const request = await prisma.$transaction(async (tx) => {
    const updated = await tx.request.update({
      where: { id },
      data: {
        status: nextStatus,
        lastActivityAt: now
      },
      include: requestInclude
    });
    await recordLifecycleStatusEvent(tx, {
      entityType: LifecycleEntityType.REQUEST,
      entityId: updated.id,
      fromStatus: existingRequest.status,
      toStatus: updated.status,
      changedAt: now,
      metadata: {
        receivedDate: updated.receivedDate.toISOString(),
        dueDate: updated.dueDate?.toISOString() ?? null
      },
      user
    });
    await createRequestSystemUpdate(
      tx,
      updated.id,
      isReopening ? `Request reopened as ${nextStatus}` : `Status changed to ${nextStatus}`,
      normalizedReason || (isReopening ? "Request returned to active intake." : null),
      user,
      now
    );
    return updated;
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

  return toRequestRecord(await getRequestOrThrow(id), user?.id);
}

export async function addRequestActivity(
  id: string,
  input: CreateRequestActivityInput,
  user?: AuthenticatedUser
) {
  return createRequestUpdateInternal(
    id,
    {
      kind: "comment",
      title: input.title,
      body: input.body || input.title,
      assigneeId: "",
      targetDate: "",
      mentionIds: []
    },
    user
  );
}

export async function createRequestTask(
  id: string,
  input: CreateRequestTaskInput,
  user?: AuthenticatedUser
) {
  const owner = input.owner && input.owner !== "Unassigned"
    ? await prisma.localUser.findFirst({
        where: { active: true, name: { equals: input.owner, mode: "insensitive" } }
      })
    : null;
  return createRequestUpdateInternal(
    id,
    {
      kind: "step",
      title: input.title,
      body: input.title,
      assigneeId: owner?.id ?? "",
      targetDate: input.dueAt,
      mentionIds: []
    },
    user,
    { allowNullableAssignee: true }
  );
}

export async function completeRequestTask(
  id: string,
  taskId: string,
  completed: boolean,
  user?: AuthenticatedUser
) {
  await getRequestOrThrow(id);
  const update = await prisma.requestUpdate.findFirst({
    where: {
      requestId: id,
      OR: [{ id: taskId }, { legacyTaskId: taskId }]
    }
  });
  if (!update) throw new Error("REQUEST_NOT_FOUND");
  return completed
    ? completeRequestUpdate(id, update.id, user)
    : undoRequestUpdate(id, update.id, user);
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
      lastActivityAt: now
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

  await createRequestSystemUpdate(
    prisma,
    finalRequest.id,
    completed
      ? `Checklist completed: ${existingItem.label}`
      : `Checklist reopened: ${existingItem.label}`,
    input.notes || null,
    user,
    now
  );

  const hydratedRequest = await getRequestOrThrow(id);

  await recordActivity({
    user,
    relatedEntityType: "Request",
    relatedEntityId: hydratedRequest.id,
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
      requestNumber: hydratedRequest.requestNumber,
      status: hydratedRequest.status,
      readyForQuote: buildChecklistSummary(hydratedRequest).readyForQuote
    }
  });

  return toRequestRecord(hydratedRequest, user?.id);
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

    const updatedRequest = await tx.request.update({
      where: { id },
      data: {
        status: "Converted to Quote",
        relatedQuoteId: quote?.id ?? existingRequest.relatedQuoteId,
        lastActivityAt: now
      },
      include: requestInclude
    });
    await recordLifecycleStatusEvent(tx, {
      entityType: LifecycleEntityType.REQUEST,
      entityId: updatedRequest.id,
      fromStatus: existingRequest.status,
      toStatus: updatedRequest.status,
      changedAt: now,
      metadata: {
        receivedDate: updatedRequest.receivedDate.toISOString(),
        dueDate: updatedRequest.dueDate?.toISOString() ?? null
      },
      user
    });
    if (quote) {
      await recordLifecycleStatusEvent(tx, {
        entityType: LifecycleEntityType.QUOTE,
        entityId: quote.id,
        toStatus: quote.status,
        changedAt: quote.createdAt,
        valueSnapshot: Number(quote.total),
        user
      });
    }
    await createRequestSystemUpdate(
      tx,
      id,
      "Request converted",
      quote
        ? `Created quote workspace ${quote.quoteNumber}.`
        : "Request marked as converted to quote.",
      user,
      now
    );
    return tx.request.findUniqueOrThrow({ where: { id }, include: requestInclude });
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

  return toRequestRecord(request, user?.id);
}
