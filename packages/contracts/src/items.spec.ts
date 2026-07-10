import assert from "node:assert/strict";
import test from "node:test";
import {
  addAdHocQuoteItemSchema,
  createItemSchema,
  itemSearchSchema,
  reorderQuoteItemsSchema,
  updateItemSchema
} from "./items";

test("item validation accepts a reusable product item", () => {
  const parsed = createItemSchema.parse({
    name: "PoE Switch",
    itemType: "PRODUCT",
    sku: "SW-1",
    cost: "100",
    sellPrice: "150"
  });

  assert.equal(parsed.name, "PoE Switch");
  assert.equal(parsed.cost, 100);
  assert.equal(parsed.sellPrice, 150);
  assert.equal(parsed.status, "ACTIVE");
});

test("item validation rejects unsafe text", () => {
  assert.equal(createItemSchema.safeParse({ name: "<script>" }).success, false);
});

test("quote ad hoc line validation coerces editable numeric inputs", () => {
  const parsed = addAdHocQuoteItemSchema.parse({
    name: "Custom mounting hardware",
    quantity: "2",
    unitCost: "12.5",
    unitPrice: "25",
    discountPercent: "5"
  });

  assert.equal(parsed.quantity, 2);
  assert.equal(parsed.unitCost, 12.5);
  assert.equal(parsed.unitPrice, 25);
  assert.equal(parsed.section, "Materials");
});

test("item search hides inactive records unless requested by caller", () => {
  assert.equal(itemSearchSchema.parse({}).includeInactive, false);
  assert.equal(itemSearchSchema.parse({ includeInactive: "true" }).includeInactive, true);
});

test("item update validation preserves an explicit default labor clear", () => {
  assert.deepEqual(updateItemSchema.parse({ defaultLaborItemId: "" }), {
    defaultLaborItemId: ""
  });
});

test("atomic quote reorder validation rejects duplicate line identifiers", () => {
  assert.equal(
    reorderQuoteItemsSchema.safeParse({
      quoteItemIds: ["line-1", "line-1"]
    }).success,
    false
  );
  assert.deepEqual(
    reorderQuoteItemsSchema.parse({
      quoteItemIds: ["line-2", "line-1"]
    }),
    { quoteItemIds: ["line-2", "line-1"] }
  );
});
