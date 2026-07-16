import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateLegacyQuoteFinancials,
  calculatePulseQuoteFinancials,
  toQuoteFinancialSummary
} from "@/modules/quotes/quote-financials";

test("Legacy quotes derive subtotal, cost, profit, margin, markup, and tax-inclusive total", () => {
  const summary = toQuoteFinancialSummary(calculateLegacyQuoteFinancials({
    materialSale: "1000.10",
    materialCost: "600.05",
    laborSale: "500.20",
    laborCost: "200.10",
    taxAmount: "120.02",
    estimatedDurationBusinessDays: 8
  }));

  assert.deepEqual(summary, {
    materialRevenue: 1000.1,
    laborRevenue: 500.2,
    serviceRevenue: 0,
    preTaxContractValue: 1500.3,
    taxAmount: 120.02,
    finalCustomerTotal: 1620.32,
    materialCost: 600.05,
    laborCost: 200.1,
    serviceCost: 0,
    totalEstimatedCost: 800.15,
    grossProfit: 700.15,
    grossMarginPercent: 46.67,
    markupPercent: 87.5,
    estimatedDurationBusinessDays: 8
  });
});

test("zero Legacy revenue and zero cost produce null percentages without division errors", () => {
  const empty = toQuoteFinancialSummary(calculateLegacyQuoteFinancials({
    materialSale: 0,
    materialCost: 0,
    laborSale: 0,
    laborCost: 0,
    taxAmount: 0,
    estimatedDurationBusinessDays: null
  }));
  assert.equal(empty.grossMarginPercent, null);
  assert.equal(empty.markupPercent, null);

  const zeroCost = toQuoteFinancialSummary(calculateLegacyQuoteFinancials({
    materialSale: 100,
    materialCost: 0,
    laborSale: 0,
    laborCost: 0,
    taxAmount: 10,
    estimatedDurationBusinessDays: null
  }));
  assert.equal(zeroCost.grossMarginPercent, 100);
  assert.equal(zeroCost.markupPercent, null);
  assert.equal(zeroCost.finalCustomerTotal, 110);
});

test("Pulse normalization separates product, labor, service, and line tax", () => {
  const summary = toQuoteFinancialSummary(calculatePulseQuoteFinancials([
    { itemType: "PRODUCT", quantity: 2, unitCost: 25, lineSubtotal: 100, lineTax: 5 },
    { itemType: "LABOR", quantity: 3, unitCost: 10, lineSubtotal: 90, lineTax: 0 },
    { itemType: "SERVICE", quantity: 1, unitCost: 20, lineSubtotal: 50, lineTax: 2.5 }
  ]));
  assert.equal(summary.preTaxContractValue, 240);
  assert.equal(summary.taxAmount, 7.5);
  assert.equal(summary.finalCustomerTotal, 247.5);
  assert.equal(summary.totalEstimatedCost, 100);
  assert.equal(summary.serviceRevenue, 50);
  assert.equal(summary.serviceCost, 20);
});
