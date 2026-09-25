import assert from "node:assert/strict";
import test from "node:test";
import { assertQuoteCommercialEditable, hasQuoteCommercialChanges } from "./quoteLifecyclePolicy";

test("frozen commercial fields cannot bypass the sent lock while operational PATCH remains allowed", () => {
  assert.equal(hasQuoteCommercialChanges({ assignedToId: "owner", collaboratorIds: [], status: "Rejected" }), false);
  for (const input of [{ title: "Renamed" }, { clientId: "other" }, { contactId: null },
    { siteId: "other" }, { dueDate: null }, { lifecycleDetails: "" }, { trades: [] }]) {
    assert.equal(hasQuoteCommercialChanges(input), true);
  }
  assert.throws(() => assertQuoteCommercialEditable({ status: "Sent", sentAt: null }), /CONTENT_LOCKED/);
  assert.throws(() => assertQuoteCommercialEditable({ status: "Draft", sentAt: new Date() }), /CONTENT_LOCKED/);
  assert.throws(() => assertQuoteCommercialEditable({ status: "Cancelled", sentAt: null }), /CONTENT_LOCKED/);
  assert.doesNotThrow(() => assertQuoteCommercialEditable({ status: "Draft", sentAt: null }));
});
