import assert from "node:assert/strict";
import test from "node:test";
import {
  createInvoiceSchema,
  createProjectInvoiceSchema,
  createProjectSchema,
  createProjectTaskSchema,
  createQuoteSchema,
  replaceLegacyQuoteFinancialsSchema,
  switchQuoteCalculationModeSchema,
  updateInvoiceSchema,
  updateProjectSchema,
  reorderProjectTasksSchema,
  updateQuoteSchema
} from "./work";

test("new quotes require a client profile point of contact", () => {
  const missingContact = createQuoteSchema.safeParse({
    title: "Network refresh",
    clientId: "client-1"
  });

  assert.equal(missingContact.success, false);

  const quote = createQuoteSchema.parse({
    title: "Network refresh",
    clientId: "client-1",
    contactId: "contact-1",
    calculationMode: "PULSE"
  });

  assert.equal(quote.clientId, "client-1");
  assert.equal(quote.contactId, "contact-1");
  assert.equal(quote.status, "Draft");
  assert.equal(quote.calculationMode, "PULSE");
});

test("quote updates can select a different client contact", () => {
  const update = updateQuoteSchema.parse({ contactId: "contact-2" });

  assert.deepEqual(update, { contactId: "contact-2" });
});

test("quote ownership is a linked user and legacy owner text is discarded", () => {
  const quote = createQuoteSchema.parse({
    title: "Network refresh",
    clientId: "client-1",
    contactId: "contact-1",
    calculationMode: "LEGACY",
    assignedToId: "user-1",
    owner: "Legacy text"
  });

  assert.equal(quote.assignedToId, "user-1");
  assert.equal("owner" in quote, false);
});

test("quote mutation contracts reject arbitrary totals and invalid Legacy values", () => {
  assert.equal(updateQuoteSchema.safeParse({ total: 500 }).success, false);
  assert.equal(createQuoteSchema.safeParse({
    title: "Manual total",
    clientId: "client-1",
    contactId: "contact-1",
    calculationMode: "LEGACY",
    total: 500
  }).success, false);
  assert.equal(replaceLegacyQuoteFinancialsSchema.safeParse({
    materialSale: -1,
    materialCost: 0,
    laborSale: 0,
    laborCost: 0,
    taxAmount: 0,
    estimatedDurationBusinessDays: 1
  }).success, false);
  assert.equal(replaceLegacyQuoteFinancialsSchema.safeParse({
    materialSale: 1,
    materialCost: 0,
    laborSale: 0,
    laborCost: 0,
    taxAmount: 0,
    estimatedDurationBusinessDays: 1.5
  }).success, false);
  assert.deepEqual(switchQuoteCalculationModeSchema.parse({
    calculationMode: "PULSE"
  }), { calculationMode: "PULSE", discardFinancialData: false });
});

test("projects use a user id for assignment", () => {
  const unassigned = createProjectSchema.parse({
    title: "Network refresh",
    clientId: "client-1",
    owner: "Legacy owner text"
  });
  const assigned = updateProjectSchema.parse({ assignedToId: "user-1" });
  const cleared = updateProjectSchema.parse({ assignedToId: "   " });

  assert.equal(unassigned.assignedToId, null);
  assert.equal("owner" in unassigned, false);
  assert.deepEqual(assigned, { assignedToId: "user-1" });
  assert.deepEqual(cleared, { assignedToId: null });
});

test("invoices use a user id for assignment", () => {
  const unassigned = createInvoiceSchema.parse({
    title: "Progress invoice",
    clientId: "client-1"
  });
  const assigned = updateInvoiceSchema.parse({ assignedToId: "user-2" });
  const inherited = createProjectInvoiceSchema.parse({});
  const explicitlyCleared = createProjectInvoiceSchema.parse({ assignedToId: "" });

  assert.equal(unassigned.assignedToId, null);
  assert.deepEqual(assigned, { assignedToId: "user-2" });
  assert.equal(inherited.assignedToId, undefined);
  assert.equal(explicitlyCleared.assignedToId, null);
});

test("project tasks validate relative weight and unique manual ordering", () => {
  const task = createProjectTaskSchema.parse({
    title: "Install racks",
    weight: 8,
    assignedToId: "tech-1"
  });
  assert.equal(task.status, "NOT_STARTED");
  assert.equal(task.weight, 8);
  assert.equal(
    reorderProjectTasksSchema.safeParse({ taskIds: ["task-1", "task-1"] }).success,
    false
  );
});
