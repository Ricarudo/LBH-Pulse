import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyDashboardDate,
  getDashboardData,
  dashboardRecordMatchesScope,
  earliestDashboardDate,
  effectiveDashboardDueDate,
  normalizeDashboardOwner,
  quoteAppearsOnDashboard,
  quoteDashboardDueDate,
  selectDownstreamDashboardSteps,
  workspaceBusinessDate
} from "@/lib/services/dashboardService";
import {
  defaultDashboardPreferences,
  normalizeDashboardPreferences
} from "@/lib/dashboardPreferences";
import { dashboardPreferencesSchema } from "@pulse/contracts/dashboard";
import { prisma } from "@/lib/db";
import { toAuthenticatedUser } from "@pulse/contracts/auth";

describe("dashboard date classification", () => {
  it("uses the workspace timezone for the business date", () => {
    const instant = new Date("2026-07-05T03:30:00.000Z");
    assert.equal(
      workspaceBusinessDate("America/Puerto_Rico", instant),
      "2026-07-04"
    );
    assert.equal(
      workspaceBusinessDate("UTC", instant),
      "2026-07-05"
    );
  });

  it("classifies overdue, today, upcoming, later, and undated work", () => {
    const today = "2026-07-05";
    assert.equal(classifyDashboardDate("2026-07-04", today), "overdue");
    assert.equal(classifyDashboardDate("2026-07-05", today), "today");
    assert.equal(classifyDashboardDate("2026-07-12", today), "upcoming");
    assert.equal(classifyDashboardDate("2026-07-13", today), "later");
    assert.equal(classifyDashboardDate(undefined, today), "none");
  });

  it("uses the earliest record or current-step date for urgency", () => {
    assert.equal(
      earliestDashboardDate("2026-07-03", "2026-07-08"),
      "2026-07-03"
    );
    assert.equal(earliestDashboardDate(undefined, "2026-07-08"), "2026-07-08");
    assert.equal(earliestDashboardDate(undefined, undefined), "");
  });

  it("uses a quote date before its linked or snapshot request fallback", () => {
    const quoteDate = new Date("2026-07-09T12:00:00.000Z");
    const linkedRequestDate = new Date("2026-07-10T12:00:00.000Z");
    const snapshotRequestDate = new Date("2026-07-11T12:00:00.000Z");
    assert.equal(
      effectiveDashboardDueDate(quoteDate, linkedRequestDate, snapshotRequestDate),
      "2026-07-09"
    );
    assert.equal(
      effectiveDashboardDueDate(null, linkedRequestDate, snapshotRequestDate),
      "2026-07-10"
    );
    assert.equal(
      effectiveDashboardDueDate(null, null, snapshotRequestDate),
      "2026-07-11"
    );
  });

  it("removes sent quotes and their preparation due dates from dashboard analysis", () => {
    assert.equal(quoteAppearsOnDashboard("Draft"), true);
    assert.equal(quoteAppearsOnDashboard("Review"), true);
    assert.equal(quoteAppearsOnDashboard("Sent"), false);
    assert.equal(quoteAppearsOnDashboard("Rejected"), false);
  });

  it("keeps approved handoffs actionable but removes converted original and change-order quotes", () => {
    assert.equal(quoteAppearsOnDashboard("Approved"), true);
    assert.equal(quoteAppearsOnDashboard("Approved", true), false);
    for (const status of ["Sent", "Rejected", "Expired", "Cancelled"]) {
      assert.equal(quoteAppearsOnDashboard(status), false);
      assert.equal(quoteAppearsOnDashboard(status, true), false);
    }
    for (const status of ["Draft", "Review", "On Hold"]) {
      assert.equal(quoteAppearsOnDashboard(status, true), true);
    }
  });

  it("does not revive an overdue preparation deadline on approval, including request fallbacks", () => {
    const past = new Date("2026-07-01T12:00:00Z");
    for (const dates of [[past], [null, past], [null, null, past]]) {
      for (const status of ["Draft", "Review", "On Hold"]) {
        assert.equal(classifyDashboardDate(quoteDashboardDueDate(status, ...dates), "2026-07-05"), "overdue");
      }
      for (const status of ["Sent", "Approved", "Rejected", "Expired", "Cancelled"]) {
        const due = quoteDashboardDueDate(status, ...dates);
        assert.equal(due, "");
        assert.equal(classifyDashboardDate(due, "2026-07-05"), "none");
      }
    }
    // An actual open follow-up keeps its own deadline after approval.
    assert.equal(classifyDashboardDate(earliestDashboardDate(
      quoteDashboardDueDate("Approved", past), "2026-07-04"
    ), "2026-07-05"), "overdue");
  });

});

describe("dashboard lifecycle current steps", () => {
  it("deduplicates an inherited step at the furthest downstream stage", () => {
    const selected = selectDownstreamDashboardSteps([
      { kind: "request", entityId: "request-1", stepId: "step-1" },
      { kind: "quote", entityId: "quote-1", stepId: "step-1" },
      { kind: "project", entityId: "project-1", stepId: "step-1" },
      { kind: "invoice", entityId: "invoice-1", stepId: "step-1" }
    ]);

    assert.deepEqual(selected.get("step-1"), {
      kind: "invoice",
      entityId: "invoice-1"
    });
  });

  it("falls back to the furthest stage included in the visible candidates", () => {
    const selected = selectDownstreamDashboardSteps([
      { kind: "request", entityId: "request-1", stepId: "step-1" },
      { kind: "quote", entityId: "quote-1", stepId: "step-1" },
      { kind: "project", entityId: "project-1", stepId: "step-1" }
    ]);

    assert.deepEqual(selected.get("step-1"), {
      kind: "project",
      entityId: "project-1"
    });
  });
});

describe("dashboard preferences", () => {
  it("defaults admins to all Pulse and other roles to personal work", () => {
    assert.equal(defaultDashboardPreferences(true).defaultScope, "all");
    assert.equal(defaultDashboardPreferences(false).defaultScope, "mine");
  });

  it("adds newly registered widgets as hidden without disturbing saved order", () => {
    const preferences = normalizeDashboardPreferences({
      version: 1,
      defaultScope: "team",
      widgets: [
        { id: "work-queue", visible: true, width: "half" }
      ]
    }, false);

    assert.equal(preferences.widgets[0].id, "work-queue");
    assert.equal(preferences.widgets[0].width, "half");
    assert.equal(preferences.widgets.length, 5);
    assert.ok(preferences.widgets.slice(1).every((widget) => !widget.visible));
  });

  it("rejects duplicate widget placements", () => {
    const result = dashboardPreferencesSchema.safeParse({
      version: 1,
      defaultScope: "mine",
      widgets: [
        { id: "work-queue", visible: true, width: "full" },
        { id: "work-queue", visible: false, width: "half" }
      ]
    });
    assert.equal(result.success, false);
  });
});

describe("dashboard owner matching input", () => {
  it("normalizes free-text owners consistently", () => {
    assert.equal(normalizeDashboardOwner("  Alex MORGAN "), "alex morgan");
    assert.equal(normalizeDashboardOwner(null), "");
  });

  it("matches assignment, current-step assignee, collaborators, and team roles", () => {
    const user = toAuthenticatedUser({
      id: "user-1",
      name: "Alex Morgan",
      email: "alex@example.com",
      role: "Sales"
    });
    const unassignedRecord = {
      assignedToId: null,
      assignedTo: null,
      lifecycleContext: { collaborators: [] }
    };
    const assignedRecord = {
      ...unassignedRecord,
      assignedToId: user.id,
      assignedTo: { name: user.name, role: user.role }
    };
    const step = {
      id: "step-1",
      title: "Call client",
      body: null,
      targetDate: null,
      assigneeId: user.id,
      assignee: { name: user.name, role: user.role }
    };
    const collaboratedRecord = {
      ...unassignedRecord,
      lifecycleContext: {
        collaborators: [{ user: { id: user.id, name: user.name, role: user.role } }]
      }
    };

    assert.equal(dashboardRecordMatchesScope("mine", user, assignedRecord, null, null, new Set()), true);
    assert.equal(dashboardRecordMatchesScope("mine", user, unassignedRecord, step, null, new Set()), true);
    assert.equal(dashboardRecordMatchesScope("mine", user, collaboratedRecord, null, null, new Set()), true);
    assert.equal(dashboardRecordMatchesScope("team", user, assignedRecord, null, null, new Set()), true);
    assert.equal(dashboardRecordMatchesScope("mine", user, unassignedRecord, null, "Alex Morgan", new Set()), true);
    assert.equal(dashboardRecordMatchesScope("mine", user, unassignedRecord, null, null, new Set()), false);
  });
});


describe("dashboard quote lifecycle regression", () => {
  it("keeps widget counts, queue, and schedule consistent through approval and project handoff", async (t) => {
    const user = toAuthenticatedUser({ id: "audit-user", name: "Owner", email: "owner@example.com", role: "Admin" });
    const past = new Date("2000-01-01T12:00:00Z");
    const quote = {
      id: "quote-1", quoteNumber: "Q1", title: "Quote", status: "Draft",
      assignedToId: user.id, assignedTo: { name: user.name, role: user.role },
      owner: user.name, total: 100, dueDate: past, currentStepId: null,
      sourceRequestIdSnapshot: null, clientName: "Client", client: null,
      requests: [], lifecycleContext: null,
      project: null as { id: string } | null,
      projectLink: null as { id: string } | null
    };
    // Prisma delegates are proxies; replace resolved methods and restore them after the test.
    const stub = (delegate: object, method: string, implementation: () => Promise<unknown>) => {
      const target = delegate as Record<string, unknown>;
      const original = target[method];
      target[method] = implementation;
      t.after(() => { target[method] = original; });
    };
    stub(prisma.localUser, "findUniqueOrThrow", async () => ({ dashboardPreferences: null }));
    stub(prisma.localUser, "findMany", async () => []);
    stub(prisma.workspaceSettings, "findUnique", async () => ({ timeZone: "UTC" }));
    stub(prisma.request, "findMany", async () => []);
    stub(prisma.quote, "findMany", async () => [quote]);
    stub(prisma.project, "findMany", async () => []);
    stub(prisma.invoice, "findMany", async () => []);
    const widgets = async () => (await getDashboardData(user, "all", [
      "attention-summary", "work-queue", "upcoming-dates", "module-health"
    ])).widgets;
    for (const status of ["Draft", "Review", "On Hold", "Sent", "Approved", "Rejected", "Expired", "Cancelled"]) {
      quote.status = status;
      const data = await widgets();
      const preparing = ["Draft", "Review", "On Hold"].includes(status);
      const visible = preparing || status === "Approved";
      assert.equal(data["attention-summary"]?.overdue, preparing ? 1 : 0, status);
      assert.equal(data["work-queue"]?.total, visible ? 1 : 0, status);
      assert.equal(data["upcoming-dates"]?.total, preparing ? 1 : 0, status);
      assert.equal(data["module-health"]?.items.find(item => item.id === "quotes")?.count, visible ? 1 : 0, status);
      if (status === "Approved") {
        assert.equal(data["work-queue"]?.items[0].timing, "none");
        assert.ok(data["work-queue"]?.items[0].attentionReasons.includes("Ready for project handoff"));
      }
    }
    quote.status = "Approved";
    for (const link of ["project", "projectLink"] as const) {
      quote[link] = { id: "project-link" };
      const data = await widgets();
      assert.equal(data["attention-summary"]?.overdue, 0, link);
      assert.equal(data["work-queue"]?.total, 0, link);
      assert.equal(data["upcoming-dates"]?.total, 0, link);
      assert.equal(data["module-health"]?.items.find(item => item.id === "quotes")?.count, 0, link);
      quote[link] = null;
    }
  });
});
