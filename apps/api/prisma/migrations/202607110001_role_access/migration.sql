CREATE TABLE "AccessRole" (
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
);

CREATE TABLE "RolePermission" (
  "roleId" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permission"),
  CONSTRAINT "RolePermission_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "AccessRole"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AccessRole_normalizedName_key" ON "AccessRole"("normalizedName");
CREATE UNIQUE INDEX "AccessRole_systemKey_key" ON "AccessRole"("systemKey");
CREATE INDEX "AccessRole_archivedAt_idx" ON "AccessRole"("archivedAt");
CREATE INDEX "AccessRole_name_idx" ON "AccessRole"("name");
CREATE INDEX "RolePermission_permission_idx" ON "RolePermission"("permission");

INSERT INTO "AccessRole" ("id", "name", "normalizedName", "color", "systemKey", "protected") VALUES
  ('Admin', 'Administrator', 'administrator', '#7C3AED', 'ADMIN', true),
  ('Sales', 'Sales', 'sales', '#2563EB', NULL, false),
  ('ProjectManager', 'Project Manager', 'project manager', '#0F766E', NULL, false),
  ('Technician', 'Technician', 'technician', '#C2410C', NULL, false)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AccessRole" ("id", "name", "normalizedName", "color", "protected")
SELECT DISTINCT "role", "role", 'legacy-' || md5("role"), '#64748B', false
FROM "LocalUser"
WHERE "role" NOT IN ('Admin', 'Sales', 'ProjectManager', 'Technician')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permission")
SELECT role_id, permission
FROM (VALUES
  ('Admin'), ('Sales')
) roles(role_id)
CROSS JOIN (VALUES
  ('requests:read'), ('requests:write'), ('clients:read'), ('clients:write'),
  ('items:read'), ('items:write'), ('quotes:read'), ('quotes:write'),
  ('projects:read'), ('projects:write'), ('billing:read'), ('billing:write'),
  ('activity:write'), ('activity:read'), ('analytics:read')
) permissions(permission)
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permission") VALUES
  ('Admin', 'settings:read'),
  ('Admin', 'settings:write'),
  ('Admin', 'users:manage'),
  ('Admin', 'roles:manage'),
  ('ProjectManager', 'requests:read'),
  ('ProjectManager', 'clients:read'),
  ('ProjectManager', 'items:read'),
  ('ProjectManager', 'quotes:read'),
  ('ProjectManager', 'projects:read'),
  ('ProjectManager', 'billing:read'),
  ('ProjectManager', 'activity:write'),
  ('ProjectManager', 'activity:read'),
  ('ProjectManager', 'analytics:read'),
  ('Technician', 'requests:read'),
  ('Technician', 'clients:read'),
  ('Technician', 'items:read'),
  ('Technician', 'quotes:read'),
  ('Technician', 'projects:read'),
  ('Technician', 'billing:read'),
  ('Technician', 'activity:read'),
  ('Technician', 'analytics:read')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permission")
SELECT "id", permission
FROM "AccessRole"
CROSS JOIN (VALUES
  ('requests:read'), ('clients:read'), ('items:read'), ('quotes:read'),
  ('projects:read'), ('billing:read'), ('activity:read'), ('analytics:read')
) permissions(permission)
WHERE "normalizedName" LIKE 'legacy-%'
ON CONFLICT DO NOTHING;

ALTER TABLE "LocalUser"
  ADD CONSTRAINT "LocalUser_role_fkey"
  FOREIGN KEY ("role") REFERENCES "AccessRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
