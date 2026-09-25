import test from "node:test";
import assert from "node:assert/strict";
import { applyList, businessDate, dateError, dateRange, filterCount, listDefaults, listSortChoices, matchesDate, options, parseListState, serializeListState, widenStatusView, type ListDefinition } from "./listState";
import { lifecycleDefinition, lifecycleMine, lifecycleNumber, openStatuses } from "./lifecycleLists";
import type { RequestRecord } from "@pulse/contracts/requests";

type Row = { id: string; status: string; client: string; owner: string; date: string; value: number };
const rows: Row[] = [
  { id: "1", status: "Open", client: "A", owner: "u1", date: "2026-09-21T03:59:59Z", value: 20 },
  { id: "2", status: "Open", client: "B", owner: "u2", date: "2026-09-21T04:00:00Z", value: 10 },
  { id: "3", status: "Closed", client: "A", owner: "", date: "", value: 10 },
  { id: "4", status: "Open", client: "A", owner: "u1", date: "2026-09-22T03:59:59Z", value: 20 }
];
const definition: ListDefinition<Row> = {
  id: "test", label: "test", defaultView: "open", defaultSort: "value", defaultDirection: "desc",
  views: [{ key: "open", label: "Open", statuses: ["Open"], matches: row => row.status === "Open" }, { key: "all", label: "All", matches: () => true }],
  filters: [
    { key: "status", label: "Status", options: options(["Open", "Closed"]), values: row => row.status },
    { key: "client", label: "Client", options: options(["A", "B"]), values: row => row.client },
    { key: "owner", label: "Owner", options: options(["u1", "u2", "__me", "__unassigned"]), values: row => row.owner }
  ], dates: [{ key: "date", label: "Date", value: row => row.date }],
  sorts: [{ key: "value", label: "Value", value: row => row.value, direction: "desc" }, { key: "date", label: "Date", value: row => row.date, direction: "asc" }],
  search: row => row.client, rowId: row => row.id
};
const defaults = listDefaults(definition);
const ids = (state = defaults) => applyList(rows, definition, state, "u1", "America/Puerto_Rico", new Date("2026-09-21T12:00:00Z")).map(row => row.id);

test("OR within each filter, AND across status/client/owner/date", () => {
  const state = { ...defaults, view: "all", filters: { status: ["Open", "Closed"], client: ["A", "B"], owner: ["__me", "__unassigned"] }, datePreset: "today" as const };
  assert.deepEqual(ids(state), ["4"]);
  assert.equal(filterCount(state), 4);
  assert.deepEqual(ids({ ...state, datePreset: "any" }), ["1", "4", "3"]);
});
test("workspace dates honor inclusive local bounds and exclude missing dates", () => {
  const state = { ...defaults, view: "all", datePreset: "today" as const };
  assert.deepEqual(ids(state), ["4", "2"]);
  assert.equal(businessDate("2026-09-21", "America/Los_Angeles"), "2026-09-21");
  assert.deepEqual(ids({ ...state, datePreset: "missing" }), ["3"]);
  assert.deepEqual(ids({ ...state, datePreset: "custom", from: "2026-09-21", to: "" }), ["4", "2"]);
  assert.deepEqual(ids({ ...state, datePreset: "custom", from: "", to: "2026-09-20" }), ["1"]);
  assert.equal(matchesDate("", { ...state, datePreset: "custom", from: "", to: "" }, "UTC", "2026-09-21"), false);
  assert.deepEqual(dateRange({ ...state, datePreset: "last7" }, "2026-01-02"), { from: "2025-12-27", to: "2026-01-02" });
  assert.deepEqual(dateRange({ ...state, datePreset: "next7" }, "2026-01-02"), { from: "2026-01-02", to: "2026-01-08" });
  assert.ok(dateError({ ...state, datePreset: "custom", from: "2026-09-22", to: "2026-09-21" }));
  assert.ok(dateError({ ...state, datePreset: "custom", from: "2026-02-30" }));
});
test("scope widening preserves other filters and sorts are deterministic with missing dates last", () => {
  const state = widenStatusView({ ...defaults, filters: { status: ["Closed"], client: ["A"] } }, definition);
  assert.equal(state.view, "all"); assert.deepEqual(state.filters.client, ["A"]);
  assert.deepEqual(ids({ ...defaults, view: "all", sort: "date", direction: "asc" }), ["1", "2", "4", "3"]);
  assert.deepEqual(ids({ ...defaults, view: "all", sort: "date", direction: "desc" }), ["4", "2", "1", "3"]);
  assert.deepEqual(ids(), ["1", "4", "2"]);
});
test("validated URL overrides preferences; repeated and legacy single values round trip with context", () => {
  const parsed = parseListState(new URLSearchParams("view=all&sort=date&status=Open&status=Closed&client=A&client=forbidden&tab=work&focus=record"), definition, { view: "open", sort: "value", direction: "desc" });
  assert.equal(parsed.view, "all"); assert.equal(parsed.direction, "asc");
  assert.deepEqual(parsed.filters.status, ["Open", "Closed"]); assert.deepEqual(parsed.filters.client, ["A"]);
  const url = serializeListState(new URLSearchParams("tab=work&focus=record&status=stale"), parsed, definition);
  assert.equal(url.get("tab"), "work"); assert.equal(url.get("focus"), "record"); assert.equal(url.getAll("status").length, 2);
  assert.deepEqual(parseListState(url, definition), parsed);
  const invalid = parseListState(new URLSearchParams("view=bad&sort=bad&dir=bad&dateField=bad&status=secret"), definition, { view: "all" });
  assert.equal(invalid.view, "open"); assert.equal(invalid.sort, "value"); assert.deepEqual(invalid.filters.status, []);
  assert.equal(parseListState(new URLSearchParams(), definition, { view: "all", sort: "date", direction: "asc" }).view, "all");
  const scoped = { ...definition, prefix: "work." };
  const scopedURL = serializeListState(new URLSearchParams("view=sales&clientId=123"), defaults, scoped);
  assert.equal(scopedURL.get("view"), "sales"); assert.equal(scopedURL.get("clientId"), "123");
});
test("lifecycle open sets and assigned owner differ from broader My work", () => {
  assert.ok(openStatuses.quotes.includes("Sent")); assert.ok(openStatuses.invoices.includes("Overdue"));
  assert.ok(!openStatuses.requests.includes("Converted to Quote"));
  const row = { id: "r", status: "Received", assignedToId: "someone", collaborators: [{ id: "me" }], currentStep: null, updatedAt: "2026-01-01", createdAt: "2026-01-01", title: "", companyName: "", requestNumber: "R1", serviceCategories: [] } as unknown as RequestRecord;
  assert.ok(lifecycleMine(row, "me")); assert.ok(!lifecycleMine(row, "other"));
  const def = lifecycleDefinition("requests", [row]);
  assert.equal(applyList([row], def, { ...listDefaults(def), view: "my" }, "me", "UTC").length, 1);
  assert.equal(applyList([row], def, { ...listDefaults(def), filters: { owner: ["__me"] } }, "me", "UTC").length, 0);
});

test("combined sort choices name both field and direction", () => {
  const def = lifecycleDefinition("requests", []);
  const choices = listSortChoices(def).flatMap(group => group.choices);
  assert.equal(choices.find(choice => choice.value === "activity:desc")?.label, "Updated · Most recently updated");
  assert.equal(choices.find(choice => choice.value === "nextAction:asc")?.label, "Next-action target · Earliest first");
  assert.equal(choices.find(choice => choice.value === "priority:desc")?.label, "Priority · Urgent first");
  assert.equal(choices.find(choice => choice.value === "client:asc")?.label, "Client · A–Z");
  assert.equal(new Set(choices.map(choice => choice.value)).size, def.sorts.length * 2);
});
test("quote numbers sort independently from their source request", () => {
  const quote = { id: "q", quoteNumber: "Q-020", requestNumber: "R-001", calculationMode: "ITEMIZED" } as unknown as import("@pulse/contracts/work").QuoteRecord;
  assert.equal(lifecycleNumber(quote), "Q-020");
  const project = { id: "p", projectNumber: "P-003", quoteNumber: "Q-020" } as unknown as import("@pulse/contracts/work").ProjectRecord;
  assert.equal(lifecycleNumber(project), "P-003");
});
