import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { SettingsController } from "@/controllers/settings.controller";
import { prisma } from "@/lib/db";

const originalUserFindUnique = prisma.localUser.findUnique.bind(prisma.localUser);
const originalUserUpdate = prisma.localUser.update.bind(prisma.localUser);
const originalSessionUpdateMany = prisma.authSession.updateMany.bind(prisma.authSession);
const originalActivityCreate = prisma.activity.create.bind(prisma.activity);

afterEach(() => {
  (prisma.localUser as unknown as { findUnique: typeof prisma.localUser.findUnique }).findUnique = originalUserFindUnique;
  (prisma.localUser as unknown as { update: typeof prisma.localUser.update }).update = originalUserUpdate;
  (prisma.authSession as unknown as { updateMany: typeof prisma.authSession.updateMany }).updateMany = originalSessionUpdateMany;
  (prisma.activity as unknown as { create: typeof prisma.activity.create }).create = originalActivityCreate;
});

describe("administrator password reset", () => {
  it("clears the reset user's account lock after changing the password", async () => {
    const account = {
      id: "user-1",
      name: "Operator",
      email: "operator@example.test",
      role: "role-1",
      active: true,
      mustChangePassword: false,
      isDemoAccount: false,
      authProvider: "LOCAL",
      entraObjectId: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      lastLoginAt: null,
      deactivatedAt: null,
      accessRole: {
        id: "role-1",
        name: "Operator",
        color: "#000000",
        protected: false,
        systemKey: null,
        archivedAt: null
      }
    };
    let passwordUpdated = false;
    let clearedEmail = "";
    (prisma.localUser as any).findUnique = async () => account;
    (prisma.localUser as any).update = async () => {
      passwordUpdated = true;
      return { ...account, mustChangePassword: true, updatedAt: new Date() };
    };
    (prisma.authSession as any).updateMany = async () => ({ count: 1 });
    (prisma.activity as any).create = async ({ data }: any) => data;

    const actor = { id: "admin-1", isSystemAdmin: true };
    const auth = { requireUser: async () => actor };
    const protection = {
      clearAccountFailures: async (email: string) => {
        assert.equal(passwordUpdated, true);
        clearedEmail = email;
      }
    };
    const controller = new SettingsController(auth as any, protection as any);

    const result = await controller.resetAccountPassword(
      {} as any,
      account.id,
      { temporaryPassword: "Temporary-passphrase-123" }
    );

    assert.equal(result.user.mustChangePassword, true);
    assert.equal(clearedEmail, account.email);
  });
});
