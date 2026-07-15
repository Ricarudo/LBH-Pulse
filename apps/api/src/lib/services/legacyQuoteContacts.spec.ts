import assert from "node:assert/strict";
import test from "node:test";
import {
  contactNamesLikelySame,
  planLegacyQuoteContactReconciliation,
  type ExistingClientContactCandidate,
  type LegacyQuoteContactCandidate
} from "../legacyQuoteContacts";

const now = new Date("2026-07-14T12:00:00.000Z");

function quote(
  values: Partial<LegacyQuoteContactCandidate> & Pick<LegacyQuoteContactCandidate, "quoteId" | "contactName">
): LegacyQuoteContactCandidate {
  return {
    quoteId: values.quoteId,
    quoteNumber: values.quoteNumber ?? values.quoteId,
    clientId: values.clientId ?? "client-1",
    clientName: values.clientName ?? "Example client",
    contactName: values.contactName,
    contactEmail: values.contactEmail ?? null,
    contactPhone: values.contactPhone ?? null,
    updatedAt: values.updatedAt ?? now
  };
}

function contact(
  values: Partial<ExistingClientContactCandidate> & Pick<ExistingClientContactCandidate, "id" | "name">
): ExistingClientContactCandidate {
  const parts = values.name?.split(" ") ?? [];
  return {
    id: values.id,
    clientId: values.clientId ?? "client-1",
    name: values.name,
    firstName: values.firstName ?? parts[0] ?? "Unknown",
    lastName: values.lastName ?? parts.slice(1).join(" "),
    email: values.email ?? null,
    phone: values.phone ?? null,
    mobile: values.mobile ?? null
  };
}

test("recognizes legacy spelling and middle-name variants without equating different people", () => {
  assert.equal(contactNamesLikelySame("Matt Blumer", "Matt Blummer"), true);
  assert.equal(contactNamesLikelySame("Diego Rivera", "Diego L. Rivera Ortiz"), true);
  assert.equal(contactNamesLikelySame("R. Spencer", "Rajeem Spencer"), true);
  assert.equal(contactNamesLikelySame("John Hambleton", "Jose Russe"), false);
});

test("keeps different people at the same company separate when they share a phone", () => {
  const plan = planLegacyQuoteContactReconciliation([
    quote({
      quoteId: "quote-ankit",
      contactName: "Ankit Sharma",
      contactEmail: "ankit@example.com",
      contactPhone: "+44 33 1663 3570"
    }),
    quote({
      quoteId: "quote-ashutosh",
      contactName: "Ashutosh Gakkar",
      contactEmail: "ashutosh@example.com",
      contactPhone: "+44 33 1663 3570"
    })
  ], []);

  assert.equal(plan.newContacts.length, 2);
  assert.deepEqual(plan.newContacts.map((item) => item.name).sort(), [
    "Ankit Sharma",
    "Ashutosh Gakkar"
  ]);
});

test("groups spelling variants when the remaining identity evidence is compatible", () => {
  const plan = planLegacyQuoteContactReconciliation([
    quote({
      quoteId: "quote-1",
      contactName: "Matt Blumer",
      contactEmail: "mblumer@example.com",
      contactPhone: "901-240-5320"
    }),
    quote({
      quoteId: "quote-2",
      contactName: "Matt Blummer",
      contactEmail: "mblumer@example.com",
      contactPhone: "901-240-5319",
      updatedAt: new Date("2026-07-15T12:00:00.000Z")
    })
  ], []);

  assert.equal(plan.newContacts.length, 1);
  assert.deepEqual(plan.newContacts[0]?.quoteIds, ["quote-1", "quote-2"]);
  assert.equal(plan.newContacts[0]?.email, "mblumer@example.com");
});

test("repairs a missing at-sign only when a valid client email confirms it", () => {
  const plan = planLegacyQuoteContactReconciliation([
    quote({
      quoteId: "quote-valid-email",
      contactName: "ASG",
      contactEmail: "mercadoabierto@asg.pr.gov"
    }),
    quote({
      quoteId: "quote-email-typo",
      contactName: null,
      contactEmail: "mercadoabierto.asg.pr.gov"
    })
  ], []);

  assert.equal(plan.newContacts.length, 1);
  assert.equal(plan.newContacts[0]?.name, "ASG");
  assert.equal(plan.newContacts[0]?.email, "mercadoabierto@asg.pr.gov");
  assert.deepEqual(plan.newContacts[0]?.quoteIds, [
    "quote-email-typo",
    "quote-valid-email"
  ]);
});

test("uses two matching strong fields to correct a conflicting legacy name", () => {
  const plan = planLegacyQuoteContactReconciliation([
    quote({
      quoteId: "quote-conflict",
      contactName: "Amanda Toberer",
      contactEmail: "adam.emrick@servicepoint.com",
      contactPhone: "502.702.9576"
    })
  ], [
    contact({
      id: "adam",
      name: "Adam Emrick",
      email: "adam.emrick@servicepoint.com",
      phone: "502-702-9576"
    }),
    contact({
      id: "amanda",
      name: "Amanda Toberer",
      email: "amanda.toberer@servicepoint.com",
      phone: "502-555-0100"
    })
  ]);

  assert.equal(plan.existingLinks[0]?.contactId, "adam");
  assert.equal(plan.newContacts.length, 0);
  assert.equal(plan.unresolved.length, 0);
});

test("links a name-only typo to one compatible existing client contact", () => {
  const plan = planLegacyQuoteContactReconciliation([
    quote({ quoteId: "quote-janet", contactName: "Janet Santigo" })
  ], [
    contact({ id: "janet", name: "Janet Santiago", email: "janet@example.com" })
  ]);

  assert.equal(plan.existingLinks[0]?.contactId, "janet");
  assert.equal(plan.newContacts.length, 0);
});

test("does not guess when multiple existing contacts are equally plausible", () => {
  const plan = planLegacyQuoteContactReconciliation([
    quote({ quoteId: "quote-shared-name", contactName: "Alex Smith" })
  ], [
    contact({ id: "alex-1", name: "Alex Smith" }),
    contact({ id: "alex-2", name: "Alex Smith" })
  ]);

  assert.equal(plan.unresolved[0]?.reason, "ambiguous_existing_contact");
  assert.deepEqual(plan.unresolved[0]?.candidateContactIds, ["alex-1", "alex-2"]);
});

test("leaves a quote with no captured identity explicitly unresolved", () => {
  const plan = planLegacyQuoteContactReconciliation([
    quote({ quoteId: "quote-empty", contactName: null })
  ], []);

  assert.equal(plan.unresolved[0]?.reason, "missing_identity");
  assert.equal(plan.existingLinks.length, 0);
  assert.equal(plan.newContacts.length, 0);
});
