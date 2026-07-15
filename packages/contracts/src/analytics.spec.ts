import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyticsDetailsQuerySchema, analyticsQuerySchema } from "./analytics";

describe("analytics query contracts", () => {
  it("defaults to the overview and accepts a complete custom range", () => {
    assert.equal(analyticsQuerySchema.parse({}).view, "overview");
    assert.deepEqual(
      analyticsQuerySchema.parse({ view: "sales", from: "2026-06-01", to: "2026-06-30" }),
      { view: "sales", from: "2026-06-01", to: "2026-06-30" }
    );
  });

  it("rejects partial and reversed custom ranges", () => {
    assert.equal(analyticsQuerySchema.safeParse({ from: "2026-06-01" }).success, false);
    assert.equal(analyticsQuerySchema.safeParse({ from: "2026-06-30", to: "2026-06-01" }).success, false);
  });

  it("caps detail page size", () => {
    assert.equal(analyticsDetailsQuerySchema.parse({ take: "25" }).take, 25);
    assert.equal(analyticsDetailsQuerySchema.safeParse({ take: "51" }).success, false);
  });

  it("parses bounded, server-sorted detail queries", () => {
    assert.deepEqual(
      analyticsDetailsQuerySchema.parse({
        metric: "quotes.decisions",
        bucketFrom: "2026-06-01",
        bucketTo: "2026-06-07",
        sort: "value",
        direction: "asc"
      }),
      {
        view: "overview",
        metric: "quotes.decisions",
        bucketFrom: "2026-06-01",
        bucketTo: "2026-06-07",
        sort: "value",
        direction: "asc",
        take: 25
      }
    );
  });

  it("rejects partial and reversed chart buckets", () => {
    assert.equal(analyticsDetailsQuerySchema.safeParse({ bucketFrom: "2026-06-01" }).success, false);
    assert.equal(analyticsDetailsQuerySchema.safeParse({
      bucketFrom: "2026-06-07",
      bucketTo: "2026-06-01"
    }).success, false);
  });
});
