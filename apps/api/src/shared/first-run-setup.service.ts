import { Injectable } from "@nestjs/common";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { permissionKeys } from "@pulse/contracts/access-control";
import {
  roleLabels,
  rolePermissions,
  toAuthenticatedUser,
  type AuthenticatedUser,
  type LocalRole
} from "@pulse/contracts/auth";
import { runtimeEnvironment } from "@/config/runtimeEnvironment";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import {
  accessRoleInclude,
  effectiveRolePermissions,
  roleSummary
} from "@/lib/services/roleAccessService";

const setupRunKind = "INTERACTIVE_ADMIN_SETUP";

const builtInRoles: Array<{
  id: LocalRole;
  name: string;
  normalizedName: string;
  color: string;
  systemKey: string | null;
  protected: boolean;
}> = [
  {
    id: "Admin",
    name: roleLabels.Admin,
    normalizedName: "administrator",
    color: "#7C3AED",
    systemKey: "ADMIN",
    protected: true
  },
  {
    id: "Sales",
    name: roleLabels.Sales,
    normalizedName: "sales",
    color: "#2563EB",
    systemKey: null,
    protected: false
  },
  {
    id: "ProjectManager",
    name: roleLabels.ProjectManager,
    normalizedName: "project manager",
    color: "#0F766E",
    systemKey: null,
    protected: false
  },
  {
    id: "Technician",
    name: roleLabels.Technician,
    normalizedName: "technician",
    color: "#C2410C",
    systemKey: null,
    protected: false
  }
];

export type FirstRunSetupInput = {
  name: string;
  email: string;
  password: string;
};

function tokenDigest(value: string) {
  return createHmac("sha256", runtimeEnvironment().securityPepper)
    .update(`first-run-setup\0${value}`)
    .digest();
}

@Injectable()
export class FirstRunSetupService {
  async status() {
    const [userCount, completedSetupCount] = await Promise.all([
      prisma.localUser.count(),
      prisma.maintenanceRun.count({
        where: {
          kind: setupRunKind,
          mode: "APPLY",
          completedAt: { not: null }
        }
      })
    ]);

    return {
      setupRequired: userCount === 0 && completedSetupCount === 0
    };
  }

  tokenMatches(suppliedToken: string) {
    const configuredToken = runtimeEnvironment().setupToken;
    const expected = tokenDigest(configuredToken || "setup-token-not-configured");
    const supplied = tokenDigest(suppliedToken);
    return Boolean(configuredToken) && timingSafeEqual(expected, supplied);
  }

  async createAdministrator(input: FirstRunSetupInput): Promise<AuthenticatedUser> {
    const user = await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pulse:first-run-setup'))`;
      const [userCount, completedSetupCount] = await Promise.all([
        transaction.localUser.count(),
        transaction.maintenanceRun.count({
          where: {
            kind: setupRunKind,
            mode: "APPLY",
            completedAt: { not: null }
          }
        })
      ]);
      if (userCount !== 0 || completedSetupCount !== 0) {
        throw new Error("INITIAL_SETUP_NOT_AVAILABLE");
      }

      for (const role of builtInRoles) {
        await transaction.accessRole.upsert({
          where: { id: role.id },
          create: role,
          update: {
            name: role.name,
            normalizedName: role.normalizedName,
            color: role.color,
            systemKey: role.systemKey,
            protected: role.protected,
            archivedAt: null
          }
        });
        for (const permission of rolePermissions[role.id]) {
          await transaction.rolePermission.upsert({
            where: { roleId_permission: { roleId: role.id, permission } },
            create: { roleId: role.id, permission },
            update: {}
          });
        }
      }

      // Guard against a contract drift that would accidentally create an
      // Administrator without a newly introduced permission.
      const missingAdminPermissions = permissionKeys.filter(
        (permission) => !rolePermissions.Admin.includes(permission)
      );
      if (missingAdminPermissions.length) {
        throw new Error("INITIAL_SETUP_ROLE_CONFIGURATION_INVALID");
      }

      await transaction.workspaceSettings.upsert({
        where: { id: "default" },
        create: { id: "default" },
        update: {}
      });

      const now = new Date();
      const created = await transaction.localUser.create({
        data: {
          name: input.name,
          email: input.email,
          role: "Admin",
          passwordHash: hashPassword(input.password),
          active: true,
          mustChangePassword: false,
          isDemoAccount: false,
          authProvider: "LOCAL",
          lastLoginAt: now
        }
      });
      const run = await transaction.maintenanceRun.create({
        data: {
          kind: setupRunKind,
          mode: "APPLY",
          reportDigest: createHash("sha256")
            .update(`${setupRunKind}\0${input.email}`)
            .digest("hex"),
          actorUserId: created.id,
          actorEmailSnapshot: input.email,
          summary: {
            userId: created.id,
            created: true,
            builtInRoles: builtInRoles.map((role) => role.id)
          },
          completedAt: now
        }
      });
      await transaction.activity.create({
        data: {
          relatedEntityType: "Authentication",
          relatedEntityId: created.id,
          actorUserId: created.id,
          actorName: created.name,
          actorRole: roleLabels.Admin,
          type: "Administrator Setup",
          title: "Initial Administrator account created",
          detail: "The protected one-time Pulse setup flow created the initial Administrator.",
          metadata: {
            maintenanceRunId: run.id,
            userId: created.id
          }
        }
      });
      return created;
    });

    const loaded = await prisma.localUser.findUniqueOrThrow({
      where: { id: user.id },
      include: { accessRole: { include: accessRoleInclude } }
    });
    return toAuthenticatedUser({
      ...loaded,
      accessRole: roleSummary(loaded.accessRole),
      permissions: effectiveRolePermissions(loaded.accessRole),
      isSystemAdmin: true
    });
  }
}

export const firstRunSetupKind = setupRunKind;
