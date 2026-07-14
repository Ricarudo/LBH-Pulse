import assert from "node:assert/strict";
import test from "node:test";
import {
  activityRetentionPolicy,
  auditCategoryFor,
  isSecurityAuditEntity
} from "@/lib/activityPolicy";

test("security and administration entities are separated from operational history", () => {
  assert.equal(isSecurityAuditEntity("User"), true);
  assert.equal(isSecurityAuditEntity("AccessRole"), true);
  assert.equal(isSecurityAuditEntity("WorkspaceSettings"), true);
  assert.equal(isSecurityAuditEntity("AuditLog"), true);
  assert.equal(isSecurityAuditEntity("Request"), false);
  assert.equal(isSecurityAuditEntity("Quote"), false);
});

test("audit events receive stable categories", () => {
  assert.equal(auditCategoryFor("User", "Login"), "authentication");
  assert.equal(auditCategoryFor("User", "Password Reset"), "authentication");
  assert.equal(auditCategoryFor("User", "Role Changed"), "permissions");
  assert.equal(auditCategoryFor("User", "Created"), "accounts");
  assert.equal(auditCategoryFor("AccessRole", "Permissions Updated"), "permissions");
  assert.equal(auditCategoryFor("AuditLog", "Audit Log Viewed"), "administration");
});

test("retention configuration is bounded and falls back safely", () => {
  assert.deepEqual(activityRetentionPolicy({}), {
    auditRetentionDays: 365,
    operationalRetentionDays: 730
  });
  assert.deepEqual(activityRetentionPolicy({
    PULSE_AUDIT_RETENTION_DAYS: "180",
    PULSE_OPERATIONAL_RETENTION_DAYS: "900"
  }), {
    auditRetentionDays: 180,
    operationalRetentionDays: 900
  });
  assert.deepEqual(activityRetentionPolicy({
    PULSE_AUDIT_RETENTION_DAYS: "7",
    PULSE_OPERATIONAL_RETENTION_DAYS: "not-a-number"
  }), {
    auditRetentionDays: 365,
    operationalRetentionDays: 730
  });
});
