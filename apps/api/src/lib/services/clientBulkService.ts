import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import {
  clientIndustries,
  clientOwners,
  clientSiteTypes,
  clientSources,
  clientStatuses
} from "@pulse/contracts/clients";
import {
  clientBulkCsvHeaders,
  type ClientBulkCommitResult,
  type ClientBulkCommitSelection,
  type ClientBulkCsvHeader,
  type ClientBulkCsvRow,
  type ClientBulkFieldDiff,
  type ClientBulkPreview,
  type ClientBulkPreviewRow,
  type ClientBulkRowStatus
} from "@pulse/contracts/client-bulk";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2_000;
const unsafeTextPattern = /[<>]|javascript\s*:/i;
const phonePattern = /^[0-9+().\-\s]*(?:(?:x|ext\.?)\s?\d{1,8})?$/i;

type UploadedCsv = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const bulkClientInclude = {
  contacts: {
    where: {
      OR: [{ isPrimary: true }, { isPrimaryContact: true }]
    },
    orderBy: { createdAt: "asc" }
  },
  sites: {
    where: { isPrimarySite: true },
    orderBy: { createdAt: "asc" }
  }
} satisfies Prisma.ClientInclude;

type BulkClient = Prisma.ClientGetPayload<{
  include: typeof bulkClientInclude;
}>;

const fieldMeta: Record<
  ClientBulkCsvHeader,
  { label: string; group: ClientBulkFieldDiff["group"] }
> = {
  client_number: { label: "Client number", group: "Client" },
  client_name: { label: "Client name", group: "Client" },
  legal_name: { label: "Legal name", group: "Client" },
  industry: { label: "Industry", group: "Client" },
  website: { label: "Website", group: "Client" },
  status: { label: "Status", group: "Client" },
  account_owner: { label: "Account owner", group: "Client" },
  source: { label: "Source", group: "Client" },
  primary_contact_name: {
    label: "Contact name",
    group: "Primary Contact"
  },
  primary_contact_title: {
    label: "Contact title",
    group: "Primary Contact"
  },
  primary_contact_email: {
    label: "Contact email",
    group: "Primary Contact"
  },
  primary_contact_phone: {
    label: "Contact phone",
    group: "Primary Contact"
  },
  primary_contact_mobile: {
    label: "Contact mobile",
    group: "Primary Contact"
  },
  primary_site_name: { label: "Site name", group: "Primary Site" },
  primary_site_type: { label: "Site type", group: "Primary Site" },
  address_line_1: { label: "Address line 1", group: "Primary Site" },
  address_line_2: { label: "Address line 2", group: "Primary Site" },
  city: { label: "City", group: "Primary Site" },
  state: { label: "State", group: "Primary Site" },
  postal_code: { label: "Postal code", group: "Primary Site" },
  country: { label: "Country", group: "Primary Site" }
};

const maxLengths: Partial<Record<ClientBulkCsvHeader, number>> = {
  client_number: 40,
  client_name: 160,
  legal_name: 160,
  industry: 120,
  website: 2048,
  status: 40,
  account_owner: 120,
  source: 120,
  primary_contact_name: 160,
  primary_contact_title: 120,
  primary_contact_email: 254,
  primary_contact_phone: 40,
  primary_contact_mobile: 40,
  primary_site_name: 160,
  primary_site_type: 80,
  address_line_1: 300,
  address_line_2: 300,
  city: 120,
  state: 120,
  postal_code: 40,
  country: 120
};

function normalizeText(value: string, collapseSpaces = false) {
  const unprotected = value.replace(/^'(?=[=+\-@\t\r])/, "");
  const normalized = unprotected.normalize("NFKC").trim();
  return collapseSpaces ? normalized.replace(/\s+/g, " ") : normalized;
}

function normalizeIdentity(value: string) {
  return normalizeText(value, true).toLocaleLowerCase("en-US");
}

function normalizeEmail(value: string) {
  return normalizeText(value).toLocaleLowerCase("en-US");
}

function normalizeWebsite(value: string) {
  const clean = normalizeText(value, true);
  if (!clean) return "";
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(clean)
    ? clean
    : `https://${clean}`;
  const url = new URL(candidate);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
    throw new Error("INVALID_URL");
  }
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function normalizeWebsiteHost(value: string) {
  if (!value) return "";
  try {
    const normalized = normalizeWebsite(value);
    const host = new URL(normalized).hostname.toLocaleLowerCase("en-US");
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

function normalizeClientNumber(value: string) {
  return normalizeText(value, true).toUpperCase();
}

function isValidEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string) {
  return (
    !value ||
    (phonePattern.test(value) && value.replace(/\D/g, "").length >= 7)
  );
}

function emptyRow(): ClientBulkCsvRow {
  return Object.fromEntries(
    clientBulkCsvHeaders.map((header) => [header, ""])
  ) as ClientBulkCsvRow;
}

function parseCsv(text: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (character === "\r") {
      if (text[index + 1] === "\n") index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("CLIENT_BULK_INVALID_CSV");
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }

  return records.filter((columns) => columns.some((value) => value.trim()));
}

export function parseClientBulkCsv(buffer: Buffer) {
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error("CLIENT_BULK_FILE_TOO_LARGE");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error("CLIENT_BULK_INVALID_ENCODING");
  }

  text = text.replace(/^\uFEFF/, "");
  if (text.includes("\0")) throw new Error("CLIENT_BULK_INVALID_CSV");

  const records = parseCsv(text);
  if (!records.length) throw new Error("CLIENT_BULK_INVALID_HEADERS");
  const headers = records[0].map((header) => normalizeText(header));
  const uniqueHeaders = new Set(headers);
  const expectedHeaders = new Set<string>(clientBulkCsvHeaders);

  if (
    headers.length !== clientBulkCsvHeaders.length ||
    uniqueHeaders.size !== headers.length ||
    headers.some((header) => !expectedHeaders.has(header)) ||
    clientBulkCsvHeaders.some((header) => !uniqueHeaders.has(header))
  ) {
    throw new Error("CLIENT_BULK_INVALID_HEADERS");
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length > MAX_ROWS) throw new Error("CLIENT_BULK_ROW_LIMIT");

  return dataRecords.map((columns, index) => {
    if (columns.length !== headers.length) {
      return {
        rowNumber: index + 2,
        row: emptyRow(),
        structuralError: `Expected ${headers.length} columns but found ${columns.length}.`
      };
    }

    const row = emptyRow();
    headers.forEach((header, columnIndex) => {
      row[header as ClientBulkCsvHeader] = columns[columnIndex] ?? "";
    });
    return { rowNumber: index + 2, row, structuralError: "" };
  });
}

export function stringifyClientBulkCsv(rows: ClientBulkCsvRow[]) {
  const spreadsheetSafe = (value: string) =>
    /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  const quote = (value: string) => {
    const safe = spreadsheetSafe(value);
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const records = [
    clientBulkCsvHeaders.join(","),
    ...rows.map((row) =>
      clientBulkCsvHeaders.map((header) => quote(row[header])).join(",")
    )
  ];
  return `\uFEFF${records.join("\r\n")}\r\n`;
}

export function sanitizeClientBulkCsvRow(
  raw: ClientBulkCsvRow,
  structuralError = ""
) {
  const row = emptyRow();
  const errors = structuralError ? [structuralError] : [];

  for (const header of clientBulkCsvHeaders) {
    const collapseSpaces = [
      "client_number",
      "client_name",
      "legal_name",
      "website",
      "primary_contact_name",
      "primary_contact_title",
      "primary_contact_phone",
      "primary_contact_mobile",
      "primary_site_name"
    ].includes(header);
    let value = normalizeText(raw[header], collapseSpaces);
    if (header === "client_number") value = normalizeClientNumber(value);
    if (header === "primary_contact_email") value = normalizeEmail(value);
    if (header === "website" && value) {
      try {
        value = normalizeWebsite(value);
      } catch {
        errors.push("Website must be a valid HTTP or HTTPS URL.");
      }
    }
    row[header] = value;

    const max = maxLengths[header];
    if (max && value.length > max) {
      errors.push(`${fieldMeta[header].label} must be ${max} characters or less.`);
    }
    if (unsafeTextPattern.test(value)) {
      errors.push(`${fieldMeta[header].label} contains unsupported HTML or script content.`);
    }
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) {
      errors.push(`${fieldMeta[header].label} contains unsupported control characters.`);
    }
  }

  if (
    row.client_number &&
    !/^CL-\d{4,}$/i.test(row.client_number)
  ) {
    errors.push("Client number must use the CL-1001 format.");
  }
  if (!isValidEmail(row.primary_contact_email)) {
    errors.push("Primary contact email is invalid.");
  }
  if (!isValidPhone(row.primary_contact_phone)) {
    errors.push("Primary contact phone is invalid.");
  }
  if (!isValidPhone(row.primary_contact_mobile)) {
    errors.push("Primary contact mobile is invalid.");
  }
  if (
    row.industry &&
    !clientIndustries.includes(row.industry as (typeof clientIndustries)[number])
  ) {
    errors.push("Industry is not an allowed value.");
  }
  if (
    row.status &&
    !clientStatuses.includes(row.status as (typeof clientStatuses)[number])
  ) {
    errors.push("Status is not an allowed value.");
  }
  if (
    row.account_owner &&
    !clientOwners.includes(row.account_owner as (typeof clientOwners)[number])
  ) {
    errors.push("Account owner is not an allowed value.");
  }
  if (
    row.source &&
    !clientSources.includes(row.source as (typeof clientSources)[number])
  ) {
    errors.push("Source is not an allowed value.");
  }
  if (
    row.primary_site_type &&
    !clientSiteTypes.includes(
      row.primary_site_type as (typeof clientSiteTypes)[number]
    )
  ) {
    errors.push("Primary site type is not an allowed value.");
  }

  const hasContact = [
    row.primary_contact_name,
    row.primary_contact_title,
    row.primary_contact_email,
    row.primary_contact_phone,
    row.primary_contact_mobile
  ].some(Boolean);
  if (hasContact && !row.primary_contact_name) {
    errors.push("Primary contact name is required when contact data is supplied.");
  }
  if (
    hasContact &&
    !row.primary_contact_email &&
    !row.primary_contact_phone &&
    !row.primary_contact_mobile
  ) {
    errors.push("Primary contact requires an email, phone, or mobile number.");
  }

  const hasSite = [
    row.primary_site_name,
    row.primary_site_type,
    row.address_line_1,
    row.address_line_2,
    row.city,
    row.state,
    row.postal_code,
    row.country
  ].some(Boolean);
  if (hasSite && !row.primary_site_name) {
    errors.push("Primary site name is required when site data is supplied.");
  }

  return { row, errors: Array.from(new Set(errors)), hasContact, hasSite };
}

function currentRow(client: BulkClient): ClientBulkCsvRow {
  const row = emptyRow();
  const contact = client.contacts[0];
  const site = client.sites[0];
  row.client_number = client.clientNumber;
  row.client_name = client.displayName;
  row.legal_name = client.legalName ?? "";
  row.industry = client.industry ?? "";
  row.website = client.website ?? "";
  row.status = client.status;
  row.account_owner = client.accountOwner;
  row.source = client.source ?? "";
  row.primary_contact_name =
    contact?.name ??
    [contact?.firstName, contact?.lastName].filter(Boolean).join(" ");
  row.primary_contact_title = contact?.title ?? "";
  row.primary_contact_email = contact?.email ?? "";
  row.primary_contact_phone = contact?.phone ?? "";
  row.primary_contact_mobile = contact?.mobile ?? "";
  row.primary_site_name = site?.siteName ?? "";
  row.primary_site_type = site?.siteType ?? "";
  row.address_line_1 = site?.addressLine1 ?? "";
  row.address_line_2 = site?.addressLine2 ?? "";
  row.city = site?.city ?? "";
  row.state = site?.state ?? "";
  row.postal_code = site?.postalCode ?? "";
  row.country = site?.country ?? "";
  return row;
}

function applyNewDefaults(row: ClientBulkCsvRow) {
  return {
    ...row,
    legal_name: row.legal_name || row.client_name,
    status: row.status || "Prospect",
    account_owner: row.account_owner || "Unassigned",
    primary_site_type: row.primary_site_name
      ? row.primary_site_type || "Main Office"
      : "",
    state: row.primary_site_name ? row.state || "PR" : "",
    country: row.primary_site_name ? row.country || "Puerto Rico" : ""
  };
}

function buildDiffs(
  incoming: ClientBulkCsvRow,
  current?: ClientBulkCsvRow
): ClientBulkFieldDiff[] {
  return clientBulkCsvHeaders
    .filter((field) => field !== "client_number")
    .map((field) => {
      const currentValue = current?.[field] ?? "";
      const incomingValue = incoming[field];
      return {
        field,
        label: fieldMeta[field].label,
        group: fieldMeta[field].group,
        current: currentValue,
        incoming: incomingValue,
        changed: Boolean(incomingValue) && incomingValue !== currentValue
      };
    });
}

function addToIndex(index: Map<string, Set<string>>, key: string, clientId: string) {
  if (!key) return;
  const values = index.get(key) ?? new Set<string>();
  values.add(clientId);
  index.set(key, values);
}

function duplicateKeys(rows: Array<{ rowNumber: number; row: ClientBulkCsvRow }>) {
  const keys = new Map<string, number[]>();
  for (const { rowNumber, row } of rows) {
    const identities = new Set(
      [
        row.client_number && `number:${normalizeClientNumber(row.client_number)}`,
        row.client_name && `name:${normalizeIdentity(row.client_name)}`,
        row.legal_name && `name:${normalizeIdentity(row.legal_name)}`,
        row.primary_contact_email &&
          `email:${normalizeEmail(row.primary_contact_email)}`,
        row.website && `website:${normalizeWebsiteHost(row.website)}`
      ].filter(Boolean) as string[]
    );
    for (const key of identities) {
      const rowNumbers = keys.get(key) ?? [];
      rowNumbers.push(rowNumber);
      keys.set(key, rowNumbers);
    }
  }
  return new Set(
    Array.from(keys.values())
      .filter((rowNumbers) => rowNumbers.length > 1)
      .flat()
  );
}

async function loadBulkClients(): Promise<BulkClient[]> {
  return prisma.client.findMany({
    include: bulkClientInclude,
    orderBy: { createdAt: "asc" }
  });
}

async function buildPreview(file: UploadedCsv) {
  if (!file?.buffer) throw new Error("CLIENT_BULK_FILE_REQUIRED");
  if (!file.originalname.toLocaleLowerCase("en-US").endsWith(".csv")) {
    throw new Error("CLIENT_BULK_FILE_TYPE");
  }
  const parsed = parseClientBulkCsv(file.buffer);
  const sanitized = parsed.map(({ rowNumber, row, structuralError }) => ({
    rowNumber,
    ...sanitizeClientBulkCsvRow(row, structuralError)
  }));
  const duplicateRowNumbers = duplicateKeys(sanitized);
  const clients = await loadBulkClients();
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const numberIndex = new Map<string, Set<string>>();
  const nameIndex = new Map<string, Set<string>>();
  const emailIndex = new Map<string, Set<string>>();
  const websiteIndex = new Map<string, Set<string>>();

  for (const client of clients) {
    addToIndex(numberIndex, normalizeClientNumber(client.clientNumber), client.id);
    addToIndex(nameIndex, normalizeIdentity(client.displayName), client.id);
    addToIndex(nameIndex, normalizeIdentity(client.legalName ?? ""), client.id);
    for (const contact of client.contacts) {
      addToIndex(emailIndex, normalizeEmail(contact.email ?? ""), client.id);
    }
    addToIndex(
      websiteIndex,
      normalizeWebsiteHost(client.website ?? ""),
      client.id
    );
  }

  const rows: ClientBulkPreviewRow[] = sanitized.map((item) => {
    const candidateIds = new Set<string>();
    const matchedBy: string[] = [];
    const rowErrors = [...item.errors];

    const signals: Array<[string, string, Map<string, Set<string>>]> = [
      ["Client number", normalizeClientNumber(item.row.client_number), numberIndex],
      ["Client name", normalizeIdentity(item.row.client_name), nameIndex],
      ["Legal name", normalizeIdentity(item.row.legal_name), nameIndex],
      [
        "Primary contact email",
        normalizeEmail(item.row.primary_contact_email),
        emailIndex
      ],
      ["Website", normalizeWebsiteHost(item.row.website), websiteIndex]
    ];

    for (const [label, key, index] of signals) {
      if (!key) continue;
      const ids = index.get(key);
      if (ids?.size) {
        matchedBy.push(label);
        for (const id of ids) candidateIds.add(id);
      } else if (label === "Client number") {
        rowErrors.push("The supplied client number does not exist.");
      }
    }

    const candidates = Array.from(candidateIds)
      .map((id) => clientById.get(id))
      .filter((client): client is BulkClient => Boolean(client));
    let status: ClientBulkRowStatus = "invalid";
    let target = candidates.length === 1 ? candidates[0] : undefined;

    if (rowErrors.length) {
      status = "invalid";
    } else if (duplicateRowNumbers.has(item.rowNumber)) {
      status = "conflict";
      rowErrors.push("This file contains another row with the same client identity.");
    } else if (candidates.length > 1) {
      status = "conflict";
      rowErrors.push("The matching values point to more than one existing client.");
    } else if (target?.archivedAt) {
      status = "conflict";
      rowErrors.push("This row matches an archived client.");
    } else if (target && (target.contacts.length > 1 || target.sites.length > 1)) {
      status = "conflict";
      rowErrors.push(
        "The existing client has multiple primary contacts or sites and must be corrected first."
      );
    } else if (target) {
      const diffs = buildDiffs(item.row, currentRow(target));
      status = diffs.some((diff) => diff.changed) ? "changed" : "unchanged";
    } else {
      if (!item.row.client_name) rowErrors.push("Client name is required for new clients.");
      if (!item.row.industry) rowErrors.push("Industry is required for new clients.");
      status = rowErrors.length ? "invalid" : "new";
      target = undefined;
    }

    const effectiveRow = target ? item.row : applyNewDefaults(item.row);
    return {
      rowNumber: item.rowNumber,
      status,
      displayName: effectiveRow.client_name || target?.displayName || `Row ${item.rowNumber}`,
      targetClientId: target?.id,
      targetClientNumber: target?.clientNumber,
      expectedUpdatedAt: target?.updatedAt.toISOString(),
      matchedBy,
      errors: Array.from(new Set(rowErrors)),
      candidates: candidates.map((client) => ({
        id: client.id,
        clientNumber: client.clientNumber,
        displayName: client.displayName,
        archived: Boolean(client.archivedAt)
      })),
      diffs: buildDiffs(effectiveRow, target ? currentRow(target) : undefined)
    };
  });

  const summary: Record<ClientBulkRowStatus, number> = {
    new: 0,
    changed: 0,
    unchanged: 0,
    conflict: 0,
    invalid: 0
  };
  rows.forEach((row) => {
    summary[row.status] += 1;
  });

  const preview: ClientBulkPreview = {
    fileName: file.originalname,
    fileDigest: createHash("sha256").update(file.buffer).digest("hex"),
    summary,
    rows
  };

  return {
    preview,
    rowsByNumber: new Map(sanitized.map((item) => [item.rowNumber, item]))
  };
}

export async function previewClientBulkCsv(file: UploadedCsv) {
  return (await buildPreview(file)).preview;
}

export async function exportClientCsv() {
  const clients = await prisma.client.findMany({
    where: { archivedAt: null },
    include: bulkClientInclude,
    orderBy: [{ displayName: "asc" }, { clientNumber: "asc" }]
  });
  return stringifyClientBulkCsv(clients.map(currentRow));
}

export function clientCsvTemplate() {
  const sample = emptyRow();
  Object.assign(sample, {
    client_name: "Sample Company",
    legal_name: "Sample Company LLC",
    industry: "Corporate",
    website: "https://sample.example",
    status: "Prospect",
    account_owner: "Unassigned",
    source: "Referral",
    primary_contact_name: "Jordan Rivera",
    primary_contact_title: "Operations Manager",
    primary_contact_email: "jordan@sample.example",
    primary_contact_phone: "+1 (787) 555-0100",
    primary_site_name: "Main Office",
    primary_site_type: "Main Office",
    address_line_1: "123 Sample Street",
    city: "San Juan",
    state: "PR",
    postal_code: "00901",
    country: "Puerto Rico"
  });
  return stringifyClientBulkCsv([sample]);
}

function nullable(value: string) {
  return value || null;
}

function splitName(name: string) {
  const [firstName = "", ...rest] = name.split(" ");
  return { firstName: firstName || "Unknown", lastName: rest.join(" ") };
}

function hasContactData(row: ClientBulkCsvRow) {
  return [
    row.primary_contact_name,
    row.primary_contact_title,
    row.primary_contact_email,
    row.primary_contact_phone,
    row.primary_contact_mobile
  ].some(Boolean);
}

function hasSiteData(row: ClientBulkCsvRow) {
  return [
    row.primary_site_name,
    row.primary_site_type,
    row.address_line_1,
    row.address_line_2,
    row.city,
    row.state,
    row.postal_code,
    row.country
  ].some(Boolean);
}

export async function commitClientBulkCsv(
  file: UploadedCsv,
  fileDigest: string,
  selections: ClientBulkCommitSelection[],
  user: AuthenticatedUser
): Promise<ClientBulkCommitResult> {
  if (!Array.isArray(selections) || !selections.length) {
    throw new Error("CLIENT_BULK_EMPTY_SELECTION");
  }

  const rebuilt = await buildPreview(file);
  if (rebuilt.preview.fileDigest !== fileDigest) {
    throw new Error("CLIENT_BULK_PREVIEW_STALE");
  }

  const selectedRows = new Set<number>();
  for (const selection of selections) {
    if (selectedRows.has(selection.rowNumber)) {
      throw new Error("CLIENT_BULK_INVALID_SELECTION");
    }
    selectedRows.add(selection.rowNumber);
    const previewRow = rebuilt.preview.rows.find(
      (row) => row.rowNumber === selection.rowNumber
    );
    const validAction =
      (selection.action === "create" && previewRow?.status === "new") ||
      (selection.action === "update" && previewRow?.status === "changed");
    if (
      !validAction ||
      selection.targetClientId !== previewRow?.targetClientId ||
      selection.expectedUpdatedAt !== previewRow?.expectedUpdatedAt
    ) {
      throw new Error("CLIENT_BULK_PREVIEW_STALE");
    }
  }

  const batchId = randomUUID();
  const now = new Date();

  try {
    return await prisma.$transaction(
      async (tx) => {
        const existingNumbers = await tx.client.findMany({
          select: { clientNumber: true }
        });
        let nextNumber = existingNumbers.reduce((maximum, client) => {
          const match = /^CL-(\d+)$/i.exec(client.clientNumber);
          return Math.max(maximum, match ? Number(match[1]) : 1000);
        }, 1000);
        const result: ClientBulkCommitResult = {
          batchId,
          created: 0,
          updated: 0,
          clients: []
        };

        for (const selection of selections) {
          const parsed = rebuilt.rowsByNumber.get(selection.rowNumber);
          const previewRow = rebuilt.preview.rows.find(
            (row) => row.rowNumber === selection.rowNumber
          );
          if (!parsed || !previewRow) throw new Error("CLIENT_BULK_PREVIEW_STALE");
          const row =
            selection.action === "create"
              ? applyNewDefaults(parsed.row)
              : parsed.row;
          const changedFields = previewRow.diffs
            .filter((diff) => diff.changed)
            .map((diff) => diff.field);

          if (selection.action === "create") {
            nextNumber += 1;
            const created = await tx.client.create({
              data: {
                clientNumber: `CL-${String(nextNumber).padStart(4, "0")}`,
                displayName: row.client_name,
                legalName: nullable(row.legal_name || row.client_name),
                industry: nullable(row.industry),
                website: nullable(row.website),
                status: row.status || "Prospect",
                accountOwner: row.account_owner || "Unassigned",
                source: nullable(row.source),
                preferredCurrency: "USD",
                preferredLanguage: "English",
                lastActivityAt: now
              }
            });
            let siteId: string | undefined;
            if (hasSiteData(row)) {
              const site = await tx.clientSite.create({
                data: {
                  clientId: created.id,
                  siteName: row.primary_site_name,
                  siteType: row.primary_site_type || "Main Office",
                  addressLine1: nullable(row.address_line_1),
                  addressLine2: nullable(row.address_line_2),
                  city: nullable(row.city),
                  state: nullable(row.state || "PR"),
                  postalCode: nullable(row.postal_code),
                  country: row.country || "Puerto Rico",
                  isPrimarySite: true
                }
              });
              siteId = site.id;
            }
            if (hasContactData(row)) {
              const name = splitName(row.primary_contact_name);
              await tx.pointOfContact.create({
                data: {
                  ownerType: "Client",
                  ownerId: created.id,
                  clientId: created.id,
                  siteId,
                  role: "Primary",
                  name: row.primary_contact_name,
                  firstName: name.firstName,
                  lastName: name.lastName,
                  title: nullable(row.primary_contact_title),
                  email: nullable(row.primary_contact_email),
                  phone: nullable(row.primary_contact_phone),
                  mobile: nullable(row.primary_contact_mobile),
                  preferredContactMethod: row.primary_contact_email
                    ? "Email"
                    : row.primary_contact_mobile
                      ? "Mobile"
                      : "Phone",
                  isPrimary: true,
                  isPrimaryContact: true
                }
              });
            }
            await tx.clientActivity.create({
              data: {
                clientId: created.id,
                type: "Import",
                title: "Client created by CSV import",
                detail: `Batch ${batchId}, row ${selection.rowNumber}.`,
                actor: user.name,
                createdAt: now
              }
            });
            result.created += 1;
            result.clients.push({
              id: created.id,
              clientNumber: created.clientNumber,
              displayName: created.displayName,
              action: "created"
            });
            continue;
          }

          const target = await tx.client.findUnique({
            where: { id: selection.targetClientId },
            include: bulkClientInclude
          });
          if (
            !target ||
            target.archivedAt ||
            target.updatedAt.toISOString() !== selection.expectedUpdatedAt ||
            target.contacts.length > 1 ||
            target.sites.length > 1
          ) {
            throw new Error("CLIENT_BULK_PREVIEW_STALE");
          }

          let siteId = target.sites[0]?.id;
          if (hasSiteData(row)) {
            if (target.sites[0]) {
              await tx.clientSite.update({
                where: { id: target.sites[0].id },
                data: {
                  ...(row.primary_site_name
                    ? { siteName: row.primary_site_name }
                    : {}),
                  ...(row.primary_site_type
                    ? { siteType: row.primary_site_type }
                    : {}),
                  ...(row.address_line_1
                    ? { addressLine1: row.address_line_1 }
                    : {}),
                  ...(row.address_line_2
                    ? { addressLine2: row.address_line_2 }
                    : {}),
                  ...(row.city ? { city: row.city } : {}),
                  ...(row.state ? { state: row.state } : {}),
                  ...(row.postal_code ? { postalCode: row.postal_code } : {}),
                  ...(row.country ? { country: row.country } : {})
                }
              });
            } else {
              const site = await tx.clientSite.create({
                data: {
                  clientId: target.id,
                  siteName: row.primary_site_name,
                  siteType: row.primary_site_type || "Main Office",
                  addressLine1: nullable(row.address_line_1),
                  addressLine2: nullable(row.address_line_2),
                  city: nullable(row.city),
                  state: nullable(row.state || "PR"),
                  postalCode: nullable(row.postal_code),
                  country: row.country || "Puerto Rico",
                  isPrimarySite: true
                }
              });
              siteId = site.id;
            }
          }

          if (hasContactData(row)) {
            const name = splitName(row.primary_contact_name);
            if (target.contacts[0]) {
              await tx.pointOfContact.update({
                where: { id: target.contacts[0].id },
                data: {
                  ...(row.primary_contact_name
                    ? {
                        name: row.primary_contact_name,
                        firstName: name.firstName,
                        lastName: name.lastName
                      }
                    : {}),
                  ...(row.primary_contact_title
                    ? { title: row.primary_contact_title }
                    : {}),
                  ...(row.primary_contact_email
                    ? { email: row.primary_contact_email }
                    : {}),
                  ...(row.primary_contact_phone
                    ? { phone: row.primary_contact_phone }
                    : {}),
                  ...(row.primary_contact_mobile
                    ? { mobile: row.primary_contact_mobile }
                    : {})
                }
              });
            } else {
              await tx.pointOfContact.create({
                data: {
                  ownerType: "Client",
                  ownerId: target.id,
                  clientId: target.id,
                  siteId,
                  role: "Primary",
                  name: row.primary_contact_name,
                  firstName: name.firstName,
                  lastName: name.lastName,
                  title: nullable(row.primary_contact_title),
                  email: nullable(row.primary_contact_email),
                  phone: nullable(row.primary_contact_phone),
                  mobile: nullable(row.primary_contact_mobile),
                  preferredContactMethod: row.primary_contact_email
                    ? "Email"
                    : row.primary_contact_mobile
                      ? "Mobile"
                      : "Phone",
                  isPrimary: true,
                  isPrimaryContact: true
                }
              });
            }
          }

          const updated = await tx.client.update({
            where: { id: target.id },
            data: {
              ...(row.client_name ? { displayName: row.client_name } : {}),
              ...(row.legal_name ? { legalName: row.legal_name } : {}),
              ...(row.industry ? { industry: row.industry } : {}),
              ...(row.website ? { website: row.website } : {}),
              ...(row.status ? { status: row.status } : {}),
              ...(row.account_owner ? { accountOwner: row.account_owner } : {}),
              ...(row.source ? { source: row.source } : {}),
              lastActivityAt: now,
              activities: {
                create: {
                  type: "Import",
                  title: "Client updated by CSV import",
                  detail: `Batch ${batchId}, row ${selection.rowNumber}; changed: ${changedFields.join(", ")}.`,
                  actor: user.name,
                  createdAt: now
                }
              }
            }
          });
          result.updated += 1;
          result.clients.push({
            id: updated.id,
            clientNumber: updated.clientNumber,
            displayName: updated.displayName,
            action: "updated"
          });
        }

        await tx.activity.create({
          data: {
            relatedEntityType: "ClientImport",
            relatedEntityId: batchId,
            actorUserId: user.id,
            actorName: user.name,
            actorRole: user.role,
            type: "Imported",
            title: "Client CSV import completed",
            detail: `${result.created} created and ${result.updated} updated.`,
            metadata: {
              fileName: file.originalname,
              fileDigest,
              selectedRows: selections.map((selection) => selection.rowNumber)
            }
          }
        });

        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    ) {
      throw new Error("CLIENT_BULK_PREVIEW_STALE");
    }
    throw error;
  }
}
