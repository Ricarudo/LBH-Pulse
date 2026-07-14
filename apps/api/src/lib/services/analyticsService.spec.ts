import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agingBucket,
  analyticsDelta,
  analyticsLocalDate,
  calculateAverageRevisions,
  calculateQuotedMargin,
  calculateRevisionReturnRate,
  calculateWinRate,
  isSupersededLifecycleDecision,
  resolveAnalyticsRange
} from "@/lib/services/analyticsService";

describe("analytics ranges and comparisons", () => {
  it("uses workspace-local calendar dates", () => {
    assert.equal(
      analyticsLocalDate(new Date("2026-07-14T02:00:00Z"), "America/Puerto_Rico"),
      "2026-07-13"
    );
    assert.deepEqual(
      resolveAnalyticsRange({}, "America/Puerto_Rico", new Date("2026-07-14T12:00:00Z")),
      {
        from: "2026-06-15",
        to: "2026-07-14",
        compareFrom: "2026-05-16",
        compareTo: "2026-06-14",
        timeZone: "America/Puerto_Rico",
        label: "2026-06-15 – 2026-07-14",
        comparisonLabel: "2026-05-16 – 2026-06-14"
      }
    );
  });

  it("does not invent a percentage delta from a zero baseline", () => {
    assert.equal(analyticsDelta(0, 0), 0);
    assert.equal(analyticsDelta(10, 0), null);
    assert.equal(analyticsDelta(15, 10), 50);
  });
});

describe("analytics metric definitions", () => {
  it("excludes cancellations from quote win rate", () => {
    assert.equal(calculateWinRate(["Approved", "Rejected", "Expired", "Cancelled"]), 1 / 3);
    assert.equal(calculateWinRate(["Cancelled"]), null);
  });

  it("calculates pre-tax quoted margin from usable line costs", () => {
    assert.equal(calculateQuotedMargin([
      { lineSubtotal: 1000, quantity: 2, unitCost: 250 },
      { lineSubtotal: 0, quantity: 1, unitCost: 20 }
    ]), 0.5);
    assert.equal(calculateQuotedMargin([]), null);
  });

  it("places receivables into stable aging buckets", () => {
    const asOf = new Date("2026-07-14T12:00:00Z");
    assert.equal(agingBucket(null, asOf), "No due date");
    assert.equal(agingBucket(new Date("2026-07-20T12:00:00Z"), asOf), "Current");
    assert.equal(agingBucket(new Date("2026-06-30T12:00:00Z"), asOf), "1–30");
    assert.equal(agingBucket(new Date("2026-04-01T12:00:00Z"), asOf), "90+");
  });

  it("measures revisions against sent-version cohorts", () => {
    assert.equal(calculateRevisionReturnRate([]), null);
    assert.equal(calculateRevisionReturnRate([
      { returnedAt: new Date("2026-07-10T12:00:00Z") },
      { returnedAt: null },
      { returnedAt: new Date("2026-07-12T12:00:00Z") }
    ]), 2 / 3);
    assert.equal(calculateAverageRevisions(["quote-1", "quote-1", "quote-2"]), 1.5);
    assert.equal(calculateAverageRevisions([]), null);
  });

  it("recognizes final decisions superseded by a later revision", () => {
    assert.equal(isSupersededLifecycleDecision({ supersededByRevisionId: "revision-1" }), true);
    assert.equal(isSupersededLifecycleDecision({ supersededVersion: true }), true);
    assert.equal(isSupersededLifecycleDecision({ eventType: "quote_status_changed" }), false);
  });
});
