import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import {
  isAuthProvider,
  type AuthenticatedUser
} from "@pulse/contracts/auth";
import { recordActivity } from "@/lib/services/activityService";
import type {
  CreateLocalUserInput,
  ResetLocalUserPasswordInput,
  UpdateLocalUserInput
} from "@pulse/contracts/local-users";
import type { LocalAccountRecord } from "@pulse/contracts/local-users";

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
  accessRole: {
    id: string;
    name: string;
    color: string;
    protected: boolean;
    systemKey: string | null;
    archivedAt: Date | null;
  };
};

const localUserInclude = {
  accessRole: {
    select: {
      id: true,
      name: true,
      color: true,
      protected: true,
      systemKey: true,
      archivedAt: true
    }
  }
} as const;

function formatDateTime(date?: Date | null) {
  return date?.toISOString() ?? "";
}

function toLocalAccountRecord(user: LocalUserShape): LocalAccountRecord {
  const authProvider = isAuthProvider(user.authProvider) ? user.authProvider : "LOCAL";
  const accessRole = {
    id: user.accessRole.id,
    name: user.accessRole.name,
    color: user.accessRole.color
  };

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: accessRole.id,
    roleId: accessRole.id,
    roleLabel: accessRole.name,
    accessRole,
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
    where: { id },
    include: localUserInclude
  });

  if (!user) {
    throw new Error("LOCAL_USER_NOT_FOUND");
  }

  return user;
}

async function assertCanChangeAdminAccess(
  existing: Pick<LocalUserShape, "id" | "role" | "active" | "accessRole">,
  nextRole: string,
  nextActive: boolean
) {
  const removingActiveAdmin =
    existing.active && existing.accessRole.systemKey === "ADMIN" &&
    (!nextActive || nextRole !== existing.role);

  if (!removingActiveAdmin) {
    return;
  }

  const remainingActiveAdmins = await prisma.localUser.count({
    where: {
      id: { not: existing.id },
      active: true,
      accessRole: { systemKey: "ADMIN" }
    }
  });

  if (remainingActiveAdmins === 0) {
    throw new Error("LOCAL_USER_LAST_ADMIN");
  }
}

async function getAssignableRoleOrThrow(roleId: string, actor: AuthenticatedUser) {
  const role = await prisma.accessRole.findFirst({
    where: { id: roleId, archivedAt: null },
    select: { id: true, name: true, color: true, protected: true, systemKey: true }
  });
  if (!role) throw new Error("ACCESS_ROLE_ASSIGNMENT_INVALID");
  if (role.protected && !actor.isSystemAdmin) throw new Error("LOCAL_USER_ADMIN_PROTECTED");
  return role;
}

function assertActorCanManageAccount(existing: LocalUserShape, actor: AuthenticatedUser) {
  if (existing.accessRole.protected && !actor.isSystemAdmin) {
    throw new Error("LOCAL_USER_ADMIN_PROTECTED");
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
    include: localUserInclude,
    orderBy: [
      { active: "desc" },
      { name: "asc" }
    ]
  });

  return users.map(toLocalAccountRecord);
}

export async function createLocalUser(input: CreateLocalUserInput, actor: AuthenticatedUser) {
  await assertEmailAvailable(input.email);
  const role = await getAssignableRoleOrThrow(input.roleId, actor);

  const user = await prisma.localUser.create({
    data: {
      name: input.name,
      email: input.email,
      role: role.id,
      passwordHash: hashPassword(input.password),
      active: input.active,
      mustChangePassword: true,
      authProvider: "LOCAL",
      deactivatedAt: input.active ? null : new Date()
    },
    include: localUserInclude
  });

  await recordActivity({
    user: actor,
    relatedEntityType: "User",
    relatedEntityId: user.id,
    type: "Created",
    title: `${user.name} account created`,
    detail: `${role.name} account created for local Pulse access.`,
    metadata: {
      roleId: role.id,
      roleName: role.name,
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
  assertActorCanManageAccount(existing, actor);
  if (
    id === actor.id &&
    ((input.roleId !== undefined && input.roleId !== existing.role) ||
      (input.active !== undefined && input.active !== existing.active))
  ) {
    throw new Error("LOCAL_USER_SELF_ACCESS");
  }
  const nextEmail = input.email ?? existing.email;
  const nextRole = input.roleId ?? existing.role;
  const nextActive = input.active ?? existing.active;

  await assertEmailAvailable(nextEmail, id);
  const nextAccessRole = await getAssignableRoleOrThrow(nextRole, actor);
  await assertCanChangeAdminAccess(existing, nextRole, nextActive);

  const updated = await prisma.localUser.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.roleId !== undefined ? { role: input.roleId } : {}),
      ...(input.active !== undefined
        ? {
            active: input.active,
            deactivatedAt: input.active ? null : new Date()
          }
        : {})
    },
    include: localUserInclude
  });

  const changes = changedFields(existing, updated);

  if (existing.role !== updated.role) {
    await recordActivity({
      user: actor,
      relatedEntityType: "User",
      relatedEntityId: updated.id,
      type: "Role Changed",
      title: `${updated.name} role changed`,
      detail: `Role changed from ${existing.accessRole.name} to ${nextAccessRole.name}.`,
      metadata: {
        previousRoleId: existing.role,
        previousRoleName: existing.accessRole.name,
        nextRoleId: updated.role,
        nextRoleName: nextAccessRole.name
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
  assertActorCanManageAccount(existing, actor);

  if (existing.authProvider !== "LOCAL") {
    throw new Error("LOCAL_USER_PASSWORD_UNAVAILABLE");
  }

  const updated = await prisma.localUser.update({
    where: { id },
    data: {
      passwordHash: hashPassword(input.temporaryPassword),
      mustChangePassword: true
    },
    include: localUserInclude
  });

  await recordActivity({
    user: actor,
    relatedEntityType: "User",
    relatedEntityId: updated.id,
    type: "Password Reset",
    title: `${updated.name} password reset`,
    detail: "A user manager set a temporary local password and required a password change.",
    metadata: {
      mustChangePassword: true
    }
  });

  return toLocalAccountRecord(updated);
}
