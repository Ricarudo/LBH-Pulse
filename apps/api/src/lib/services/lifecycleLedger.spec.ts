import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLifecycleLedger, type LifecycleLedgerEvent } from "@/lib/lifecycleLedger";

function event(
  id: string,
  fromStatus: string | null,
  toStatus: string,
  changedAt: string,
  additions: Partial<LifecycleLedgerEvent> = {}
): LifecycleLedgerEvent {
  return {
    id,
    fromStatus,
    toStatus,
    changedAt: new Date(changedAt),
    source: "APPLICATION",
    precision: "EXACT",
    metadata: { test: true },
    ...additions
  };
}

describe("resolveLifecycleLedger", () => {
  it("returns a validated status chain", () => {
    const result = resolveLifecycleLedger([
      event("a", null, "Draft", "2026-01-01T00:00:00Z"),
      event("b", "Draft", "Sent", "2026-01-02T00:00:00Z")
    ], "Sent");
    assert.deepEqual(result.canonicalEvents.map(({ id }) => id), ["a", "b"]);
    assert.equal(result.unreliableFrom, null);
    assert.equal(result.currentStatusAgreement, true);
  });

  it("deduplicates identity-equivalent events without deleting history", () => {
    const original = event("a", null, "Draft", "2026-01-01T00:00:00Z");
    const duplicate = event("b", null, "Draft", "2026-01-01T00:00:00Z");
    const result = resolveLifecycleLedger([duplicate, original], "Draft");
    assert.deepEqual(result.canonicalEvents.map(({ id }) => id), ["a"]);
    assert.equal(result.excludedEvents[0]?.event.id, "b");
    assert.equal(result.issues[0]?.type, "exact-duplicate");
    assert.equal(result.deterministic, true);
  });

  it("does not treat matching transitions with conflicting payloads as exact duplicates", () => {
    const result = resolveLifecycleLedger([
      event("a", null, "Sent", "2026-01-01T00:00:00Z", { valueSnapshot: "100.00" }),
      event("b", null, "Sent", "2026-01-01T00:00:00Z", { valueSnapshot: "200.00" })
    ], "Sent");
    assert.equal(result.issues.some(({ type }) => type === "exact-duplicate"), false);
    assert.equal(result.issues.some(({ type }) => type === "ambiguous-timestamp-tie"), true);
    assert.equal(result.deterministic, false);
  });

  it("stops before a broken chain instead of trusting the final timestamp", () => {
    const result = resolveLifecycleLedger([
      event("a", null, "Draft", "2026-01-01T00:00:00Z"),
      event("b", "Review", "Approved", "2026-01-02T00:00:00Z"),
      event("c", "Approved", "Complete", "2026-01-03T00:00:00Z")
    ], "Complete");
    assert.deepEqual(result.canonicalEvents.map(({ id }) => id), ["a"]);
    assert.equal(result.issues.some(({ type }) => type === "chain-break"), true);
    assert.equal(result.unreliableFrom?.toISOString(), "2026-01-02T00:00:00.000Z");
  });

  it("resolves a timestamp tie only when statuses prove one order", () => {
    const result = resolveLifecycleLedger([
      event("z", "Review", "Sent", "2026-01-02T00:00:00Z"),
      event("a", null, "Draft", "2026-01-01T00:00:00Z"),
      event("y", "Draft", "Review", "2026-01-02T00:00:00Z")
    ], "Sent");
    assert.deepEqual(result.canonicalEvents.map(({ id }) => id), ["a", "y", "z"]);
    assert.equal(result.issues.some(({ type }) => type === "timestamp-tie-resolved"), true);
  });

  it("flags an ambiguous timestamp tie", () => {
    const result = resolveLifecycleLedger([
      event("a", null, "Draft", "2026-01-01T00:00:00Z"),
      event("b", "Draft", "Sent", "2026-01-02T00:00:00Z"),
      event("c", "Draft", "Review", "2026-01-02T00:00:00Z")
    ], "Review");
    assert.deepEqual(result.canonicalEvents.map(({ id }) => id), ["a"]);
    assert.equal(result.issues.some(({ type }) => type === "ambiguous-timestamp-tie"), true);
  });

  it("excludes reviewed superseded events", () => {
    const result = resolveLifecycleLedger([
      event("a", null, "Draft", "2026-01-01T00:00:00Z"),
      event("bad", "Draft", "Rejected", "2026-01-02T00:00:00Z", { disposition: { status: "SUPERSEDED" } }),
      event("b", "Draft", "Sent", "2026-01-03T00:00:00Z")
    ], "Sent");
    assert.deepEqual(result.canonicalEvents.map(({ id }) => id), ["a", "b"]);
    assert.equal(result.excludedEvents[0]?.event.id, "bad");
  });

  it("flags disagreement with the current entity status", () => {
    const result = resolveLifecycleLedger([
      event("a", null, "Draft", "2026-01-01T00:00:00Z")
    ], "Sent");
    assert.equal(result.currentStatusAgreement, false);
    assert.equal(result.issues.some(({ type }) => type === "current-status-disagreement"), true);
  });
});
