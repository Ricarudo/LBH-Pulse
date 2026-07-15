import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/services/activityService";
import { effectiveRolePermissions } from "@/lib/services/roleAccessService";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import type {
  CreateRequestUpdateInput,
  RequestAssignee,
  RequestStepStatus,
  RequestUpdate,
  RequestUpdateFilter
} from "@pulse/contracts/requests";

const quoteUpdateInclude = {
  author: { include: { accessRole: true } },
  assignee: { include: { accessRole: true } },
  mentions: {
    include: { user: true },
    orderBy: { createdAt: "asc" }
  }
} satisfies Prisma.RequestUpdateInclude;

type QuoteUpdateWithRelations = Prisma.RequestUpdateGetPayload<{
  include: typeof quoteUpdateInclude;
}>;
type UpdateDb = typeof prisma | Prisma.TransactionClient;

function updateMetadata(value: Prisma.JsonValue | null): RequestUpdate["metadata"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as Record<string, Prisma.JsonValue>;
  return {
    ...(typeof metadata.eventType === "string" ? { eventType: metadata.eventType } : {}),
    ...(metadata.precision === "EXACT" || metadata.precision === "ESTIMATED"
      ? { precision: metadata.precision }
      : {}),
    ...(typeof metadata.quoteNumber === "string" ? { quoteNumber: metadata.quoteNumber } : {}),
    ...(typeof metadata.revisionNumber === "number" ? { revisionNumber: metadata.revisionNumber } : {}),
    ...(typeof metadata.fromStatus === "string" ? { fromStatus: metadata.fromStatus } : {}),
    ...(typeof metadata.toStatus === "string" ? { toStatus: metadata.toStatus } : {}),
    ...(typeof metadata.legacyStatus === "string" ? { legacyStatus: metadata.legacyStatus } : {})
  };
}

function dateInput(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOutput(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function dateTimeOutput(value?: Date | null) {
  return value?.toISOString() ?? "";
}

function actorFields(user?: AuthenticatedUser) {
  return {
    authorId: user?.id ?? null,
    authorNameSnapshot: user?.name ?? "Pulse System",
    authorEmailSnapshot: user?.email ?? null,
    authorRoleSnapshot: user?.roleLabel ?? "System"
  };
}

function assigneeRecord(user: QuoteUpdateWithRelations["assignee"]): RequestAssignee | null {
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

export function toQuoteUpdateRecord(update: QuoteUpdateWithRelations): RequestUpdate {
  const stepStatus: RequestStepStatus | null =
    update.stepStatus === "open" ||
    update.stepStatus === "completed" ||
    update.stepStatus === "superseded"
      ? update.stepStatus
      : null;
  const fallbackAssignee = update.assigneeId && update.assigneeNameSnapshot
    ? {
        id: update.assigneeId,
        name: update.assigneeNameSnapshot,
        email: update.assigneeEmailSnapshot ?? "",
        role: "",
        roleLabel: "Former assignee",
        roleColor: "#64748B"
      }
    : null;

  return {
    id: update.id,
    requestId: update.requestId,
    quoteId: update.quoteId,
    projectId: update.projectId,
    invoiceId: update.invoiceId,
    kind: update.kind === "comment" || update.kind === "step" || update.kind === "system"
      ? update.kind
      : "system",
    title: update.title || (update.kind === "step" ? "Current step" : "Update"),
    body: update.body ?? "",
    author: {
      id: update.author?.id ?? update.authorId,
      name: update.author?.name ?? update.authorNameSnapshot,
      email: update.author?.email ?? update.authorEmailSnapshot ?? "",
      role: update.author?.accessRole.id ?? update.author?.role ?? "",
      roleLabel: update.author?.accessRole.name ?? update.authorRoleSnapshot ?? "Pulse System",
      roleColor: update.author?.accessRole.color ?? "#64748B"
    },
    assignee: assigneeRecord(update.assignee) ?? fallbackAssignee,
    targetDate: dateOutput(update.targetDate),
    stepStatus,
    supersedesId: update.supersedesId,
    metadata: updateMetadata(update.metadata),
    createdAt: dateTimeOutput(update.createdAt),
    updatedAt: dateTimeOutput(update.updatedAt),
    mentions: update.mentions.map((mention) => ({
      id: mention.id,
      userId: mention.userId,
      userName: mention.user.name,
      readAt: dateTimeOutput(mention.readAt)
    }))
  };
}

async function quoteThread(id: string, db: UpdateDb = prisma) {
  const quote = await db.quote.findFirst({
    where: { archivedAt: null, OR: [{ id }, { quoteNumber: id }] },
    select: {
      id: true,
      quoteNumber: true,
      title: true,
      currentStepId: true,
      sourceRequestIdSnapshot: true,
      requests: { select: { id: true, currentStepId: true } }
    }
  });
  if (!quote) throw new Error("QUOTE_NOT_FOUND");
  const requestIds = Array.from(new Set([
    ...quote.requests.map((request) => request.id),
    ...(quote.sourceRequestIdSnapshot ? [quote.sourceRequestIdSnapshot] : [])
  ]));
  const inheritedCurrentStepId = quote.requests.find((request) => request.currentStepId)?.currentStepId ?? null;
  return { ...quote, requestIds, inheritedCurrentStepId };
}

function threadWhere(quoteId: string, requestIds: string[]) {
  return {
    OR: [
      { quoteId },
      ...(requestIds.length ? [{ requestId: { in: requestIds } }] : [])
    ]
  } satisfies Prisma.RequestUpdateWhereInput;
}

async function resolveAssignee(assigneeId?: string | null) {
  if (!assigneeId) return null;
  const user = await prisma.localUser.findFirst({
    where: { id: assigneeId, active: true },
    include: { accessRole: { include: { permissions: true } } }
  });
  const permissions = user ? effectiveRolePermissions(user.accessRole) : [];
  if (!user || user.accessRole.archivedAt || !permissions.includes("quotes:read") || !permissions.includes("activity:write")) {
    throw new Error("QUOTE_UPDATE_ASSIGNEE_INVALID");
  }
  return user;
}

async function resolveMentionIds(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids));
  if (!uniqueIds.length) return [];
  const users = await prisma.localUser.findMany({
    where: { id: { in: uniqueIds }, active: true },
    include: { accessRole: { include: { permissions: true } } }
  });
  if (users.length !== uniqueIds.length || users.some((user) => {
    const permissions = effectiveRolePermissions(user.accessRole);
    return user.accessRole.archivedAt || !permissions.includes("quotes:read");
  })) {
    throw new Error("QUOTE_MENTION_USER_INVALID");
  }
  return uniqueIds;
}

async function createSystemUpdate(
  db: UpdateDb,
  quoteId: string,
  title: string,
  body: string | null,
  user?: AuthenticatedUser,
  createdAt = new Date(),
  metadata?: Prisma.InputJsonObject
) {
  return db.requestUpdate.create({
    data: {
      quoteId,
      kind: "system",
      title,
      body,
      metadata,
      ...actorFields(user),
      createdAt,
      updatedAt: createdAt
    }
  });
}

export function createQuoteSystemUpdate(
  db: UpdateDb,
  input: {
    quoteId: string;
    title: string;
    body?: string | null;
    user?: AuthenticatedUser;
    createdAt?: Date;
    metadata?: Prisma.InputJsonObject;
  }
) {
  return createSystemUpdate(
    db,
    input.quoteId,
    input.title,
    input.body ?? null,
    input.user,
    input.createdAt ?? new Date(),
    input.metadata
  );
}

export async function listQuoteUpdates(
  id: string,
  filter: RequestUpdateFilter = "all",
  cursor?: string,
  take = 25,
  viewerId?: string
) {
  const quote = await quoteThread(id);
  const limit = Math.min(Math.max(take, 1), 50);
  const where = threadWhere(quote.id, quote.requestIds);
  const updates = await prisma.requestUpdate.findMany({
    where: { AND: [where, ...(filter !== "all" ? [{ kind: filter }] : [])] },
    include: quoteUpdateInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1
  });
  const hasMore = updates.length > limit;
  const page = hasMore ? updates.slice(0, limit) : updates;
  const currentStepId = quote.currentStepId ?? quote.inheritedCurrentStepId;
  const currentStep = currentStepId
    ? await prisma.requestUpdate.findFirst({
        where: { id: currentStepId, stepStatus: "open", AND: [where] },
        include: quoteUpdateInclude
      })
    : null;
  const unreadMentionCount = viewerId
    ? await prisma.requestUpdateMention.count({
        where: { userId: viewerId, readAt: null, update: where }
      })
    : 0;
  return {
    updates: page.map(toQuoteUpdateRecord),
    currentStep: currentStep ? toQuoteUpdateRecord(currentStep) : null,
    unreadMentionCount,
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    hasMore
  };
}

export async function createQuoteUpdate(
  id: string,
  input: CreateRequestUpdateInput,
  user?: AuthenticatedUser
) {
  const assignee = await resolveAssignee(input.assigneeId);
  if (input.kind === "step" && !assignee) throw new Error("QUOTE_UPDATE_ASSIGNEE_REQUIRED");
  const mentionIds = await resolveMentionIds(input.mentionIds);
  const now = new Date();
  const quote = await prisma.$transaction(async (tx) => {
    const existing = await quoteThread(id, tx);
    await tx.$queryRaw`SELECT "id" FROM "Quote" WHERE "id" = ${existing.id} FOR UPDATE`;
    const locked = await quoteThread(existing.id, tx);
    const previousStepId = locked.currentStepId ?? locked.inheritedCurrentStepId;
    const previousStep = previousStepId
      ? await tx.requestUpdate.findUnique({ where: { id: previousStepId } })
      : null;
    const openPreviousStep = previousStep?.stepStatus === "open" ? previousStep : null;
    if (input.kind === "step" && openPreviousStep) {
      await tx.requestUpdate.update({
        where: { id: openPreviousStep.id },
        data: { stepStatus: "superseded" }
      });
      if (openPreviousStep.requestId) {
        await tx.request.updateMany({
          where: { id: openPreviousStep.requestId, currentStepId: openPreviousStep.id },
          data: { currentStepId: null, lastActivityAt: now }
        });
      }
    }
    const created = await tx.requestUpdate.create({
      data: {
        quoteId: locked.id,
        kind: input.kind,
        title: input.title || (input.kind === "step" ? input.body : "Comment"),
        body: input.body,
        ...actorFields(user),
        assigneeId: assignee?.id ?? null,
        assigneeNameSnapshot: assignee?.name ?? null,
        assigneeEmailSnapshot: assignee?.email ?? null,
        targetDate: dateInput(input.targetDate),
        stepStatus: input.kind === "step" ? "open" : null,
        supersedesId: input.kind === "step" ? openPreviousStep?.id ?? null : null,
        createdAt: now,
        updatedAt: now,
        mentions: mentionIds.length
          ? { create: mentionIds.map((userId) => ({ userId })) }
          : undefined
      }
    });
    if (input.kind === "step") {
      await tx.quote.update({ where: { id: locked.id }, data: { currentStepId: created.id } });
      if (openPreviousStep) {
        await createSystemUpdate(tx, locked.id, "Current step replaced", `${openPreviousStep.title || openPreviousStep.body || "Previous step"} was superseded.`, user, now);
      }
    }
    return locked;
  });
  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: input.kind === "step" ? "Current Step Posted" : "Quote Update Posted",
    title: input.title || input.body,
    detail: input.body,
    metadata: { quoteNumber: quote.quoteNumber, kind: input.kind }
  });
  return listQuoteUpdates(quote.id, "all", undefined, 25, user?.id);
}

export async function completeQuoteUpdate(id: string, updateId: string, user?: AuthenticatedUser) {
  const now = new Date();
  const quote = await prisma.$transaction(async (tx) => {
    const existing = await quoteThread(id, tx);
    await tx.$queryRaw`SELECT "id" FROM "Quote" WHERE "id" = ${existing.id} FOR UPDATE`;
    const locked = await quoteThread(existing.id, tx);
    const update = await tx.requestUpdate.findFirst({
      where: { id: updateId, kind: "step", AND: [threadWhere(locked.id, locked.requestIds)] }
    });
    if (!update) throw new Error("QUOTE_UPDATE_NOT_FOUND");
    if (update.stepStatus !== "open") throw new Error("QUOTE_UPDATE_NOT_OPEN");
    await tx.requestUpdate.update({ where: { id: update.id }, data: { stepStatus: "completed" } });
    await tx.quote.update({ where: { id: locked.id }, data: { currentStepId: null } });
    if (update.requestId) {
      await tx.request.updateMany({
        where: { id: update.requestId, currentStepId: update.id },
        data: { currentStepId: null, lastActivityAt: now }
      });
    }
    await createSystemUpdate(tx, locked.id, "Current step completed", update.title || update.body, user, now);
    return locked;
  });
  await recordActivity({
    user,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
    type: "Current Step Completed",
    title: `Current step completed on ${quote.quoteNumber}`,
    detail: quote.title,
    metadata: { updateId }
  });
  return listQuoteUpdates(quote.id, "all", undefined, 25, user?.id);
}

export async function undoQuoteUpdate(id: string, updateId: string, user?: AuthenticatedUser) {
  const now = new Date();
  const quote = await prisma.$transaction(async (tx) => {
    const existing = await quoteThread(id, tx);
    await tx.$queryRaw`SELECT "id" FROM "Quote" WHERE "id" = ${existing.id} FOR UPDATE`;
    const locked = await quoteThread(existing.id, tx);
    const update = await tx.requestUpdate.findFirst({
      where: { id: updateId, kind: "step", AND: [threadWhere(locked.id, locked.requestIds)] }
    });
    if (!update) throw new Error("QUOTE_UPDATE_NOT_FOUND");
    if (update.stepStatus === "open" && update.supersedesId) {
      if (locked.currentStepId !== update.id) throw new Error("QUOTE_UPDATE_UNDO_CONFLICT");
      await tx.requestUpdate.update({ where: { id: update.id }, data: { stepStatus: "superseded" } });
      await tx.requestUpdate.update({ where: { id: update.supersedesId }, data: { stepStatus: "open" } });
      await tx.quote.update({ where: { id: locked.id }, data: { currentStepId: update.supersedesId } });
      await createSystemUpdate(tx, locked.id, "Step replacement undone", update.title || update.body, user, now);
    } else if (update.stepStatus === "completed") {
      if (locked.currentStepId) throw new Error("QUOTE_UPDATE_UNDO_CONFLICT");
      await tx.requestUpdate.update({ where: { id: update.id }, data: { stepStatus: "open" } });
      await tx.quote.update({ where: { id: locked.id }, data: { currentStepId: update.id } });
      await createSystemUpdate(tx, locked.id, "Step completion undone", update.title || update.body, user, now);
    } else {
      throw new Error("QUOTE_UPDATE_NOT_UNDOABLE");
    }
    return locked;
  });
  return listQuoteUpdates(quote.id, "all", undefined, 25, user?.id);
}

export async function markQuoteMentionsRead(id: string, userId: string) {
  const quote = await quoteThread(id);
  const result = await prisma.requestUpdateMention.updateMany({
    where: { userId, readAt: null, update: threadWhere(quote.id, quote.requestIds) },
    data: { readAt: new Date() }
  });
  return { marked: result.count };
}

export async function listQuoteUpdateTeamMembers() {
  const users = await prisma.localUser.findMany({
    where: { active: true },
    include: { accessRole: { include: { permissions: true } } },
    orderBy: { name: "asc" }
  });
  return users
    .filter((user) => {
      const permissions = effectiveRolePermissions(user.accessRole);
      return !user.accessRole.archivedAt && permissions.includes("quotes:read") && permissions.includes("activity:write");
    })
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.accessRole.id,
      roleLabel: user.accessRole.name,
      roleColor: user.accessRole.color
    })) satisfies RequestAssignee[];
}
