import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildClientContactPayload,
  createBlankClientContactDraft,
  validateClientContactDraft
} from "./forms/clientContact";

describe("client contact form", () => {
  it("normalizes user-entered contact values before submission", () => {
    const result = validateClientContactDraft({
      ...createBlankClientContactDraft(),
      name: "  Ada   Lovelace ",
      email: " ADA@EXAMPLE.COM ",
      phone: " +1  (787) 555-0199 ",
      notes: "  Call after 3pm.  "
    });

    assert.deepEqual(result.errors, {});
    assert.equal(result.normalized.name, "Ada Lovelace");
    assert.equal(result.normalized.email, "ada@example.com");
    assert.equal(result.normalized.phone, "+1 (787) 555-0199");
    assert.equal(result.normalized.notes, "Call after 3pm.");
  });

  it("rejects malformed email, phone, and unsafe text", () => {
    const result = validateClientContactDraft({
      ...createBlankClientContactDraft(),
      name: "<script>",
      email: "not-an-email",
      phone: "call-me"
    });

    assert.equal(result.errors.name, "Remove HTML or script content.");
    assert.equal(result.errors.email, "Enter a valid email address.");
    assert.equal(result.errors.phone, "Enter a valid phone number.");
  });

  it("rejects digit strings longer than an international phone number", () => {
    const result = validateClientContactDraft({
      ...createBlankClientContactDraft(),
      name: "Ada Lovelace",
      phone: "12345678901234567890"
    });

    assert.equal(result.errors.phone, "Enter a valid phone number.");
  });

  it("allows a valid international number with an extension", () => {
    const result = validateClientContactDraft({
      ...createBlankClientContactDraft(),
      name: "Ada Lovelace",
      phone: "+1 (787) 555-0199 ext. 42"
    });

    assert.deepEqual(result.errors, {});
  });

  it("requires a name and at least one contact method", () => {
    const result = validateClientContactDraft(createBlankClientContactDraft());

    assert.equal(result.errors.name, "Point of Contact Name is required.");
    assert.equal(
      result.errors.email,
      "Provide an email or phone for this contact."
    );
  });

  it("builds synchronized contact flags for the API", () => {
    const payload = buildClientContactPayload(
      {
        ...createBlankClientContactDraft(),
        name: "Ada Lovelace",
        email: "ada@example.com"
      },
      {
        siteId: "site-1",
        primary: true,
        billing: true,
        technical: true
      }
    );

    assert.equal(payload.firstName, "Ada");
    assert.equal(payload.lastName, "Lovelace");
    assert.equal(payload.siteId, "site-1");
    assert.equal(payload.isPrimary, true);
    assert.equal(payload.isPrimaryContact, true);
    assert.equal(payload.isBilling, true);
    assert.equal(payload.isBillingContact, true);
    assert.equal(payload.isTechnicalContact, true);
  });
});
