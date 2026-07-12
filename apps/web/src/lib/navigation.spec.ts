import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessPath,
  getActiveNavigationKey,
  getMobileActiveKey,
  routeMotionDirection,
  routeMotionProfile,
  searchResultHref
} from "@/lib/navigation";
import type { AuthenticatedUser } from "@pulse/contracts/auth";

function userWith(
  permissions: AuthenticatedUser["permissions"],
  isSystemAdmin = false
): AuthenticatedUser {
  return {
    id: "user-1",
    name: "Role Tester",
    email: "tester@example.com",
    role: "role_test",
    roleLabel: "Test role",
    accessRole: { id: "role_test", name: "Test role", color: "#64748B" },
    permissions,
    isSystemAdmin,
    mustChangePassword: false,
    authProvider: "LOCAL"
  };
}

test("nested routes activate their owning desktop destinations", () => {
  assert.equal(getActiveNavigationKey("/clients/abc"), "directory");
  assert.equal(getActiveNavigationKey("/contacts"), "directory");
  assert.equal(getActiveNavigationKey("/procurement"), "projects");
  assert.equal(getActiveNavigationKey("/field"), "projects");
  assert.equal(getActiveNavigationKey("/activity"), "activity");
});

test("mobile overflow routes activate More", () => {
  assert.equal(getMobileActiveKey("/billing"), "more");
  assert.equal(getMobileActiveKey("/settings/appearance"), "more");
  assert.equal(getMobileActiveKey("/quotes"), "quotes");
});

test("search destinations use detail pages or focused boards", () => {
  assert.equal(searchResultHref("request", "rq-1"), "/requests/rq-1");
  assert.equal(searchResultHref("client", "cl-1"), "/clients/cl-1");
  assert.equal(searchResultHref("quote", "qt-1"), "/quotes/qt-1");
  assert.equal(searchResultHref("item", "item-1"), "/directory/items/item-1");
  assert.equal(searchResultHref("invoice", "in 1"), "/billing?record=in%201");
});

test("route motion follows hierarchy and navigation order", () => {
  assert.equal(routeMotionDirection("/hub", "/quotes"), 1);
  assert.equal(routeMotionDirection("/quotes", "/hub"), -1);
  assert.equal(routeMotionDirection("/requests", "/requests/rq-1"), 1);
  assert.equal(routeMotionDirection("/requests/rq-1", "/requests"), -1);
});

test("route motion profiles route relationship", () => {
  assert.deepEqual(routeMotionProfile("/hub", "/quotes"), {
    kind: "lateral",
    direction: 1
  });
  assert.deepEqual(routeMotionProfile("/quotes", "/hub"), {
    kind: "lateral",
    direction: -1
  });
  assert.deepEqual(routeMotionProfile("/requests", "/requests/rq-1"), {
    kind: "drill-in",
    direction: 1
  });
  assert.deepEqual(routeMotionProfile("/requests/rq-1", "/requests"), {
    kind: "drill-out",
    direction: -1
  });
  assert.deepEqual(routeMotionProfile("/settings/account", "/settings/appearance"), {
    kind: "replace",
    direction: 0
  });
});

test("module routes follow effective read permissions", () => {
  const requestsOnly = userWith(["requests:read"]);
  assert.equal(canAccessPath(requestsOnly, "/requests/rq-1"), true);
  assert.equal(canAccessPath(requestsOnly, "/quotes"), false);
  assert.equal(canAccessPath(requestsOnly, "/clients/client-1"), false);
  assert.equal(canAccessPath(requestsOnly, "/hub"), true);
});

test("the directory supports independent client and item access", () => {
  const itemsOnly = userWith(["items:read"]);
  assert.equal(canAccessPath(itemsOnly, "/directory"), true);
  assert.equal(canAccessPath(itemsOnly, "/directory/items/item-1"), true);
  assert.equal(canAccessPath(itemsOnly, "/directory/sites"), false);
});

test("role administration remains exclusive to the protected Administrator", () => {
  const forgedGrant = userWith(["settings:read", "roles:manage"]);
  const administrator = userWith(["settings:read", "roles:manage"], true);
  assert.equal(canAccessPath(forgedGrant, "/settings/roles"), false);
  assert.equal(canAccessPath(administrator, "/settings/roles"), true);
  assert.equal(canAccessPath(forgedGrant, "/settings/account"), true);
});
