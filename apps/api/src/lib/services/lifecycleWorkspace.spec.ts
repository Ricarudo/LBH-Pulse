import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBillingTotals,
  calculateProjectProgress
} from "@/lib/services/workService";

test("weighted project progress counts only done active task weight", () => {
  assert.deepEqual(
    calculateProjectProgress([
      { status: "DONE", weight: 3 },
      { status: "IN_PROGRESS", weight: 2 },
      { status: "BLOCKED", weight: 1 },
      { status: "DONE", weight: 20, archivedAt: new Date() }
    ]),
    {
      percent: 50,
      completedWeight: 3,
      totalWeight: 6,
      completedTasks: 1,
      totalTasks: 3
    }
  );
});

test("project progress is zero when there are no active tasks", () => {
  assert.equal(calculateProjectProgress([]).percent, 0);
});

test("billing totals treat invoices as milestones and exclude void records", () => {
  assert.deepEqual(
    calculateBillingTotals(10_000, [
      { status: "Draft", amount: 1_000 },
      { status: "Sent", amount: 2_000 },
      { status: "Paid", amount: 3_000 },
      { status: "Overdue", amount: 500 },
      { status: "Void", amount: 9_000 }
    ]),
    {
      planned: 6_500,
      invoiced: 5_500,
      paid: 3_000,
      outstanding: 2_500,
      remaining: 3_500
    }
  );
});

test("standalone billing has no project remaining value", () => {
  assert.equal(
    calculateBillingTotals(0, [{ status: "Draft", amount: 450 }], false).remaining,
    0
  );
});
