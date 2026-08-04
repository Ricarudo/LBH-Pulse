import assert from "node:assert/strict";
import test from "node:test";
import {
  clientIndustries,
  createClientSchema
} from "@pulse/contracts/clients";
import {
  buildQuickCreatePayload,
  createBlankQuickCreateForm,
  validateQuickCreateForm
} from "./forms/clientQuickCreate";

test("quick client creation builds a contract-valid primary site", () => {
  const { normalized, errors } = validateQuickCreateForm({
    ...createBlankQuickCreateForm(),
    clientName: "  Acme   Security  ",
    industry: clientIndustries[0],
    siteName: "  Main   Office ",
    addressLine1: "  100 Main Street  ",
    city: "  San Juan  ",
    contactName: "  Jane Doe ",
    contactEmail: "JANE@example.com"
  });

  assert.deepEqual(errors, {});
  assert.equal(normalized.clientName, "Acme Security");
  assert.equal(normalized.siteName, "Main Office");
  assert.equal(normalized.contactEmail, "jane@example.com");

  const payload = buildQuickCreatePayload(normalized);
  const parsed = createClientSchema.parse(payload);

  assert.equal(parsed.sites.length, 1);
  assert.equal(parsed.sites[0]?.siteName, "Main Office");
  assert.equal(parsed.sites[0]?.isPrimarySite, true);
  assert.equal(parsed.contacts[0]?.siteLocalId, "quick-create-site");
});

test("quick client creation rejects unsafe and invalid site input", () => {
  const { errors } = validateQuickCreateForm({
    ...createBlankQuickCreateForm(),
    clientName: "Acme Security",
    industry: clientIndustries[0],
    siteName: "<script>alert(1)</script>",
    siteType: "Invalid Site Type",
    addressLine1: "javascript:alert(1)"
  });

  assert.equal(errors.siteName, "Remove HTML or script content.");
  assert.equal(errors.siteType, "Select a valid site type.");
  assert.equal(errors.addressLine1, "Remove HTML or script content.");
});
