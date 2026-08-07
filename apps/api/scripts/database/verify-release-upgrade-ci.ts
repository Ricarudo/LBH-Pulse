import "dotenv/config";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const sourceVersion = "0.1.1";
const targetVersion = "0.1.2";
const targetDatabase = process.env.PULSE_CI_RELEASE_UPGRADE_DATABASE?.trim() || "pulse_release_upgrade_ci";
const safeDatabaseName = /^[a-z][a-z0-9_]{5,62}$/;
const prismaDirectory = resolve(process.cwd(), "prisma");
const migrationsDirectory = resolve(prismaDirectory, "migrations");
const sourceMigrations = [
  "202607210001_pulse_0_1_baseline",
  "202607210002_enterprise_security",
  "202607290001_record_number_sequences",
  "202607300001_client_consolidation",
  "202608030001_quote_due_date",
  "202608030002_lifecycle_collaborators"
];
const targetMigrations = [
  "202608070001_project_quote_change_orders"
];

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

function runNpmScript(script: string, environment: NodeJS.ProcessEnv) {
  const result = spawnSync("npm", ["run", script], {
    cwd: process.cwd(),
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"]
  });
  if (result.status !== 0) throw new Error(`${script} failed for the isolated ${sourceVersion} upgrade database.`);
}

function installSourceMigrations(environment: NodeJS.ProcessEnv) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "pulse-release-upgrade-"));
  const temporaryPrisma = join(temporaryRoot, "prisma");
  const temporaryMigrations = join(temporaryPrisma, "migrations");
  try {
    mkdirSync(temporaryMigrations, { recursive: true });
    cpSync(resolve(prismaDirectory, "schema.prisma"), resolve(temporaryPrisma, "schema.prisma"));
    cpSync(resolve(migrationsDirectory, "migration_lock.toml"), resolve(temporaryMigrations, "migration_lock.toml"));
    for (const migration of sourceMigrations) {
      cpSync(resolve(migrationsDirectory, migration), resolve(temporaryMigrations, migration), { recursive: true });
    }
    const result = spawnSync(
      "npx",
      ["prisma", "migrate", "deploy", "--schema", resolve(temporaryPrisma, "schema.prisma")],
      {
        cwd: process.cwd(),
        env: environment,
        encoding: "utf8",
        stdio: ["ignore", "inherit", "inherit"]
      }
    );
    if (result.status !== 0) throw new Error(`Failed to install the ${sourceVersion} migration ledger.`);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

const fixtureSql = `
  INSERT INTO "AccessRole" ("id", "name", "normalizedName", "protected", "updatedAt")
  VALUES ('upgrade-role', 'Upgrade Role', 'upgrade role', false, CURRENT_TIMESTAMP);

  INSERT INTO "LocalUser" ("id", "name", "email", "role", "passwordHash", "updatedAt")
  VALUES ('upgrade-user', 'Upgrade User', 'upgrade-user@example.invalid', 'upgrade-role', 'fixture:0000', CURRENT_TIMESTAMP);

  INSERT INTO "LifecycleContext" ("id", "details", "updatedById", "updatedByNameSnapshot", "updatedAt")
  VALUES ('upgrade-lifecycle', 'Preserve this lifecycle context', 'upgrade-user', 'Upgrade User', CURRENT_TIMESTAMP);

  INSERT INTO "Request" (
    "id", "requestNumber", "title", "requestType", "source", "serviceCategory", "status",
    "assignedToId", "lifecycleContextId", "createdById", "updatedAt"
  ) VALUES (
    'upgrade-request', 'UP-RQ-0001', 'Preserved release request', 'Service', 'Application', 'Network', 'Quoted',
    'upgrade-user', 'upgrade-lifecycle', 'upgrade-user', CURRENT_TIMESTAMP
  );

  INSERT INTO "RequestCollaborator" ("id", "requestId", "userId", "addedById", "createdAt")
  VALUES ('upgrade-collaborator', 'upgrade-request', 'upgrade-user', 'upgrade-user', '2026-08-01T12:00:00Z');

  INSERT INTO "LifecycleCollaborator" ("id", "lifecycleContextId", "userId", "addedById", "createdAt")
  VALUES ('upgrade-collaborator', 'upgrade-lifecycle', 'upgrade-user', 'upgrade-user', '2026-08-01T12:00:00Z');

  INSERT INTO "Quote" (
    "id", "quoteNumber", "title", "assignedToId", "lifecycleContextId", "status", "owner", "updatedAt"
  ) VALUES (
    'upgrade-quote', 'UP-Q-0001', 'Preserved release quote', 'upgrade-user', 'upgrade-lifecycle', 'Draft',
    'Upgrade User', CURRENT_TIMESTAMP
  );
`;

async function fixtureDigest(client: Client) {
  const result = await client.query<{ state: unknown }>(`
    SELECT jsonb_build_object(
      'role', (SELECT to_jsonb(r) - 'createdAt' - 'updatedAt' FROM "AccessRole" r WHERE id = 'upgrade-role'),
      'user', (SELECT to_jsonb(u) - 'createdAt' - 'updatedAt' FROM "LocalUser" u WHERE id = 'upgrade-user'),
      'lifecycle', (SELECT to_jsonb(l) - 'createdAt' - 'updatedAt' FROM "LifecycleContext" l WHERE id = 'upgrade-lifecycle'),
      'request', (SELECT to_jsonb(r) - 'createdAt' - 'updatedAt' FROM "Request" r WHERE id = 'upgrade-request'),
      'requestCollaborator', (SELECT to_jsonb(c) FROM "RequestCollaborator" c WHERE id = 'upgrade-collaborator'),
      'lifecycleCollaborator', (SELECT to_jsonb(c) FROM "LifecycleCollaborator" c WHERE id = 'upgrade-collaborator'),
      'quote', (SELECT to_jsonb(q) - 'createdAt' - 'updatedAt' - 'dueDate' FROM "Quote" q WHERE id = 'upgrade-quote')
    ) AS state
  `);
  return createHash("sha256").update(JSON.stringify(result.rows[0]?.state ?? null)).digest("hex");
}

async function main() {
  if (!safeDatabaseName.test(targetDatabase) || !targetDatabase.endsWith("_release_upgrade_ci")) {
    throw new Error("PULSE_CI_RELEASE_UPGRADE_DATABASE must be a safe name ending in _release_upgrade_ci.");
  }
  if (process.env.NODE_ENV !== "test" || process.env.PULSE_ALLOW_CI_DATABASE_CREATE !== "1") {
    throw new Error("Release-upgrade verification is restricted to explicit test environments.");
  }

  const diskMigrations = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expectedMigrations = [...sourceMigrations, ...targetMigrations];
  if (JSON.stringify(diskMigrations) !== JSON.stringify(expectedMigrations)) {
    throw new Error(`The ${sourceVersion} -> ${targetVersion} migration contract is stale; review the release-upgrade fixture.`);
  }

  console.log(JSON.stringify({
    mode: "APPLY",
    sourceVersion,
    targetVersion,
    targetDatabase,
    sourceMigrations,
    targetMigrations,
    productionDataAffected: false
  }, null, 2));

  const adminSource = required("PULSE_DATABASE_ADMIN_URL");
  const migrationSource = required("PULSE_DATABASE_MIGRATION_URL");
  const appSource = required("PULSE_DATABASE_APP_URL");
  const adminDatabase = new URL(adminSource).pathname.slice(1);
  const admin = new Client({ connectionString: connectionUrl(adminSource, adminDatabase) });
  await admin.connect();
  try {
    const exists = await admin.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [targetDatabase]
    );
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
          throw new Error("The isolated release-upgrade verification database is not empty; refusing to overwrite it.");
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

  runNpmScript("db:roles:apply", targetEnvironment);
  installSourceMigrations(targetEnvironment);

  const fixture = new Client({ connectionString: connectionUrl(targetMigrationUrl, targetDatabase) });
  let beforeDigest: string;
  await fixture.connect();
  try {
    await fixture.query("SET search_path = pulse, pg_catalog");
    await fixture.query(fixtureSql);
    beforeDigest = await fixtureDigest(fixture);
  } finally {
    await fixture.end();
  }

  runNpmScript("db:migrate:deploy", targetEnvironment);
  runNpmScript("db:migrate:deploy", targetEnvironment);
  runNpmScript("db:roles:apply", targetEnvironment);
  runNpmScript("db:roles:verify", { ...targetEnvironment, DATABASE_URL: targetAppUrl });

  const verification = new Client({ connectionString: connectionUrl(targetMigrationUrl, targetDatabase) });
  await verification.connect();
  try {
    await verification.query("SET search_path = pulse, pg_catalog");
    const afterDigest = await fixtureDigest(verification);
    const ledger = await verification.query<{ migration_name: string }>(`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY started_at, migration_name
    `);
    const schema = await verification.query<{ due_date: boolean; collaborators: boolean }>(`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'pulse' AND table_name = 'Quote' AND column_name = 'dueDate'
        ) AS due_date,
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'pulse' AND table_name = 'LifecycleCollaborator'
        ) AS collaborators
    `);
    const preservation = await verification.query<{
      request_collaborators: string;
      lifecycle_collaborators: string;
      copied_exactly: boolean;
      quote_due_date_is_null: boolean;
    }>(`
      SELECT
        (SELECT count(*)::text FROM "RequestCollaborator" WHERE id = 'upgrade-collaborator') AS request_collaborators,
        (SELECT count(*)::text FROM "LifecycleCollaborator" WHERE id = 'upgrade-collaborator') AS lifecycle_collaborators,
        EXISTS (
          SELECT 1
          FROM "RequestCollaborator" rc
          JOIN "Request" r ON r.id = rc."requestId"
          JOIN "LifecycleCollaborator" lc ON lc.id = rc.id
          WHERE rc.id = 'upgrade-collaborator'
            AND lc."lifecycleContextId" = r."lifecycleContextId"
            AND lc."userId" = rc."userId"
            AND lc."addedById" IS NOT DISTINCT FROM rc."addedById"
            AND lc."createdAt" = rc."createdAt"
        ) AS copied_exactly,
        (SELECT "dueDate" IS NULL FROM "Quote" WHERE id = 'upgrade-quote') AS quote_due_date_is_null
    `);
    const appliedMigrations = ledger.rows.map((row) => row.migration_name);
    const valid = beforeDigest === afterDigest &&
      JSON.stringify(appliedMigrations) === JSON.stringify(expectedMigrations) &&
      schema.rows[0]?.due_date === true &&
      schema.rows[0]?.collaborators === true &&
      preservation.rows[0]?.request_collaborators === "1" &&
      preservation.rows[0]?.lifecycle_collaborators === "1" &&
      preservation.rows[0]?.copied_exactly === true &&
      preservation.rows[0]?.quote_due_date_is_null === true;
    console.log(JSON.stringify({
      status: valid ? "ok" : "failed",
      sourceVersion,
      targetVersion,
      targetDatabase,
      preservedFixtureDigest: afterDigest,
      appliedMigrations,
      dueDateAdded: schema.rows[0]?.due_date === true,
      collaboratorBackfillPreserved: preservation.rows[0]?.copied_exactly === true
    }, null, 2));
    if (!valid) throw new Error(`Release upgrade verification failed for ${sourceVersion} -> ${targetVersion}.`);
  } finally {
    await verification.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Release-upgrade verification failed.");
  process.exitCode = 1;
});
