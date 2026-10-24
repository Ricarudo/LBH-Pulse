import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultQuoteValidThrough, quoteCommercialContentLocked, quoteFamilyPipelineVersion,
  quoteFamilyWinRate, quoteLifecycleGroup, quoteOutcomeFromLegacyStatus,
  quotePricingValidity, quoteStatusLabel, type QuoteFamilyProjection, type QuoteFamilyVersion
} from "./quote-lifecycle";
import { quoteFamilyWorkCounts } from "./quote-lifecycle";

test("legacy client approval is an accepted outcome, not an internal review state", () => {
  assert.equal(quoteStatusLabel("Approved"), "Accepted");
  assert.equal(quoteOutcomeFromLegacyStatus("Approved"), "ACCEPTED");
  assert.equal(quoteOutcomeFromLegacyStatus("Review"), null);
  assert.equal(quoteOutcomeFromLegacyStatus("constructor"), null);
  assert.equal(quoteLifecycleGroup("Review"), "working");
  assert.equal(quoteLifecycleGroup("On Hold"), "working");
  assert.equal(quoteLifecycleGroup("Sent"), "awaiting-response");
  for (const status of ["Approved", "Rejected", "Cancelled", "Expired"]) {
    assert.equal(quoteLifecycleGroup(status), "closed");
    assert.equal(quoteCommercialContentLocked({ status }), true);
  }
  assert.equal(quoteCommercialContentLocked({ status: "Draft", sentAt: "2026-09-25T12:00:00Z" }), true);
  assert.equal(quoteCommercialContentLocked({ status: "Draft", sentAt: null }), false);
});

test("validity ends after the valid-through business date without closing an opportunity", () => {
  assert.equal(defaultQuoteValidThrough("2026-09-25"), "2026-10-25");
  assert.equal(defaultQuoteValidThrough("2028-02-01"), "2028-03-02");
  assert.equal(quotePricingValidity("2026-10-25", "2026-10-25"), "VALID");
  assert.equal(quotePricingValidity("2026-10-25", "2026-10-26"), "NEEDS_REFRESH");
  assert.equal(quotePricingValidity(null, "2026-10-26"), "UNSPECIFIED");
  assert.throws(() => defaultQuoteValidThrough("2026-02-30"));
  assert.throws(() => defaultQuoteValidThrough("2026-09-25", -1));
  assert.throws(() => quotePricingValidity("not-a-date", "2026-10-26"));
});

test("a replacement draft does not inflate pipeline or replace the outstanding offer", () => {
  const offer = { id: "q0", familyId: "family", publicationState: "SENT", outcome: null, value: "1000.00" } satisfies QuoteFamilyVersion & { value: string };
  const draft = { id: "q1", familyId: "family", publicationState: "DRAFT", outcome: null, value: "1200.00" } satisfies QuoteFamilyVersion & { value: string };
  const family: QuoteFamilyProjection = { id: "family", outcome: null, currentOfferId: "q0", currentDraftId: "q1" };
  assert.equal(quoteFamilyPipelineVersion(family, [offer, draft])?.value, "1000.00");
  assert.equal(quoteFamilyPipelineVersion({ ...family, currentOfferId: null }, [draft])?.value, "1200.00");
  assert.equal(quoteFamilyPipelineVersion({ ...family, currentOfferId: "q1", currentDraftId: null }, [
    { ...offer, outcome: "SUPERSEDED" }, { ...draft, publicationState: "SENT" }
  ])?.value, "1200.00");
  assert.equal(quoteFamilyPipelineVersion({ ...family, outcome: "ACCEPTED" }, [offer, draft]), null);
  assert.throws(() => quoteFamilyPipelineVersion(family, [draft]), /POINTER_INVALID/);
  assert.throws(() => quoteFamilyPipelineVersion(family, [{ ...offer, familyId: "other" }]), /POINTER_INVALID/);
  assert.throws(() => quoteFamilyPipelineVersion(family, [offer, offer]), /POINTER_INVALID/);
});

test("win rate counts one family decision and excludes cancellations and open families", () => {
  assert.equal(quoteFamilyWinRate([
    { id: "win", outcome: "ACCEPTED" }, { id: "loss", outcome: "REJECTED" },
    { id: "expired", outcome: "EXPIRED" }, { id: "cancelled", outcome: "CANCELLED" },
    { id: "open", outcome: null }
  ]), 1 / 3);
  assert.equal(quoteFamilyWinRate([{ id: "cancelled", outcome: "CANCELLED" }]), null);
  assert.throws(() => quoteFamilyWinRate([{ id: "same", outcome: "ACCEPTED" }, { id: "same", outcome: "ACCEPTED" }]), /DUPLICATE/);
});

test("Home counts an offer and its draft once while retaining both work categories", () => {
  const family = { id: "family", outcome: null, currentOfferId: "q0", currentDraftId: "q1", needsRefresh: true };
  assert.deepEqual(quoteFamilyWorkCounts([family]), { open: 1, working: 1, awaitingResponse: 1, needsRefresh: 1 });
  assert.deepEqual(quoteFamilyWorkCounts([{ ...family, outcome: "ACCEPTED", currentOfferId: null, currentDraftId: null }]), { open: 0, working: 0, awaitingResponse: 0, needsRefresh: 0 });
  assert.throws(() => quoteFamilyWorkCounts([family, family]), /DUPLICATE/);
});
