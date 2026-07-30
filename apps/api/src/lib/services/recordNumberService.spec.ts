import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import {
  allocateRecordNumber,
  formatRecordNumber,
  nextRecordNumberFromExisting,
  normalizeRecordNumber,
  parseRecordNumberSequenceCursor,
  reserveRecordNumberSequence,
  updateRecordNumberSequence
} from "@/lib/services/recordNumberService";
import type { AuthenticatedUser } from "@pulse/contracts/auth";

const in2026 = new Date("2026-07-22T12:00:00.000Z");
const originalTransaction = prisma.$transaction;
const originalActivityCreate = prisma.activity.create;

afterEach(() => {
  (prisma as any).$transaction = originalTransaction;
  (prisma.activity as any).create = originalActivityCreate;
});

describe("record number nomenclature", () => {
  it("formats requests, quotes, and projects with type, two-digit year, and four-digit sequence", () => {
    assert.equal(formatRecordNumber("request", 1, in2026), "RM260001");
    assert.equal(formatRecordNumber("quote", 457, in2026), "QM260457");
    assert.equal(formatRecordNumber("project", 42, in2026), "PM260042");
  });

  it("continues after the highest imported quote number", () => {
    const imported = Array.from(
      { length: 456 },
      (_, index) => formatRecordNumber("quote", index + 1, in2026)
    );
    assert.equal(
      nextRecordNumberFromExisting("quote", imported, in2026),
      "QM260457"
    );
  });

  it("ignores legacy formats, other types, and other years", () => {
    assert.equal(
      nextRecordNumberFromExisting(
        "request",
        ["RQ-2026-1001", "RM250999", "QM269999", "RM260008"],
        in2026
      ),
      "RM260009"
    );
  });

  it("normalizes canonical imported numbers without accepting malformed values", () => {
    assert.equal(normalizeRecordNumber(" qm260456 ", "quote"), "QM260456");
    assert.equal(normalizeRecordNumber("QM260000", "quote"), null);
    assert.equal(normalizeRecordNumber("QM26-0456", "quote"), null);
    assert.equal(normalizeRecordNumber("RM260456", "quote"), null);
  });

  it("rejects a sequence beyond four digits", () => {
    assert.throws(
      () => nextRecordNumberFromExisting("project", ["PM269999"], in2026),
      /RECORD_NUMBER_SEQUENCE_EXHAUSTED/
    );
  });

  it("accepts a current-year administrative cursor, including the zero baseline", () => {
    assert.equal(
      parseRecordNumberSequenceCursor("qm260457", "quote", in2026),
      457
    );
    assert.equal(
      parseRecordNumberSequenceCursor("RM260000", "request", in2026),
      0
    );
  });

  it("rejects administrative cursors with the wrong kind or year", () => {
    assert.throws(
      () => parseRecordNumberSequenceCursor("PM260457", "quote", in2026),
      /RECORD_NUMBER_SEQUENCE_INVALID/
    );
    assert.throws(
      () => parseRecordNumberSequenceCursor("QM250457", "quote", in2026),
      /RECORD_NUMBER_SEQUENCE_INVALID/
    );
  });
});

function sequenceTransaction(lastSequence: number, occupied = new Set<string>()) {
  let cursor = {
    kind: "quote",
    year: 26,
    lastSequence,
    createdAt: in2026,
    updatedAt: new Date("2026-07-22T11:00:00.000Z")
  };
  const tx = {
    $executeRaw: async () => 1,
    recordNumberSequence: {
      findUnique: async () => cursor,
      upsert: async ({ create, update }: any) => {
        cursor = {
          ...cursor,
          ...create,
          ...update,
          updatedAt: new Date(cursor.updatedAt.getTime() + 1_000)
        };
        return cursor;
      }
    },
    quote: {
      findMany: async () => [],
      findFirst: async ({ where }: any) => {
        const candidates = where.OR.map((condition: Record<string, string>) =>
          Object.values(condition)[0]
        );
        return candidates.some((candidate: string) => occupied.has(candidate))
          ? { id: "occupied" }
          : null;
      }
    }
  };
  return { tx, cursor: () => cursor };
}

const administrator: AuthenticatedUser = {
  id: "admin-1",
  name: "Administrator",
  email: "admin@example.test",
  role: "Admin",
  roleLabel: "Administrator",
  accessRole: { id: "Admin", name: "Administrator", color: "#2563EB" },
  permissions: ["settings:read", "settings:write"],
  isSystemAdmin: true,
  mustChangePassword: false,
  authProvider: "LOCAL"
};

describe("persisted record number cursor", () => {
  it("allows an administrator to lower the cursor and allocates the exact next number", async () => {
    const fake = sequenceTransaction(765);
    (prisma as any).$transaction = async (callback: any) => callback(fake.tx);
    (prisma.activity as any).create = async ({ data }: any) => data;

    const saved = await updateRecordNumberSequence("quote", {
      currentNumber: "QM260457",
      expectedUpdatedAt: "2026-07-22T11:00:00.000Z"
    }, administrator, in2026);
    assert.equal(saved.currentNumber, "QM260457");
    assert.equal(saved.nextNumber, "QM260458");

    const allocated = await allocateRecordNumber(fake.tx as any, "quote", in2026);
    assert.equal(allocated, "QM260458");
    assert.equal(fake.cursor().lastSequence, 458);
  });

  it("rejects a cursor whose immediate next number is occupied", async () => {
    const fake = sequenceTransaction(765, new Set(["QM260458"]));
    (prisma as any).$transaction = async (callback: any) => callback(fake.tx);

    await assert.rejects(
      updateRecordNumberSequence("quote", {
        currentNumber: "QM260457",
        expectedUpdatedAt: "2026-07-22T11:00:00.000Z"
      }, administrator, in2026),
      /RECORD_NUMBER_SEQUENCE_CONFLICT/
    );
  });

  it("reserves imported canonical numbers before generated import numbers", async () => {
    const fake = sequenceTransaction(457);
    await reserveRecordNumberSequence(
      fake.tx as any,
      "quote",
      ["QM260765"],
      in2026
    );
    assert.equal(fake.cursor().lastSequence, 765);
    assert.equal(
      await allocateRecordNumber(fake.tx as any, "quote", in2026),
      "QM260766"
    );
  });
});
