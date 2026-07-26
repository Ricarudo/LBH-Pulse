CREATE INDEX IF NOT EXISTS "Activity_relatedEntityType_createdAt_idx"
  ON "Activity"("relatedEntityType", "createdAt");

INSERT INTO "RolePermission" ("roleId", "permission")
SELECT "id", 'audit:read'
FROM "AccessRole"
WHERE "protected" = true AND "systemKey" = 'ADMIN'
ON CONFLICT DO NOTHING;
