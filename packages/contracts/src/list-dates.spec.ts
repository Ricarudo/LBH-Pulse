import test from "node:test";
import assert from "node:assert/strict";
import { calendarBoundary, nextCalendarDate } from "./list-dates";
import { itemSearchSchema } from "./items";
import { dashboardWorkQuerySchema, filterDashboardWork, type DashboardWorkItem } from "./dashboard";
test("workspace boundaries include the full local date across DST", () => {
  assert.equal(calendarBoundary("2026-03-08", "America/New_York").toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(calendarBoundary(nextCalendarDate("2026-03-08"), "America/New_York").toISOString(), "2026-03-09T04:00:00.000Z");
  assert.equal(calendarBoundary("2026-09-21", "America/Puerto_Rico").toISOString(), "2026-09-21T04:00:00.000Z");
});
test("Items accepts legacy inputs and optional repeated filters while rejecting invalid dates", () => {
  assert.equal(itemSearchSchema.parse({ type: "PRODUCT" }).type, "PRODUCT");
  assert.deepEqual(itemSearchSchema.parse({ types: "PRODUCT", statuses: ["ACTIVE", "INACTIVE"] }).types, ["PRODUCT"]);
  assert.ok(!itemSearchSchema.safeParse({ dateFrom: "2026-02-30" }).success);
  assert.ok(!itemSearchSchema.safeParse({ dateFrom: "2026-09-22", dateTo: "2026-09-21" }).success);
  assert.ok(!itemSearchSchema.safeParse({ timeZone: "Invalid/Zone" }).success);
});
test("Home finds work beyond its display cap and combines filters before sorting", () => {
  const items = Array.from({ length: 70 }, (_, index) => ({ id: String(index), reference: `R${index}`, kind: "request", title: "Work", context: "Client", owner: index > 50 ? "Pat" : "Chris", status: "New", timing: "overdue", timingDate: "2026-09-21", attentionReasons: [] } as unknown as DashboardWorkItem));
  const found = filterDashboardWork(items, dashboardWorkQuerySchema.parse({ owner: "Pat", status: ["New", "Review"], attention: "overdue", dateField: "timingDate", dateFrom: "2026-09-21", sort: "reference", dir: "desc" }));
  assert.equal(found.length, 19); assert.equal(found[0].id, "69");
});
