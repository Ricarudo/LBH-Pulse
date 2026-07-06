import assert from "node:assert/strict";
import test from "node:test";
import { canRole } from "./auth/permissions";

test("Admin and Sales users can create CRM records", () => {
  assert.equal(canRole("Admin", "crm:write"), true);
  assert.equal(canRole("Sales", "crm:write"), true);
  assert.equal(canRole("ProjectManager", "crm:write"), false);
  assert.equal(canRole("Technician", "crm:write"), false);
});
