import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeCsvText,
  parseExactCsv,
  stringifyCsv
} from "@/lib/importers/csvImportUtils";
import {
  legacyQuoteCsvHeaders,
  legacyQuoteCsvTemplate
} from "@/lib/importers/legacyQuoteCsv";

describe("modular CSV import utilities", () => {
  it("round-trips reordered exact headers and quoted UTF-8 values", () => {
    const headers = ["external_id", "title"] as const;
    const csv = stringifyCsv(headers, [{ external_id: "Q-1", title: 'Café, "Norte"' }]);
    const parsed = parseExactCsv(Buffer.from(csv, "utf8"), headers);
    assert.equal(parsed[0].row.external_id, "Q-1");
    assert.equal(parsed[0].row.title, 'Café, "Norte"');
  });

  it("rejects unknown headers before an importer reaches preview logic", () => {
    assert.throws(
      () => parseExactCsv(Buffer.from("external_id,unknown\nQ-1,value\n"), ["external_id", "title"]),
      /BULK_IMPORT_INVALID_HEADERS/
    );
  });

  it("normalizes spreadsheet-protected values consistently", () => {
    assert.equal(normalizeCsvText("  '+1 787 555 0100  ", true), "+1 787 555 0100");
  });

  it("generates an uploadable legacy quote sample with the exact contract", () => {
    const parsed = parseExactCsv(
      Buffer.from(legacyQuoteCsvTemplate(), "utf8"),
      legacyQuoteCsvHeaders
    );
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].row.external_quote_number, "LEGACY-1001");
    assert.equal(parsed[0].row.status, "Approved");
    assert.equal(parsed[0].row.material_sale, "12500.00");
  });
});
