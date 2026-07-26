import "dotenv/config";
import { Client } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const expectedRole = process.env.PULSE_DB_APP_USER?.trim();
  if (!expectedRole) throw new Error("PULSE_DB_APP_USER is required.");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const role = (await client.query<{
      rolname: string;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
      database_create: boolean;
      schema_create: boolean;
    }>(`
      SELECT r.rolname, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication,
             r.rolbypassrls, has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
             has_schema_privilege(current_user, 'pulse', 'CREATE') AS schema_create
      FROM pg_roles r WHERE r.rolname = current_user
    `)).rows[0];
    const owned = await client.query<{ schema_name: string; object_name: string }>(`
      SELECT n.nspname AS schema_name, c.relname AS object_name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY n.nspname, c.relname
    `);
    const grants = await client.query<{ privilege_type: string }>(`
      SELECT DISTINCT privilege_type FROM information_schema.role_table_grants
      WHERE grantee = current_user AND table_schema = 'pulse' ORDER BY privilege_type
    `);
    const actualGrants = grants.rows.map((row) => row.privilege_type);
    const expectedGrants = ["DELETE", "INSERT", "SELECT", "UPDATE"];
    const failures: string[] = [];
    if (!role || role.rolname !== expectedRole) failures.push("connected role does not match PULSE_DB_APP_USER");
    if (role && (role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.rolbypassrls)) {
      failures.push("runtime role has elevated cluster attributes");
    }
    if (role?.database_create) failures.push("runtime role can create objects in the database");
    if (role?.schema_create) failures.push("runtime role can create objects in the pulse schema");
    if (owned.rowCount) failures.push("runtime role owns database relations");
    if (JSON.stringify(actualGrants) !== JSON.stringify(expectedGrants)) failures.push("runtime table grants differ from the DML-only allowlist");

    console.log(JSON.stringify({
      status: failures.length ? "failed" : "ok",
      role,
      ownedRelations: owned.rows,
      tableGrants: actualGrants,
      failures
    }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Runtime role verification failed.");
  process.exitCode = 1;
});
