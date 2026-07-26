import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatRecordNumber,
  nextRecordNumberFromExisting,
  normalizeRecordNumber
} from "@/lib/services/recordNumberService";

const in2026 = new Date("2026-07-22T12:00:00.000Z");

describe("record number nomenclature", () => {
  it("formats requests, quotes, and projects with type, two-digit year, and four-digit sequence", () => {
    assert.equal(formatRecordNumber("request", 1, in2026), "RM260001");
    assert.equal(formatRecordNumber("quote", 457, in2026), "QM260457");
    assert.equal(formatRecordNumber("project", 42, in2026), "PM260042");
  });

  it("continues after the highest imported quote number", () => {
    const imported = Array.from(
      { length: 456 },
      (_, index) => formatRecordNumber("quote", index + 1, in2026)
    );
    assert.equal(
      nextRecordNumberFromExisting("quote", imported, in2026),
      "QM260457"
    );
  });

  it("ignores legacy formats, other types, and other years", () => {
    assert.equal(
      nextRecordNumberFromExisting(
        "request",
        ["RQ-2026-1001", "RM250999", "QM269999", "RM260008"],
        in2026
      ),
      "RM260009"
    );
  });

  it("normalizes canonical imported numbers without accepting malformed values", () => {
    assert.equal(normalizeRecordNumber(" qm260456 ", "quote"), "QM260456");
    assert.equal(normalizeRecordNumber("QM260000", "quote"), null);
    assert.equal(normalizeRecordNumber("QM26-0456", "quote"), null);
    assert.equal(normalizeRecordNumber("RM260456", "quote"), null);
  });

  it("rejects a sequence beyond four digits", () => {
    assert.throws(
      () => nextRecordNumberFromExisting("project", ["PM269999"], in2026),
      /RECORD_NUMBER_SEQUENCE_EXHAUSTED/
    );
  });
});
