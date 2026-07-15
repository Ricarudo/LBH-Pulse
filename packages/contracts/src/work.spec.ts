import assert from "node:assert/strict";
import test from "node:test";
import {
  createInvoiceSchema,
  createProjectInvoiceSchema,
  createProjectSchema,
  createQuoteSchema,
  updateInvoiceSchema,
  updateProjectSchema,
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
    contactId: "contact-1"
  });

  assert.equal(quote.clientId, "client-1");
  assert.equal(quote.contactId, "contact-1");
  assert.equal(quote.status, "Draft");
});

test("quote updates can select a different client contact", () => {
  const update = updateQuoteSchema.parse({ contactId: "contact-2" });

  assert.deepEqual(update, { contactId: "contact-2" });
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
