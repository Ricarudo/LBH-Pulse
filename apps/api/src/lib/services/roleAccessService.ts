import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  assignablePermissionKeys,
  normalizePermissions,
  permissionKeys,
  permissionSchema,
  type AccessRoleRecord,
  type ArchiveAccessRoleInput,
  type CreateAccessRoleInput,
  type Permission,
  type RestoreAccessRoleInput,
  type RoleSummary,
  type SaveAccessRoleMatrixInput
} from "@pulse/contracts/access-control";
import type { AuthenticatedUser } from "@pulse/contracts/auth";

type RoleWithPermissions = {
  id: string;
  name: string;
  normalizedName: string;
  color: string;
  systemKey: string | null;
  protected: boolean;
  archivedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  permissions: Array<{ permission: string }>;
  _count?: { users: number };
};

export const accessRoleInclude = {
  permissions: { select: { permission: true } }
} as const;

export function roleSummary(role: Pick<RoleWithPermissions, "id" | "name" | "color">): RoleSummary {
  return { id: role.id, name: role.name, color: role.color };
}

export function effectiveRolePermissions(
  role: Pick<RoleWithPermissions, "systemKey" | "protected" | "permissions">
): Permission[] {
  if (role.protected && role.systemKey === "ADMIN") return [...permissionKeys];
  const parsed = role.permissions.flatMap(({ permission }) => {
    const result = permissionSchema.safeParse(permission);
    return result.success && result.data !== "roles:manage" ? [result.data] : [];
  });
  return normalizePermissions(parsed);
}

function normalizeRoleName(name: string) {
  return name.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function toRecord(role: RoleWithPermissions): AccessRoleRecord {
  return {
    ...roleSummary(role),
    permissions: effectiveRolePermissions(role),
    protected: role.protected,
    archived: Boolean(role.archivedAt),
    assignedUserCount: role._count?.users ?? 0,
    version: role.version,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString()
  };
}

function assertRoleAdministrator(actor: AuthenticatedUser) {
  if (!actor.isSystemAdmin) throw new Error("ACCESS_ROLE_ADMIN_REQUIRED");
}

async function assertNameAvailable(name: string, exceptRoleId?: string) {
  const existing = await prisma.accessRole.findUnique({
    where: { normalizedName: normalizeRoleName(name) },
    select: { id: true }
  });
  if (existing && existing.id !== exceptRoleId) throw new Error("ACCESS_ROLE_NAME_EXISTS");
}

function activityActor(actor: AuthenticatedUser) {
  return {
    actorUserId: actor.id,
    actorName: actor.name,
    actorRole: actor.roleLabel
  };
}

export async function listAccessRoles(actor: AuthenticatedUser) {
  assertRoleAdministrator(actor);
  const roles = await prisma.accessRole.findMany({
    include: {
      permissions: { select: { permission: true } },
      _count: { select: { users: true } }
    },
    orderBy: [
      { protected: "desc" },
      { archivedAt: "asc" },
      { name: "asc" }
    ]
  });
  return roles.map((role) => toRecord(role));
}

export async function listRoleOptions(actor: AuthenticatedUser) {
  const roles = await prisma.accessRole.findMany({
    where: {
      archivedAt: null,
      ...(!actor.isSystemAdmin ? { protected: false } : {})
    },
    select: { id: true, name: true, color: true },
    orderBy: [{ protected: "desc" }, { name: "asc" }]
  });
  return roles.map(roleSummary);
}

export async function createAccessRole(input: CreateAccessRoleInput, actor: AuthenticatedUser) {
  assertRoleAdministrator(actor);
  await assertNameAvailable(input.name);
  const source = input.copyFromRoleId
    ? await prisma.accessRole.findFirst({
        where: { id: input.copyFromRoleId, archivedAt: null },
        include: accessRoleInclude
      })
    : null;
  if (input.copyFromRoleId && !source) throw new Error("ACCESS_ROLE_COPY_SOURCE_INVALID");
  const sourcePermissions = source
    ? effectiveRolePermissions(source).filter((permission) => permission !== "roles:manage")
    : [];
  const role = await prisma.$transaction(async (tx) => {
    const created = await tx.accessRole.create({
      data: {
        id: `role_${randomUUID()}`,
        name: input.name,
        normalizedName: normalizeRoleName(input.name),
        color: input.color,
        permissions: {
          create: normalizePermissions(sourcePermissions).map((permission) => ({ permission }))
        }
      },
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { users: true } }
      }
    });
    await tx.activity.create({
      data: {
        relatedEntityType: "AccessRole",
        relatedEntityId: created.id,
        ...activityActor(actor),
        type: "Created",
        title: `${created.name} role created`,
        detail: source ? `Permissions copied from ${source.name}.` : "Role started with no access.",
        metadata: { permissions: sourcePermissions, color: created.color }
      }
    });
    return created;
  });
  return toRecord(role);
}

export async function saveAccessRoleMatrix(input: SaveAccessRoleMatrixInput, actor: AuthenticatedUser) {
  assertRoleAdministrator(actor);
  const currentRoles = await prisma.accessRole.findMany({
    where: { archivedAt: null },
    include: {
      permissions: { select: { permission: true } },
      _count: { select: { users: true } }
    }
  });
  const currentById = new Map(currentRoles.map((role) => [role.id, role]));
  const incomingIds = new Set(input.roles.map((role) => role.id));
  if (
    incomingIds.size !== input.roles.length ||
    currentRoles.length !== input.roles.length ||
    currentRoles.some((role) => !incomingIds.has(role.id))
  ) {
    throw new Error("ACCESS_ROLE_MATRIX_STALE");
  }

  const normalizedNames = input.roles.map((role) => normalizeRoleName(role.name));
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new Error("ACCESS_ROLE_NAME_EXISTS");
  }
  const archivedNameConflict = await prisma.accessRole.findFirst({
    where: {
      archivedAt: { not: null },
      normalizedName: { in: normalizedNames }
    },
    select: { id: true }
  });
  if (archivedNameConflict) throw new Error("ACCESS_ROLE_NAME_EXISTS");

  const changes: Array<Record<string, unknown>> = [];
  const savedRoles = await prisma.$transaction(async (tx) => {
    for (const draft of input.roles) {
      const current = currentById.get(draft.id)!;
      const nextName = current.protected ? current.name : draft.name;
      const requestedPermissions = draft.permissions.filter(
        (permission): permission is Permission => permission !== "roles:manage"
      );
      const nextPermissions = current.protected
        ? [...permissionKeys]
        : normalizePermissions(requestedPermissions).filter((permission) =>
            (assignablePermissionKeys as readonly Permission[]).includes(permission)
          );
      const previousPermissions = effectiveRolePermissions(current);
      const granted = nextPermissions.filter((permission) => !previousPermissions.includes(permission));
      const revoked = previousPermissions.filter((permission) => !nextPermissions.includes(permission));
      const metadataChanged = nextName !== current.name || draft.color !== current.color;

      if (granted.length || revoked.length || metadataChanged) {
        const updated = await tx.accessRole.updateMany({
          where: { id: draft.id, version: draft.version, archivedAt: null },
          data: {
            name: nextName,
            normalizedName: normalizeRoleName(nextName),
            color: draft.color,
            version: { increment: 1 }
          }
        });
        if (updated.count !== 1) throw new Error("ACCESS_ROLE_MATRIX_STALE");

        if (!current.protected) {
          await tx.rolePermission.deleteMany({ where: { roleId: draft.id } });
          if (nextPermissions.length) {
            await tx.rolePermission.createMany({
              data: nextPermissions.map((permission) => ({ roleId: draft.id, permission }))
            });
          }
        }
        changes.push({
          roleId: draft.id,
          previousName: current.name,
          nextName,
          previousColor: current.color,
          nextColor: draft.color,
          granted,
          revoked
        });
      } else if (draft.version !== current.version) {
        throw new Error("ACCESS_ROLE_MATRIX_STALE");
      }
    }

    if (changes.length) {
      await tx.activity.create({
        data: {
          relatedEntityType: "AccessRole",
          relatedEntityId: "matrix",
          ...activityActor(actor),
          type: "Permissions Updated",
          title: "Role access updated",
          detail: `${changes.length} role${changes.length === 1 ? "" : "s"} changed.`,
          metadata: { changes } as unknown as Prisma.InputJsonValue
        }
      });
    }

    return tx.accessRole.findMany({
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { users: true } }
      },
      orderBy: [{ protected: "desc" }, { name: "asc" }]
    });
  });

  return savedRoles.map((role) => toRecord(role));
}

export async function archiveAccessRole(
  roleId: string,
  input: ArchiveAccessRoleInput,
  actor: AuthenticatedUser
) {
  assertRoleAdministrator(actor);
  const role = await prisma.accessRole.findFirst({
    where: { id: roleId, archivedAt: null },
    include: {
      permissions: { select: { permission: true } },
      users: { select: { id: true, name: true } }
    }
  });
  if (!role) throw new Error("ACCESS_ROLE_NOT_FOUND");
  if (role.protected) throw new Error("ACCESS_ROLE_PROTECTED");
  if (role.version !== input.version) throw new Error("ACCESS_ROLE_MATRIX_STALE");

  const replacement = input.replacementRoleId
    ? await prisma.accessRole.findFirst({
        where: { id: input.replacementRoleId, archivedAt: null },
        select: { id: true, name: true }
      })
    : null;
  if (input.replacementRoleId === role.id || (input.replacementRoleId && !replacement)) {
    throw new Error("ACCESS_ROLE_REPLACEMENT_INVALID");
  }
  if (role.users.length && !replacement) throw new Error("ACCESS_ROLE_REPLACEMENT_REQUIRED");

  await prisma.$transaction(async (tx) => {
    if (replacement) {
      await tx.localUser.updateMany({
        where: { role: role.id },
        data: { role: replacement.id }
      });
      if (role.users.length) {
        await tx.activity.createMany({
          data: role.users.map((user) => ({
            relatedEntityType: "User",
            relatedEntityId: user.id,
            ...activityActor(actor),
            type: "Role Changed",
            title: `${user.name} role changed`,
            detail: `Role changed from ${role.name} to ${replacement.name}.`,
            metadata: { previousRoleId: role.id, nextRoleId: replacement.id }
          }))
        });
      }
    }
    const updated = await tx.accessRole.updateMany({
      where: { id: role.id, version: input.version, archivedAt: null },
      data: { archivedAt: new Date(), version: { increment: 1 } }
    });
    if (updated.count !== 1) throw new Error("ACCESS_ROLE_MATRIX_STALE");
    await tx.activity.create({
      data: {
        relatedEntityType: "AccessRole",
        relatedEntityId: role.id,
        ...activityActor(actor),
        type: "Archived",
        title: `${role.name} role archived`,
        detail: replacement
          ? `${role.users.length} user${role.users.length === 1 ? " was" : "s were"} reassigned to ${replacement.name}.`
          : "The unassigned role was archived.",
        metadata: { replacementRoleId: replacement?.id ?? null, reassignedUsers: role.users.length }
      }
    });
  });
}

export async function restoreAccessRole(
  roleId: string,
  input: RestoreAccessRoleInput,
  actor: AuthenticatedUser
) {
  assertRoleAdministrator(actor);
  const role = await prisma.accessRole.findFirst({
    where: { id: roleId, archivedAt: { not: null } },
    select: { id: true, name: true, version: true }
  });
  if (!role) throw new Error("ACCESS_ROLE_NOT_FOUND");
  if (role.version !== input.version) throw new Error("ACCESS_ROLE_MATRIX_STALE");
  await prisma.$transaction(async (tx) => {
    const updated = await tx.accessRole.updateMany({
      where: { id: role.id, version: input.version, archivedAt: { not: null } },
      data: { archivedAt: null, version: { increment: 1 } }
    });
    if (updated.count !== 1) throw new Error("ACCESS_ROLE_MATRIX_STALE");
    await tx.activity.create({
      data: {
        relatedEntityType: "AccessRole",
        relatedEntityId: role.id,
        ...activityActor(actor),
        type: "Restored",
        title: `${role.name} role restored`,
        detail: "The role is available for assignment again."
      }
    });
  });
}
