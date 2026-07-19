const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2_000;

export function normalizeCsvText(value: string, collapseSpaces = false) {
  const unprotected = value.trim().replace(/^'(?=[=+\-@\t\r])/, "");
  const normalized = unprotected.normalize("NFKC").trim();
  return collapseSpaces ? normalized.replace(/\s+/g, " ") : normalized;
}

function parseCsvRecords(text: string) {
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
        } else quoted = false;
      } else field += character;
      continue;
    }
    if (character === '"' && field === "") quoted = true;
    else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("BULK_IMPORT_INVALID_CSV");
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  return records.filter((columns) => columns.some((value) => value.trim()));
}

export function parseExactCsv<Header extends string>(
  buffer: Buffer,
  expectedHeaders: readonly Header[]
) {
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error("BULK_IMPORT_FILE_TOO_LARGE");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error("BULK_IMPORT_INVALID_ENCODING");
  }
  text = text.replace(/^\uFEFF/, "");
  if (text.includes("\0")) throw new Error("BULK_IMPORT_INVALID_CSV");
  const records = parseCsvRecords(text);
  if (!records.length) throw new Error("BULK_IMPORT_INVALID_HEADERS");
  const headers = records[0].map((header) => normalizeCsvText(header));
  const expected = new Set<string>(expectedHeaders);
  if (
    headers.length !== expectedHeaders.length ||
    new Set(headers).size !== headers.length ||
    headers.some((header) => !expected.has(header)) ||
    expectedHeaders.some((header) => !headers.includes(header))
  ) throw new Error("BULK_IMPORT_INVALID_HEADERS");
  const data = records.slice(1);
  if (data.length > MAX_ROWS) throw new Error("BULK_IMPORT_ROW_LIMIT");
  return data.map((columns, index) => {
    const row = Object.fromEntries(expectedHeaders.map((header) => [header, ""])) as Record<Header, string>;
    if (columns.length !== headers.length) {
      return {
        rowNumber: index + 2,
        row,
        structuralError: `Expected ${headers.length} columns but found ${columns.length}.`
      };
    }
    headers.forEach((header, columnIndex) => {
      row[header as Header] = columns[columnIndex] ?? "";
    });
    return { rowNumber: index + 2, row, structuralError: "" };
  });
}

export function stringifyCsv<Header extends string>(
  headers: readonly Header[],
  rows: Array<Record<Header, string>>
) {
  const quote = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return `\uFEFF${[
    headers.join(","),
    ...rows.map((row) => headers.map((header) => quote(row[header])).join(","))
  ].join("\r\n")}\r\n`;
}
