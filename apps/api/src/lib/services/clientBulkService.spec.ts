import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientCsvTemplate,
  parseClientBulkCsv,
  sanitizeClientBulkCsvRow,
  stringifyClientBulkCsv
} from "@/lib/services/clientBulkService";
import {
  clientBulkCsvHeaders,
  type ClientBulkCsvRow
} from "@/types/clientBulk";

function row(values: Partial<ClientBulkCsvRow> = {}): ClientBulkCsvRow {
  return Object.assign(
    Object.fromEntries(clientBulkCsvHeaders.map((header) => [header, ""])),
    values
  ) as ClientBulkCsvRow;
}

describe("client bulk CSV", () => {
  it("round-trips quoted commas, quotes, newlines, and UTF-8 content", () => {
    const source = row({
      client_name: 'Café "Norte", LLC',
      legal_name: "Café Norte,\nSociedad",
      industry: "Corporate"
    });
    const csv = stringifyClientBulkCsv([source]);
    const parsed = parseClientBulkCsv(Buffer.from(csv, "utf8"));

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].row.client_name, source.client_name);
    assert.equal(parsed[0].row.legal_name, source.legal_name);
  });

  it("accepts the supported headers in a different order", () => {
    const reversed = [...clientBulkCsvHeaders].reverse();
    const csv = `${reversed.join(",")}\n${reversed
      .map((header) => (header === "client_name" ? "Acme" : ""))
      .join(",")}\n`;
    const parsed = parseClientBulkCsv(Buffer.from(csv));

    assert.equal(parsed[0].row.client_name, "Acme");
  });

  it("rejects missing or unknown headers", () => {
    assert.throws(
      () => parseClientBulkCsv(Buffer.from("client_name,unknown\nAcme,value\n")),
      /CLIENT_BULK_INVALID_HEADERS/
    );
  });

  it("normalizes email, URLs, whitespace, and spreadsheet-safe phone values", () => {
    const sanitized = sanitizeClientBulkCsvRow(
      row({
        client_name: "  Acme   Group ",
        website: "www.example.com/",
        primary_contact_name: "  Jane   Doe ",
        primary_contact_email: " JANE@EXAMPLE.COM ",
        primary_contact_phone: "'+1 (787) 555-0100"
      })
    );

    assert.deepEqual(sanitized.errors, []);
    assert.equal(sanitized.row.client_name, "Acme Group");
    assert.equal(sanitized.row.website, "https://www.example.com");
    assert.equal(sanitized.row.primary_contact_name, "Jane Doe");
    assert.equal(sanitized.row.primary_contact_email, "jane@example.com");
    assert.equal(sanitized.row.primary_contact_phone, "+1 (787) 555-0100");
  });

  it("returns field-level validation messages without throwing the whole file", () => {
    const sanitized = sanitizeClientBulkCsvRow(
      row({
        client_name: "<script>",
        industry: "Unknown Industry",
        primary_contact_email: "not-an-email"
      })
    );

    assert.ok(sanitized.errors.some((error) => error.includes("script")));
    assert.ok(sanitized.errors.some((error) => error.includes("Industry")));
    assert.ok(sanitized.errors.some((error) => error.includes("email")));
  });

  it("generates an uploadable sample with the exact import contract", () => {
    const parsed = parseClientBulkCsv(Buffer.from(clientCsvTemplate(), "utf8"));

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].row.client_name, "Sample Company");
    assert.equal(parsed[0].row.primary_site_name, "Main Office");
    assert.equal(parsed[0].row.primary_contact_name, "Jordan Rivera");
  });
});
