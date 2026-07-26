import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseExactCsv } from "@/lib/importers/csvImportUtils";
import { itemCsvHeaders, itemCsvTemplate } from "@/lib/importers/itemCsv";
import { sanitizeItemCsv } from "@/lib/importers/itemImporter";

describe("item CSV importer", () => {
  it("accepts the published item template and normalizes supported values", () => {
    const rows = sanitizeItemCsv(
      parseExactCsv(Buffer.from(itemCsvTemplate(), "utf8"), itemCsvHeaders)
    );
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].errors, []);
    assert.equal(rows[0].row.item_type, "PRODUCT");
    assert.equal(rows[0].row.taxable, "true");
    assert.equal(rows[0].row.cost, "500.00");
  });

  it("reports unsafe catalog values without changing data", () => {
    const values = Object.fromEntries(itemCsvHeaders.map((header) => [header, ""]));
    Object.assign(values, {
      name: "<script>unsafe</script>",
      item_type: "UNKNOWN",
      status: "DELETED",
      cost: "-1.00",
      sell_price: "12.345",
      markup_percent: "10000",
      taxable: "sometimes",
      product_url: "file:///tmp/item"
    });
    const csv = `${itemCsvHeaders.join(",")}\n${itemCsvHeaders.map((header) => values[header]).join(",")}\n`;
    const [row] = sanitizeItemCsv(parseExactCsv(Buffer.from(csv), itemCsvHeaders));
    assert.ok(row.errors.some((error) => error.includes("unsupported HTML")));
    assert.ok(row.errors.some((error) => error.includes("Item type")));
    assert.ok(row.errors.some((error) => error.includes("Item status")));
    assert.ok(row.errors.some((error) => error.includes("Cost")));
    assert.ok(row.errors.some((error) => error.includes("Sell price")));
    assert.ok(row.errors.some((error) => error.includes("Markup")));
    assert.ok(row.errors.some((error) => error.includes("Taxable")));
    assert.ok(row.errors.some((error) => error.includes("Product URL")));
  });
});
