-- Move client phone/email data onto PointOfContact before removing redundant Client columns.
-- Prisma does not support PostgreSQL partial unique indexes directly, so the
-- one-primary-contact rule is enforced here with raw SQL and mirrored in the
-- service layer transactions.

INSERT INTO "PointOfContact" (
  "id",
  "ownerType",
  "ownerId",
  "clientId",
  "role",
  "name",
  "firstName",
  "lastName",
  "email",
  "phone",
  "preferredContactMethod",
  "isPrimary",
  "isBilling",
  "isPrimaryContact",
  "isBillingContact",
  "createdAt",
  "updatedAt"
)
SELECT
  'poc_migr_primary_' || c."id",
  'Client',
  c."id",
  c."id",
  'Primary',
  COALESCE(NULLIF(TRIM(c."displayName"), ''), NULLIF(TRIM(c."legalName"), ''), 'Primary Contact'),
  'Primary',
  'Contact',
  LOWER(NULLIF(TRIM(c."mainEmail"), '')),
  NULLIF(TRIM(c."mainPhone"), ''),
  CASE
    WHEN NULLIF(TRIM(c."mainEmail"), '') IS NOT NULL THEN 'Email'
    WHEN NULLIF(TRIM(c."mainPhone"), '') IS NOT NULL THEN 'Phone'
    ELSE 'Email'
  END,
  TRUE,
  FALSE,
  TRUE,
  FALSE,
  NOW(),
  NOW()
FROM "Client" c
WHERE (
  NULLIF(TRIM(c."mainEmail"), '') IS NOT NULL
  OR NULLIF(TRIM(c."mainPhone"), '') IS NOT NULL
)
AND NOT EXISTS (
  SELECT 1
  FROM "PointOfContact" p
  WHERE p."clientId" = c."id"
  AND (
    (
      NULLIF(TRIM(c."mainEmail"), '') IS NOT NULL
      AND LOWER(COALESCE(p."email", '')) = LOWER(TRIM(c."mainEmail"))
    )
    OR (
      NULLIF(TRIM(c."mainPhone"), '') IS NOT NULL
      AND REGEXP_REPLACE(COALESCE(p."phone", ''), '\D', '', 'g') = REGEXP_REPLACE(TRIM(c."mainPhone"), '\D', '', 'g')
    )
  )
)
ON CONFLICT ("id") DO NOTHING;

UPDATE "PointOfContact" p
SET
  "isBilling" = TRUE,
  "isBillingContact" = TRUE,
  "updatedAt" = NOW()
FROM "Client" c
WHERE p."clientId" = c."id"
AND NULLIF(TRIM(c."billingEmail"), '') IS NOT NULL
AND LOWER(COALESCE(p."email", '')) = LOWER(TRIM(c."billingEmail"));

INSERT INTO "PointOfContact" (
  "id",
  "ownerType",
  "ownerId",
  "clientId",
  "role",
  "name",
  "firstName",
  "lastName",
  "email",
  "preferredContactMethod",
  "isPrimary",
  "isBilling",
  "isPrimaryContact",
  "isBillingContact",
  "createdAt",
  "updatedAt"
)
SELECT
  'poc_migr_billing_' || c."id",
  'Client',
  c."id",
  c."id",
  'Billing',
  'Billing Contact',
  'Billing',
  'Contact',
  LOWER(NULLIF(TRIM(c."billingEmail"), '')),
  'Email',
  FALSE,
  TRUE,
  FALSE,
  TRUE,
  NOW(),
  NOW()
FROM "Client" c
WHERE NULLIF(TRIM(c."billingEmail"), '') IS NOT NULL
AND NOT EXISTS (
  SELECT 1
  FROM "PointOfContact" p
  WHERE p."clientId" = c."id"
  AND LOWER(COALESCE(p."email", '')) = LOWER(TRIM(c."billingEmail"))
)
ON CONFLICT ("id") DO NOTHING;

WITH ranked_primary AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "clientId"
      ORDER BY "isPrimaryContact" DESC, "updatedAt" DESC, "createdAt" ASC, "id" ASC
    ) AS primary_rank
  FROM "PointOfContact"
  WHERE "clientId" IS NOT NULL
  AND ("isPrimary" = TRUE OR "isPrimaryContact" = TRUE)
)
UPDATE "PointOfContact" p
SET
  "isPrimary" = ranked_primary.primary_rank = 1,
  "isPrimaryContact" = ranked_primary.primary_rank = 1,
  "updatedAt" = NOW()
FROM ranked_primary
WHERE p."id" = ranked_primary."id";

DROP INDEX IF EXISTS "Client_clientType_idx";

ALTER TABLE "Client"
  DROP COLUMN IF EXISTS "clientType",
  DROP COLUMN IF EXISTS "mainPhone",
  DROP COLUMN IF EXISTS "mainEmail",
  DROP COLUMN IF EXISTS "billingEmail";

CREATE UNIQUE INDEX IF NOT EXISTS "PointOfContact_one_primary_per_client_idx"
  ON "PointOfContact"("clientId")
  WHERE "clientId" IS NOT NULL AND "isPrimary" = TRUE;
