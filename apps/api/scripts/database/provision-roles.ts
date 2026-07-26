import "dotenv/config";
import { Client } from "pg";

const apply = process.argv.includes("--apply");
const rolePattern = /^[a-z_][a-z0-9_-]{2,62}$/;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function roleName(name: string) {
  const value = required(name);
  if (!rolePattern.test(value)) throw new Error(`${name} is not a safe PostgreSQL role name.`);
  return value;
}

function quoted(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function formatted(client: Client, template: string, values: string[]) {
  const placeholders = values.map((_, index) => `$${index + 2}::text`).join(", ");
  const result = await client.query<{ sql: string }>(
    `SELECT format($1::text, ${placeholders}) AS sql`,
    [template, ...values]
  );
  return result.rows[0]!.sql;
}

async function ensureRole(client: Client, name: string, password: string) {
  const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [name]);
  if (!exists.rowCount) {
    await client.query(await formatted(client, "CREATE ROLE %I LOGIN", [name]));
  }
  await client.query(await formatted(
    client,
    "ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
    [name, password]
  ));
}

async function main() {
  const connectionString = required("PULSE_DATABASE_ADMIN_URL");
  const migrationRole = roleName("PULSE_DB_MIGRATION_USER");
  const migrationPassword = required("PULSE_DB_MIGRATION_PASSWORD");
  const appRole = roleName("PULSE_DB_APP_USER");
  const appPassword = required("PULSE_DB_APP_PASSWORD");
  if (migrationPassword.length < 24 || appPassword.length < 24 || migrationPassword === appPassword) {
    throw new Error("Database role passwords must be different and contain at least 24 characters.");
  }
  if (migrationRole === appRole) throw new Error("Migration and runtime roles must be different.");

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const database = (await client.query<{ database: string; current_user: string }>(
      "SELECT current_database() AS database, current_user"
    )).rows[0]!;
    const roles = await client.query<{
      rolname: string;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
    }>(`
      SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname
    `, [[migrationRole, appRole]]);
    const schema = await client.query<{ owner: string }>(`
      SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = 'pulse'
    `);
    console.log(JSON.stringify({
      mode: apply ? "APPLY" : "PREVIEW",
      database: database.database,
      administratorRole: database.current_user,
      existingRoles: roles.rows,
      currentPulseSchemaOwner: schema.rows[0]?.owner ?? null,
      proposed: {
        migrationRole: { name: migrationRole, ownsPulseSchema: true, elevatedClusterPrivileges: false },
        runtimeRole: { name: appRole, schemaCreate: false, tablePrivileges: ["SELECT", "INSERT", "UPDATE", "DELETE"], elevatedClusterPrivileges: false },
        unrelatedSchemasChanged: false
      }
    }, null, 2));
    if (!apply) return;

    await client.query("BEGIN");
    try {
      await ensureRole(client, migrationRole, migrationPassword);
      await ensureRole(client, appRole, appPassword);
      await client.query(await formatted(client, "GRANT CONNECT ON DATABASE %I TO %I", [database.database, migrationRole]));
      await client.query(await formatted(client, "GRANT CONNECT ON DATABASE %I TO %I", [database.database, appRole]));
      await client.query(await formatted(client, "CREATE SCHEMA IF NOT EXISTS pulse AUTHORIZATION %I", [migrationRole]));
      await client.query(await formatted(client, "ALTER SCHEMA pulse OWNER TO %I", [migrationRole]));

      const relations = await client.query<{ kind: string; name: string }>(`
        SELECT CASE c.relkind WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END AS kind, c.relname AS name
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'pulse' AND c.relkind IN ('r', 'p', 'S')
        ORDER BY c.relkind, c.relname
      `);
      for (const relation of relations.rows) {
        await client.query(await formatted(client, `ALTER ${relation.kind} pulse.%I OWNER TO %I`, [relation.name, migrationRole]));
      }
      const types = await client.query<{ name: string }>(`
        SELECT t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'pulse' AND t.typtype IN ('e', 'd') ORDER BY t.typname
      `);
      for (const type of types.rows) {
        await client.query(await formatted(client, "ALTER TYPE pulse.%I OWNER TO %I", [type.name, migrationRole]));
      }

      await client.query("REVOKE CREATE ON SCHEMA pulse FROM PUBLIC");
      await client.query(`REVOKE ALL ON SCHEMA pulse FROM ${quoted(appRole)}`);
      await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA pulse FROM ${quoted(appRole)}`);
      await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA pulse FROM ${quoted(appRole)}`);
      await client.query(`GRANT USAGE ON SCHEMA pulse TO ${quoted(appRole)}`);
      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pulse TO ${quoted(appRole)}`);
      await client.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA pulse TO ${quoted(appRole)}`);
      await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${quoted(migrationRole)} IN SCHEMA pulse GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quoted(appRole)}`);
      await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${quoted(migrationRole)} IN SCHEMA pulse GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${quoted(appRole)}`);
      await client.query(await formatted(client, "ALTER ROLE %I IN DATABASE %I SET search_path = pulse, pg_catalog", [migrationRole, database.database]));
      await client.query(await formatted(client, "ALTER ROLE %I IN DATABASE %I SET search_path = pulse, pg_catalog", [appRole, database.database]));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    console.log("Restricted PostgreSQL roles provisioned. No password value was logged.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Database role provisioning failed.");
  process.exitCode = 1;
});
