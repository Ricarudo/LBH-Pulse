import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import {
  isAuthProvider,
  isLocalRole,
  roleLabels,
  type AuthenticatedUser
} from "@/lib/auth/permissions";
import { recordActivity } from "@/lib/services/activityService";
import type {
  CreateLocalUserInput,
  ResetLocalUserPasswordInput,
  UpdateLocalUserInput
} from "@/lib/validations/localUser";
import type { LocalAccountRecord } from "@/types/localUser";

type LocalUserShape = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
  authProvider: string;
  entraObjectId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  deactivatedAt: Date | null;
};

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

function toLocalAccountRecord(user: LocalUserShape): LocalAccountRecord {
  const role = isLocalRole(user.role) ? user.role : "Technician";
  const authProvider = isAuthProvider(user.authProvider) ? user.authProvider : "LOCAL";

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    roleLabel: roleLabels[role],
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    authProvider,
    entraObjectId: user.entraObjectId ?? "",
    createdAt: formatDateTime(user.createdAt),
    updatedAt: formatDateTime(user.updatedAt),
    lastLoginAt: formatDateTime(user.lastLoginAt),
    deactivatedAt: formatDateTime(user.deactivatedAt)
  };
}

async function assertEmailAvailable(email: string, exceptUserId?: string) {
  const duplicate = await prisma.localUser.findUnique({
    where: { email }
  });

  if (duplicate && duplicate.id !== exceptUserId) {
    throw new Error("LOCAL_USER_EMAIL_EXISTS");
  }
}

async function getLocalUserOrThrow(id: string) {
  const user = await prisma.localUser.findUnique({
    where: { id }
  });

  if (!user) {
    throw new Error("LOCAL_USER_NOT_FOUND");
  }

  return user;
}

async function assertCanChangeAdminAccess(
  existing: Pick<LocalUserShape, "id" | "role" | "active">,
  nextRole: string,
  nextActive: boolean
) {
  const removingActiveAdmin =
    existing.active && existing.role === "Admin" && (!nextActive || nextRole !== "Admin");

  if (!removingActiveAdmin) {
    return;
  }

  const remainingActiveAdmins = await prisma.localUser.count({
    where: {
      id: { not: existing.id },
      active: true,
      role: "Admin"
    }
  });

  if (remainingActiveAdmins === 0) {
    throw new Error("LOCAL_USER_LAST_ADMIN");
  }
}

function changedFields(existing: LocalUserShape, updated: LocalUserShape) {
  return [
    existing.name !== updated.name ? "name" : "",
    existing.email !== updated.email ? "email" : "",
    existing.role !== updated.role ? "role" : "",
    existing.active !== updated.active ? "status" : ""
  ].filter(Boolean);
}

export async function listLocalUsers() {
  const users = await prisma.localUser.findMany({
    orderBy: [
      { active: "desc" },
      { name: "asc" }
    ]
  });

  return users.map(toLocalAccountRecord);
}

export async function createLocalUser(input: CreateLocalUserInput, actor: AuthenticatedUser) {
  await assertEmailAvailable(input.email);

  const user = await prisma.localUser.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: hashPassword(input.password),
      active: input.active,
      mustChangePassword: true,
      authProvider: "LOCAL",
      deactivatedAt: input.active ? null : new Date()
    }
  });

  await recordActivity({
    user: actor,
    relatedEntityType: "User",
    relatedEntityId: user.id,
    type: "Created",
    title: `${user.name} account created`,
    detail: `${roleLabels[input.role]} account created for local Pulse access.`,
    metadata: {
      role: input.role,
      active: input.active,
      authProvider: "LOCAL"
    }
  });

  return toLocalAccountRecord(user);
}

export async function updateLocalUser(
  id: string,
  input: UpdateLocalUserInput,
  actor: AuthenticatedUser
) {
  const existing = await getLocalUserOrThrow(id);
  const nextEmail = input.email ?? existing.email;
  const nextRole = input.role ?? existing.role;
  const nextActive = input.active ?? existing.active;

  await assertEmailAvailable(nextEmail, id);
  await assertCanChangeAdminAccess(existing, nextRole, nextActive);

  const updated = await prisma.localUser.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.active !== undefined
        ? {
            active: input.active,
            deactivatedAt: input.active ? null : new Date()
          }
        : {})
    }
  });

  const changes = changedFields(existing, updated);

  if (existing.role !== updated.role) {
    await recordActivity({
      user: actor,
      relatedEntityType: "User",
      relatedEntityId: updated.id,
      type: "Role Changed",
      title: `${updated.name} role changed`,
      detail: `Role changed from ${existing.role} to ${updated.role}.`,
      metadata: {
        previousRole: existing.role,
        nextRole: updated.role
      }
    });
  }

  if (existing.active !== updated.active) {
    await recordActivity({
      user: actor,
      relatedEntityType: "User",
      relatedEntityId: updated.id,
      type: updated.active ? "Reactivated" : "Deactivated",
      title: `${updated.name} account ${updated.active ? "reactivated" : "deactivated"}`,
      detail: updated.active
        ? "Local Pulse account access was restored."
        : "Local Pulse account access was deactivated.",
      metadata: {
        active: updated.active
      }
    });
  }

  if (changes.length && existing.role === updated.role && existing.active === updated.active) {
    await recordActivity({
      user: actor,
      relatedEntityType: "User",
      relatedEntityId: updated.id,
      type: "Updated",
      title: `${updated.name} account updated`,
      detail: "Local Pulse account profile details were updated.",
      metadata: {
        changedFields: changes
      }
    });
  }

  return toLocalAccountRecord(updated);
}

export async function resetLocalUserPassword(
  id: string,
  input: ResetLocalUserPasswordInput,
  actor: AuthenticatedUser
) {
  const existing = await getLocalUserOrThrow(id);

  if (existing.authProvider !== "LOCAL") {
    throw new Error("LOCAL_USER_PASSWORD_UNAVAILABLE");
  }

  const updated = await prisma.localUser.update({
    where: { id },
    data: {
      passwordHash: hashPassword(input.temporaryPassword),
      mustChangePassword: true
    }
  });

  await recordActivity({
    user: actor,
    relatedEntityType: "User",
    relatedEntityId: updated.id,
    type: "Password Reset",
    title: `${updated.name} password reset`,
    detail: "An Admin set a temporary local password and required a password change.",
    metadata: {
      mustChangePassword: true
    }
  });

  return toLocalAccountRecord(updated);
}
