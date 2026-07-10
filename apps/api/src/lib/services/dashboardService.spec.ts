import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyDashboardDate,
  normalizeDashboardOwner,
  workspaceBusinessDate
} from "@/lib/services/dashboardService";
import {
  defaultDashboardPreferences,
  normalizeDashboardPreferences
} from "@/lib/dashboardPreferences";
import { dashboardPreferencesSchema } from "@pulse/contracts/dashboard";

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
});

describe("dashboard preferences", () => {
  it("defaults admins to all Pulse and other roles to personal work", () => {
    assert.equal(defaultDashboardPreferences("Admin").defaultScope, "all");
    assert.equal(defaultDashboardPreferences("Sales").defaultScope, "mine");
  });

  it("adds newly registered widgets as hidden without disturbing saved order", () => {
    const preferences = normalizeDashboardPreferences({
      version: 1,
      defaultScope: "team",
      widgets: [
        { id: "work-queue", visible: true, width: "half" }
      ]
    }, "Sales");

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
});
