import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/services/activityService";
import { toQuoteUpdateRecord } from "@/lib/services/quoteUpdateService";
import { effectiveRolePermissions } from "@/lib/services/roleAccessService";
import type { Permission } from "@pulse/contracts/access-control";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import type {
  CreateRequestUpdateInput,
  RequestAssignee,
  RequestUpdateFilter
} from "@pulse/contracts/requests";

export type WorkUpdateStage = "project" | "invoice";

type UpdateDb = typeof prisma | Prisma.TransactionClient;

const workUpdateInclude = {
  author: { include: { accessRole: true } },
  assignee: { include: { accessRole: true } },
  mentions: {
    include: { user: true },
    orderBy: { createdAt: "asc" }
  }
} satisfies Prisma.RequestUpdateInclude;

type WorkThread = {
  stage: WorkUpdateStage;
  id: string;
  number: string;
  title: string;
  requestIds: string[];
  quoteId: string | null;
  projectId: string;
  invoiceId: string | null;
  currentStepId: string | null;
  inheritedCurrentStepId: string | null;
};

function readPermission(stage: WorkUpdateStage): Permission {
  return stage === "project" ? "projects:read" : "billing:read";
}

function entityType(stage: WorkUpdateStage) {
  return stage === "project" ? "Project" : "Invoice";
}

function dateInput(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function actorFields(user?: AuthenticatedUser) {
  return {
    authorId: user?.id ?? null,
    authorNameSnapshot: user?.name ?? "Pulse System",
    authorEmailSnapshot: user?.email ?? null,
    authorRoleSnapshot: user?.roleLabel ?? "System"
  };
}

function toAssignee(user: {
  id: string;
  name: string;
  email: string;
  accessRole: { id: string; name: string; color: string };
}): RequestAssignee {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.accessRole.id,
    roleLabel: user.accessRole.name,
    roleColor: user.accessRole.color
  };
}

function quoteRequestIds(quote: {
  sourceRequestIdSnapshot: string | null;
  requests: Array<{ id: string }>;
} | null | undefined) {
  if (!quote) return [];
  return Array.from(new Set([
    ...quote.requests.map((request) => request.id),
    ...(quote.sourceRequestIdSnapshot ? [quote.sourceRequestIdSnapshot] : [])
  ]));
}

function inheritedQuoteStep(quote: {
  currentStepId: string | null;
  requests: Array<{ currentStepId: string | null }>;
} | null | undefined) {
  return quote?.currentStepId ??
    quote?.requests.find((request) => request.currentStepId)?.currentStepId ??
    null;
}

async function workThread(
  stage: WorkUpdateStage,
  id: string,
  db: UpdateDb = prisma
): Promise<WorkThread> {
  if (stage === "project") {
    const project = await db.project.findFirst({
      where: { archivedAt: null, OR: [{ id }, { projectNumber: id }] },
      select: {
        id: true,
        projectNumber: true,
        title: true,
        currentStepId: true,
        quoteId: true,
        quote: {
          select: {
            currentStepId: true,
            sourceRequestIdSnapshot: true,
            requests: { select: { id: true, currentStepId: true } }
          }
        }
      }
    });
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    return {
      stage,
      id: project.id,
      number: project.projectNumber,
      title: project.title,
      requestIds: quoteRequestIds(project.quote),
      quoteId: project.quoteId,
      projectId: project.id,
      invoiceId: null,
      currentStepId: project.currentStepId,
      inheritedCurrentStepId: inheritedQuoteStep(project.quote)
    };
  }

  const invoice = await db.invoice.findFirst({
    where: { archivedAt: null, OR: [{ id }, { invoiceNumber: id }] },
    select: {
      id: true,
      invoiceNumber: true,
      title: true,
      currentStepId: true,
      projectId: true,
      project: {
        select: {
          id: true,
          currentStepId: true,
          quoteId: true,
          quote: {
            select: {
              currentStepId: true,
              sourceRequestIdSnapshot: true,
              requests: { select: { id: true, currentStepId: true } }
            }
          }
        }
      }
    }
  });
  if (!invoice) throw new Error("INVOICE_NOT_FOUND");
  return {
    stage,
    id: invoice.id,
    number: invoice.invoiceNumber,
    title: invoice.title,
    requestIds: quoteRequestIds(invoice.project?.quote),
    quoteId: invoice.project?.quoteId ?? null,
    projectId: invoice.projectId ?? invoice.project?.id ?? "",
    invoiceId: invoice.id,
    currentStepId: invoice.currentStepId,
    inheritedCurrentStepId: invoice.project?.currentStepId ??
      inheritedQuoteStep(invoice.project?.quote)
  };
}

function threadWhere(thread: WorkThread) {
  const parents: Prisma.RequestUpdateWhereInput[] = [
    ...(thread.requestIds.length ? [{ requestId: { in: thread.requestIds } }] : []),
    ...(thread.quoteId ? [{ quoteId: thread.quoteId }] : []),
    ...(thread.projectId ? [{ projectId: thread.projectId }] : []),
    ...(thread.invoiceId ? [{ invoiceId: thread.invoiceId }] : [])
  ];
  return { OR: parents } satisfies Prisma.RequestUpdateWhereInput;
}

export async function findEligibleWorkAssignee(
  stage: WorkUpdateStage,
  assigneeId?: string | null,
  db: UpdateDb = prisma,
  requireActivity = false
) {
  if (!assigneeId) return null;
  const user = await db.localUser.findFirst({
    where: { id: assigneeId, active: true },
    include: { accessRole: { include: { permissions: true } } }
  });
  const permissions = user ? effectiveRolePermissions(user.accessRole) : [];
  const valid = Boolean(
    user &&
    !user.accessRole.archivedAt &&
    permissions.includes(readPermission(stage)) &&
    (!requireActivity || permissions.includes("activity:write"))
  );
  return valid ? user! : null;
}

export async function resolveWorkAssignee(
  stage: WorkUpdateStage,
  assigneeId?: string | null,
  db: UpdateDb = prisma,
  requireActivity = false
) {
  if (!assigneeId) return null;
  const user = await findEligibleWorkAssignee(stage, assigneeId, db, requireActivity);
  if (!user) {
    throw new Error(requireActivity ? "WORK_UPDATE_ASSIGNEE_INVALID" : "WORK_ASSIGNEE_INVALID");
  }
  return user;
}

export async function resolveLegacyWorkAssignee(
  stage: WorkUpdateStage,
  legacyOwner: string,
  db: UpdateDb
) {
  const normalized = legacyOwner.trim();
  if (!normalized || normalized.toLowerCase() === "unassigned") return null;
  const user = await db.localUser.findFirst({
    where: {
      active: true,
      OR: [
        { name: { equals: normalized, mode: "insensitive" } },
        { email: { equals: normalized, mode: "insensitive" } }
      ]
    },
    include: { accessRole: { include: { permissions: true } } },
    orderBy: { id: "asc" }
  });
  if (!user) return null;
  const permissions = effectiveRolePermissions(user.accessRole);
  return !user.accessRole.archivedAt && permissions.includes(readPermission(stage))
    ? user
    : null;
}

async function resolveMentionIds(stage: WorkUpdateStage, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids));
  if (!uniqueIds.length) return [];
  const users = await prisma.localUser.findMany({
    where: { id: { in: uniqueIds }, active: true },
    include: { accessRole: { include: { permissions: true } } }
  });
  if (
    users.length !== uniqueIds.length ||
    users.some((user) => {
      const permissions = effectiveRolePermissions(user.accessRole);
      return user.accessRole.archivedAt || !permissions.includes(readPermission(stage));
    })
  ) {
    throw new Error("WORK_MENTION_USER_INVALID");
  }
  return uniqueIds;
}

export function createWorkSystemUpdate(
  db: UpdateDb,
  input: {
    stage: WorkUpdateStage;
    recordId: string;
    title: string;
    body?: string | null;
    user?: AuthenticatedUser;
    createdAt?: Date;
    metadata?: Prisma.InputJsonObject;
  }
) {
  const createdAt = input.createdAt ?? new Date();
  return db.requestUpdate.create({
    data: {
      ...(input.stage === "project"
        ? { projectId: input.recordId }
        : { invoiceId: input.recordId }),
      kind: "system",
      title: input.title,
      body: input.body ?? null,
      metadata: input.metadata,
      ...actorFields(input.user),
      createdAt,
      updatedAt: createdAt
    }
  });
}

async function setCurrentStep(
  tx: Prisma.TransactionClient,
  stage: WorkUpdateStage,
  id: string,
  currentStepId: string | null
) {
  if (stage === "project") {
    await tx.project.update({ where: { id }, data: { currentStepId } });
  } else {
    await tx.invoice.update({ where: { id }, data: { currentStepId } });
  }
}

async function clearCurrentStepOwner(
  tx: Prisma.TransactionClient,
  update: {
    id: string;
    requestId: string | null;
    quoteId: string | null;
    projectId: string | null;
    invoiceId: string | null;
  },
  now: Date
) {
  if (update.requestId) {
    await tx.request.updateMany({
      where: { id: update.requestId, currentStepId: update.id },
      data: { currentStepId: null, lastActivityAt: now }
    });
  }
  if (update.quoteId) {
    await tx.quote.updateMany({
      where: { id: update.quoteId, currentStepId: update.id },
      data: { currentStepId: null }
    });
  }
  if (update.projectId) {
    await tx.project.updateMany({
      where: { id: update.projectId, currentStepId: update.id },
      data: { currentStepId: null }
    });
  }
  if (update.invoiceId) {
    await tx.invoice.updateMany({
      where: { id: update.invoiceId, currentStepId: update.id },
      data: { currentStepId: null }
    });
  }
}

export async function listWorkUpdates(
  stage: WorkUpdateStage,
  id: string,
  filter: RequestUpdateFilter = "all",
  cursor?: string,
  take = 25,
  viewerId?: string
) {
  const thread = await workThread(stage, id);
  const limit = Math.min(Math.max(take, 1), 50);
  const where = threadWhere(thread);
  const updates = await prisma.requestUpdate.findMany({
    where: { AND: [where, ...(filter !== "all" ? [{ kind: filter }] : [])] },
    include: workUpdateInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1
  });
  const hasMore = updates.length > limit;
  const page = hasMore ? updates.slice(0, limit) : updates;
  const currentStepId = thread.currentStepId ?? thread.inheritedCurrentStepId;
  const currentStep = currentStepId
    ? await prisma.requestUpdate.findFirst({
        where: { id: currentStepId, stepStatus: "open", AND: [where] },
        include: workUpdateInclude
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

export async function createWorkUpdate(
  stage: WorkUpdateStage,
  id: string,
  input: CreateRequestUpdateInput,
  user?: AuthenticatedUser
) {
  const assignee = await resolveWorkAssignee(
    stage,
    input.assigneeId,
    prisma,
    input.kind === "step"
  );
  if (input.kind === "step" && !assignee) throw new Error("WORK_UPDATE_ASSIGNEE_REQUIRED");
  const mentionIds = await resolveMentionIds(stage, input.mentionIds);
  const now = new Date();
  const thread = await prisma.$transaction(async (tx) => {
    const existing = await workThread(stage, id, tx);
    if (stage === "project") {
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${existing.id} FOR UPDATE`;
    } else {
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${existing.id} FOR UPDATE`;
    }
    const locked = await workThread(stage, existing.id, tx);
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
      await clearCurrentStepOwner(tx, openPreviousStep, now);
    }
    const created = await tx.requestUpdate.create({
      data: {
        ...(stage === "project" ? { projectId: locked.id } : { invoiceId: locked.id }),
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
      await setCurrentStep(tx, stage, locked.id, created.id);
      if (openPreviousStep) {
        await createWorkSystemUpdate(tx, {
          stage,
          recordId: locked.id,
          title: "Current step replaced",
          body: `${openPreviousStep.title || openPreviousStep.body || "Previous step"} was superseded.`,
          user,
          createdAt: now
        });
      }
    }
    return locked;
  });
  await recordActivity({
    user,
    relatedEntityType: entityType(stage),
    relatedEntityId: thread.id,
    type: input.kind === "step" ? "Current Step Posted" : `${entityType(stage)} Update Posted`,
    title: input.title || input.body,
    detail: input.body,
    metadata: { recordNumber: thread.number, kind: input.kind }
  });
  return listWorkUpdates(stage, thread.id, "all", undefined, 25, user?.id);
}

export async function completeWorkUpdate(
  stage: WorkUpdateStage,
  id: string,
  updateId: string,
  user?: AuthenticatedUser
) {
  const now = new Date();
  const thread = await prisma.$transaction(async (tx) => {
    const existing = await workThread(stage, id, tx);
    if (stage === "project") {
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${existing.id} FOR UPDATE`;
    } else {
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${existing.id} FOR UPDATE`;
    }
    const locked = await workThread(stage, existing.id, tx);
    const update = await tx.requestUpdate.findFirst({
      where: { id: updateId, kind: "step", AND: [threadWhere(locked)] }
    });
    if (!update) throw new Error("WORK_UPDATE_NOT_FOUND");
    if (update.stepStatus !== "open") throw new Error("WORK_UPDATE_NOT_OPEN");
    await tx.requestUpdate.update({
      where: { id: update.id },
      data: { stepStatus: "completed" }
    });
    await setCurrentStep(tx, stage, locked.id, null);
    await clearCurrentStepOwner(tx, update, now);
    await createWorkSystemUpdate(tx, {
      stage,
      recordId: locked.id,
      title: "Current step completed",
      body: update.title || update.body,
      user,
      createdAt: now
    });
    return locked;
  });
  await recordActivity({
    user,
    relatedEntityType: entityType(stage),
    relatedEntityId: thread.id,
    type: "Current Step Completed",
    title: `Current step completed on ${thread.number}`,
    detail: thread.title,
    metadata: { updateId }
  });
  return listWorkUpdates(stage, thread.id, "all", undefined, 25, user?.id);
}

export async function undoWorkUpdate(
  stage: WorkUpdateStage,
  id: string,
  updateId: string,
  user?: AuthenticatedUser
) {
  const now = new Date();
  const thread = await prisma.$transaction(async (tx) => {
    const existing = await workThread(stage, id, tx);
    if (stage === "project") {
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${existing.id} FOR UPDATE`;
    } else {
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${existing.id} FOR UPDATE`;
    }
    const locked = await workThread(stage, existing.id, tx);
    const update = await tx.requestUpdate.findFirst({
      where: { id: updateId, kind: "step", AND: [threadWhere(locked)] }
    });
    if (!update) throw new Error("WORK_UPDATE_NOT_FOUND");
    if (update.stepStatus === "open" && update.supersedesId) {
      if (locked.currentStepId !== update.id) throw new Error("WORK_UPDATE_UNDO_CONFLICT");
      await tx.requestUpdate.update({
        where: { id: update.id },
        data: { stepStatus: "superseded" }
      });
      await tx.requestUpdate.update({
        where: { id: update.supersedesId },
        data: { stepStatus: "open" }
      });
      await setCurrentStep(tx, stage, locked.id, update.supersedesId);
      await createWorkSystemUpdate(tx, {
        stage,
        recordId: locked.id,
        title: "Step replacement undone",
        body: update.title || update.body,
        user,
        createdAt: now
      });
    } else if (update.stepStatus === "completed") {
      if (locked.currentStepId) throw new Error("WORK_UPDATE_UNDO_CONFLICT");
      await tx.requestUpdate.update({
        where: { id: update.id },
        data: { stepStatus: "open" }
      });
      await setCurrentStep(tx, stage, locked.id, update.id);
      await createWorkSystemUpdate(tx, {
        stage,
        recordId: locked.id,
        title: "Step completion undone",
        body: update.title || update.body,
        user,
        createdAt: now
      });
    } else {
      throw new Error("WORK_UPDATE_NOT_UNDOABLE");
    }
    return locked;
  });
  return listWorkUpdates(stage, thread.id, "all", undefined, 25, user?.id);
}

export async function markWorkMentionsRead(
  stage: WorkUpdateStage,
  id: string,
  userId: string
) {
  const thread = await workThread(stage, id);
  const result = await prisma.requestUpdateMention.updateMany({
    where: { userId, readAt: null, update: threadWhere(thread) },
    data: { readAt: new Date() }
  });
  return { marked: result.count };
}

export async function listWorkUsers(stage: WorkUpdateStage) {
  const users = await prisma.localUser.findMany({
    where: { active: true },
    include: { accessRole: { include: { permissions: true } } },
    orderBy: { name: "asc" }
  });
  const eligible = users.filter((user) => {
    const permissions = effectiveRolePermissions(user.accessRole);
    return !user.accessRole.archivedAt && permissions.includes(readPermission(stage));
  });
  return {
    assignees: eligible.map(toAssignee),
    teamMembers: eligible
      .filter((user) => effectiveRolePermissions(user.accessRole).includes("activity:write"))
      .map(toAssignee)
  };
}
