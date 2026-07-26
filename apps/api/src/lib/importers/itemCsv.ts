import { stringifyCsv } from "@/lib/importers/csvImportUtils";

export const itemCsvHeaders = [
  "sku",
  "part_number",
  "name",
  "description",
  "item_type",
  "status",
  "manufacturer",
  "brand",
  "category",
  "subcategory",
  "unit_of_measure",
  "cost",
  "sell_price",
  "markup_percent",
  "taxable",
  "primary_image_url",
  "product_url",
  "datasheet_url",
  "quote_description",
  "internal_notes"
] as const;

export type ItemCsvHeader = (typeof itemCsvHeaders)[number];
export type ItemCsvRow = Record<ItemCsvHeader, string>;

export function itemCsvTemplate() {
  return stringifyCsv(itemCsvHeaders, [{
    sku: "SAMPLE-SWITCH-24",
    part_number: "SW-24-POE",
    name: "Sample 24-port PoE switch",
    description: "Replace this sample row before importing.",
    item_type: "PRODUCT",
    status: "ACTIVE",
    manufacturer: "Sample Manufacturer",
    brand: "Sample Brand",
    category: "Networking",
    subcategory: "Switches",
    unit_of_measure: "each",
    cost: "500.00",
    sell_price: "650.00",
    markup_percent: "30.00",
    taxable: "true",
    primary_image_url: "",
    product_url: "https://sample.example/products/sw-24-poe",
    datasheet_url: "",
    quote_description: "Managed 24-port PoE network switch.",
    internal_notes: ""
  }]);
}
