import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { permissionKeys } from "@pulse/contracts/access-control";
import { prisma } from "@/lib/db";
import { FirstRunSetupService } from "@/shared/first-run-setup.service";

const originalTransaction = prisma.$transaction.bind(prisma);
const originalUserCount = prisma.localUser.count.bind(prisma.localUser);
const originalUserFind = prisma.localUser.findUniqueOrThrow.bind(prisma.localUser);
const originalRunCount = prisma.maintenanceRun.count.bind(prisma.maintenanceRun);

afterEach(() => {
  (prisma as any).$transaction = originalTransaction;
  (prisma.localUser as any).count = originalUserCount;
  (prisma.localUser as any).findUniqueOrThrow = originalUserFind;
  (prisma.maintenanceRun as any).count = originalRunCount;
});

describe("first-run Administrator setup", () => {
  it("reports setup only when both users and the one-time completion record are absent", async () => {
    const service = new FirstRunSetupService();
    (prisma.localUser as any).count = async () => 0;
    (prisma.maintenanceRun as any).count = async () => 0;
    assert.deepEqual(await service.status(), { setupRequired: true });

    (prisma.maintenanceRun as any).count = async () => 1;
    assert.deepEqual(await service.status(), { setupRequired: false });
  });

  it("creates built-in roles, one Administrator, and auditable setup provenance atomically", async () => {
    const roleIds: string[] = [];
    const rolePermissionPairs: string[] = [];
    const createdAt = new Date("2026-07-22T12:00:00.000Z");
    const accessRole = {
      id: "Admin",
      name: "Administrator",
      normalizedName: "administrator",
      color: "#7C3AED",
      systemKey: "ADMIN",
      protected: true,
      archivedAt: null,
      version: 1,
      createdAt,
      updatedAt: createdAt,
      permissions: permissionKeys.map((permission) => ({ roleId: "Admin", permission, createdAt }))
    };
    const createdUser = {
      id: "initial-admin",
      name: "Initial Operator",
      email: "initial@example.test",
      role: "Admin",
      passwordHash: "not-returned",
      active: true,
      mustChangePassword: false,
      isDemoAccount: false,
      authProvider: "LOCAL",
      themeMode: "system",
      accentTheme: "blue",
      motionMode: "luxurious",
      dashboardPreferences: null,
      entraObjectId: null,
      lastLoginAt: createdAt,
      deactivatedAt: null,
      createdAt,
      updatedAt: createdAt
    };
    const transaction = {
      $executeRaw: async () => 1,
      localUser: {
        count: async () => 0,
        create: async () => createdUser
      },
      maintenanceRun: {
        count: async () => 0,
        create: async () => ({ id: "setup-run" })
      },
      accessRole: {
        upsert: async ({ where }: any) => { roleIds.push(where.id); }
      },
      rolePermission: {
        upsert: async ({ where }: any) => {
          const pair = where.roleId_permission;
          rolePermissionPairs.push(`${pair.roleId}:${pair.permission}`);
        }
      },
      workspaceSettings: { upsert: async () => ({ id: "default" }) },
      activity: { create: async () => ({ id: "activity" }) }
    };
    (prisma as any).$transaction = async (operation: (tx: typeof transaction) => unknown) => operation(transaction);
    (prisma.localUser as any).findUniqueOrThrow = async () => ({ ...createdUser, accessRole });

    const user = await new FirstRunSetupService().createAdministrator({
      name: createdUser.name,
      email: createdUser.email,
      password: "A-strong-initial-password-12345"
    });
    assert.deepEqual(roleIds, ["Admin", "Sales", "ProjectManager", "Technician"]);
    assert.ok(permissionKeys.every((permission) => rolePermissionPairs.includes(`Admin:${permission}`)));
    assert.equal(user.id, createdUser.id);
    assert.equal(user.isSystemAdmin, true);
    assert.deepEqual(user.permissions, permissionKeys);
  });

  it("refuses a concurrent or repeated setup inside the locked transaction", async () => {
    const transaction = {
      $executeRaw: async () => 1,
      localUser: { count: async () => 1 },
      maintenanceRun: { count: async () => 0 }
    };
    (prisma as any).$transaction = async (operation: (tx: typeof transaction) => unknown) => operation(transaction);
    await assert.rejects(
      () => new FirstRunSetupService().createAdministrator({
        name: "Initial Operator",
        email: "initial@example.test",
        password: "A-strong-initial-password-12345"
      }),
      /INITIAL_SETUP_NOT_AVAILABLE/
    );
  });
});
