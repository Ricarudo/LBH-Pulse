import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, test } from "node:test";
import { toAuthenticatedUser, type AuthenticatedUser } from "@pulse/contracts/auth";
import { prisma } from "@/lib/db";
import { registerQuoteFamilyDraft, sendQuoteFamilyDraft, createQuoteFamilyRevision, acceptQuoteFamilyOffer, listQuoteFamilyProjections, getQuoteFamilyCurrentSummary, getQuoteFamilyVersion } from "@/lib/services/quoteFamilyService";
import { getQuoteById, replaceLegacyQuoteFinancials } from "@/lib/services/workService";

const enabled = process.env.PULSE_RUN_FAMILY_DB_TESTS === "1";
const key = () => randomUUID();
let actor: AuthenticatedUser;
before(async () => {
  if (!enabled) return;
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/pulse_lifecycle_family_test", "Family tests require the disposable family database with candidate SQL installed");
  const role = await prisma.accessRole.create({ data: {
    id: key(), name: "Family test role", normalizedName: key(),
    permissions: { create: ["quotes:read", "quotes:write", "projects:read", "projects:write"].map(permission => ({ permission })) }
  } });
  const user = await prisma.localUser.create({ data: { name: "Family tester", email: `${key()}@example.invalid`, role: role.id, passwordHash: "unused" } });
  actor = toAuthenticatedUser({ ...user, permissions: ["quotes:read", "quotes:write", "projects:read", "projects:write"] });
  await prisma.workspaceSettings.upsert({ where: { id: "default" }, create: { id: "default", timeZone: "America/Puerto_Rico" }, update: { timeZone: "America/Puerto_Rico" } });
});

async function fixture(mode: "LEGACY" | "PULSE" = "LEGACY") {
  const client = await prisma.client.create({ data: { clientNumber: key(), displayName: "Original client" } });
  const contact = await prisma.pointOfContact.create({ data: { ownerType: "Client", ownerId: client.id, clientId: client.id, name: "Original contact", firstName: "Original", lastName: "contact" } });
  const site = await prisma.clientSite.create({ data: { clientId: client.id, siteName: "Original site", addressLine1: "Original address" } });
  const context = await prisma.lifecycleContext.create({ data: { details: "Original scope" } });
  const quote = await prisma.quote.create({ data: {
    quoteNumber: `FAMILY-${key()}`, title: "Original offer", clientId: client.id, contactId: contact.id, siteId: site.id,
    assignedToId: actor.id, lifecycleContextId: context.id, calculationMode: mode, dueDate: new Date("2026-10-01"),
    legacyMaterialSale: mode === "LEGACY" ? "1000.00" : 0, legacyMaterialCost: mode === "LEGACY" ? "600.00" : 0,
    legacyTaxAmount: mode === "LEGACY" ? "100.00" : 0, total: "1100.00", proposalNotes: "Original proposal terms",
    ...(mode === "PULSE" ? { items: { create: { name: "Original line", itemType: "PRODUCT", quantity: "2.000", unitCost: "300.00", unitPrice: "500.00", lineSubtotal: "1000.00", lineTax: "100.00", lineTotal: "1100.00" } } } : {})
  } });
  const family = await registerQuoteFamilyDraft({ key: key(), quoteId: quote.id }, actor);
  return { ...family, quote, client, contact, site, context };
}
async function sendInput(familyId: string, quoteId: string) {
  const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
  const versions = await prisma.$queryRaw<Array<{ contentVersion: number }>>`SELECT "contentVersion" FROM pulse."QuoteVersion" WHERE "quoteId" = ${quoteId}`;
  return { key: key(), familyId, quoteId, expectedUpdatedAt: quote.updatedAt.toISOString(), expectedContentVersion: versions[0].contentVersion };
}
const revisionInput = (f: { familyId: string; quoteId: string }) => ({ ...f, key: key(), reason: "Client changed scope", origin: "CLIENT_REQUESTED" as const });
async function projection(familyId: string) {
  return (await listQuoteFamilyProjections()).find(family => family.id === familyId)!;
}

test("new-row revisions preserve the sent quote and clone frozen lines without repricing", { skip: !enabled }, async () => {
  const f = await fixture("PULSE");
  const send = await sendInput(f.familyId, f.quoteId);
  await sendQuoteFamilyDraft(send, actor);
  const original = await prisma.quote.findUniqueOrThrow({ where: { id: f.quoteId }, include: { items: true } });
  await prisma.client.update({ where: { id: f.client.id }, data: { displayName: "Current client" } });
  await prisma.pointOfContact.update({ where: { id: f.contact.id }, data: { name: "Current contact", firstName: "Current" } });
  await prisma.clientSite.update({ where: { id: f.site.id }, data: { siteName: "Current site" } });
  await prisma.lifecycleContext.update({ where: { id: f.context.id }, data: { details: "Later request/project scope" } });
  const frozen = await getQuoteById(f.quoteId);
  assert.equal(frozen.commercialSnapshot?.status, "FROZEN");
  assert.equal(frozen.clientName, "Original client");
  assert.equal(frozen.contact?.name, "Original contact");
  assert.equal(frozen.site?.siteName, "Original site");
  assert.equal(frozen.lifecycleContext.details, "Original scope");
  const canonical = await getQuoteFamilyVersion(f.familyId, f.quoteId);
  assert.equal(canonical.quote.clientName, "Original client");
  assert.ok(canonical.quote.commercialSnapshot?.snapshotId);
  const draft = await createQuoteFamilyRevision(revisionInput(f), actor);
  assert.notEqual(draft.quoteId, f.quoteId);
  assert.equal(draft.quoteNumber, `${f.quote.quoteNumber}R1`);
  const copied = await prisma.quote.findUniqueOrThrow({ where: { id: draft.quoteId }, include: { items: true, lifecycleContext: true } });
  assert.equal(copied.items.length, 1);
  assert.notEqual(copied.items[0].id, original.items[0].id);
  assert.equal(copied.items[0].unitPrice.toFixed(2), "500.00");
  assert.equal(copied.items[0].quantity.toFixed(3), "2.000");
  assert.equal(copied.clientName, "Original client");
  assert.equal(copied.lifecycleContext?.details, "Original scope");
  assert.notEqual(copied.lifecycleContextId, f.context.id);
  assert.equal(copied.dueDate, null);
  assert.equal(copied.sentAt, null);
  assert.equal(copied.currentStepId, null);
  assert.equal(copied.proposalPreparedAt, null);
  const draftView = await getQuoteFamilyVersion(f.familyId, draft.quoteId);
  assert.equal(draftView.quote.clientName, "Original client");
  assert.equal(draftView.quote.contact?.name, "Original contact");
  assert.equal(draftView.quote.site?.siteName, "Original site");
  assert.deepEqual(await prisma.quote.findUniqueOrThrow({ where: { id: f.quoteId }, include: { items: true } }), original);
  assert.equal((await projection(f.familyId)).pipelineValue, "1000.00");
  await assert.rejects(prisma.quote.update({ where: { id: f.quoteId }, data: { title: "Rewrite" } }), /immutable/);
  await assert.rejects(prisma.quoteItem.update({ where: { id: original.items[0].id }, data: { unitPrice: 1 } }), /immutable/);
  await sendQuoteFamilyDraft(await sendInput(f.familyId, draft.quoteId), actor);
  const resent = await getQuoteById(draft.quoteId);
  assert.equal(resent.clientName, "Original client");
  assert.equal(resent.contact?.name, "Original contact");
  assert.equal(resent.site?.siteName, "Original site");
});

test("pipeline changes only at replacement send; retries do not duplicate sends or handoff", { skip: !enabled }, async () => {
  const f = await fixture();
  await sendQuoteFamilyDraft(await sendInput(f.familyId, f.quoteId), actor);
  const draft = await createQuoteFamilyRevision(revisionInput(f), actor);
  await replaceLegacyQuoteFinancials(draft.quoteId, { materialSale: 1200, materialCost: 600, laborSale: 0, laborCost: 0, taxAmount: 120, estimatedDurationBusinessDays: null });
  assert.equal((await projection(f.familyId)).pipelineValue, "1000.00");
  const send = await sendInput(f.familyId, draft.quoteId);
  const sends = await Promise.all([sendQuoteFamilyDraft(send, actor), sendQuoteFamilyDraft(send, actor)]);
  assert.deepEqual(sends[0], sends[1]);
  const projected = await projection(f.familyId);
  assert.equal(projected.pipelineValue, "1200.00");
  assert.equal(projected.versions.find(v => v.quoteId === f.quoteId)?.outcome, "SUPERSEDED");
  await assert.rejects(acceptQuoteFamilyOffer({ key: key(), familyId: f.familyId, quoteId: f.quoteId }, actor), /OFFER_STALE/);
  const accept = { key: key(), familyId: f.familyId, quoteId: draft.quoteId };
  const results = await Promise.all([acceptQuoteFamilyOffer(accept, actor), acceptQuoteFamilyOffer(accept, actor)]);
  assert.deepEqual(results[0], results[1]);
  const project = await prisma.project.findUniqueOrThrow({ where: { id: results[0].projectId }, include: { lifecycleContext: true } });
  assert.equal(project.budget.toFixed(2), "1200.00");
  assert.equal(project.quoteId, draft.quoteId);
  assert.equal(project.lifecycleContext?.details, "Original scope");
  assert.equal(await prisma.project.count({ where: { quoteId: draft.quoteId } }), 1);
  assert.equal(await prisma.lifecycleStatusEvent.count({ where: { entityId: draft.quoteId, toStatus: "Sent" } }), 1);
  assert.equal(await prisma.lifecycleStatusEvent.count({ where: { entityId: draft.quoteId, toStatus: "Approved" } }), 1);
  assert.equal((await projection(f.familyId)).pipelineValue, null);
  await assert.rejects(createQuoteFamilyRevision(revisionInput({ familyId: f.familyId, quoteId: draft.quoteId }), actor), /FAMILY_CLOSED/);
});

test("concurrent revision attempts return one draft; reusing a retry key with changed content is rejected", { skip: !enabled }, async () => {
  const f = await fixture();
  await sendQuoteFamilyDraft(await sendInput(f.familyId, f.quoteId), actor);
  const input = revisionInput(f);
  const drafts = await Promise.all([createQuoteFamilyRevision(input, actor), createQuoteFamilyRevision({ ...input, key: key() }, actor), createQuoteFamilyRevision(input, actor)]);
  assert.equal(new Set(drafts.map(d => d.quoteId)).size, 1);
  assert.equal((await projection(f.familyId)).lastRevisionNumber, 1);
  await assert.rejects(createQuoteFamilyRevision({ ...input, reason: "Changed request" }, actor), /OPERATION_KEY_REUSED/);
});

test("Home and pipeline summaries count a family once across revision creation", { skip: !enabled }, async () => {
  const before = await getQuoteFamilyCurrentSummary();
  const f = await fixture();
  await sendQuoteFamilyDraft(await sendInput(f.familyId, f.quoteId), actor);
  await createQuoteFamilyRevision(revisionInput(f), actor);
  const after = await getQuoteFamilyCurrentSummary();
  assert.equal(after.open - before.open, 1);
  assert.equal(after.working - before.working, 1);
  assert.equal(after.awaitingResponse - before.awaitingResponse, 1);
  assert.equal(Number(after.pipelineValue) - Number(before.pipelineValue), 1000);
});

test("accepting the old offer and sending its replacement cannot both succeed", { skip: !enabled }, async () => {
  const f = await fixture();
  await sendQuoteFamilyDraft(await sendInput(f.familyId, f.quoteId), actor);
  const draft = await createQuoteFamilyRevision(revisionInput(f), actor);
  const send = await sendInput(f.familyId, draft.quoteId);
  const outcomes = await Promise.allSettled([
    acceptQuoteFamilyOffer({ key: key(), familyId: f.familyId, quoteId: f.quoteId }, actor),
    sendQuoteFamilyDraft(send, actor)
  ]);
  assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
  const rejected = outcomes.find(result => result.status === "rejected") as PromiseRejectedResult;
  assert.match(String(rejected.reason), /FAMILY_CLOSED|OFFER_STALE/);
  const state = await projection(f.familyId);
  if (state.outcome === "ACCEPTED") {
    assert.equal(state.acceptedQuoteId, f.quoteId);
    assert.equal(state.versions.find(v => v.quoteId === draft.quoteId)?.outcome, "DISCARDED");
  } else {
    assert.equal(state.currentOfferId, draft.quoteId);
    assert.equal(await prisma.project.count({ where: { quoteId: f.quoteId } }), 0);
  }
});

test("stale content and unresolved review block send without replacing the outstanding offer", { skip: !enabled }, async () => {
  const f = await fixture();
  const stale = await sendInput(f.familyId, f.quoteId);
  await prisma.lifecycleContext.update({ where: { id: f.context.id }, data: { details: "Updated scope" } });
  await assert.rejects(sendQuoteFamilyDraft(stale, actor), /QUOTE_STATE_CHANGED/);
  const rows = await prisma.$queryRaw<Array<{ contentVersion: number }>>`SELECT "contentVersion" FROM pulse."QuoteVersion" WHERE "quoteId" = ${f.quoteId}`;
  assert.ok(rows[0].contentVersion > stale.expectedContentVersion);
  assert.equal((await prisma.quote.findUniqueOrThrow({ where: { id: f.quoteId } })).status, "Draft");
  assert.equal(await prisma.lifecycleStatusEvent.count({ where: { entityId: f.quoteId, toStatus: "Sent" } }), 0);
  const noAccess = { ...actor, permissions: [] };
  await assert.rejects(sendQuoteFamilyDraft(await sendInput(f.familyId, f.quoteId), noAccess), /WRITE_FORBIDDEN/);
  const reviewer = await prisma.localUser.create({ data: { name: "Reviewer", email: `${key()}@example.invalid`, role: actor.role, passwordHash: "unused" } });
  const snapshotId = key();
  await prisma.$executeRaw`INSERT INTO pulse."QuoteContentSnapshot" (id, "quoteId", "contentVersion", "schemaVersion", payload, "createdByName") VALUES (${snapshotId}, ${f.quoteId}, ${rows[0].contentVersion}, 2, '{}'::jsonb, ${actor.name})`;
  await prisma.$executeRaw`INSERT INTO pulse."QuoteReview" (id, "quoteId", "contentVersion", "snapshotId", "submittedById", "reviewerId") VALUES (${key()}, ${f.quoteId}, ${rows[0].contentVersion}, ${snapshotId}, ${actor.id}, ${reviewer.id})`;
  await assert.rejects(sendQuoteFamilyDraft(await sendInput(f.familyId, f.quoteId), actor), /REVIEW_NOT_SUPPORTED/);
});

test("failed project handoff rolls back acceptance and its ledger event", { skip: !enabled }, async () => {
  const f = await fixture();
  await sendQuoteFamilyDraft(await sendInput(f.familyId, f.quoteId), actor);
  await assert.rejects(acceptQuoteFamilyOffer({ key: key(), familyId: f.familyId, quoteId: f.quoteId, projectId: "missing-project" }, actor), /PROJECT_NOT_FOUND/);
  assert.equal((await prisma.quote.findUniqueOrThrow({ where: { id: f.quoteId } })).status, "Sent");
  assert.equal((await projection(f.familyId)).outcome, null);
  assert.equal(await prisma.lifecycleStatusEvent.count({ where: { entityId: f.quoteId, toStatus: "Approved" } }), 0);
  assert.equal(await prisma.project.count({ where: { quoteId: f.quoteId } }), 0);
});

test("accepting an outstanding offer discards its draft atomically", { skip: !enabled }, async () => {
  const f = await fixture();
  await sendQuoteFamilyDraft(await sendInput(f.familyId, f.quoteId), actor);
  const draft = await createQuoteFamilyRevision(revisionInput(f), actor);
  await acceptQuoteFamilyOffer({ key: key(), familyId: f.familyId, quoteId: f.quoteId }, actor);
  const state = await projection(f.familyId);
  assert.equal(state.currentDraftId, null);
  assert.equal(state.acceptedQuoteId, f.quoteId);
  assert.equal(state.versions.find(v => v.quoteId === draft.quoteId)?.outcome, "DISCARDED");
  await assert.rejects(sendQuoteFamilyDraft(await sendInput(f.familyId, draft.quoteId), actor), /FAMILY_CLOSED/);
  await assert.rejects(prisma.quote.update({ where: { id: draft.quoteId }, data: { title: "Resurrect" } }), /immutable/);
});

test("pricing validity produces Needs Refresh without automatically closing or losing pipeline", { skip: !enabled }, async t => {
  const f = await fixture();
  await sendQuoteFamilyDraft(await sendInput(f.familyId, f.quoteId), actor);
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 32 * 86400000 });
  try {
    const state = await projection(f.familyId);
    assert.equal(state.needsRefresh, true);
    assert.equal(state.outcome, null);
    assert.equal(state.pipelineValue, "1000.00");
    await assert.rejects(acceptQuoteFamilyOffer({ key: key(), familyId: f.familyId, quoteId: f.quoteId }, actor), /OFFER_NOT_ACCEPTABLE/);
  } finally { t.mock.timers.reset(); }
});
