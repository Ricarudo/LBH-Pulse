import {
  LifecycleEntityType,
  Prisma,
  type PrismaClient
} from "@/generated/prisma/client";
import type { AuthenticatedUser } from "@pulse/contracts/auth";

type LifecycleWriter = Prisma.TransactionClient | PrismaClient;

type LifecycleEventInput = {
  entityType: LifecycleEntityType;
  entityId: string;
  fromStatus?: string | null;
  toStatus: string;
  changedAt?: Date;
  valueSnapshot?: number | null;
  metadata?: Prisma.InputJsonObject;
  recordWhenUnchanged?: boolean;
  user?: AuthenticatedUser;
};

export async function recordLifecycleStatusEvent(
  db: LifecycleWriter,
  input: LifecycleEventInput
) {
  if (input.fromStatus === input.toStatus && !input.recordWhenUnchanged) return null;

  return db.lifecycleStatusEvent.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      fromStatus: input.fromStatus || null,
      toStatus: input.toStatus,
      changedAt: input.changedAt ?? new Date(),
      actorUserId: input.user?.id,
      actorNameSnapshot: input.user?.name ?? "Pulse System",
      valueSnapshot: input.valueSnapshot ?? null,
      metadata: input.metadata,
      source: "APPLICATION",
      precision: "EXACT"
    }
  });
}
