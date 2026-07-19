import { createHash, randomUUID } from "node:crypto";
import { LifecycleEntityType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  normalizeCsvText,
  parseExactCsv,
  stringifyCsv
} from "@/lib/importers/csvImportUtils";
import {
  legacyQuoteCsvHeaders,
  legacyQuoteCsvTemplate,
  type LegacyQuoteCsvHeader as Header,
  type LegacyQuoteCsvRow as Row
} from "@/lib/importers/legacyQuoteCsv";
import type { BulkImporter, UploadedCsv } from "@/lib/importers/types";
import type {
  BulkImportCommitResult,
  BulkImportCommitSelection,
  BulkImportFieldDiff,
  BulkImportPreview,
  BulkImportPreviewRow,
  BulkImportRowStatus
} from "@pulse/contracts/bulk-import";
import { quoteStatuses } from "@pulse/contracts/work";

type SanitizedRow = { rowNumber: number; row: Row; errors: string[] };

const fieldMeta: Record<Header, { label: string; group: string }> = {
  external_quote_number: { label: "External quote number", group: "Quote" },
  title: { label: "Title", group: "Quote" },
  client_number: { label: "Client number", group: "Relationships" },
  client_name: { label: "Client name", group: "Relationships" },
  contact_name: { label: "Contact name", group: "Relationships" },
  contact_email: { label: "Contact email", group: "Relationships" },
  status: { label: "Status", group: "Quote" },
  owner_email: { label: "Owner email", group: "Relationships" },
  material_sale: { label: "Material sale", group: "Financials" },
  material_cost: { label: "Material cost", group: "Financials" },
  labor_sale: { label: "Labor sale", group: "Financials" },
  labor_cost: { label: "Labor cost", group: "Financials" },
  tax_amount: { label: "Tax amount", group: "Financials" },
  estimated_duration_business_days: { label: "Estimated duration", group: "Financials" },
  created_at: { label: "Created at", group: "Lifecycle" },
  sent_at: { label: "Sent at", group: "Lifecycle" },
  approved_at: { label: "Approved at", group: "Lifecycle" },
  scope_description: { label: "Scope description", group: "Notes" },
  internal_notes: { label: "Internal notes", group: "Notes" },
  proposal_notes: { label: "Proposal notes", group: "Notes" }
};

const moneyFields: Header[] = [
  "material_sale", "material_cost", "labor_sale", "labor_cost", "tax_amount"
];
const dateFields: Header[] = ["created_at", "sent_at", "approved_at"];
const maxLengths: Partial<Record<Header, number>> = {
  external_quote_number: 100,
  title: 200,
  client_number: 40,
  client_name: 160,
  contact_name: 160,
  contact_email: 254,
  status: 40,
  owner_email: 254,
  scope_description: 5000,
  internal_notes: 5000,
  proposal_notes: 10000
};

function identity(value: string) {
  return normalizeCsvText(value, true).toLocaleLowerCase("en-US");
}

function money(value: string) {
  if (!value) return null;
  const normalized = value.replace(/[$,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed <= 9_999_999_999 ? parsed : null;
}

function date(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function cleanDate(value: string) {
  return date(value)?.toISOString() ?? value;
}

function cleanMoney(value: string) {
  const parsed = money(value);
  return parsed === null ? value : parsed.toFixed(2);
}

function sanitize(parsed: ReturnType<typeof parseExactCsv<Header>>): SanitizedRow[] {
  return parsed.map(({ rowNumber, row: raw, structuralError }) => {
    const row = Object.fromEntries(legacyQuoteCsvHeaders.map((header) => [header, ""])) as Row;
    const errors = structuralError ? [structuralError] : [];
    for (const header of legacyQuoteCsvHeaders) {
      const value = normalizeCsvText(raw[header], !["scope_description", "internal_notes", "proposal_notes"].includes(header));
      row[header] = moneyFields.includes(header) ? cleanMoney(value) : dateFields.includes(header) ? cleanDate(value) : value;
      const max = maxLengths[header];
      if (max && value.length > max) errors.push(`${fieldMeta[header].label} must be ${max} characters or less.`);
      if (/[<>]|javascript\s*:/i.test(value)) errors.push(`${fieldMeta[header].label} contains unsupported HTML or script content.`);
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) errors.push(`${fieldMeta[header].label} contains unsupported control characters.`);
    }
    if (!row.external_quote_number) errors.push("External quote number is required.");
    if (row.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.contact_email)) errors.push("Contact email is invalid.");
    if (row.owner_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.owner_email)) errors.push("Owner email is invalid.");
    if (row.status && !quoteStatuses.includes(row.status as (typeof quoteStatuses)[number])) errors.push("Status is not an allowed quote status.");
    for (const header of moneyFields) if (row[header] && money(row[header]) === null) errors.push(`${fieldMeta[header].label} must be a non-negative amount with no more than two decimals.`);
    if (row.estimated_duration_business_days && (!/^\d+$/.test(row.estimated_duration_business_days) || Number(row.estimated_duration_business_days) > 100000)) errors.push("Estimated duration must be a whole number from 0 to 100,000.");
    for (const header of dateFields) if (row[header] && !date(row[header])) errors.push(`${fieldMeta[header].label} must be a valid date.`);
    const created = date(row.created_at);
    const sent = date(row.sent_at);
    const approved = date(row.approved_at);
    if (created && sent && sent < created) errors.push("Sent at cannot be earlier than created at.");
    if (sent && approved && approved < sent) errors.push("Approved at cannot be earlier than sent at.");
    return { rowNumber, row, errors: Array.from(new Set(errors)) };
  });
}

const quoteSelect = {
  id: true,
  quoteNumber: true,
  externalQuoteNumber: true,
  title: true,
  status: true,
  calculationMode: true,
  clientId: true,
  clientName: true,
  contactId: true,
  assignedToId: true,
  owner: true,
  legacyMaterialSale: true,
  legacyMaterialCost: true,
  legacyLaborSale: true,
  legacyLaborCost: true,
  legacyTaxAmount: true,
  legacyEstimatedDurationBusinessDays: true,
  externalCreatedAt: true,
  externalSentAt: true,
  externalApprovedAt: true,
  contactNameSnapshot: true,
  contactEmailSnapshot: true,
  scopeDescriptionSnapshot: true,
  internalNotesSnapshot: true,
  proposalNotes: true,
  importBatchId: true,
  archivedAt: true,
  updatedAt: true,
  project: { select: { id: true } },
  client: { select: { clientNumber: true, displayName: true } },
  assignedTo: { select: { email: true } }
} satisfies Prisma.QuoteSelect;

type Quote = Prisma.QuoteGetPayload<{ select: typeof quoteSelect }>;
type Client = Prisma.ClientGetPayload<{ include: { contacts: true } }>;

function currentRow(quote: Quote): Row {
  return {
    external_quote_number: quote.externalQuoteNumber ?? quote.quoteNumber,
    title: quote.title,
    client_number: quote.client?.clientNumber ?? "",
    client_name: quote.client?.displayName ?? quote.clientName ?? "",
    contact_name: quote.contactNameSnapshot ?? "",
    contact_email: quote.contactEmailSnapshot ?? "",
    status: quote.status,
    owner_email: quote.assignedTo?.email ?? "",
    material_sale: Number(quote.legacyMaterialSale).toFixed(2),
    material_cost: Number(quote.legacyMaterialCost).toFixed(2),
    labor_sale: Number(quote.legacyLaborSale).toFixed(2),
    labor_cost: Number(quote.legacyLaborCost).toFixed(2),
    tax_amount: Number(quote.legacyTaxAmount).toFixed(2),
    estimated_duration_business_days: quote.legacyEstimatedDurationBusinessDays?.toString() ?? "",
    created_at: quote.externalCreatedAt?.toISOString() ?? "",
    sent_at: quote.externalSentAt?.toISOString() ?? "",
    approved_at: quote.externalApprovedAt?.toISOString() ?? "",
    scope_description: quote.scopeDescriptionSnapshot ?? "",
    internal_notes: quote.internalNotesSnapshot ?? "",
    proposal_notes: quote.proposalNotes ?? ""
  };
}

function diffs(row: Row, current?: Row): BulkImportFieldDiff[] {
  return legacyQuoteCsvHeaders
    .filter((field) => field !== "external_quote_number")
    .map((field) => ({
      field,
      label: fieldMeta[field].label,
      group: fieldMeta[field].group,
      current: current?.[field] ?? "",
      incoming: row[field],
      changed: Boolean(row[field]) && row[field] !== (current?.[field] ?? "")
    }));
}

async function buildPreview(file: UploadedCsv) {
  if (!file?.buffer) throw new Error("BULK_IMPORT_FILE_REQUIRED");
  if (!file.originalname.toLocaleLowerCase("en-US").endsWith(".csv")) throw new Error("BULK_IMPORT_FILE_TYPE");
  const sanitized = sanitize(parseExactCsv(file.buffer, legacyQuoteCsvHeaders));
  const [quotes, clients, users] = await Promise.all([
    prisma.quote.findMany({
      where: {
        OR: [
          { externalQuoteNumber: { not: null } },
          { calculationMode: "LEGACY" }
        ]
      },
      select: quoteSelect
    }),
    prisma.client.findMany({ include: { contacts: true } }),
    prisma.localUser.findMany({ where: { active: true }, select: { id: true, email: true, name: true } })
  ]);
  const quoteByExternal = new Map<string, Quote>();
  for (const quote of quotes) {
    quoteByExternal.set(identity(quote.externalQuoteNumber ?? ""), quote);
    quoteByExternal.set(identity(quote.quoteNumber), quote);
  }
  const clientsByNumber = new Map(clients.map((client) => [identity(client.clientNumber), client]));
  const clientsByName = new Map<string, Client[]>();
  for (const client of clients) for (const name of [client.displayName, client.legalName ?? ""]) {
    const key = identity(name);
    if (key) clientsByName.set(key, [...(clientsByName.get(key) ?? []), client]);
  }
  const usersByEmail = new Map(users.map((user) => [identity(user.email), user]));
  const duplicateExternal = new Set(
    sanitized
      .filter((item, index, all) => all.some((other, otherIndex) => otherIndex !== index && identity(other.row.external_quote_number) === identity(item.row.external_quote_number)))
      .map((item) => item.rowNumber)
  );
  const resolved = new Map<number, { client?: Client; contactId?: string; assignedToId?: string; assignedToName?: string }>();
  const rows: BulkImportPreviewRow[] = sanitized.map((item) => {
    const errors = [...item.errors];
    const matchedBy: string[] = [];
    const clientCandidates = new Map<string, Client>();
    if (item.row.client_number) {
      const client = clientsByNumber.get(identity(item.row.client_number));
      if (client) { clientCandidates.set(client.id, client); matchedBy.push("Client number"); }
      else errors.push("The supplied client number does not exist.");
    }
    if (item.row.client_name) {
      const matches = clientsByName.get(identity(item.row.client_name)) ?? [];
      matches.forEach((client) => clientCandidates.set(client.id, client));
      if (matches.length) matchedBy.push("Client name");
    }
    const client = clientCandidates.size === 1 ? Array.from(clientCandidates.values())[0] : undefined;
    if (clientCandidates.size > 1) errors.push("Client number and name match different or ambiguous client records.");
    let contactId: string | undefined;
    if (item.row.contact_email && client) {
      const contacts = client.contacts.filter((contact) => identity(contact.email ?? "") === identity(item.row.contact_email));
      if (contacts.length === 1) { contactId = contacts[0].id; matchedBy.push("Contact email"); }
      else if (contacts.length > 1) errors.push("Contact email matches more than one client contact.");
    }
    let assignedToId: string | undefined;
    let assignedToName: string | undefined;
    if (item.row.owner_email) {
      const assignedTo = usersByEmail.get(identity(item.row.owner_email));
      assignedToId = assignedTo?.id;
      assignedToName = assignedTo?.name;
      if (!assignedToId) errors.push("Owner email does not match an active Pulse user.");
      else matchedBy.push("Owner email");
    }
    const target = quoteByExternal.get(identity(item.row.external_quote_number));
    if (target) matchedBy.unshift("External quote number");
    if (!target && !item.row.title) errors.push("Title is required for a new legacy quote.");
    if (target?.clientId && (item.row.client_number || item.row.client_name) && !client) {
      errors.push("The supplied client values do not resolve to an existing client.");
    }
    let status: BulkImportRowStatus;
    if (errors.length) status = "invalid";
    else if (duplicateExternal.has(item.rowNumber)) { status = "conflict"; errors.push("This file contains the external quote number more than once."); }
    else if (target && (target.calculationMode !== "LEGACY" || !target.importBatchId || target.project || target.archivedAt)) { status = "conflict"; errors.push("This external number belongs to a quote that cannot be updated by the legacy importer."); }
    else if (target) status = diffs(item.row, currentRow(target)).some((diff) => diff.changed) ? "changed" : "unchanged";
    else status = "new";
    resolved.set(item.rowNumber, { client, contactId, assignedToId, assignedToName });
    return {
      rowNumber: item.rowNumber,
      status,
      displayName: item.row.title || `Row ${item.rowNumber}`,
      targetId: target?.id,
      targetNumber: target?.quoteNumber,
      expectedUpdatedAt: target?.updatedAt.toISOString(),
      matchedBy,
      errors: Array.from(new Set(errors)),
      candidates: target ? [{ id: target.id, recordNumber: target.quoteNumber, displayName: target.title, archived: Boolean(target.archivedAt) }] : [],
      diffs: diffs(item.row, target ? currentRow(target) : undefined)
    };
  });
  const summary: Record<BulkImportRowStatus, number> = { new: 0, changed: 0, unchanged: 0, conflict: 0, invalid: 0 };
  rows.forEach((row) => { summary[row.status] += 1; });
  const preview: BulkImportPreview = {
    fileName: file.originalname,
    fileDigest: createHash("sha256").update(file.buffer).digest("hex"),
    summary,
    rows
  };
  return { preview, sanitized: new Map(sanitized.map((item) => [item.rowNumber, item.row])), resolved };
}

function nullable(value: string) { return value || null; }
function amount(row: Row, field: Header, fallback = 0) { return money(row[field]) ?? fallback; }
function total(row: Row, current?: Quote) {
  return amount(row, "material_sale", Number(current?.legacyMaterialSale ?? 0)) +
    amount(row, "labor_sale", Number(current?.legacyLaborSale ?? 0)) +
    amount(row, "tax_amount", Number(current?.legacyTaxAmount ?? 0));
}

async function commit(
  file: UploadedCsv,
  fileDigest: string,
  selections: BulkImportCommitSelection[],
  user: Parameters<BulkImporter["commit"]>[3]
): Promise<BulkImportCommitResult> {
  if (!Array.isArray(selections) || !selections.length) throw new Error("BULK_IMPORT_EMPTY_SELECTION");
  const rebuilt = await buildPreview(file);
  if (rebuilt.preview.fileDigest !== fileDigest) throw new Error("BULK_IMPORT_PREVIEW_STALE");
  const seen = new Set<number>();
  for (const selection of selections) {
    const previewRow = rebuilt.preview.rows.find((row) => row.rowNumber === selection.rowNumber);
    if (seen.has(selection.rowNumber) || !previewRow ||
      !((selection.action === "create" && previewRow.status === "new") || (selection.action === "update" && previewRow.status === "changed")) ||
      selection.targetId !== previewRow.targetId || selection.expectedUpdatedAt !== previewRow.expectedUpdatedAt) {
      throw new Error("BULK_IMPORT_PREVIEW_STALE");
    }
    seen.add(selection.rowNumber);
  }
  const batchId = randomUUID();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pulse-number:quote'))`;
      const year = new Date().getUTCFullYear();
      const existingNumbers = await tx.quote.findMany({ select: { quoteNumber: true } });
      let next = existingNumbers.reduce((max, quote) => {
        const match = new RegExp(`^QT-${year}-(\\d+)$`).exec(quote.quoteNumber);
        return Math.max(max, match ? Number(match[1]) : 1000);
      }, Math.max(1000, existingNumbers.length + 1000));
      const result: BulkImportCommitResult = { batchId, created: 0, updated: 0, records: [] };
      for (const selection of selections) {
        const row = rebuilt.sanitized.get(selection.rowNumber);
        const relation = rebuilt.resolved.get(selection.rowNumber);
        if (!row || !relation) throw new Error("BULK_IMPORT_PREVIEW_STALE");
        if (selection.action === "create") {
          next += 1;
          const quoteNumber = `QT-${year}-${String(next).padStart(4, "0")}`;
          const createdAt = date(row.created_at) ?? new Date();
          const lifecycle = await tx.lifecycleContext.create({ data: { details: row.internal_notes, updatedById: user.id, updatedByNameSnapshot: user.name } });
          const created = await tx.quote.create({
            data: {
              quoteNumber, baseQuoteNumber: quoteNumber, revisionNumber: 0, versionCreatedAt: createdAt,
              title: row.title, clientId: relation.client?.id, contactId: relation.contactId,
              assignedToId: relation.assignedToId, lifecycleContextId: lifecycle.id,
              clientName: relation.client?.displayName ?? nullable(row.client_name),
              owner: relation.assignedToName ?? "Unassigned",
              status: row.status || "Draft", calculationMode: "LEGACY", total: total(row),
              legacyMaterialSale: amount(row, "material_sale"), legacyMaterialCost: amount(row, "material_cost"),
              legacyLaborSale: amount(row, "labor_sale"), legacyLaborCost: amount(row, "labor_cost"),
              legacyTaxAmount: amount(row, "tax_amount"),
              legacyEstimatedDurationBusinessDays: row.estimated_duration_business_days ? Number(row.estimated_duration_business_days) : null,
              externalQuoteNumber: row.external_quote_number, importBatchId: batchId,
              externalCreatedAt: date(row.created_at), externalSentAt: date(row.sent_at), externalApprovedAt: date(row.approved_at),
              sentAt: date(row.sent_at), sentAtPrecision: row.sent_at ? "EXACT" : undefined,
              contactNameSnapshot: nullable(row.contact_name), contactEmailSnapshot: nullable(row.contact_email),
              scopeDescriptionSnapshot: nullable(row.scope_description), internalNotesSnapshot: nullable(row.internal_notes),
              proposalNotes: nullable(row.proposal_notes), proposalPreparedAt: date(row.sent_at)
            }
          });
          await tx.lifecycleStatusEvent.create({ data: {
            entityType: LifecycleEntityType.QUOTE, entityId: created.id, toStatus: created.status,
            changedAt: date(row.approved_at) ?? date(row.sent_at) ?? createdAt,
            actorUserId: user.id, actorNameSnapshot: user.name,
            valueSnapshot: amount(row, "material_sale") + amount(row, "labor_sale"),
            metadata: { eventType: "legacy_quote_imported", importBatchId: batchId, externalQuoteNumber: row.external_quote_number },
            source: "IMPORT", precision: "EXACT"
          } });
          result.created += 1;
          result.records.push({ id: created.id, recordNumber: created.quoteNumber, displayName: created.title, action: "created", href: `/quotes/${created.id}` });
        } else {
          const current = await tx.quote.findUnique({ where: { id: selection.targetId }, select: quoteSelect });
          if (!current || current.updatedAt.toISOString() !== selection.expectedUpdatedAt || current.calculationMode !== "LEGACY" || !current.importBatchId || current.project || current.archivedAt) throw new Error("BULK_IMPORT_PREVIEW_STALE");
          const priorStatus = current.status;
          const updated = await tx.quote.update({ where: { id: current.id }, data: {
            ...(row.title ? { title: row.title } : {}), ...(row.status ? { status: row.status } : {}),
            ...(relation.client ? { clientId: relation.client.id, clientName: relation.client.displayName } : row.client_name ? { clientName: row.client_name } : {}),
            ...(relation.contactId ? { contactId: relation.contactId } : {}), ...(relation.assignedToId ? { assignedToId: relation.assignedToId, owner: relation.assignedToName } : {}),
            ...(row.material_sale ? { legacyMaterialSale: amount(row, "material_sale") } : {}),
            ...(row.material_cost ? { legacyMaterialCost: amount(row, "material_cost") } : {}),
            ...(row.labor_sale ? { legacyLaborSale: amount(row, "labor_sale") } : {}),
            ...(row.labor_cost ? { legacyLaborCost: amount(row, "labor_cost") } : {}),
            ...(row.tax_amount ? { legacyTaxAmount: amount(row, "tax_amount") } : {}),
            ...(row.estimated_duration_business_days ? { legacyEstimatedDurationBusinessDays: Number(row.estimated_duration_business_days) } : {}),
            total: total(row, current), importBatchId: batchId,
            ...(row.created_at ? { externalCreatedAt: date(row.created_at) } : {}),
            ...(row.sent_at ? { externalSentAt: date(row.sent_at), sentAt: date(row.sent_at), sentAtPrecision: "EXACT" as const } : {}),
            ...(row.approved_at ? { externalApprovedAt: date(row.approved_at) } : {}),
            ...(row.contact_name ? { contactNameSnapshot: row.contact_name } : {}), ...(row.contact_email ? { contactEmailSnapshot: row.contact_email } : {}),
            ...(row.scope_description ? { scopeDescriptionSnapshot: row.scope_description } : {}), ...(row.internal_notes ? { internalNotesSnapshot: row.internal_notes } : {}),
            ...(row.proposal_notes ? { proposalNotes: row.proposal_notes } : {})
          } });
          if (priorStatus !== updated.status) await tx.lifecycleStatusEvent.create({ data: {
            entityType: LifecycleEntityType.QUOTE, entityId: updated.id, fromStatus: priorStatus, toStatus: updated.status,
            changedAt: date(row.approved_at) ?? date(row.sent_at) ?? new Date(), actorUserId: user.id, actorNameSnapshot: user.name,
            valueSnapshot: Number(updated.legacyMaterialSale) + Number(updated.legacyLaborSale),
            metadata: { eventType: "legacy_quote_import_updated", importBatchId: batchId }, source: "IMPORT", precision: "EXACT"
          } });
          result.updated += 1;
          result.records.push({ id: updated.id, recordNumber: updated.quoteNumber, displayName: updated.title, action: "updated", href: `/quotes/${updated.id}` });
        }
      }
      await tx.activity.create({ data: {
        relatedEntityType: "QuoteImport", relatedEntityId: batchId, actorUserId: user.id,
        actorName: user.name, actorRole: user.roleLabel, type: "Imported", title: "Legacy quote CSV import completed",
        detail: `${result.created} created and ${result.updated} updated.`,
        metadata: { fileName: file.originalname, fileDigest, selectedRows: selections.map((selection) => selection.rowNumber) }
      } });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw new Error("BULK_IMPORT_PREVIEW_STALE");
    throw error;
  }
}

export const legacyQuoteImporter: BulkImporter = {
  key: "legacy-quotes",
  readPermission: "quotes:read",
  writePermission: "quotes:write",
  templateFileName: "pulse-legacy-quote-import-template.csv",
  exportFileName: (dateValue) => `pulse-legacy-quotes-${dateValue}.csv`,
  template: legacyQuoteCsvTemplate,
  export: async () => stringifyCsv(legacyQuoteCsvHeaders, (await prisma.quote.findMany({
    where: { calculationMode: "LEGACY", archivedAt: null }, select: quoteSelect, orderBy: { createdAt: "asc" }
  })).map(currentRow)),
  preview: async (file) => (await buildPreview(file)).preview,
  commit
};
