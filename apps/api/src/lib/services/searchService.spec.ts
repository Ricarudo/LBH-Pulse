import assert from "node:assert/strict";
import test from "node:test";
import { rankSearchResults } from "@/lib/services/searchService";
import { globalSearchQuerySchema } from "@/lib/validations/search";
import type { GlobalSearchResult } from "@/types/search";

function result(
  number: string,
  title: string,
  updatedAt: string
): GlobalSearchResult {
  return {
    kind: "request",
    id: number,
    number,
    title,
    context: "R2 test client",
    status: "Open",
    updatedAt
  };
}

test("global search validates bounded non-empty queries", () => {
  assert.equal(globalSearchQuerySchema.safeParse({ q: "RQ" }).success, true);
  assert.equal(globalSearchQuerySchema.safeParse({ q: " " }).success, false);
  assert.equal(globalSearchQuerySchema.safeParse({ q: "x".repeat(101) }).success, false);
});

test("global search ranks exact numbers before prefixes and recent substrings", () => {
  const ranked = rankSearchResults([
    result("RQ-2026-1002", "Coastal refresh", "2026-07-04T10:00:00.000Z"),
    result("RQ-2026-1001", "Older exact", "2026-01-01T10:00:00.000Z"),
    result("RQ-2026-10010", "Exact prefix", "2026-07-05T10:00:00.000Z")
  ], "RQ-2026-1001");

  assert.deepEqual(
    ranked.map((item) => item.number),
    ["RQ-2026-1001", "RQ-2026-10010", "RQ-2026-1002"]
  );
});

test("global search respects per-kind result limits", () => {
  const candidates = Array.from({ length: 8 }, (_, index) =>
    result(
      `RQ-${index}`,
      `Network request ${index}`,
      `2026-07-0${Math.min(index + 1, 9)}T10:00:00.000Z`
    )
  );
  assert.equal(rankSearchResults(candidates, "request", 5).length, 5);
});
