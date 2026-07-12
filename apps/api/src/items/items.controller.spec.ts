import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import { ItemsController } from "@/items/items.controller";
import type { ItemsService } from "@/items/items.service";
import { AuthError, type AuthService } from "@/shared/auth.service";

const request = { headers: {} } as Request;
const user: AuthenticatedUser = {
  id: "user-1",
  name: "Sales User",
  email: "sales@example.test",
  role: "Sales",
  roleLabel: "Sales",
  accessRole: { id: "Sales", name: "Sales", color: "#2563EB" },
  permissions: ["items:read", "items:write"],
  isSystemAdmin: false,
  mustChangePassword: false,
  authProvider: "LOCAL"
};

test("items controller authorizes reads before invoking the service", async () => {
  let listed = false;
  const auth = {
    requireUser: async () => {
      throw new AuthError("Authentication required.", 401);
    }
  } as unknown as AuthService;
  const items = {
    listItems: async () => {
      listed = true;
      return [];
    }
  } as unknown as ItemsService;
  const controller = new ItemsController(auth, items);

  await assert.rejects(
    controller.list(request, {}),
    (error: unknown) =>
      error instanceof AuthError && error.status === 401
  );
  assert.equal(listed, false);
});

test("items controller rejects invalid external payloads before mutation", async () => {
  let created = false;
  const auth = {
    requireUser: async () => user
  } as unknown as AuthService;
  const items = {
    createItem: async () => {
      created = true;
      throw new Error("unexpected service call");
    }
  } as unknown as ItemsService;
  const controller = new ItemsController(auth, items);

  await assert.rejects(
    controller.create(request, { name: "<script>" }),
    (error: unknown) =>
      error instanceof Error && error.name === "ZodError"
  );
  assert.equal(created, false);
});
