import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseQuoteVersionNumber } from "@/lib/services/workService";

describe("quote revision numbering", () => {
  it("treats only a trailing R-number as a revision marker", () => {
    assert.deepEqual(parseQuoteVersionNumber("QM260123"), {
      baseQuoteNumber: "QM260123",
      revisionNumber: 0
    });
    assert.deepEqual(parseQuoteVersionNumber("QM260123R3"), {
      baseQuoteNumber: "QM260123",
      revisionNumber: 3
    });
    assert.deepEqual(parseQuoteVersionNumber("R2-SERVICE-100"), {
      baseQuoteNumber: "R2-SERVICE-100",
      revisionNumber: 0
    });
  });

  it("normalizes whitespace and lowercase legacy suffixes", () => {
    assert.deepEqual(parseQuoteVersionNumber("  QM260016r1  "), {
      baseQuoteNumber: "QM260016",
      revisionNumber: 1
    });
  });
});
