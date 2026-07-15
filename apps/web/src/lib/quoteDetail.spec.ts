import assert from "node:assert/strict";
import test from "node:test";
import { normalizeQuoteDetailRecord } from "@/lib/quoteDetail";
import type { QuoteRecord } from "@pulse/contracts/work";

const legacyQuote: QuoteRecord = {
  id: "quote-1",
  quoteNumber: "QT-1001",
  baseQuoteNumber: "QT-1001",
  revisionNumber: 0,
  versionCreatedAt: "2026-07-09T12:00:00.000Z",
  sentAt: "",
  sentAtPrecision: null,
  title: "Legacy quote",
  clientId: null,
  clientName: "Example client",
  contactId: null,
  contact: null,
  status: "Draft",
  owner: "Sales User",
  total: 100,
  requestId: "request-1",
  requestNumber: "RQ-1001",
  trades: [],
  projectId: null,
  createdAt: "2026-07-09",
  updatedAt: "2026-07-09T12:00:00.000Z",
  documents: []
};

test("quote detail normalization accepts a legacy list-shaped quote", () => {
  const quote = normalizeQuoteDetailRecord(legacyQuote);

  assert.equal(quote.context.requestNumber, "RQ-1001");
  assert.equal(quote.context.requestTitle, "Legacy quote");
  assert.equal(quote.context.sourceRequestId, "request-1");
  assert.deepEqual(quote.items, []);
  assert.deepEqual(quote.updates, []);
  assert.deepEqual(quote.versions, []);
  assert.equal(quote.currentStep, null);
  assert.equal(quote.proposalNotes, "");
});

test("quote detail normalization preserves snapshot context", () => {
  const quote = normalizeQuoteDetailRecord({
    ...legacyQuote,
    trades: ["Networking"],
    context: {
      sourceRequestId: "snapshot-request",
      requestNumber: "RQ-SNAPSHOT",
      requestTitle: "Snapshot title",
      requestType: "Quote Request",
      serviceCategory: "Networking",
      contactName: "Sofia",
      contactEmail: "sofia@example.test",
      contactPhone: "",
      siteName: "Main site",
      siteAddress: "1 Main Street",
      city: "San Juan",
      state: "PR",
      scopeDescription: "Network refresh",
      internalNotes: ""
    },
    proposalNotes: "Prepared",
    proposalPreparedAt: "2026-07-09T13:00:00.000Z",
    items: []
  });

  assert.equal(quote.context.requestNumber, "RQ-SNAPSHOT");
  assert.equal(quote.context.siteName, "Main site");
  assert.deepEqual(quote.trades, ["Networking"]);
  assert.equal(quote.proposalNotes, "Prepared");
});
