import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { canSeeActivity, type AuthenticatedUser } from "@/lib/auth/permissions";
import type { ActivityRecord } from "@/types/activity";

type RecordActivityInput = {
  user?: AuthenticatedUser | null;
  relatedEntityType: string;
  relatedEntityId: string;
  type: string;
  title: string;
  detail?: string;
  metadata?: Prisma.InputJsonValue;
};

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function toActivityRecord(activity: {
  id: string;
  relatedEntityType: string;
  relatedEntityId: string;
  actorUserId: string | null;
  actorName: string;
  actorRole: string;
  type: string;
  title: string;
  detail: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}): ActivityRecord {
  return {
    id: activity.id,
    relatedEntityType: activity.relatedEntityType,
    relatedEntityId: activity.relatedEntityId,
    actorUserId: activity.actorUserId ?? undefined,
    actorName: activity.actorName,
    actorRole: activity.actorRole,
    type: activity.type,
    title: activity.title,
    detail: activity.detail ?? "",
    createdAt: formatDateTime(activity.createdAt),
    metadata:
      activity.metadata && typeof activity.metadata === "object" && !Array.isArray(activity.metadata)
        ? (activity.metadata as Record<string, unknown>)
        : undefined
  };
}

export async function recordActivity(input: RecordActivityInput) {
  return prisma.activity.create({
    data: {
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      actorUserId: input.user?.id,
      actorName: input.user?.name ?? "Pulse System",
      actorRole: input.user?.role ?? "System",
      type: input.type,
      title: input.title,
      detail: input.detail || null,
      metadata: input.metadata === undefined ? Prisma.JsonNull : input.metadata
    }
  });
}

export async function listActivities(
  user: AuthenticatedUser,
  filters: {
    relatedEntityType?: string;
    relatedEntityId?: string;
    take?: number;
  } = {}
) {
  const activities = await prisma.activity.findMany({
    where: {
      ...(filters.relatedEntityType ? { relatedEntityType: filters.relatedEntityType } : {}),
      ...(filters.relatedEntityId ? { relatedEntityId: filters.relatedEntityId } : {})
    },
    orderBy: {
      createdAt: "desc"
    },
    take: filters.take ?? 50
  });

  return activities.filter((activity) => canSeeActivity(user, activity)).map(toActivityRecord);
}
