import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  normalizeCsvText,
  parseExactCsv,
  stringifyCsv
} from "@/lib/importers/csvImportUtils";
import {
  itemCsvHeaders,
  itemCsvTemplate,
  type ItemCsvHeader as Header,
  type ItemCsvRow as Row
} from "@/lib/importers/itemCsv";
import type { BulkImporter, UploadedCsv } from "@/lib/importers/types";
import type {
  BulkImportCommitResult,
  BulkImportCommitSelection,
  BulkImportFieldDiff,
  BulkImportPreview,
  BulkImportPreviewRow,
  BulkImportRowStatus
} from "@pulse/contracts/bulk-import";
import { itemStatuses, itemTypes } from "@pulse/contracts/items";

type SanitizedRow = { rowNumber: number; row: Row; errors: string[] };

const fieldMeta: Record<Header, { label: string; group: string }> = {
  sku: { label: "SKU", group: "Identity" },
  part_number: { label: "Part number", group: "Identity" },
  name: { label: "Name", group: "Item" },
  description: { label: "Description", group: "Item" },
  item_type: { label: "Item type", group: "Item" },
  status: { label: "Status", group: "Item" },
  manufacturer: { label: "Manufacturer", group: "Catalog" },
  brand: { label: "Brand", group: "Catalog" },
  category: { label: "Category", group: "Catalog" },
  subcategory: { label: "Subcategory", group: "Catalog" },
  unit_of_measure: { label: "Unit of measure", group: "Pricing" },
  cost: { label: "Cost", group: "Pricing" },
  sell_price: { label: "Sell price", group: "Pricing" },
  markup_percent: { label: "Markup percent", group: "Pricing" },
  taxable: { label: "Taxable", group: "Pricing" },
  primary_image_url: { label: "Primary image URL", group: "Links" },
  product_url: { label: "Product URL", group: "Links" },
  datasheet_url: { label: "Datasheet URL", group: "Links" },
  quote_description: { label: "Quote description", group: "Notes" },
  internal_notes: { label: "Internal notes", group: "Notes" }
};

const maxLengths: Partial<Record<Header, number>> = {
  sku: 120,
  part_number: 120,
  name: 200,
  description: 2_000,
  manufacturer: 160,
  brand: 160,
  category: 120,
  subcategory: 120,
  unit_of_measure: 40,
  primary_image_url: 2_048,
  product_url: 2_048,
  datasheet_url: 2_048,
  quote_description: 2_000,
  internal_notes: 4_000
};
const moneyFields: Header[] = ["cost", "sell_price"];
const urlFields: Header[] = ["primary_image_url", "product_url", "datasheet_url"];

const itemSelect = {
  id: true,
  name: true,
  description: true,
  itemType: true,
  status: true,
  sku: true,
  partNumber: true,
  manufacturer: true,
  brand: true,
  category: true,
  subcategory: true,
  unitOfMeasure: true,
  cost: true,
  sellPrice: true,
  markupPercent: true,
  taxable: true,
  primaryImageUrl: true,
  productUrl: true,
  datasheetUrl: true,
  quoteDescription: true,
  internalNotes: true,
  updatedAt: true
} satisfies Prisma.ItemSelect;

type Item = Prisma.ItemGetPayload<{ select: typeof itemSelect }>;

function identity(value: string) {
  return normalizeCsvText(value, true).toLocaleLowerCase("en-US");
}

function decimal(value: string, maximum: number) {
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed <= maximum ? parsed : null;
}

function boolean(value: string) {
  if (["true", "yes", "1"].includes(value.toLowerCase())) return true;
  if (["false", "no", "0"].includes(value.toLowerCase())) return false;
  return null;
}

function normalizeUrl(value: string) {
  if (!value) return "";
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(candidate);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) throw new Error("INVALID_URL");
  url.hash = "";
  return url.toString();
}

export function sanitizeItemCsv(
  parsed: ReturnType<typeof parseExactCsv<Header>>
): SanitizedRow[] {
  return parsed.map(({ rowNumber, row: raw, structuralError }) => {
    const row = Object.fromEntries(itemCsvHeaders.map((header) => [header, ""])) as Row;
    const errors = structuralError ? [structuralError] : [];
    for (const header of itemCsvHeaders) {
      const collapseSpaces = !["description", "quote_description", "internal_notes"].includes(header);
      let value = normalizeCsvText(raw[header], collapseSpaces);
      if (urlFields.includes(header) && value) {
        try {
          value = normalizeUrl(value);
        } catch {
          errors.push(`${fieldMeta[header].label} must be a valid HTTP or HTTPS URL.`);
        }
      }
      row[header] = value;
      const maximum = maxLengths[header];
      if (maximum && value.length > maximum) errors.push(`${fieldMeta[header].label} must be ${maximum} characters or less.`);
      if (/[<>]|javascript\s*:/i.test(value)) errors.push(`${fieldMeta[header].label} contains unsupported HTML or script content.`);
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) errors.push(`${fieldMeta[header].label} contains unsupported control characters.`);
    }

    if (!row.name) errors.push("Item name is required.");
    if (row.item_type && !itemTypes.includes(row.item_type as (typeof itemTypes)[number])) errors.push("Item type is not allowed.");
    if (row.status && !itemStatuses.includes(row.status as (typeof itemStatuses)[number])) errors.push("Item status is not allowed.");
    for (const field of moneyFields) {
      if (row[field] && decimal(row[field], 9_999_999_999) === null) errors.push(`${fieldMeta[field].label} must be a non-negative amount with no more than two decimals.`);
    }
    if (row.markup_percent && decimal(row.markup_percent, 9_999) === null) errors.push("Markup percent must be between 0 and 9,999 with no more than two decimals.");
    if (row.taxable && boolean(row.taxable) === null) errors.push("Taxable must be true or false.");
    if (row.taxable) row.taxable = String(boolean(row.taxable));
    return { rowNumber, row, errors: Array.from(new Set(errors)) };
  });
}

function currentRow(item: Item): Row {
  return {
    sku: item.sku ?? "",
    part_number: item.partNumber ?? "",
    name: item.name,
    description: item.description ?? "",
    item_type: item.itemType,
    status: item.status,
    manufacturer: item.manufacturer ?? "",
    brand: item.brand ?? "",
    category: item.category ?? "",
    subcategory: item.subcategory ?? "",
    unit_of_measure: item.unitOfMeasure ?? "",
    cost: Number(item.cost).toFixed(2),
    sell_price: Number(item.sellPrice).toFixed(2),
    markup_percent: Number(item.markupPercent).toFixed(2),
    taxable: String(item.taxable),
    primary_image_url: item.primaryImageUrl ?? "",
    product_url: item.productUrl ?? "",
    datasheet_url: item.datasheetUrl ?? "",
    quote_description: item.quoteDescription ?? "",
    internal_notes: item.internalNotes ?? ""
  };
}

function newRow(row: Row): Row {
  return {
    ...row,
    item_type: row.item_type || "PRODUCT",
    status: row.status || "ACTIVE",
    unit_of_measure: row.unit_of_measure || "each",
    cost: row.cost || "0.00",
    sell_price: row.sell_price || "0.00",
    markup_percent: row.markup_percent || "0.00",
    taxable: row.taxable || "true"
  };
}

function diffs(row: Row, current?: Row): BulkImportFieldDiff[] {
  const incoming = current ? row : newRow(row);
  return itemCsvHeaders.map((field) => ({
    field,
    label: fieldMeta[field].label,
    group: fieldMeta[field].group,
    current: current?.[field] ?? "",
    incoming: incoming[field],
    changed: current ? Boolean(row[field]) && row[field] !== current[field] : Boolean(incoming[field])
  }));
}

function identityKeys(row: Pick<Row, "sku" | "part_number" | "manufacturer" | "name">) {
  const sku = identity(row.sku);
  const part = identity(row.part_number);
  const manufacturer = identity(row.manufacturer);
  if (sku || part) {
    return [
      sku ? `sku:${sku}` : "",
      part ? `part:${part}` : "",
      part && manufacturer ? `manufacturer-part:${manufacturer}:${part}` : ""
    ].filter(Boolean);
  }
  return row.name ? [`name:${identity(row.name)}`] : [];
}

function itemCandidates(row: Row, items: Item[]) {
  const keys = new Set(identityKeys(row));
  return items.filter((item) => identityKeys(currentRow(item)).some((key) => keys.has(key)));
}

function duplicateRows(rows: SanitizedRow[]) {
  const indexes = new Map<string, number[]>();
  for (const item of rows) {
    for (const key of identityKeys(item.row)) indexes.set(key, [...(indexes.get(key) ?? []), item.rowNumber]);
  }
  return new Set(Array.from(indexes.values()).filter((values) => values.length > 1).flat());
}

async function buildPreview(file: UploadedCsv) {
  if (!file?.buffer) throw new Error("BULK_IMPORT_FILE_REQUIRED");
  if (!file.originalname.toLocaleLowerCase("en-US").endsWith(".csv")) throw new Error("BULK_IMPORT_FILE_TYPE");
  const sanitized = sanitizeItemCsv(parseExactCsv(file.buffer, itemCsvHeaders));
  const duplicates = duplicateRows(sanitized);
  const items = await prisma.item.findMany({ select: itemSelect, orderBy: { createdAt: "asc" } });
  const rows: BulkImportPreviewRow[] = sanitized.map((entry) => {
    const errors = [...entry.errors];
    const candidates = itemCandidates(entry.row, items);
    const target = candidates.length === 1 ? candidates[0] : undefined;
    let status: BulkImportRowStatus;
    if (errors.length) status = "invalid";
    else if (duplicates.has(entry.rowNumber)) {
      status = "conflict";
      errors.push("This file contains another row with the same SKU, part number, or fallback name.");
    } else if (candidates.length > 1) {
      status = "conflict";
      errors.push("The item identity matches more than one existing catalog record.");
    } else if (target) status = diffs(entry.row, currentRow(target)).some((diff) => diff.changed) ? "changed" : "unchanged";
    else status = "new";

    return {
      rowNumber: entry.rowNumber,
      status,
      displayName: entry.row.name || `Row ${entry.rowNumber}`,
      targetId: target?.id,
      targetNumber: target?.sku ?? target?.partNumber ?? undefined,
      expectedUpdatedAt: target?.updatedAt.toISOString(),
      matchedBy: target ? identityKeys(entry.row).filter((key) => identityKeys(currentRow(target)).includes(key)).map((key) => key.split(":", 1)[0].replace("manufacturer-part", "manufacturer + part number")) : [],
      errors: Array.from(new Set(errors)),
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        recordNumber: candidate.sku ?? candidate.partNumber ?? candidate.id,
        displayName: candidate.name,
        archived: candidate.status === "INACTIVE"
      })),
      diffs: diffs(entry.row, target ? currentRow(target) : undefined)
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
  return { preview, sanitized: new Map(sanitized.map((entry) => [entry.rowNumber, entry.row])) };
}

function nullable(value: string) { return value || null; }

function createData(row: Row): Prisma.ItemUncheckedCreateInput {
  const value = newRow(row);
  return {
    name: value.name,
    description: nullable(value.description),
    itemType: value.item_type as Prisma.ItemUncheckedCreateInput["itemType"],
    status: value.status as Prisma.ItemUncheckedCreateInput["status"],
    sku: nullable(value.sku),
    partNumber: nullable(value.part_number),
    manufacturer: nullable(value.manufacturer),
    brand: nullable(value.brand),
    category: nullable(value.category),
    subcategory: nullable(value.subcategory),
    unitOfMeasure: nullable(value.unit_of_measure),
    cost: Number(value.cost),
    sellPrice: Number(value.sell_price),
    markupPercent: Number(value.markup_percent),
    taxable: boolean(value.taxable) ?? true,
    primaryImageUrl: nullable(value.primary_image_url),
    productUrl: nullable(value.product_url),
    datasheetUrl: nullable(value.datasheet_url),
    quoteDescription: nullable(value.quote_description),
    internalNotes: nullable(value.internal_notes)
  };
}

function updateData(row: Row): Prisma.ItemUncheckedUpdateInput {
  return {
    ...(row.name ? { name: row.name } : {}),
    ...(row.description ? { description: row.description } : {}),
    ...(row.item_type ? { itemType: row.item_type as Prisma.ItemUncheckedUpdateInput["itemType"] } : {}),
    ...(row.status ? { status: row.status as Prisma.ItemUncheckedUpdateInput["status"] } : {}),
    ...(row.sku ? { sku: row.sku } : {}),
    ...(row.part_number ? { partNumber: row.part_number } : {}),
    ...(row.manufacturer ? { manufacturer: row.manufacturer } : {}),
    ...(row.brand ? { brand: row.brand } : {}),
    ...(row.category ? { category: row.category } : {}),
    ...(row.subcategory ? { subcategory: row.subcategory } : {}),
    ...(row.unit_of_measure ? { unitOfMeasure: row.unit_of_measure } : {}),
    ...(row.cost ? { cost: Number(row.cost) } : {}),
    ...(row.sell_price ? { sellPrice: Number(row.sell_price) } : {}),
    ...(row.markup_percent ? { markupPercent: Number(row.markup_percent) } : {}),
    ...(row.taxable ? { taxable: boolean(row.taxable) ?? true } : {}),
    ...(row.primary_image_url ? { primaryImageUrl: row.primary_image_url } : {}),
    ...(row.product_url ? { productUrl: row.product_url } : {}),
    ...(row.datasheet_url ? { datasheetUrl: row.datasheet_url } : {}),
    ...(row.quote_description ? { quoteDescription: row.quote_description } : {}),
    ...(row.internal_notes ? { internalNotes: row.internal_notes } : {})
  };
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
    const row = rebuilt.preview.rows.find((candidate) => candidate.rowNumber === selection.rowNumber);
    if (seen.has(selection.rowNumber) || !row ||
      !((selection.action === "create" && row.status === "new") || (selection.action === "update" && row.status === "changed")) ||
      selection.targetId !== row.targetId || selection.expectedUpdatedAt !== row.expectedUpdatedAt) {
      throw new Error("BULK_IMPORT_PREVIEW_STALE");
    }
    seen.add(selection.rowNumber);
  }

  const batchId = randomUUID();
  try {
    return await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pulse-import:items'))`;
      const knownItems = await transaction.item.findMany({ select: itemSelect, orderBy: { createdAt: "asc" } });
      const result: BulkImportCommitResult = { batchId, created: 0, updated: 0, records: [] };
      for (const selection of selections) {
        const row = rebuilt.sanitized.get(selection.rowNumber);
        if (!row) throw new Error("BULK_IMPORT_PREVIEW_STALE");
        if (selection.action === "create") {
          if (itemCandidates(row, knownItems).length) throw new Error("BULK_IMPORT_PREVIEW_STALE");
          const created = await transaction.item.create({ data: createData(row), select: itemSelect });
          await transaction.itemPriceHistory.create({ data: {
            itemId: created.id,
            previousCost: null,
            newCost: created.cost,
            previousSellPrice: null,
            newSellPrice: created.sellPrice,
            changedAt: created.updatedAt
          } });
          knownItems.push(created);
          result.created += 1;
          result.records.push({ id: created.id, recordNumber: created.sku ?? created.partNumber ?? created.id, displayName: created.name, action: "created", href: `/directory/items/${created.id}` });
          continue;
        }

        const existing = await transaction.item.findUnique({ where: { id: selection.targetId }, select: itemSelect });
        if (!existing || existing.updatedAt.toISOString() !== selection.expectedUpdatedAt) throw new Error("BULK_IMPORT_PREVIEW_STALE");
        const updated = await transaction.item.update({ where: { id: existing.id }, data: updateData(row), select: itemSelect });
        if (Number(existing.cost) !== Number(updated.cost) || Number(existing.sellPrice) !== Number(updated.sellPrice)) {
          await transaction.itemPriceHistory.create({ data: {
            itemId: updated.id,
            previousCost: existing.cost,
            newCost: updated.cost,
            previousSellPrice: existing.sellPrice,
            newSellPrice: updated.sellPrice
          } });
        }
        const knownIndex = knownItems.findIndex((item) => item.id === updated.id);
        if (knownIndex >= 0) knownItems[knownIndex] = updated;
        result.updated += 1;
        result.records.push({ id: updated.id, recordNumber: updated.sku ?? updated.partNumber ?? updated.id, displayName: updated.name, action: "updated", href: `/directory/items/${updated.id}` });
      }
      await transaction.activity.create({ data: {
        relatedEntityType: "ItemImport",
        relatedEntityId: batchId,
        actorUserId: user.id,
        actorName: user.name,
        actorRole: user.roleLabel,
        type: "Imported",
        title: "Item CSV import completed",
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

export const itemImporter: BulkImporter = {
  key: "items",
  readPermission: "items:read",
  writePermission: "items:write",
  templateFileName: "pulse-item-import-template.csv",
  exportFileName: (date) => `pulse-items-${date}.csv`,
  template: itemCsvTemplate,
  export: async () => stringifyCsv(itemCsvHeaders, (await prisma.item.findMany({ select: itemSelect, orderBy: [{ name: "asc" }, { createdAt: "asc" }] })).map(currentRow)),
  preview: async (file) => (await buildPreview(file)).preview,
  commit
};
