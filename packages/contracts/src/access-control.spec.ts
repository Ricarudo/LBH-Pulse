import assert from "node:assert/strict";
import test from "node:test";
import {
  assignablePermissionKeys,
  normalizePermissions,
  roleColorForeground,
  roleColorSchema,
  saveAccessRoleMatrixSchema
} from "./access-control";
import { toAuthenticatedUser } from "./auth";

test("manage permissions include their required view dependencies", () => {
  assert.deepEqual(normalizePermissions(["billing:write"]), [
    "clients:read",
    "projects:read",
    "billing:read",
    "billing:write"
  ]);
  assert.deepEqual(normalizePermissions(["quotes:write"]), [
    "clients:read",
    "items:read",
    "quotes:read",
    "quotes:write"
  ]);
});

test("role administration cannot be granted through the editable matrix", () => {
  assert.equal(assignablePermissionKeys.includes("roles:manage"), false);
  assert.equal(assignablePermissionKeys.includes("users:manage"), true);
});

test("role payloads validate versions, colors, and permission keys", () => {
  const parsed = saveAccessRoleMatrixSchema.parse({
    roles: [{
      id: "role_dispatch",
      version: 2,
      name: "Dispatch",
      color: "#0f766e",
      permissions: ["requests:read", "activity:write"]
    }]
  });
  assert.equal(parsed.roles[0]?.color, "#0F766E");
  assert.equal(roleColorSchema.safeParse("teal").success, false);
  assert.equal(saveAccessRoleMatrixSchema.safeParse({
    roles: [{
      id: "role_dispatch",
      version: 1,
      name: "Dispatch",
      color: "#0F766E",
      permissions: ["unknown:read"]
    }]
  }).success, false);
});

test("role colors choose a readable foreground", () => {
  assert.equal(roleColorForeground("#FFFFFF"), "#000000");
  assert.equal(roleColorForeground("#111827"), "#FFFFFF");
  assert.equal(roleColorForeground("invalid"), "#FFFFFF");
});

test("unknown legacy roles fail closed when effective permissions are absent", () => {
  const user = toAuthenticatedUser({
    id: "user-1",
    name: "Jordan",
    email: "jordan@example.com",
    role: "CustomRole"
  });
  assert.deepEqual(user.permissions, []);
  assert.equal(user.roleLabel, "CustomRole");
  assert.equal(user.isSystemAdmin, false);
});
