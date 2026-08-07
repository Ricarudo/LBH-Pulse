import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateProjectFinancialSummary,
  parseQuoteVersionNumber
} from "@/lib/services/workService";
import type { ProjectExpenseRecord, ProjectQuoteSummary } from "@pulse/contracts/work";

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

describe("project financial summary", () => {
  const quote = (
    overrides: Partial<ProjectQuoteSummary> = {}
  ): ProjectQuoteSummary => ({
    linkId: "link-original",
    quoteId: "quote-original",
    quoteNumber: "QM260001",
    title: "Original scope",
    role: "ORIGINAL",
    sequence: 0,
    status: "Approved",
    calculationMode: "PULSE",
    approvedAt: "2026-08-07T12:00:00.000Z",
    salesPrice: 100_000,
    estimatedCost: 60_000,
    taxAmount: 11_500,
    finalCustomerTotal: 111_500,
    ...overrides
  });

  const expense = (id: string, amount: number): ProjectExpenseRecord => ({
    id,
    projectId: "project-1",
    occurredOn: "2026-08-07",
    category: "Materials",
    vendor: "Supplier",
    description: "Project cost",
    amount,
    receiptDocumentId: null,
    createdByName: "Pulse User",
    updatedByName: "Pulse User",
    createdAt: "2026-08-07T12:00:00.000Z",
    updatedAt: "2026-08-07T12:00:00.000Z"
  });

  it("adds only approved change orders and exposes cost overrun", () => {
    const summary = calculateProjectFinancialSummary([
      quote(),
      quote({
        linkId: "link-co-1",
        quoteId: "quote-co-1",
        quoteNumber: "QM260002",
        title: "Approved change",
        role: "CHANGE_ORDER",
        sequence: 1,
        salesPrice: 20_000,
        estimatedCost: 8_000,
        taxAmount: 2_300,
        finalCustomerTotal: 22_300
      }),
      quote({
        linkId: "link-co-2",
        quoteId: "quote-co-2",
        quoteNumber: "QM260003",
        title: "Draft change",
        role: "CHANGE_ORDER",
        sequence: 2,
        status: "Draft",
        approvedAt: "",
        salesPrice: 50_000,
        estimatedCost: 30_000
      })
    ], [expense("expense-1", 50_000), expense("expense-2", 25_000)]);

    assert.equal(summary.approvedSalesPrice, 120_000);
    assert.equal(summary.approvedEstimatedCost, 68_000);
    assert.equal(summary.currentExpense, 75_000);
    assert.equal(summary.plannedGrossProfit, 52_000);
    assert.equal(summary.remainingCostAllowance, -7_000);
    assert.equal(summary.costVariance, -7_000);
    assert.ok(summary.expenseBurnPercent && summary.expenseBurnPercent > 110);
  });
});
