import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  activityRetentionPolicy,
  auditCategoryFor,
  authenticationAuditTypes,
  securityAuditEntityTypes
} from "@/lib/activityPolicy";
import { recordActivity } from "@/lib/services/activityService";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import type {
  AuditLogQuery,
  AuditLogResponse,
  AuditRecord,
  DataPracticesRecord
} from "@pulse/contracts/audit";

const permissionUserTypes = ["Role Changed"];

function categoryWhere(category: AuditLogQuery["category"]): Prisma.ActivityWhereInput | null {
  if (category === "all") return null;
  if (category === "authentication") {
    return {
      relatedEntityType: "User",
      type: { in: [...authenticationAuditTypes] }
    };
  }
  if (category === "accounts") {
    return {
      relatedEntityType: "User",
      type: { notIn: [...authenticationAuditTypes, ...permissionUserTypes] }
    };
  }
  if (category === "permissions") {
    return {
      OR: [
        { relatedEntityType: "AccessRole" },
        { relatedEntityType: "User", type: { in: permissionUserTypes } }
      ]
    };
  }
  return { relatedEntityType: { in: ["WorkspaceSettings", "AuditLog"] } };
}

function auditDateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {})
  };
}

function toAuditRecord(activity: {
  id: string;
  relatedEntityType: string;
  relatedEntityId: string;
  actorName: string;
  actorRole: string;
  type: string;
  title: string;
  detail: string | null;
  createdAt: Date;
}): AuditRecord {
  return {
    id: activity.id,
    category: auditCategoryFor(activity.relatedEntityType, activity.type),
    relatedEntityType: activity.relatedEntityType,
    relatedEntityId: activity.relatedEntityId,
    actorName: activity.actorName,
    actorRole: activity.actorRole,
    type: activity.type,
    title: activity.title,
    detail: activity.detail ?? "",
    createdAt: activity.createdAt.toISOString()
  };
}

export function getDataPractices(): DataPracticesRecord {
  return activityRetentionPolicy();
}

export async function listAuditEvents(
  filters: AuditLogQuery,
  viewer: AuthenticatedUser
): Promise<AuditLogResponse> {
  const category = categoryWhere(filters.category);
  const where: Prisma.ActivityWhereInput = {
    AND: [
      { relatedEntityType: { in: [...securityAuditEntityTypes] } },
      ...(category ? [category] : []),
      ...(filters.actor
        ? [{
            OR: [
              { actorName: { contains: filters.actor, mode: "insensitive" as const } },
              { actorRole: { contains: filters.actor, mode: "insensitive" as const } }
            ]
          }]
        : []),
      ...(filters.from || filters.to
        ? [{ createdAt: auditDateRange(filters.from, filters.to) }]
        : [])
    ]
  };
  const skip = (filters.page - 1) * filters.take;
  const [total, activities] = await prisma.$transaction([
    prisma.activity.count({ where }),
    prisma.activity.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: filters.take,
      select: {
        id: true,
        relatedEntityType: true,
        relatedEntityId: true,
        actorName: true,
        actorRole: true,
        type: true,
        title: true,
        detail: true,
        createdAt: true
      }
    })
  ]);

  await recordActivity({
    user: viewer,
    relatedEntityType: "AuditLog",
    relatedEntityId: "security",
    type: "Audit Log Viewed",
    title: "Security audit log viewed",
    detail: "An Administrator reviewed security and administration events.",
    metadata: {
      category: filters.category,
      actorFilterApplied: Boolean(filters.actor),
      from: filters.from ?? null,
      to: filters.to ?? null,
      page: filters.page
    }
  });

  return {
    events: activities.map(toAuditRecord),
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / filters.take)),
    total,
    retentionDays: activityRetentionPolicy().auditRetentionDays
  };
}
