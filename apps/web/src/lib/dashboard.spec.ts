import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dashboardGreeting,
  dashboardRecordHref,
  defaultDashboardPreferences,
  normalizeDashboardPreferences
} from "@/lib/dashboard";

describe("dashboard greeting", () => {
  it("uses workspace-local morning, afternoon, and evening boundaries", () => {
    assert.equal(
      dashboardGreeting("Ricardo Rodriguez", "UTC", new Date("2026-07-05T11:59:00Z")),
      "Good morning, Ricardo"
    );
    assert.equal(
      dashboardGreeting("Ricardo Rodriguez", "UTC", new Date("2026-07-05T12:00:00Z")),
      "Good afternoon, Ricardo"
    );
    assert.equal(
      dashboardGreeting("Ricardo Rodriguez", "UTC", new Date("2026-07-05T17:00:00Z")),
      "Good evening, Ricardo"
    );
  });
});

describe("dashboard layout", () => {
  it("uses the intended five-widget starter layout", () => {
    const preferences = defaultDashboardPreferences("Admin");
    assert.equal(preferences.defaultScope, "all");
    assert.deepEqual(
      preferences.widgets.map((widget) => [widget.id, widget.width]),
      [
        ["attention-summary", "full"],
        ["work-queue", "full"],
        ["upcoming-dates", "half"],
        ["recent-activity", "half"],
        ["module-health", "full"]
      ]
    );
  });

  it("normalizes missing widget entries as hidden", () => {
    const preferences = normalizeDashboardPreferences({
      version: 1,
      defaultScope: "mine",
      widgets: [{ id: "recent-activity", visible: true, width: "full" }]
    }, "Sales");
    assert.equal(preferences.widgets[0].id, "recent-activity");
    assert.equal(preferences.widgets.length, 5);
    assert.equal(preferences.widgets[1].visible, false);
  });
});

describe("dashboard record links", () => {
  it("builds precise existing record routes", () => {
    assert.equal(dashboardRecordHref("Request", "rq1"), "/requests/rq1");
    assert.equal(dashboardRecordHref("Quote", "q 1"), "/quotes?record=q%201");
    assert.equal(dashboardRecordHref("Opportunity", "o1"), undefined);
  });
});
