import assert from "node:assert/strict";
import test from "node:test";
import type { QuoteRecord } from "@pulse/contracts/work";
import { lifecycleDefinition } from "./lifecycleLists";
import { applyList, listDefaults, parseListState, serializeListState } from "./listState";

test("quote groups widen saved open views and preserve outcome filters, search and URLs", () => {
  // Only fields consumed by the list projection are needed in this fixture.
  const rows = ["Draft", "Sent", "Approved", "Cancelled", "Expired"].map((status, index) => ({
    id: String(index), quoteNumber: `Q-${index}`, status, calculationMode: "PULSE",
    title: "Quote", clientName: "Client", clientId: "client", assignedToId: null,
    assignedTo: null, trades: [], collaborators: [], createdAt: "2026-09-25", updatedAt: "2026-09-25"
  })) as unknown as QuoteRecord[];
  const definition = lifecycleDefinition("quotes", rows);
  const state = parseListState(new URLSearchParams("group=closed"), definition);
  assert.equal(state.view, "all");
  assert.deepEqual(applyList(rows, definition, state, "", "UTC").map(row => row.status).sort(), ["Approved", "Cancelled", "Expired"]);
  const status = definition.filters.find(filter => filter.key === "status")!;
  assert.equal(status.options.find(option => option.value === "Approved")?.label, "Accepted");
  const searched = applyList(rows, definition, { ...state, q: "accepted" }, "", "UTC");
  assert.deepEqual(searched.map(row => row.status), ["Approved"]);
  const encoded = serializeListState(new URLSearchParams(), state, definition);
  assert.deepEqual(parseListState(encoded, definition), state);
  assert.deepEqual(applyList(rows, definition, { ...listDefaults(definition), filters: { group: ["awaiting-response"] } }, "", "UTC").map(row => row.status), ["Sent"]);
});
