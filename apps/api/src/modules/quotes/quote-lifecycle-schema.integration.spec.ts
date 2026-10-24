import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { Client } from "pg";

const enabled = process.env.PULSE_RUN_LIFECYCLE_SCHEMA_TESTS === "1";

test("0.2 candidate schema enforces family, snapshot, review and retry constraints without changing legacy data", { skip: !enabled }, async () => {
  // This test creates experimental DDL inside a rolled-back transaction. Never target a working database.
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.pathname, "/pulse_lifecycle_test", "Use the dedicated disposable lifecycle database");
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query(`INSERT INTO pulse."Quote" (id, "quoteNumber", title, "updatedAt") VALUES ('legacy-preserve', 'SCHEMA-LEGACY', 'Historical quote to preserve', now())`);
    const before = await db.query('SELECT to_jsonb(q) AS data FROM pulse."Quote" q ORDER BY id');
    await db.query(await readFile(resolve(__dirname, "../../../prisma/migration-plans/quote-lifecycle-foundation.sql"), "utf8"));
    const after = await db.query('SELECT to_jsonb(q) AS data FROM pulse."Quote" q ORDER BY id');
    assert.deepEqual(after.rows, before.rows);

    const rejected = async (sql: string, code: string) => {
      await db.query("SAVEPOINT expected_failure");
      await assert.rejects(db.query(sql), (error: unknown) => (error as { code: string }).code === code);
      await db.query("ROLLBACK TO SAVEPOINT expected_failure");
      await db.query("RELEASE SAVEPOINT expected_failure");
    };
    await db.query(`INSERT INTO pulse."QuoteFamily" (id, "baseQuoteNumber") VALUES ('family-a', 'QA'), ('family-b', 'QB')`);
    await db.query(`INSERT INTO pulse."Quote" (id, "quoteNumber", title, "updatedAt") VALUES
      ('q0', 'SCHEMA-Q0', 'Original', now()), ('q1', 'SCHEMA-Q1', 'Revision', now()), ('q2', 'SCHEMA-Q2', 'Other family', now())`);
    await db.query(`INSERT INTO pulse."QuoteVersion" ("quoteId", "familyId", "revisionNumber") VALUES ('q0', 'family-a', 0), ('q2', 'family-b', 0)`);
    await rejected(`INSERT INTO pulse."QuoteVersion" ("quoteId", "familyId", "revisionNumber") VALUES ('q1', 'family-a', 1)`, "23505");
    await rejected(`UPDATE pulse."QuoteFamily" SET "currentDraftId" = 'q2' WHERE id = 'family-a'`, "23503");
    await rejected(`UPDATE pulse."QuoteVersion" SET "previousQuoteId" = 'q2' WHERE "quoteId" = 'q0'`, "23503");
    await rejected(`UPDATE pulse."QuoteVersion" SET "publicationState" = 'SENT', "sentAt" = now() WHERE "quoteId" = 'q0'`, "23514");
    await rejected(`UPDATE pulse."QuoteVersion" SET "onHold" = true WHERE "quoteId" = 'q0'`, "23514");
    await db.query(`INSERT INTO pulse."QuoteContentSnapshot" (id, "quoteId", "contentVersion", "schemaVersion", payload, "createdByName") VALUES
      ('s0', 'q0', 1, 1, '{"total":"1000.00"}', 'Test'), ('s2', 'q2', 1, 1, '{}', 'Test')`);
    await rejected(`UPDATE pulse."QuoteContentSnapshot" SET payload = '{}' WHERE id = 's0'`, "23514");
    await rejected(`DELETE FROM pulse."QuoteContentSnapshot" WHERE id = 's0'`, "23514");
    await rejected(`UPDATE pulse."QuoteVersion" SET "frozenSnapshotId" = 's2' WHERE "quoteId" = 'q0'`, "23503");
    await db.query(`UPDATE pulse."QuoteVersion" SET "publicationState" = 'SENT', "sentAt" = now(), "frozenSnapshotId" = 's0' WHERE "quoteId" = 'q0'`);
    await db.query(`INSERT INTO pulse."QuoteVersion" ("quoteId", "familyId", "revisionNumber", "previousQuoteId") VALUES ('q1', 'family-a', 1, 'q0')`);
    await db.query(`UPDATE pulse."QuoteFamily" SET "currentDraftId" = 'q1', "currentOfferId" = 'q0' WHERE id = 'family-a'`);
    await db.query(`INSERT INTO pulse."QuoteContentSnapshot" (id, "quoteId", "contentVersion", "schemaVersion", payload, "createdByName") VALUES ('s1', 'q1', 1, 1, '{"total":"1200.00"}', 'Test')`);
    await rejected(`UPDATE pulse."QuoteVersion" SET "publicationState" = 'SENT', "sentAt" = now(), "frozenSnapshotId" = 's1' WHERE "quoteId" = 'q1'`, "23505");
    // Sending a replacement must supersede the old offer in the same transaction.
    await db.query(`UPDATE pulse."QuoteVersion" SET outcome = 'SUPERSEDED' WHERE "quoteId" = 'q0'`);
    await db.query(`UPDATE pulse."QuoteVersion" SET "publicationState" = 'SENT', "sentAt" = now(), "frozenSnapshotId" = 's1' WHERE "quoteId" = 'q1'`);
    await db.query(`UPDATE pulse."QuoteFamily" SET "currentDraftId" = NULL, "currentOfferId" = 'q1' WHERE id = 'family-a'`);
    await rejected(`UPDATE pulse."QuoteVersion" SET "contentVersion" = 2 WHERE "quoteId" = 'q1'`, "23514");
    await rejected(`UPDATE pulse."QuoteVersion" SET "publicationState" = 'DRAFT', "sentAt" = NULL WHERE "quoteId" = 'q1'`, "23514");
    await rejected(`UPDATE pulse."Quote" SET title = 'Changed after sending' WHERE id = 'q1'`, "23514");
    await rejected(`UPDATE pulse."QuoteFamily" SET outcome = 'ACCEPTED' WHERE id = 'family-a'`, "23514");
    await db.query(`UPDATE pulse."QuoteVersion" SET outcome = 'ACCEPTED' WHERE "quoteId" = 'q1'`);
    await db.query(`UPDATE pulse."QuoteFamily" SET outcome = 'ACCEPTED', "currentOfferId" = NULL, "acceptedQuoteId" = 'q1' WHERE id = 'family-a'`);
    await rejected(`UPDATE pulse."QuoteVersion" SET outcome = NULL WHERE "quoteId" = 'q1'`, "23514");

    await db.query(`INSERT INTO pulse."AccessRole" (id, name, "normalizedName", "updatedAt") VALUES ('schema-role', 'Test', 'schema-role', now())`);
    await db.query(`INSERT INTO pulse."LocalUser" (id, name, email, role, "passwordHash", "updatedAt") VALUES
      ('author', 'Author', 'author@schema.test', 'schema-role', 'unused', now()),
      ('reviewer', 'Reviewer', 'reviewer@schema.test', 'schema-role', 'unused', now())`);
    await rejected(`INSERT INTO pulse."QuoteReview" (id, "quoteId", "contentVersion", "snapshotId", "submittedById", "reviewerId") VALUES ('bad', 'q2', 1, 's2', 'author', 'author')`, "23514");
    await db.query(`INSERT INTO pulse."QuoteReview" (id, "quoteId", "contentVersion", "snapshotId", "submittedById", "reviewerId") VALUES ('review', 'q2', 1, 's2', 'author', 'reviewer')`);
    await rejected(`INSERT INTO pulse."QuoteReview" (id, "quoteId", "contentVersion", "snapshotId", "submittedById", "reviewerId") VALUES ('duplicate', 'q2', 1, 's2', 'author', 'reviewer')`, "23505");
    await rejected(`UPDATE pulse."QuoteReview" SET decision = 'APPROVED' WHERE id = 'review'`, "23514");
    await db.query(`UPDATE pulse."QuoteReview" SET decision = 'APPROVED', "respondedAt" = now() WHERE id = 'review'`);
    await db.query(`INSERT INTO pulse."QuoteOperation" (id, "actorId", action, key, "requestHash", result) VALUES ('op', 'author', 'send', 'retry-key', repeat('a', 64), '{}')`);
    await rejected(`INSERT INTO pulse."QuoteOperation" (id, "actorId", action, key, "requestHash", result) VALUES ('op2', 'author', 'send', 'retry-key', repeat('b', 64), '{}')`, "23505");
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
});
