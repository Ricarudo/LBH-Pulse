import assert from "node:assert/strict";
import test from "node:test";
import { canUser } from "@pulse/contracts/auth";

test("effective permission lists control browser actions", () => {
  const user = { permissions: ["requests:read", "requests:write"] } as const;
  assert.equal(canUser(user, "requests:read"), true);
  assert.equal(canUser(user, "requests:write"), true);
  assert.equal(canUser(user, "clients:write"), false);
});
