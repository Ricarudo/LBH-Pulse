/** Staged 0.2 command service. Deliberately not exposed by the legacy controller.
 * Requires quote-lifecycle-foundation.sql and coordinated family-aware readers.
 */
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import { defaultQuoteValidThrough, quoteFamilyPipelineVersion, quoteFamilyWorkCounts, quotePricingValidity, quoteRevisionOriginSchema, type QuoteFamilyOutcome, type QuotePublicationState } from "@pulse/contracts/quote-lifecycle";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { convertQuoteToProjectTransaction, quoteDetailInclude, quoteRevisionSnapshot, toQuoteDetailRecord } from "./workService";
import { projectQuoteSnapshot, quoteCommercialViewSchema } from "./quoteSnapshotService";

const id = z.string().trim().min(1).max(200);
const reason = z.string().trim().min(1).max(2000);
const command = z.object({ key: id });
const reviseSchema = command.extend({ familyId: id, quoteId: id, reason, origin: quoteRevisionOriginSchema });
const sendSchema = command.extend({ familyId: id, quoteId: id, expectedContentVersion: z.number().int().positive(), expectedUpdatedAt: z.iso.datetime(), validThrough: z.iso.date().optional() });
const acceptSchema = command.extend({ familyId: id, quoteId: id, projectId: id.optional(), startDate: z.iso.date().optional(), dueDate: z.iso.date().optional() });
type Result = { familyId: string; quoteId: string; quoteNumber: string; revisionNumber: number; projectId?: string };
type Family = { id: string; baseQuoteNumber: string; lastRevisionNumber: number; outcome: QuoteFamilyOutcome | null; currentDraftId: string | null; currentOfferId: string | null; acceptedQuoteId: string | null };
type Version = { quoteId: string; familyId: string; previousQuoteId: string | null; revisionNumber: number; contentVersion: number; publicationState: QuotePublicationState; outcome: QuoteFamilyOutcome | "SUPERSEDED" | "DISCARDED" | "CORRECTED" | null; frozenSnapshotId: string | null; validThrough: string | null; validityTimeZone: string | null; onHold: boolean };

const decimal = z.string().regex(/^-?\d+(\.\d+)?$/);
const nullableText = z.string().nullable();
const seedSchema = z.object({
  title: z.string(), clientId: nullableText, contactId: nullableText, siteId: nullableText, clientName: nullableText,
  calculationMode: z.enum(["PULSE", "LEGACY"]), total: decimal,
  legacyMaterialSale: decimal, legacyMaterialCost: decimal, legacyLaborSale: decimal, legacyLaborCost: decimal, legacyTaxAmount: decimal,
  legacyEstimatedDurationBusinessDays: z.number().int().nullable(),
  sourceRequestIdSnapshot: nullableText, requestNumberSnapshot: nullableText, requestTitleSnapshot: nullableText,
  requestTypeSnapshot: nullableText, serviceCategorySnapshot: nullableText, contactNameSnapshot: nullableText,
  contactEmailSnapshot: nullableText, contactPhoneSnapshot: nullableText, siteNameSnapshot: nullableText,
  siteAddressSnapshot: nullableText, citySnapshot: nullableText, stateSnapshot: nullableText,
  scopeDescriptionSnapshot: nullableText, internalNotesSnapshot: nullableText, proposalNotes: nullableText
});
const lineSeedSchema = z.object({
  sourceItemId: nullableText, section: z.string(), name: z.string(), description: nullableText,
  itemType: z.enum(["PRODUCT", "LABOR", "SERVICE"]), sku: nullableText, partNumber: nullableText,
  manufacturer: nullableText, brand: nullableText, quantity: decimal, unitOfMeasure: nullableText,
  unitCost: decimal, unitPrice: decimal, markupPercent: decimal, discountPercent: decimal,
  taxable: z.boolean(), imageUrl: nullableText, productUrl: nullableText,
  lineSubtotal: decimal, lineTax: decimal, lineTotal: decimal, sortOrder: z.number().int()
});
const copySchema = z.object({ quote: seedSchema, items: z.array(lineSeedSchema), lifecycleDetails: z.string() });

function json(value: unknown): Prisma.InputJsonObject { return JSON.parse(JSON.stringify(value)); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}

async function operation(action: string, input: { key: string }, actor: AuthenticatedUser, run: (tx: Prisma.TransactionClient, operationId: string) => Promise<Result>): Promise<Result> {
  if (!actor.permissions.includes("quotes:write")) throw new Error("QUOTE_FAMILY_WRITE_FORBIDDEN");
  const hash = createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");
  return prisma.$transaction(async tx => {
    // Serializes retries before either caller observes an absent operation row.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["quote-family", actor.id, action, input.key])}, 0))`;
    const previous = await tx.$queryRaw<Array<{ requestHash: string; result: Result }>>`
      SELECT "requestHash", result FROM pulse."QuoteOperation" WHERE "actorId" = ${actor.id} AND action = ${action} AND key = ${input.key}`;
    if (previous[0]) {
      if (previous[0].requestHash !== hash) throw new Error("QUOTE_OPERATION_KEY_REUSED");
      return previous[0].result;
    }
    const operationId = randomUUID();
    const result = await run(tx, operationId);
    await tx.$executeRaw`INSERT INTO pulse."QuoteOperation" (id, "actorId", action, key, "requestHash", result)
      VALUES (${operationId}, ${actor.id}, ${action}, ${input.key}, ${hash}, ${JSON.stringify(result)}::jsonb)`;
    return result;
  }, { timeout: 15000 });
}

async function familyLock(tx: Prisma.TransactionClient, familyId: string) {
  const rows = await tx.$queryRaw<Family[]>`SELECT * FROM pulse."QuoteFamily" WHERE id = ${familyId} FOR UPDATE`;
  if (!rows[0]) throw new Error("QUOTE_FAMILY_NOT_FOUND");
  if (rows[0].outcome) throw new Error("QUOTE_FAMILY_CLOSED");
  return rows[0];
}
async function versionFor(tx: Prisma.TransactionClient, familyId: string, quoteId: string) {
  const rows = await tx.$queryRaw<Version[]>`SELECT *, "validThrough"::text AS "validThrough" FROM pulse."QuoteVersion" WHERE "quoteId" = ${quoteId} AND "familyId" = ${familyId} FOR UPDATE`;
  if (!rows[0]) throw new Error("QUOTE_FAMILY_VERSION_NOT_FOUND");
  return rows[0];
}
async function quoteLock(tx: Prisma.TransactionClient, quoteId: string) {
  await tx.$queryRaw`SELECT id FROM pulse."Quote" WHERE id = ${quoteId} FOR UPDATE`;
  const quote = await tx.quote.findFirst({ where: { id: quoteId, archivedAt: null }, include: quoteDetailInclude });
  if (!quote) throw new Error("QUOTE_NOT_FOUND");
  return quote;
}
async function familyCommercialRecord(tx: Prisma.TransactionClient, quote: Awaited<ReturnType<typeof quoteLock>>, version: Version) {
  const record = toQuoteDetailRecord(quote);
  if (version.publicationState === "SENT") {
    const snapshots = await tx.$queryRaw<Array<{ payload: { commercial?: unknown } }>>`SELECT payload FROM pulse."QuoteContentSnapshot" WHERE id = ${version.frozenSnapshotId} AND "quoteId" = ${quote.id} AND "contentVersion" = ${version.contentVersion}`;
    if (!quoteCommercialViewSchema.safeParse(snapshots[0]?.payload.commercial).success || !quote.sentAt) throw new Error("QUOTE_FAMILY_COPY_EVIDENCE_UNAVAILABLE");
    const projected = projectQuoteSnapshot(record, [{
      id: version.frozenSnapshotId!, entityId: quote.id, changedAt: quote.sentAt,
      metadata: { quoteNumber: quote.quoteNumber, revisionNumber: quote.revisionNumber, versionSnapshot: snapshots[0].payload }
    }]);
    projected.commercialSnapshot = { status: "FROZEN", snapshotId: version.frozenSnapshotId!, capturedAt: quote.sentAt.toISOString() };
    return projected;
  }
  if (!version.previousQuoteId) return record;
  const sources = await tx.$queryRaw<Array<{ payload: { copy?: unknown; commercial?: unknown } }>>`
    SELECT s.payload FROM pulse."QuoteContentSnapshot" s JOIN pulse."QuoteVersion" v ON v."frozenSnapshotId" = s.id
      WHERE v."quoteId" = ${version.previousQuoteId} AND v."familyId" = ${version.familyId}`;
  const source = sources[0]?.payload;
  const copy = copySchema.parse(source?.copy);
  const captured = quoteCommercialViewSchema.parse(source?.commercial);
  // Keep inherited directory facts until an explicit link change. Merely editing
  // a master contact/site or sending the draft is not an instruction to refresh it.
  if (quote.clientId === copy.quote.clientId) record.clientName = captured.clientName;
  if (quote.contactId === copy.quote.contactId) record.contact = captured.contact;
  if (quote.siteId === copy.quote.siteId) record.site = captured.site;
  return record;
}
function resultFor(familyId: string, quote: { id: string; quoteNumber: string; revisionNumber: number }): Result {
  return { familyId, quoteId: quote.id, quoteNumber: quote.quoteNumber, revisionNumber: quote.revisionNumber };
}
function businessDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
async function event(tx: Prisma.TransactionClient, actor: AuthenticatedUser, operationId: string, familyId: string, quoteId: string, eventType: string, fromStatus: string | null, toStatus: string, extra: Prisma.InputJsonObject = {}, value?: string) {
  await tx.lifecycleStatusEvent.create({ data: {
    entityType: "QUOTE", entityId: quoteId, fromStatus, toStatus, changedAt: new Date(),
    actorUserId: actor.id, actorNameSnapshot: actor.name, valueSnapshot: value,
    source: "APPLICATION", precision: "EXACT", metadata: { ...extra, familyId, quoteId, operationId, eventType }
  } });
}

/** Only new draft enrollment is supported here. Historical backfill is a separate audited operation. */
export async function registerQuoteFamilyDraft(raw: { key: string; quoteId: string }, actor: AuthenticatedUser) {
  const input = command.extend({ quoteId: id }).parse(raw);
  return operation("family-register", input, actor, async (tx, operationId) => {
    const quote = await quoteLock(tx, input.quoteId);
    if (quote.status !== "Draft" || quote.sentAt || quote.revisionNumber !== 0 || quote.revisions.length || quote.project || quote.projectLink || quote.importBatchId || quote.externalQuoteNumber || quote.externalCreatedAt) throw new Error("QUOTE_FAMILY_ENROLLMENT_REQUIRES_NEW_DRAFT");
    const existing = await tx.$queryRaw<Array<{ familyId: string }>>`SELECT "familyId" FROM pulse."QuoteVersion" WHERE "quoteId" = ${quote.id}`;
    if (existing[0]) throw new Error("QUOTE_ALREADY_IN_FAMILY");
    const familyId = randomUUID();
    await tx.$executeRaw`INSERT INTO pulse."QuoteFamily" (id, "baseQuoteNumber", "sourceRequestId") VALUES (${familyId}, ${quote.quoteNumber}, ${quote.requests[0]?.id ?? null})`;
    await tx.$executeRaw`INSERT INTO pulse."QuoteVersion" ("quoteId", "familyId", "revisionNumber") VALUES (${quote.id}, ${familyId}, 0)`;
    await tx.$executeRaw`UPDATE pulse."QuoteFamily" SET "currentDraftId" = ${quote.id} WHERE id = ${familyId}`;
    await event(tx, actor, operationId, familyId, quote.id, "quote_family_created", null, "Draft");
    return resultFor(familyId, quote);
  });
}

export async function createQuoteFamilyRevision(raw: z.input<typeof reviseSchema>, actor: AuthenticatedUser) {
  const input = reviseSchema.parse(raw);
  return operation("family-revise", input, actor, async (tx, operationId) => {
    const family = await familyLock(tx, input.familyId);
    if (family.currentOfferId !== input.quoteId) throw new Error("QUOTE_FAMILY_OFFER_STALE");
    if (family.currentDraftId) return resultFor(family.id, await quoteLock(tx, family.currentDraftId));
    const source = await quoteLock(tx, input.quoteId);
    const version = await versionFor(tx, family.id, source.id);
    if (version.publicationState !== "SENT" || version.outcome || !version.frozenSnapshotId) throw new Error("QUOTE_FAMILY_OFFER_STALE");
    const snapshots = await tx.$queryRaw<Array<{ payload: { copy?: unknown } }>>`SELECT payload FROM pulse."QuoteContentSnapshot" WHERE id = ${version.frozenSnapshotId}`;
    const parsed = copySchema.safeParse(snapshots[0]?.payload.copy);
    if (!parsed.success) throw new Error("QUOTE_FAMILY_COPY_EVIDENCE_UNAVAILABLE");
    const copy = parsed.data;
    // Linked records are references, not a source for repricing or replacing frozen values.
    const context = await tx.lifecycleContext.create({ data: { details: copy.lifecycleDetails, updatedById: actor.id, updatedByNameSnapshot: actor.name } });
    const collaborators = source.lifecycleContext?.collaborators ?? [];
    if (collaborators.length) await tx.lifecycleCollaborator.createMany({ data: collaborators.map(c => ({ lifecycleContextId: context.id, userId: c.userId, addedById: actor.id })) });
    const revisionNumber = family.lastRevisionNumber + 1;
    const quote = await tx.quote.create({ data: {
      ...copy.quote, quoteNumber: `${family.baseQuoteNumber}R${revisionNumber}`, baseQuoteNumber: family.baseQuoteNumber,
      revisionNumber, versionCreatedAt: new Date(), status: "Draft", sentAt: null,
      lifecycleContextId: context.id, assignedToId: source.assignedToId, owner: source.owner,
      dueDate: null, proposalPreparedAt: null,
      items: { create: copy.items }
    } });
    await tx.$executeRaw`INSERT INTO pulse."QuoteVersion" ("quoteId", "familyId", "revisionNumber", "previousQuoteId", "revisionOrigin", "revisionReason")
      VALUES (${quote.id}, ${family.id}, ${revisionNumber}, ${source.id}, ${input.origin}, ${input.reason})`;
    await tx.$executeRaw`UPDATE pulse."QuoteFamily" SET "lastRevisionNumber" = ${revisionNumber}, "currentDraftId" = ${quote.id}, "updatedAt" = now() WHERE id = ${family.id}`;
    await event(tx, actor, operationId, family.id, quote.id, "quote_family_revision_created", null, "Draft", { previousQuoteId: source.id, revisionNumber, origin: input.origin, reason: input.reason });
    return resultFor(family.id, quote);
  });
}

export async function sendQuoteFamilyDraft(raw: z.input<typeof sendSchema>, actor: AuthenticatedUser) {
  const input = sendSchema.parse(raw);
  return operation("family-send", input, actor, async (tx, operationId) => {
    const family = await familyLock(tx, input.familyId);
    if (family.currentDraftId !== input.quoteId) throw new Error("QUOTE_FAMILY_DRAFT_STALE");
    const quote = await quoteLock(tx, input.quoteId);
    const version = await versionFor(tx, family.id, quote.id);
    if (version.publicationState !== "DRAFT" || version.outcome || quote.status !== "Draft" || version.onHold) throw new Error("QUOTE_FAMILY_SEND_NOT_READY");
    if (quote.updatedAt.toISOString() !== input.expectedUpdatedAt || version.contentVersion !== input.expectedContentVersion) throw new Error("QUOTE_STATE_CHANGED");
    const reviews = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM pulse."QuoteReview" WHERE "quoteId" = ${quote.id}`;
    if (reviews.length) throw new Error("QUOTE_FAMILY_REVIEW_NOT_SUPPORTED");
    if (!quote.clientId || !quote.contactId || !quote.siteId || !quote.assignedToId) throw new Error("QUOTE_FAMILY_RELATIONSHIPS_REQUIRED");
    const clients = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM pulse."Client" WHERE id = ${quote.clientId} AND "archivedAt" IS NULL FOR SHARE`;
    const contacts = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM pulse."PointOfContact" WHERE id = ${quote.contactId} AND "clientId" = ${quote.clientId} AND "ownerType" = 'Client' AND "ownerId" = ${quote.clientId} FOR SHARE`;
    const sites = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM pulse."ClientSite" WHERE id = ${quote.siteId} AND "clientId" = ${quote.clientId} FOR SHARE`;
    if (!clients.length || !contacts.length || !sites.length) throw new Error("WORK_CLIENT_MISMATCH");
    const assignee = await tx.localUser.findFirst({ where: { id: quote.assignedToId, active: true, accessRole: { archivedAt: null } } });
    if (!assignee) throw new Error("WORK_ASSIGNEE_INVALID");
    const settings = await tx.workspaceSettings.findUniqueOrThrow({ where: { id: "default" } });
    const sentAt = new Date();
    const today = businessDate(sentAt, settings.timeZone);
    const validThrough = input.validThrough ?? defaultQuoteValidThrough(today);
    if (quotePricingValidity(validThrough, today) !== "VALID") throw new Error("QUOTE_VALIDITY_IN_PAST");
    const updated = await tx.quote.update({ where: { id: quote.id }, data: { status: "Sent", sentAt, sentAtPrecision: "EXACT" }, include: quoteDetailInclude });
    const commercialRecord = await familyCommercialRecord(tx, updated, version);
    const snapshot = quoteRevisionSnapshot(updated, commercialRecord);
    const view = snapshot.commercial as Prisma.InputJsonObject;
    const savedContext = view.context as Prisma.InputJsonObject;
    const seed = seedSchema.parse(json({ ...updated,
      clientName: view.clientName, sourceRequestIdSnapshot: savedContext.sourceRequestId,
      requestNumberSnapshot: savedContext.requestNumber, requestTitleSnapshot: savedContext.requestTitle,
      requestTypeSnapshot: savedContext.requestType, serviceCategorySnapshot: savedContext.serviceCategory,
      contactNameSnapshot: commercialRecord.contact?.name ?? savedContext.contactName,
      contactEmailSnapshot: commercialRecord.contact?.email ?? savedContext.contactEmail,
      contactPhoneSnapshot: commercialRecord.contact?.phone ?? savedContext.contactPhone,
      siteNameSnapshot: commercialRecord.site?.siteName ?? savedContext.siteName,
      siteAddressSnapshot: commercialRecord.site?.address ?? savedContext.siteAddress,
      citySnapshot: commercialRecord.site?.city ?? savedContext.city, stateSnapshot: commercialRecord.site?.state ?? savedContext.state,
      scopeDescriptionSnapshot: view.lifecycleDetails
    }));
    const payload = { ...snapshot, copy: { quote: seed, items: updated.items.map(line => lineSeedSchema.parse(json(line))), lifecycleDetails: view.lifecycleDetails } };
    const snapshotId = randomUUID();
    await tx.$executeRaw`INSERT INTO pulse."QuoteContentSnapshot" (id, "quoteId", "contentVersion", "schemaVersion", payload, "createdById", "createdByName")
      VALUES (${snapshotId}, ${quote.id}, ${version.contentVersion}, 2, ${JSON.stringify(payload)}::jsonb, ${actor.id}, ${actor.name})`;
    if (family.currentOfferId) {
      await quoteLock(tx, family.currentOfferId);
      await tx.$executeRaw`UPDATE pulse."QuoteVersion" SET outcome = 'SUPERSEDED' WHERE "quoteId" = ${family.currentOfferId}`;
      await event(tx, actor, operationId, family.id, family.currentOfferId, "quote_family_offer_superseded", "Sent", "Superseded", { replacementQuoteId: quote.id });
    }
    await tx.$executeRaw`UPDATE pulse."QuoteVersion" SET "publicationState" = 'SENT', "sentAt" = ${sentAt}, "frozenSnapshotId" = ${snapshotId}, "validThrough" = ${validThrough}::date, "validityTimeZone" = ${settings.timeZone} WHERE "quoteId" = ${quote.id}`;
    await tx.$executeRaw`UPDATE pulse."QuoteFamily" SET "currentDraftId" = NULL, "currentOfferId" = ${quote.id}, "updatedAt" = now() WHERE id = ${family.id}`;
    const finances = snapshot.financialSummary as Prisma.InputJsonObject;
    await tx.lifecycleStatusEvent.create({ data: {
      entityType: "QUOTE", entityId: quote.id, fromStatus: "Draft", toStatus: "Sent", changedAt: sentAt,
      actorUserId: actor.id, actorNameSnapshot: actor.name, valueSnapshot: String(finances.preTaxContractValue),
      metadata: json({ familyId: family.id, quoteId: quote.id, operationId, eventType: "quote_family_sent", contentVersion: version.contentVersion, snapshotId, quoteNumber: quote.quoteNumber, revisionNumber: quote.revisionNumber, versionSnapshot: snapshot, validThrough, validityTimeZone: settings.timeZone })
    } });
    return resultFor(family.id, quote);
  });
}

export async function acceptQuoteFamilyOffer(raw: z.input<typeof acceptSchema>, actor: AuthenticatedUser) {
  const input = acceptSchema.parse(raw);
  if (!actor.permissions.includes("quotes:write") || !actor.permissions.includes("projects:write")) throw new Error("QUOTE_FAMILY_HANDOFF_FORBIDDEN");
  return operation("family-accept", input, actor, async (tx, operationId) => {
    const family = await familyLock(tx, input.familyId);
    if (family.currentOfferId !== input.quoteId) throw new Error("QUOTE_FAMILY_OFFER_STALE");
    const quote = await quoteLock(tx, input.quoteId);
    const version = await versionFor(tx, family.id, quote.id);
    if (version.publicationState !== "SENT" || version.outcome || !version.validityTimeZone || quotePricingValidity(version.validThrough, businessDate(new Date(), version.validityTimeZone)) !== "VALID") throw new Error("QUOTE_FAMILY_OFFER_NOT_ACCEPTABLE");
    if (quote.project || quote.projectLink) throw new Error("QUOTE_FAMILY_HANDOFF_EXISTS");
    const snapshots = await tx.$queryRaw<Array<{ payload: { copy?: unknown } }>>`SELECT payload FROM pulse."QuoteContentSnapshot" WHERE id = ${version.frozenSnapshotId}`;
    const copy = copySchema.parse(snapshots[0]?.payload.copy);
    if (input.startDate && input.dueDate && input.dueDate < input.startDate) throw new Error("QUOTE_FAMILY_HANDOFF_DATES_INVALID");
    const handoff = await convertQuoteToProjectTransaction(tx, quote.id, { startDate: input.startDate, dueDate: input.dueDate, projectId: input.projectId }, actor);
    if (!input.projectId) {
      const context = await tx.lifecycleContext.create({ data: { details: copy.lifecycleDetails, updatedById: actor.id, updatedByNameSnapshot: actor.name } });
      const collaborators = quote.lifecycleContext?.collaborators ?? [];
      if (collaborators.length) await tx.lifecycleCollaborator.createMany({ data: collaborators.map(c => ({ lifecycleContextId: context.id, userId: c.userId, addedById: actor.id })) });
      await tx.project.update({ where: { id: handoff.project.id }, data: {
        lifecycleContextId: context.id,
        quoteFinancialSnapshot: { ...json(handoff.project.quoteFinancialSnapshot), quoteContentSnapshotId: version.frozenSnapshotId }
      } });
    }
    const projectLink = await tx.projectQuote.findUniqueOrThrow({ where: { quoteId: quote.id } });
    await tx.projectQuote.update({ where: { id: projectLink.id }, data: { financialSnapshot: { ...json(projectLink.financialSnapshot), quoteContentSnapshotId: version.frozenSnapshotId } } });
    // Annotate the one acceptance event emitted by the existing atomic handoff.
    const accepted = await tx.lifecycleStatusEvent.findFirstOrThrow({ where: { entityType: "QUOTE", entityId: quote.id, toStatus: "Approved" }, orderBy: [{ changedAt: "desc" }, { id: "desc" }] });
    await tx.lifecycleStatusEvent.update({ where: { id: accepted.id }, data: { metadata: { ...json(accepted.metadata), familyId: family.id, quoteId: quote.id, snapshotId: version.frozenSnapshotId, operationId, eventType: "quote_family_accepted", projectId: handoff.project.id } } });
    if (family.currentDraftId) {
      await quoteLock(tx, family.currentDraftId);
      await tx.quote.update({ where: { id: family.currentDraftId }, data: { status: "Cancelled" } });
      await tx.$executeRaw`UPDATE pulse."QuoteVersion" SET outcome = 'DISCARDED' WHERE "quoteId" = ${family.currentDraftId}`;
      await tx.$executeRaw`UPDATE pulse."QuoteReview" SET decision = 'CANCELLED', "respondedAt" = now() WHERE "quoteId" = ${family.currentDraftId} AND decision = 'PENDING'`;
      await event(tx, actor, operationId, family.id, family.currentDraftId, "quote_family_draft_discarded", "Draft", "Discarded", { reason: "Outstanding offer accepted", acceptedQuoteId: quote.id });
    }
    await tx.$executeRaw`UPDATE pulse."QuoteVersion" SET outcome = 'ACCEPTED' WHERE "quoteId" = ${quote.id}`;
    await tx.$executeRaw`UPDATE pulse."QuoteFamily" SET outcome = 'ACCEPTED', "acceptedQuoteId" = ${quote.id}, "currentDraftId" = NULL, "currentOfferId" = NULL, "updatedAt" = now() WHERE id = ${family.id}`;
    return { ...resultFor(family.id, quote), projectId: handoff.project.id };
  });
}

/** Managed-family projection for reader integration and reconciliation, never mix with raw Quote counts. */
export async function listQuoteFamilyProjections() {
  return prisma.$transaction(async tx => {
    const families = await tx.$queryRaw<Family[]>`SELECT * FROM pulse."QuoteFamily" ORDER BY "createdAt", id`;
    const versions = await tx.$queryRaw<Version[]>`SELECT *, "validThrough"::text AS "validThrough" FROM pulse."QuoteVersion"`;
    const snapshots = await tx.$queryRaw<Array<{ id: string; payload: { financialSummary?: { preTaxContractValue?: unknown } } }>>`SELECT id, payload FROM pulse."QuoteContentSnapshot"`;
    const bySnapshot = new Map(snapshots.map(s => [s.id, s.payload]));
    const quotes = await tx.quote.findMany({ where: { id: { in: versions.map(v => v.quoteId) } }, include: quoteDetailInclude });
    const byId = new Map(quotes.map(q => [q.id, q]));
    return families.map(family => {
      const members = versions.filter(v => v.familyId === family.id).map(v => ({ ...v, id: v.quoteId }));
      const selected = quoteFamilyPipelineVersion(family, members);
      const quote = selected ? byId.get(selected.quoteId) : null;
      if (selected && !quote) throw new Error("QUOTE_FAMILY_POINTER_INVALID");
      const snapshot = selected?.publicationState === "SENT"
        ? bySnapshot.get(selected.frozenSnapshotId!)
        : quote ? quoteRevisionSnapshot(quote) : null;
      const value = snapshot ? (snapshot.financialSummary as { preTaxContractValue?: unknown })?.preTaxContractValue : null;
      if (selected && !decimal.safeParse(value).success) throw new Error("QUOTE_FAMILY_VALUE_EVIDENCE_UNAVAILABLE");
      return {
        ...family, versions: members,
        pipelineQuoteId: selected?.quoteId ?? null,
        pipelineValue: selected ? String(value) : null,
        needsRefresh: selected?.publicationState === "SENT" && selected.validityTimeZone
          ? quotePricingValidity(selected.validThrough, businessDate(new Date(), selected.validityTimeZone)) === "NEEDS_REFRESH" : false
      };
    });
  }, { isolationLevel: "RepeatableRead" });
}

/** Exact-version reader for the future family workspace; legacy GET remains separate. */
export async function getQuoteFamilyVersion(familyId: string, quoteId: string) {
  id.parse(familyId); id.parse(quoteId);
  return prisma.$transaction(async tx => {
    const versions = await tx.$queryRaw<Version[]>`SELECT *, "validThrough"::text AS "validThrough" FROM pulse."QuoteVersion" WHERE "quoteId" = ${quoteId} AND "familyId" = ${familyId}`;
    const version = versions[0];
    if (!version) throw new Error("QUOTE_FAMILY_VERSION_NOT_FOUND");
    const quote = await tx.quote.findFirst({ where: { id: quoteId, archivedAt: null }, include: quoteDetailInclude });
    if (!quote) throw new Error("QUOTE_NOT_FOUND");
    return { familyId, version, quote: await familyCommercialRecord(tx, quote, version) };
  }, { isolationLevel: "RepeatableRead" });
}

export async function getQuoteFamilyCurrentSummary() {
  const families = await listQuoteFamilyProjections();
  return {
    scope: "current" as const,
    ...quoteFamilyWorkCounts(families),
    pipelineValue: families.reduce((total, family) => total.plus(family.pipelineValue ?? 0), new Prisma.Decimal(0)).toFixed(2)
  };
}
