import assert from "node:assert/strict";
import test from "node:test";
import { calculateMarkupPercent, calculateQuoteLine } from "@/lib/quoteMath";

test("quote line math applies quantity and discount with zero tax for MVP", () => {
  assert.deepEqual(
    calculateQuoteLine({
      quantity: 2,
      unitPrice: 150,
      discountPercent: 10
    }),
    {
      lineSubtotal: 270,
      lineTax: 0,
      lineTotal: 270
    }
  );
});

test("quote line math never returns a negative total", () => {
  assert.deepEqual(
    calculateQuoteLine({
      quantity: 1,
      unitPrice: 100,
      discountPercent: 100
    }),
    {
      lineSubtotal: 0,
      lineTax: 0,
      lineTotal: 0
    }
  );
});

test("markup display derives from unit cost and unit price", () => {
  assert.equal(calculateMarkupPercent(80, 120), 50);
  assert.equal(calculateMarkupPercent(0, 120), 0);
});
