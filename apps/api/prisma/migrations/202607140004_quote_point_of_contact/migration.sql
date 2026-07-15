ALTER TABLE "Quote"
  ADD COLUMN "contactId" TEXT;

-- Prefer the canonical contact already selected on the source request.
UPDATE "Quote" AS q
SET "contactId" = (
  SELECT request."contactId"
  FROM "Request" AS request
  INNER JOIN "PointOfContact" AS contact
    ON contact."id" = request."contactId"
  WHERE request."contactId" IS NOT NULL
    AND (
      request."id" = q."sourceRequestIdSnapshot"
      OR request."relatedQuoteId" = q."id"
    )
    AND (
      q."clientId" IS NULL
      OR contact."clientId" = q."clientId"
    )
  ORDER BY
    CASE WHEN request."id" = q."sourceRequestIdSnapshot" THEN 0 ELSE 1 END,
    request."updatedAt" DESC,
    request."id" ASC
  LIMIT 1
)
WHERE q."contactId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "Request" AS request
    INNER JOIN "PointOfContact" AS contact
      ON contact."id" = request."contactId"
    WHERE request."contactId" IS NOT NULL
      AND (
        request."id" = q."sourceRequestIdSnapshot"
        OR request."relatedQuoteId" = q."id"
      )
      AND (
        q."clientId" IS NULL
        OR contact."clientId" = q."clientId"
      )
  );

-- Older quotes may only have contact snapshots. Link a snapshot only when its
-- email, phone, or name resolves to exactly one contact on that client profile.
WITH contact_matches AS (
  SELECT
    q."id" AS "quoteId",
    contact."id" AS "contactId",
    COUNT(*) OVER (PARTITION BY q."id") AS "matchCount"
  FROM "Quote" AS q
  INNER JOIN "PointOfContact" AS contact
    ON contact."clientId" = q."clientId"
  WHERE q."contactId" IS NULL
    AND q."clientId" IS NOT NULL
    AND (
      (
        NULLIF(TRIM(q."contactEmailSnapshot"), '') IS NOT NULL
        AND LOWER(TRIM(COALESCE(contact."email", ''))) =
          LOWER(TRIM(q."contactEmailSnapshot"))
      )
      OR (
        NULLIF(REGEXP_REPLACE(COALESCE(q."contactPhoneSnapshot", ''), '\D', '', 'g'), '') IS NOT NULL
        AND REGEXP_REPLACE(
          COALESCE(NULLIF(contact."phone", ''), contact."mobile", ''),
          '\D',
          '',
          'g'
        ) = REGEXP_REPLACE(q."contactPhoneSnapshot", '\D', '', 'g')
      )
      OR (
        NULLIF(TRIM(q."contactNameSnapshot"), '') IS NOT NULL
        AND LOWER(TRIM(COALESCE(
          contact."name",
          CONCAT_WS(' ', contact."firstName", contact."lastName")
        ))) = LOWER(TRIM(q."contactNameSnapshot"))
      )
    )
)
UPDATE "Quote" AS q
SET "contactId" = contact_matches."contactId"
FROM contact_matches
WHERE q."id" = contact_matches."quoteId"
  AND contact_matches."matchCount" = 1;

-- A source request can supply the contact before old quote client links were
-- normalized. Keep both quote relationships on the same client profile.
UPDATE "Quote" AS q
SET
  "clientId" = contact."clientId",
  "clientName" = COALESCE(q."clientName", client."displayName")
FROM "PointOfContact" AS contact
INNER JOIN "Client" AS client
  ON client."id" = contact."clientId"
WHERE q."contactId" = contact."id"
  AND q."clientId" IS NULL;

CREATE INDEX "Quote_contactId_idx" ON "Quote"("contactId");

ALTER TABLE "Quote"
  ADD CONSTRAINT "Quote_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "PointOfContact"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
