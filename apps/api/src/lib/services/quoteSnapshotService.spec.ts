import assert from "node:assert/strict";
import test from "node:test";
import type { QuoteRecord } from "@pulse/contracts/work";
import { projectQuoteSnapshot } from "./quoteSnapshotService";

const record = { id: "quote", quoteNumber: "QM1R1", revisionNumber: 1, sentAt: "2026-09-25T12:00:00.000Z", status: "Sent", title: "Current title", owner: "Current owner", lifecycleContext: { details: "Current scope" } } as QuoteRecord;
const evidence = { id: "event", entityId: "quote", changedAt: new Date(record.sentAt), metadata: { quoteNumber: record.quoteNumber, revisionNumber: 1, versionSnapshot: { title: "Sent title", lifecycleDetails: "Sent scope" } } };
test("partial evidence freezes only recovered fields and preserves live operational ownership", () => {
  const projected = projectQuoteSnapshot(record, [evidence]);
  assert.equal(projected.title, "Sent title");
  assert.equal(projected.lifecycleContext.details, "Sent scope");
  assert.equal(projected.owner, "Current owner");
  assert.equal(projected.commercialSnapshot?.status, "PARTIAL");
  assert.equal(record.lifecycleContext.details, "Current scope");
});
test("missing, ambiguous and different-revision evidence is never presented as frozen history", () => {
  for (const events of [[], [evidence, { ...evidence, id: "duplicate" }], [{ ...evidence, metadata: { ...evidence.metadata, revisionNumber: 0 } }], [{ ...evidence, changedAt: new Date("2026-09-24") }]]) {
    const projected = projectQuoteSnapshot(record, events);
    assert.equal(projected.title, record.title);
    assert.equal(projected.commercialSnapshot?.status, "UNAVAILABLE");
  }
  assert.equal(projectQuoteSnapshot({ ...record, status: "Draft", sentAt: "" }, [evidence]).commercialSnapshot?.status, "DRAFT");
  assert.equal(projectQuoteSnapshot({ ...record, status: "Approved", sentAt: "" }, [evidence]).commercialSnapshot?.status, "UNAVAILABLE");
});
