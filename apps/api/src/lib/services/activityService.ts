import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { canUser, type AuthenticatedUser } from "@pulse/contracts/auth";

type RecordActivityInput = {
  user?: AuthenticatedUser | null;
  relatedEntityType: string;
  relatedEntityId: string;
  type: string;
  title: string;
  detail?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function recordActivity(input: RecordActivityInput) {
  return prisma.activity.create({
    data: {
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      actorUserId: input.user?.id,
      actorName: input.user?.name ?? "Pulse System",
      actorRole: input.user?.roleLabel ?? "System",
      type: input.type,
      title: input.title,
      detail: input.detail || null,
      metadata: input.metadata === undefined ? Prisma.JsonNull : input.metadata
    }
  });
}

export function canAccessActivity(
  user: AuthenticatedUser,
  activity: { actorUserId?: string | null; relatedEntityType: string }
) {
  if (activity.relatedEntityType === "Request") return canUser(user, "requests:read");
  if (activity.relatedEntityType === "Client" || activity.relatedEntityType === "ClientImport") {
    return canUser(user, "clients:read");
  }
  if (activity.relatedEntityType === "Quote" || activity.relatedEntityType === "QuoteImport") {
    return canUser(user, "quotes:read");
  }
  if (activity.relatedEntityType === "Project") return canUser(user, "projects:read");
  if (activity.relatedEntityType === "Invoice") return canUser(user, "billing:read");
  if (
    activity.relatedEntityType === "WorkspaceSettings" ||
    activity.relatedEntityType === "RequestChecklistTemplate"
  ) {
    return canUser(user, "settings:read");
  }
  if (activity.relatedEntityType === "AccessRole") return user.isSystemAdmin;
  if (activity.relatedEntityType === "User") {
    return activity.actorUserId === user.id || canUser(user, "users:manage");
  }
  return false;
}
