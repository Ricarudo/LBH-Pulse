import type { Prisma } from "@/generated/prisma/client";

export type RecordNumberKind = "request" | "quote" | "project";

const prefixByKind: Record<RecordNumberKind, string> = {
  request: "RM",
  quote: "QM",
  project: "PM"
};

const maximumSequence = 9_999;

function yearCode(date: Date) {
  return String(date.getUTCFullYear() % 100).padStart(2, "0");
}

function patternFor(kind: RecordNumberKind) {
  return new RegExp(`^${prefixByKind[kind]}(\\d{2})(\\d{4})$`, "i");
}

export function normalizeRecordNumber(
  value: string,
  kind: RecordNumberKind
) {
  const match = patternFor(kind).exec(value.trim());
  if (!match || Number(match[2]) < 1) return null;
  return `${prefixByKind[kind]}${match[1]}${match[2]}`;
}

export function formatRecordNumber(
  kind: RecordNumberKind,
  sequence: number,
  date = new Date()
) {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > maximumSequence) {
    throw new Error("RECORD_NUMBER_SEQUENCE_EXHAUSTED");
  }
  return `${prefixByKind[kind]}${yearCode(date)}${String(sequence).padStart(4, "0")}`;
}

export function nextRecordNumberFromExisting(
  kind: RecordNumberKind,
  existingNumbers: Iterable<string | null | undefined>,
  date = new Date()
) {
  const expectedYear = yearCode(date);
  let maximum = 0;
  for (const value of existingNumbers) {
    if (!value) continue;
    const match = patternFor(kind).exec(value.trim());
    if (match?.[1] === expectedYear) {
      maximum = Math.max(maximum, Number(match[2]));
    }
  }
  return formatRecordNumber(kind, maximum + 1, date);
}

export async function lockRecordNumberSequence(
  tx: Prisma.TransactionClient,
  kind: RecordNumberKind
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pulse-number:${kind}`}))`;
}

export async function allocateRecordNumber(
  tx: Prisma.TransactionClient,
  kind: RecordNumberKind,
  date = new Date()
) {
  await lockRecordNumberSequence(tx, kind);

  const existingNumbers = kind === "request"
    ? (await tx.request.findMany({ select: { requestNumber: true } }))
        .map((record) => record.requestNumber)
    : kind === "project"
      ? (await tx.project.findMany({ select: { projectNumber: true } }))
          .map((record) => record.projectNumber)
      : (await tx.quote.findMany({
          select: {
            quoteNumber: true,
            baseQuoteNumber: true,
            externalQuoteNumber: true
          }
        })).flatMap((record) => [
          record.quoteNumber,
          record.baseQuoteNumber,
          record.externalQuoteNumber
        ]);

  return nextRecordNumberFromExisting(kind, existingNumbers, date);
}
