import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/services/activityService";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import type {
  RecordNumberKind,
  RecordNumberSequenceRecord,
  RecordNumberSequenceUpdateInput
} from "@pulse/contracts/settings";

export type { RecordNumberKind } from "@pulse/contracts/settings";

const prefixByKind: Record<RecordNumberKind, "RM" | "QM" | "PM"> = {
  request: "RM",
  quote: "QM",
  project: "PM"
};

const recordNumberKinds: RecordNumberKind[] = ["request", "quote", "project"];
const maximumSequence = 9_999;

function yearValue(date: Date) {
  return date.getUTCFullYear() % 100;
}

function yearCode(date: Date) {
  return String(yearValue(date)).padStart(2, "0");
}

function patternFor(kind: RecordNumberKind) {
  return new RegExp(`^${prefixByKind[kind]}(\\d{2})(\\d{4})$`, "i");
}

function formatSequenceCursor(
  kind: RecordNumberKind,
  sequence: number,
  date = new Date()
) {
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > maximumSequence) {
    throw new Error("RECORD_NUMBER_SEQUENCE_INVALID");
  }
  return `${prefixByKind[kind]}${yearCode(date)}${String(sequence).padStart(4, "0")}`;
}

export function parseRecordNumberSequenceCursor(
  value: string,
  kind: RecordNumberKind,
  date = new Date()
) {
  const match = patternFor(kind).exec(value.trim());
  if (!match || match[1] !== yearCode(date)) {
    throw new Error("RECORD_NUMBER_SEQUENCE_INVALID");
  }
  return Number(match[2]);
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
  return formatSequenceCursor(kind, sequence, date);
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

async function existingNumbers(
  tx: Prisma.TransactionClient,
  kind: RecordNumberKind
) {
  if (kind === "request") {
    return (await tx.request.findMany({ select: { requestNumber: true } }))
      .map((record) => record.requestNumber);
  }
  if (kind === "project") {
    return (await tx.project.findMany({ select: { projectNumber: true } }))
      .map((record) => record.projectNumber);
  }
  return (await tx.quote.findMany({
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
}

async function deriveLastSequence(
  tx: Prisma.TransactionClient,
  kind: RecordNumberKind,
  date: Date
) {
  const expectedYear = yearCode(date);
  let maximum = 0;
  for (const value of await existingNumbers(tx, kind)) {
    if (!value) continue;
    const match = patternFor(kind).exec(value.trim());
    if (match?.[1] === expectedYear) {
      maximum = Math.max(maximum, Number(match[2]));
    }
  }
  return maximum;
}

async function recordNumberExists(
  tx: Prisma.TransactionClient,
  kind: RecordNumberKind,
  recordNumber: string
) {
  if (kind === "request") {
    return Boolean(await tx.request.findUnique({
      where: { requestNumber: recordNumber },
      select: { id: true }
    }));
  }
  if (kind === "project") {
    return Boolean(await tx.project.findUnique({
      where: { projectNumber: recordNumber },
      select: { id: true }
    }));
  }
  return Boolean(await tx.quote.findFirst({
    where: {
      OR: [
        { quoteNumber: recordNumber },
        { baseQuoteNumber: recordNumber },
        { externalQuoteNumber: recordNumber }
      ]
    },
    select: { id: true }
  }));
}

function sequenceRecord(
  kind: RecordNumberKind,
  sequence: number,
  updatedAt: Date | null,
  date: Date
): RecordNumberSequenceRecord {
  const exhausted = sequence >= maximumSequence;
  return {
    kind,
    prefix: prefixByKind[kind],
    year: yearValue(date),
    currentNumber: formatSequenceCursor(kind, sequence, date),
    nextNumber: exhausted ? null : formatRecordNumber(kind, sequence + 1, date),
    exhausted,
    updatedAt: updatedAt?.toISOString() ?? null
  };
}

export async function getRecordNumberSequences(
  date = new Date()
): Promise<RecordNumberSequenceRecord[]> {
  const year = yearValue(date);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.recordNumberSequence.findMany({ where: { year } });
    const byKind = new Map(rows.map((row) => [row.kind, row]));
    const result: RecordNumberSequenceRecord[] = [];
    for (const kind of recordNumberKinds) {
      const stored = byKind.get(kind);
      const sequence = stored
        ? stored.lastSequence
        : await deriveLastSequence(tx, kind, date);
      result.push(sequenceRecord(kind, sequence, stored?.updatedAt ?? null, date));
    }
    return result;
  });
}

export async function updateRecordNumberSequence(
  kind: RecordNumberKind,
  input: RecordNumberSequenceUpdateInput,
  actor: AuthenticatedUser,
  date = new Date()
): Promise<RecordNumberSequenceRecord> {
  const lastSequence = parseRecordNumberSequenceCursor(
    input.currentNumber,
    kind,
    date
  );
  const year = yearValue(date);

  const result = await prisma.$transaction(async (tx) => {
    await lockRecordNumberSequence(tx, kind);
    const current = await tx.recordNumberSequence.findUnique({
      where: { kind_year: { kind, year } }
    });
    const currentTimestamp = current?.updatedAt.toISOString() ?? null;
    if (currentTimestamp !== input.expectedUpdatedAt) {
      throw new Error("RECORD_NUMBER_SEQUENCE_STALE");
    }

    if (lastSequence < maximumSequence) {
      const nextNumber = formatRecordNumber(kind, lastSequence + 1, date);
      if (await recordNumberExists(tx, kind, nextNumber)) {
        throw new Error("RECORD_NUMBER_SEQUENCE_CONFLICT");
      }
    }

    const previousSequence = current?.lastSequence ??
      await deriveLastSequence(tx, kind, date);
    const saved = await tx.recordNumberSequence.upsert({
      where: { kind_year: { kind, year } },
      create: { kind, year, lastSequence },
      update: { lastSequence }
    });
    return { saved, previousSequence };
  });

  await recordActivity({
    user: actor,
    relatedEntityType: "RecordNumberSequence",
    relatedEntityId: `${kind}:${year}`,
    type: "Updated",
    title: `${prefixByKind[kind]} record number sequence updated`,
    detail: `${formatSequenceCursor(kind, result.previousSequence, date)} changed to ${formatSequenceCursor(kind, lastSequence, date)}.`,
    metadata: {
      kind,
      year,
      previousNumber: formatSequenceCursor(kind, result.previousSequence, date),
      currentNumber: formatSequenceCursor(kind, lastSequence, date)
    }
  });

  return sequenceRecord(kind, lastSequence, result.saved.updatedAt, date);
}

export async function reserveRecordNumberSequence(
  tx: Prisma.TransactionClient,
  kind: RecordNumberKind,
  recordNumbers: Iterable<string>,
  date = new Date()
) {
  await lockRecordNumberSequence(tx, kind);
  const year = yearValue(date);
  const current = await tx.recordNumberSequence.findUnique({
    where: { kind_year: { kind, year } }
  });
  let lastSequence = current?.lastSequence ??
    await deriveLastSequence(tx, kind, date);
  const expectedYear = yearCode(date);

  for (const value of recordNumbers) {
    const match = patternFor(kind).exec(value.trim());
    if (match?.[1] === expectedYear) {
      lastSequence = Math.max(lastSequence, Number(match[2]));
    }
  }

  await tx.recordNumberSequence.upsert({
    where: { kind_year: { kind, year } },
    create: { kind, year, lastSequence },
    update: { lastSequence }
  });
}

export async function allocateRecordNumber(
  tx: Prisma.TransactionClient,
  kind: RecordNumberKind,
  date = new Date()
) {
  await lockRecordNumberSequence(tx, kind);
  const year = yearValue(date);
  const current = await tx.recordNumberSequence.findUnique({
    where: { kind_year: { kind, year } }
  });
  const lastSequence = current?.lastSequence ??
    await deriveLastSequence(tx, kind, date);
  const nextNumber = formatRecordNumber(kind, lastSequence + 1, date);

  if (await recordNumberExists(tx, kind, nextNumber)) {
    throw new Error("RECORD_NUMBER_SEQUENCE_CONFLICT");
  }

  await tx.recordNumberSequence.upsert({
    where: { kind_year: { kind, year } },
    create: { kind, year, lastSequence: lastSequence + 1 },
    update: { lastSequence: lastSequence + 1 }
  });
  return nextNumber;
}
