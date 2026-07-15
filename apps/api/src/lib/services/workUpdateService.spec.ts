import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Permission } from "@pulse/contracts/access-control";
import {
  findEligibleWorkAssignee,
  resolveWorkAssignee
} from "@/lib/services/workUpdateService";

function assigneeDb(
  permissions: Permission[],
  options: { active?: boolean; archived?: boolean } = {}
) {
  const user = {
    id: "user-1",
    name: "Project Manager",
    email: "pm@example.com",
    active: options.active ?? true,
    accessRole: {
      id: "role-1",
      name: "Project Manager",
      normalizedName: "project manager",
      color: "#2563EB",
      systemKey: null,
      protected: false,
      archivedAt: options.archived ? new Date() : null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      permissions: permissions.map((permission) => ({
        id: `permission-${permission}`,
        roleId: "role-1",
        permission,
        createdAt: new Date()
      }))
    }
  };

  return {
    localUser: {
      findFirst: async () => user.active ? user : null
    }
  };
}

describe("project and billing user assignment", () => {
  it("accepts only active users who can read the target workspace", async () => {
    const billingUser = await findEligibleWorkAssignee(
      "invoice",
      "user-1",
      assigneeDb(["billing:read"]) as never
    );
    const projectOnlyUser = await findEligibleWorkAssignee(
      "invoice",
      "user-1",
      assigneeDb(["projects:read"]) as never
    );
    const archivedRoleUser = await findEligibleWorkAssignee(
      "project",
      "user-1",
      assigneeDb(["projects:read"], { archived: true }) as never
    );

    assert.equal(billingUser?.id, "user-1");
    assert.equal(projectOnlyUser, null);
    assert.equal(archivedRoleUser, null);
  });

  it("requires collaboration access for current-step assignees", async () => {
    const recordAssignee = await findEligibleWorkAssignee(
      "project",
      "user-1",
      assigneeDb(["projects:read"]) as never
    );
    const invalidStepAssignee = await findEligibleWorkAssignee(
      "project",
      "user-1",
      assigneeDb(["projects:read"]) as never,
      true
    );
    const stepAssignee = await findEligibleWorkAssignee(
      "project",
      "user-1",
      assigneeDb(["projects:read", "activity:write"]) as never,
      true
    );

    assert.equal(recordAssignee?.id, "user-1");
    assert.equal(invalidStepAssignee, null);
    assert.equal(stepAssignee?.id, "user-1");
  });

  it("rejects an invalid explicit assignment", async () => {
    await assert.rejects(
      resolveWorkAssignee(
        "invoice",
        "user-1",
        assigneeDb(["projects:read"]) as never
      ),
      /WORK_ASSIGNEE_INVALID/
    );
  });
});
