import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const apply = process.argv.includes("--apply");
const targetDatabase = process.env.PULSE_CI_PREBASELINE_DATABASE?.trim() || "pulse_prebaseline_ci";
const safeDatabaseName = /^[a-z][a-z0-9_]{5,62}$/;
const migrationsDirectory = resolve(process.cwd(), "prisma/migrations");

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function databaseUrl(source: string, database: string) {
  const url = new URL(source);
  url.pathname = `/${database}`;
  url.searchParams.set("schema", "pulse");
  return url.toString();
}

function connectionUrl(source: string, database: string) {
  const url = new URL(source);
  url.pathname = `/${database}`;
  url.searchParams.delete("schema");
  return url.toString();
}

function runScript(script: string, environment: NodeJS.ProcessEnv) {
  const result = spawnSync("npm", ["run", script], {
    cwd: process.cwd(),
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"]
  });
  if (result.status !== 0) throw new Error(`${script} failed in the isolated pre-baseline verification database.`);
}

const fixtureSql = `
  INSERT INTO "Client" ("id", "clientNumber", "displayName", "updatedAt")
  VALUES ('ci-client', 'CI-LEGACY-001', 'Pre-baseline preservation fixture', CURRENT_TIMESTAMP);

  INSERT INTO "ClientSite" ("id", "clientId", "siteName", "addressLine1", "city", "state", "isPrimarySite", "updatedAt")
  VALUES ('ci-site', 'ci-client', 'Validated legacy site', 'Fixture address', 'San Juan', 'PR', true, CURRENT_TIMESTAMP);

  INSERT INTO "PointOfContact" ("id", "ownerId", "clientId", "name", "firstName", "lastName", "email", "isPrimary", "updatedAt")
  VALUES ('ci-contact', 'ci-client', 'ci-client', 'Fixture Contact', 'Fixture', 'Contact', 'fixture@example.invalid', true, CURRENT_TIMESTAMP);

  INSERT INTO "AccessRole" ("id", "name", "normalizedName", "systemKey", "protected", "updatedAt")
  VALUES ('ci-role', 'Fixture Role', 'fixture role', NULL, false, CURRENT_TIMESTAMP);

  INSERT INTO "LocalUser" ("id", "name", "email", "role", "passwordHash", "updatedAt")
  VALUES ('ci-user', 'Fixture User', 'fixture-user@example.invalid', 'ci-role', 'fixture:0000', CURRENT_TIMESTAMP);

  INSERT INTO "Request" (
    "id", "requestNumber", "title", "requestType", "source", "serviceCategory", "status",
    "clientId", "contactId", "siteId", "assignedToId", "updatedAt"
  ) VALUES (
    'ci-request', 'CI-RQ-001', 'Preserved request', 'Service', 'Legacy import', 'Network', 'Quoted',
    'ci-client', 'ci-contact', 'ci-site', 'ci-user', CURRENT_TIMESTAMP
  );

  INSERT INTO "RequestUpdate" ("id", "requestId", "kind", "title", "body", "authorNameSnapshot", "createdAt", "updatedAt")
  VALUES ('ci-update', 'ci-request', 'Status', 'Legacy request step', 'Preserved request timeline body', 'Fixture User', '2026-01-01T12:00:00Z', '2026-01-01T12:00:00Z');
  UPDATE "Request" SET "currentStepId" = 'ci-update' WHERE "id" = 'ci-request';

  INSERT INTO "Quote" (
    "id", "quoteNumber", "baseQuoteNumber", "revisionNumber", "versionCreatedAt", "sentAt", "sentAtPrecision",
    "title", "clientId", "contactId", "siteId", "assignedToId", "clientName", "status", "owner", "calculationMode",
    "total", "legacyMaterialSale", "legacyMaterialCost", "legacyLaborSale", "legacyLaborCost", "legacyTaxAmount", "updatedAt"
  ) VALUES (
    'ci-quote', 'CI-Q-001', 'CI-Q-001', 1, '2026-01-01T12:00:00Z', '2026-01-02T12:00:00Z', 'EXACT',
    'Preserved quote', 'ci-client', 'ci-contact', 'ci-site', 'ci-user', 'Pre-baseline preservation fixture', 'Sent', 'Fixture User', 'PULSE',
    107.00, 0, 0, 0, 0, 0, CURRENT_TIMESTAMP
  );

  INSERT INTO "Item" ("id", "name", "itemType", "sku", "cost", "sellPrice", "taxable", "updatedAt")
  VALUES ('ci-item', 'Preserved item', 'PRODUCT', 'CI-SKU-001', 60.00, 100.00, true, CURRENT_TIMESTAMP);

  INSERT INTO "ItemPriceHistory" ("id", "itemId", "previousCost", "newCost", "previousSellPrice", "newSellPrice", "changedAt")
  VALUES ('ci-price', 'ci-item', 55.00, 60.00, 95.00, 100.00, '2026-01-01T10:00:00Z');

  INSERT INTO "QuoteItem" (
    "id", "quoteId", "sourceItemId", "name", "itemType", "sku", "quantity", "unitCost", "unitPrice",
    "discountPercent", "taxable", "lineSubtotal", "lineTax", "lineTotal", "updatedAt"
  ) VALUES (
    'ci-line', 'ci-quote', 'ci-item', 'Preserved quote line', 'PRODUCT', 'CI-SKU-001', 1, 60.00, 100.00,
    0, true, 100.00, 7.00, 107.00, CURRENT_TIMESTAMP
  );

  INSERT INTO "QuoteRevision" (
    "id", "quoteId", "revisionNumber", "quoteNumber", "titleSnapshot", "clientIdSnapshot", "clientNameSnapshot",
    "ownerSnapshot", "totalSnapshot", "priorStatus", "outcome", "versionCreatedAt", "sentAt", "requestedAt", "reason",
    "snapshot", "source", "precision", "requestedById", "requestedByName"
  ) VALUES (
    'ci-revision', 'ci-quote', 0, 'CI-Q-001', 'Preserved quote', 'ci-client', 'Pre-baseline preservation fixture',
    'Fixture User', 107.00, 'Sent', 'Revision Requested', '2025-12-20T12:00:00Z', '2025-12-21T12:00:00Z',
    '2026-01-01T12:00:00Z', 'CI preservation fixture', '{"total":107,"lineIds":["ci-line"]}'::jsonb,
    'APPLICATION', 'EXACT', 'ci-user', 'Fixture User'
  );

  INSERT INTO "LifecycleStatusEvent" (
    "id", "entityType", "entityId", "fromStatus", "toStatus", "changedAt", "actorUserId",
    "actorNameSnapshot", "valueSnapshot", "metadata", "source", "precision"
  ) VALUES (
    'ci-event', 'QUOTE', 'ci-quote', 'Draft', 'Sent', '2026-01-02T12:00:00Z', 'ci-user',
    'Fixture User', 107.00, '{"fixture":true}'::jsonb, 'APPLICATION', 'EXACT'
  );

  INSERT INTO "LifecycleDocument" (
    "id", "quoteId", "objectKey", "originalFileName", "mediaType", "byteSize", "sha256", "category",
    "tags", "scanStatus", "uploadedById", "uploadedByName", "updatedAt"
  ) VALUES (
    'ci-document', 'ci-quote', 'ci/fixture-document.pdf', 'fixture-document.pdf', 'application/pdf', 1234,
    repeat('a', 64), 'Proposal', ARRAY['ci', 'preservation'], 'Clean', 'ci-user', 'Fixture User', CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX "Request_currentStepId_key" ON "Request"("currentStepId");
  ALTER TABLE "Request" ADD CONSTRAINT "Request_currentStepId_fkey"
    FOREIGN KEY ("currentStepId") REFERENCES "RequestUpdate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
`;

async function preservationState(client: Client) {
  const result = await client.query<{ state: unknown }>(`
    SELECT jsonb_build_object(
      'request', (SELECT to_jsonb(r) - 'updatedAt' - 'createdAt' FROM "Request" r WHERE id = 'ci-request'),
      'update', (SELECT to_jsonb(u) - 'updatedAt' - 'createdAt' FROM "RequestUpdate" u WHERE id = 'ci-update'),
      'quote', (SELECT to_jsonb(q) - 'updatedAt' - 'createdAt' FROM "Quote" q WHERE id = 'ci-quote'),
      'line', (SELECT to_jsonb(qi) - 'updatedAt' - 'createdAt' FROM "QuoteItem" qi WHERE id = 'ci-line'),
      'revision', (SELECT to_jsonb(qr) - 'createdAt' FROM "QuoteRevision" qr WHERE id = 'ci-revision'),
      'price', (SELECT to_jsonb(ph) FROM "ItemPriceHistory" ph WHERE id = 'ci-price'),
      'document', (SELECT to_jsonb(d) - 'updatedAt' - 'createdAt' FROM "LifecycleDocument" d WHERE id = 'ci-document'),
      'event', (SELECT to_jsonb(e) - 'createdAt' FROM "LifecycleStatusEvent" e WHERE id = 'ci-event')
    ) AS state
  `);
  const serialized = JSON.stringify(result.rows[0]?.state ?? null);
  return createHash("sha256").update(serialized).digest("hex");
}

async function main() {
  if (!safeDatabaseName.test(targetDatabase) || !targetDatabase.endsWith("_prebaseline_ci")) {
    throw new Error("PULSE_CI_PREBASELINE_DATABASE must be a safe name ending in _prebaseline_ci.");
  }
  if (process.env.NODE_ENV !== "test" || process.env.PULSE_ALLOW_CI_DATABASE_CREATE !== "1") {
    throw new Error("Pre-baseline database verification is restricted to explicit test environments.");
  }

  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "PREVIEW",
    targetDatabase,
    changes: [
      "create an isolated CI database if absent",
      "install the validated pre-0.1 schema and preservation fixture",
      "adopt the baseline without replaying it",
      "deploy the enterprise migration and verify preserved data"
    ],
    productionDataAffected: false
  }, null, 2));
  if (!apply) return;

  const adminSource = required("PULSE_DATABASE_ADMIN_URL");
  const migrationSource = required("PULSE_DATABASE_MIGRATION_URL");
  const appSource = required("PULSE_DATABASE_APP_URL");
  const admin = new Client({ connectionString: connectionUrl(adminSource, new URL(adminSource).pathname.slice(1)) });
  await admin.connect();
  try {
    const exists = await admin.query<{ exists: boolean }>("SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists", [targetDatabase]);
    if (!exists.rows[0]?.exists) {
      await admin.query(`CREATE DATABASE "${targetDatabase}"`);
    } else {
      const targetAdmin = new Client({ connectionString: connectionUrl(adminSource, targetDatabase) });
      await targetAdmin.connect();
      try {
        const populated = await targetAdmin.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'pulse'"
        );
        if (Number(populated.rows[0]?.count ?? 0) > 0) {
          throw new Error("The isolated pre-baseline verification database is not empty; refusing to overwrite it.");
        }
      } finally {
        await targetAdmin.end();
      }
    }
  } finally {
    await admin.end();
  }

  const targetAdminUrl = databaseUrl(adminSource, targetDatabase);
  const targetMigrationUrl = databaseUrl(migrationSource, targetDatabase);
  const targetAppUrl = databaseUrl(appSource, targetDatabase);
  const targetEnvironment = {
    ...process.env,
    DATABASE_URL: targetMigrationUrl,
    PULSE_DATABASE_ADMIN_URL: targetAdminUrl,
    PULSE_DATABASE_MIGRATION_URL: targetMigrationUrl,
    PULSE_DATABASE_APP_URL: targetAppUrl
  };

  runScript("db:roles:apply", targetEnvironment);
  const migration = new Client({ connectionString: connectionUrl(targetMigrationUrl, targetDatabase) });
  await migration.connect();
  let beforeDigest: string;
  try {
    await migration.query("SET search_path = pulse, pg_catalog");
    const baselineSql = readFileSync(
      resolve(migrationsDirectory, "202607210001_pulse_0_1_baseline/migration.sql"),
      "utf8"
    );
    await migration.query(baselineSql);
    await migration.query(fixtureSql);
    beforeDigest = await preservationState(migration);
  } finally {
    await migration.end();
  }

  runScript("db:baseline:preview", targetEnvironment);
  runScript("db:baseline:apply", targetEnvironment);
  runScript("db:migrate:deploy", targetEnvironment);
  runScript("db:roles:apply", targetEnvironment);
  runScript("db:roles:verify", { ...targetEnvironment, DATABASE_URL: targetAppUrl });

  const verification = new Client({ connectionString: connectionUrl(targetMigrationUrl, targetDatabase) });
  await verification.connect();
  try {
    await verification.query("SET search_path = pulse, pg_catalog");
    const afterDigest = await preservationState(verification);
    const ledger = await verification.query<{ migration_name: string }>(`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name
    `);
    const obsolete = await verification.query<{ constraint_exists: boolean; index_exists: boolean }>(`
      SELECT
        EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace = 'pulse'::regnamespace AND conname = 'Request_currentStepId_fkey') AS constraint_exists,
        EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'pulse' AND indexname = 'Request_currentStepId_key') AS index_exists
    `);
    const enterprise = await verification.query<{ security_tables: string; demo_column: boolean; placeholder_column: boolean }>(`
      SELECT
        (SELECT count(*)::text FROM information_schema.tables
          WHERE table_schema = 'pulse' AND table_name IN ('AuthSession', 'AuthThrottleBucket', 'MaintenanceRun', 'LifecycleEventDisposition')) AS security_tables,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'pulse' AND table_name = 'LocalUser' AND column_name = 'isDemoAccount') AS demo_column,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'pulse' AND table_name = 'ClientSite' AND column_name = 'isPlaceholder') AS placeholder_column
    `);
    const migrations = ledger.rows.map((row) => row.migration_name);
    // Derive this list from disk so adding a Prisma migration needs no matching CI maintenance.
    const expectedMigrations = readdirSync(migrationsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    // Exact equality catches missing, unexpected, and out-of-order applied migrations.
    const valid = beforeDigest === afterDigest &&
      JSON.stringify(migrations) === JSON.stringify(expectedMigrations) &&
      obsolete.rows[0]?.constraint_exists === false &&
      obsolete.rows[0]?.index_exists === false &&
      Number(enterprise.rows[0]?.security_tables ?? 0) === 4 &&
      enterprise.rows[0]?.demo_column === true &&
      enterprise.rows[0]?.placeholder_column === true;
    console.log(JSON.stringify({
      status: valid ? "ok" : "failed",
      targetDatabase,
      preservedFixtureDigest: afterDigest,
      migrations,
      expectedMigrations,
      obsoleteCompatibilityObjectsRemoved: !obsolete.rows[0]?.constraint_exists && !obsolete.rows[0]?.index_exists,
      enterpriseSchemaPresent: Number(enterprise.rows[0]?.security_tables ?? 0) === 4
    }, null, 2));
    if (!valid) throw new Error("Pre-baseline adoption verification failed.");
  } finally {
    await verification.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Pre-baseline adoption verification failed.");
  process.exitCode = 1;
});
