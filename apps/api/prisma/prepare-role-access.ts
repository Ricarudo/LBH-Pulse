import "dotenv/config";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const client = new Client({ connectionString });

const allWorkPermissions = [
  "requests:read", "requests:write", "clients:read", "clients:write",
  "items:read", "items:write", "quotes:read", "quotes:write",
  "projects:read", "projects:write", "billing:read", "billing:write",
  "activity:write", "activity:read", "analytics:read"
];
const projectManagerPermissions = [
  "requests:read", "clients:read", "items:read", "quotes:read",
  "projects:read", "billing:read", "activity:write", "activity:read", "analytics:read"
];
const technicianPermissions = [
  "requests:read", "clients:read", "items:read", "quotes:read",
  "projects:read", "billing:read", "activity:read", "analytics:read"
];

function values(values: string[]) {
  return values.map((value) => `('${value.replaceAll("'", "''")}')`).join(",");
}

async function main() {
  await client.connect();
  await client.query("BEGIN");
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS "pulse"');
    await client.query('SET search_path TO "pulse"');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "AccessRole" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "normalizedName" TEXT NOT NULL,
        "color" TEXT NOT NULL DEFAULT '#64748B',
        "systemKey" TEXT,
        "protected" BOOLEAN NOT NULL DEFAULT false,
        "archivedAt" TIMESTAMP(3),
        "version" INTEGER NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AccessRole_pkey" PRIMARY KEY ("id")
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "RolePermission" (
        "roleId" TEXT NOT NULL,
        "permission" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permission")
      )
    `);
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "AccessRole_normalizedName_key" ON "AccessRole"("normalizedName")');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "AccessRole_systemKey_key" ON "AccessRole"("systemKey")');
    await client.query('CREATE INDEX IF NOT EXISTS "AccessRole_archivedAt_idx" ON "AccessRole"("archivedAt")');
    await client.query('CREATE INDEX IF NOT EXISTS "AccessRole_name_idx" ON "AccessRole"("name")');
    await client.query('CREATE INDEX IF NOT EXISTS "RolePermission_permission_idx" ON "RolePermission"("permission")');
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolePermission_roleId_fkey') THEN
          ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey"
          FOREIGN KEY ("roleId") REFERENCES "AccessRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    const roleSeeds = [
      { id: "Admin", name: "Administrator", normalizedName: "administrator", color: "#7C3AED", systemKey: "ADMIN", protected: true, permissions: [...allWorkPermissions, "audit:read", "settings:read", "settings:write", "users:manage", "roles:manage"] },
      { id: "Sales", name: "Sales", normalizedName: "sales", color: "#2563EB", systemKey: null, protected: false, permissions: allWorkPermissions },
      { id: "ProjectManager", name: "Project Manager", normalizedName: "project manager", color: "#0F766E", systemKey: null, protected: false, permissions: projectManagerPermissions },
      { id: "Technician", name: "Technician", normalizedName: "technician", color: "#C2410C", systemKey: null, protected: false, permissions: technicianPermissions }
    ];

    for (const role of roleSeeds) {
      const inserted = await client.query<{ id: string }>(`
        INSERT INTO "AccessRole" ("id", "name", "normalizedName", "color", "systemKey", "protected", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT ("id") DO NOTHING
        RETURNING "id"
      `, [role.id, role.name, role.normalizedName, role.color, role.systemKey, role.protected]);
      if (inserted.rowCount) {
        await client.query(`
          INSERT INTO "RolePermission" ("roleId", "permission")
          SELECT $1, permission FROM (VALUES ${values(role.permissions)}) AS permissions(permission)
          ON CONFLICT DO NOTHING
        `, [role.id]);
      }
    }

    await client.query(`
      INSERT INTO "RolePermission" ("roleId", "permission")
      SELECT "id", 'audit:read'
      FROM "AccessRole"
      WHERE "protected" = true AND "systemKey" = 'ADMIN'
      ON CONFLICT DO NOTHING
    `);

    const localUsersExist = await client.query<{ exists: boolean }>(
      `SELECT to_regclass('pulse."LocalUser"') IS NOT NULL AS exists`
    );
    if (localUsersExist.rows[0]?.exists) {
      const legacyRoles = await client.query<{ id: string }>(`
        INSERT INTO "AccessRole" ("id", "name", "normalizedName", "color", "protected", "updatedAt")
        SELECT DISTINCT "role", "role", 'legacy-' || md5("role"), '#64748B', false, CURRENT_TIMESTAMP
        FROM "LocalUser"
        WHERE "role" NOT IN ('Admin', 'Sales', 'ProjectManager', 'Technician')
        ON CONFLICT ("id") DO NOTHING
        RETURNING "id"
      `);
      for (const role of legacyRoles.rows) {
        await client.query(`
          INSERT INTO "RolePermission" ("roleId", "permission")
          SELECT $1, permission FROM (VALUES ${values(technicianPermissions)}) AS permissions(permission)
          ON CONFLICT DO NOTHING
        `, [role.id]);
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
