import assert from "node:assert/strict";
import test from "node:test";
import { addClientContactSchema, addClientSiteSchema } from "@pulse/contracts/clients";
import { updateQuoteSchema } from "@pulse/contracts/work";
import {
  buildQuoteContactPayload,
  buildQuoteDetailsPayload,
  buildQuoteSitePayload,
  createBlankQuoteContactDraft,
  createBlankQuoteSiteDraft,
  validateQuoteContactDraft,
  validateQuoteDetailsDraft,
  validateQuoteSiteDraft
} from "./forms/quoteDetails";

test("quote details preserve unresolved relationships while saving editable fields", () => {
  const validation = validateQuoteDetailsDraft({
    title: "  Network   refresh ",
    contactId: "",
    siteId: "",
    assignedToId: "",
    dueDate: "2026-08-20",
    lifecycleDetails: "Coordinate after hours.",
    collaboratorIds: ["user-1", "user-1", "user-2"]
  });

  assert.deepEqual(validation.errors, {});
  assert.equal(validation.normalized.title, "Network refresh");
  assert.deepEqual(validation.normalized.collaboratorIds, ["user-1", "user-2"]);

  const payload = buildQuoteDetailsPayload(validation.normalized);
  assert.equal("contactId" in payload, false);
  assert.equal("siteId" in payload, false);
  assert.equal("assignedToId" in payload, false);
  assert.deepEqual(updateQuoteSchema.parse(payload).collaboratorIds, ["user-1", "user-2"]);
});

test("quote details omit unchanged fields and lifecycle activity", () => {
  const original = {
    title: "Network refresh",
    contactId: "contact-1",
    siteId: "site-1",
    assignedToId: "user-1",
    dueDate: "2026-08-20",
    lifecycleDetails: "Coordinate after hours.",
    collaboratorIds: ["user-2"]
  };

  assert.deepEqual(buildQuoteDetailsPayload(original, original), {});
  assert.deepEqual(buildQuoteDetailsPayload({ ...original, dueDate: "" }, original), { dueDate: null });
});

test("quote inline contact creation validates and builds a contract-safe payload", () => {
  const validation = validateQuoteContactDraft({
    ...createBlankQuoteContactDraft(),
    firstName: " Jane ",
    lastName: " Doe ",
    email: "JANE@example.com"
  });

  assert.deepEqual(validation.errors, {});
  assert.equal(validation.normalized.email, "jane@example.com");
  const payload = buildQuoteContactPayload(validation.normalized, true);
  assert.equal(addClientContactSchema.parse(payload).siteId, "");
});

test("quote inline site creation validates and builds a contract-safe payload", () => {
  const validation = validateQuoteSiteDraft({
    ...createBlankQuoteSiteDraft(),
    siteName: "  San Juan   HQ ",
    city: " San Juan "
  });

  assert.deepEqual(validation.errors, {});
  assert.equal(validation.normalized.siteName, "San Juan HQ");
  const payload = buildQuoteSitePayload(validation.normalized, false);
  assert.equal(addClientSiteSchema.parse(payload).localId, "");
});
