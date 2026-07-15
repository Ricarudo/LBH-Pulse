import assert from "node:assert/strict";
import test from "node:test";
import { createQuoteSchema, updateQuoteSchema } from "./work";

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
