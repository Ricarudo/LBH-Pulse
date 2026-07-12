import assert from "node:assert/strict";
import test from "node:test";
import { permissionKeys } from "@pulse/contracts/access-control";
import { effectiveRolePermissions } from "./roleAccessService";

test("the protected Administrator role always receives every permission", () => {
  assert.deepEqual(effectiveRolePermissions({
    systemKey: "ADMIN",
    protected: true,
    permissions: []
  }), [...permissionKeys]);
});

test("custom roles discard unknown and protected grants while normalizing dependencies", () => {
  assert.deepEqual(effectiveRolePermissions({
    systemKey: null,
    protected: false,
    permissions: [
      { permission: "quotes:write" },
      { permission: "roles:manage" },
      { permission: "not-a-permission" }
    ]
  }), ["clients:read", "items:read", "quotes:read", "quotes:write"]);
});
