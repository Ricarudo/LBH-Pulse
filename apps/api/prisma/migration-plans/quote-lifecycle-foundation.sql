-- 0.2 candidate, deliberately NOT in the deployable migrations directory.
-- Promote with the family-aware readers/writers and 0.2 release contract.
-- Run against the existing pulse schema inside a caller-owned transaction.
-- Sidecar metadata keeps the existing Quote columns/IDs and legacy JSON intact.

CREATE TYPE pulse."QuoteFamilyOutcome" AS ENUM ('ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED');
CREATE TYPE pulse."QuotePublicationState" AS ENUM ('DRAFT', 'SENT');
CREATE TYPE pulse."QuoteVersionOutcome" AS ENUM ('ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'SUPERSEDED', 'DISCARDED', 'CORRECTED');
CREATE TYPE pulse."QuoteReviewDecision" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'CANCELLED', 'STALE');

CREATE TABLE pulse."QuoteFamily" (
  "id" TEXT PRIMARY KEY,
  "baseQuoteNumber" TEXT NOT NULL,
  "sourceRequestId" TEXT REFERENCES pulse."Request"("id") ON DELETE RESTRICT,
  "sourceProjectId" TEXT REFERENCES pulse."Project"("id") ON DELETE RESTRICT,
  "renewedFromFamilyId" TEXT REFERENCES pulse."QuoteFamily"("id") ON DELETE RESTRICT,
  "lastRevisionNumber" INTEGER NOT NULL DEFAULT 0 CHECK ("lastRevisionNumber" >= 0),
  "outcome" pulse."QuoteFamilyOutcome",
  "currentDraftId" TEXT,
  "currentOfferId" TEXT,
  "acceptedQuoteId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("renewedFromFamilyId" IS DISTINCT FROM "id"),
  CHECK ("outcome" IS NULL OR ("currentDraftId" IS NULL AND "currentOfferId" IS NULL)),
  CHECK (("outcome" IS NOT DISTINCT FROM 'ACCEPTED') = ("acceptedQuoteId" IS NOT NULL))
);
CREATE INDEX "QuoteFamily_baseQuoteNumber_idx" ON pulse."QuoteFamily"("baseQuoteNumber");
CREATE INDEX "QuoteFamily_outcome_createdAt_idx" ON pulse."QuoteFamily"("outcome", "createdAt");

CREATE TABLE pulse."QuoteVersion" (
  "quoteId" TEXT PRIMARY KEY REFERENCES pulse."Quote"("id") ON DELETE RESTRICT,
  "familyId" TEXT NOT NULL REFERENCES pulse."QuoteFamily"("id") ON DELETE RESTRICT,
  "revisionNumber" INTEGER NOT NULL CHECK ("revisionNumber" >= 0),
  "previousQuoteId" TEXT,
  "contentVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("contentVersion" > 0),
  "publicationState" pulse."QuotePublicationState" NOT NULL DEFAULT 'DRAFT',
  "outcome" pulse."QuoteVersionOutcome",
  "readyContentVersion" INTEGER,
  "frozenSnapshotId" TEXT,
  "sentAt" TIMESTAMPTZ(3),
  "draftDueOn" DATE,
  "nextFollowUpOn" DATE,
  "validThrough" DATE,
  "validityTimeZone" TEXT,
  "onHold" BOOLEAN NOT NULL DEFAULT false,
  "holdReason" TEXT,
  "revisionOrigin" TEXT CHECK ("revisionOrigin" IN ('CLIENT_REQUESTED', 'INTERNAL')),
  "revisionReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("familyId", "quoteId"),
  UNIQUE ("familyId", "revisionNumber"),
  FOREIGN KEY ("familyId", "previousQuoteId") REFERENCES pulse."QuoteVersion"("familyId", "quoteId") ON DELETE RESTRICT,
  CHECK ("previousQuoteId" IS DISTINCT FROM "quoteId"),
  CHECK ("readyContentVersion" IS NULL OR "readyContentVersion" = "contentVersion"),
  CHECK (NOT "onHold" OR length(btrim("holdReason")) > 0 AND "holdReason" IS NOT NULL),
  CHECK (("validThrough" IS NULL) = ("validityTimeZone" IS NULL)),
  CHECK (("publicationState" = 'SENT') = ("sentAt" IS NOT NULL)),
  CHECK ("publicationState" <> 'SENT' OR "frozenSnapshotId" IS NOT NULL)
);
CREATE UNIQUE INDEX "QuoteVersion_one_open_draft" ON pulse."QuoteVersion"("familyId")
  WHERE "publicationState" = 'DRAFT' AND "outcome" IS NULL;
CREATE UNIQUE INDEX "QuoteVersion_one_current_offer" ON pulse."QuoteVersion"("familyId")
  WHERE "publicationState" = 'SENT' AND "outcome" IS NULL;
CREATE UNIQUE INDEX "QuoteVersion_one_accepted" ON pulse."QuoteVersion"("familyId") WHERE "outcome" = 'ACCEPTED';
CREATE INDEX "QuoteVersion_nextFollowUpOn_idx" ON pulse."QuoteVersion"("nextFollowUpOn") WHERE "outcome" IS NULL;

ALTER TABLE pulse."QuoteFamily"
  ADD FOREIGN KEY ("id", "currentDraftId") REFERENCES pulse."QuoteVersion"("familyId", "quoteId") ON DELETE RESTRICT,
  ADD FOREIGN KEY ("id", "currentOfferId") REFERENCES pulse."QuoteVersion"("familyId", "quoteId") ON DELETE RESTRICT,
  ADD FOREIGN KEY ("id", "acceptedQuoteId") REFERENCES pulse."QuoteVersion"("familyId", "quoteId") ON DELETE RESTRICT;

CREATE TABLE pulse."QuoteContentSnapshot" (
  "id" TEXT PRIMARY KEY,
  "quoteId" TEXT NOT NULL REFERENCES pulse."QuoteVersion"("quoteId") ON DELETE RESTRICT,
  "contentVersion" INTEGER NOT NULL CHECK ("contentVersion" > 0),
  "schemaVersion" INTEGER NOT NULL CHECK ("schemaVersion" > 0),
  "payload" JSONB NOT NULL CHECK (jsonb_typeof("payload") = 'object'),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "createdByName" TEXT NOT NULL,
  UNIQUE ("quoteId", "contentVersion"),
  UNIQUE ("quoteId", "contentVersion", "id")
);
ALTER TABLE pulse."QuoteVersion" ADD FOREIGN KEY ("quoteId", "contentVersion", "frozenSnapshotId")
  REFERENCES pulse."QuoteContentSnapshot"("quoteId", "contentVersion", "id") ON DELETE RESTRICT;

CREATE TABLE pulse."QuoteReview" (
  "id" TEXT PRIMARY KEY,
  "quoteId" TEXT NOT NULL,
  "contentVersion" INTEGER NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "submittedById" TEXT NOT NULL REFERENCES pulse."LocalUser"("id") ON DELETE RESTRICT,
  "reviewerId" TEXT NOT NULL REFERENCES pulse."LocalUser"("id") ON DELETE RESTRICT,
  "decision" pulse."QuoteReviewDecision" NOT NULL DEFAULT 'PENDING',
  "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMPTZ(3),
  "decisionNotes" TEXT,
  FOREIGN KEY ("quoteId", "contentVersion", "snapshotId") REFERENCES pulse."QuoteContentSnapshot"("quoteId", "contentVersion", "id") ON DELETE RESTRICT,
  CHECK ("submittedById" <> "reviewerId"),
  CHECK (("decision" = 'PENDING') = ("respondedAt" IS NULL))
);
CREATE UNIQUE INDEX "QuoteReview_one_pending" ON pulse."QuoteReview"("quoteId") WHERE "decision" = 'PENDING';
CREATE INDEX "QuoteReview_reviewer_queue" ON pulse."QuoteReview"("reviewerId", "decision", "submittedAt");

CREATE TABLE pulse."QuoteOperation" (
  "id" TEXT PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  "result" JSONB NOT NULL CHECK (jsonb_typeof("result") = 'object'),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("actorId", "action", "key")
);

CREATE FUNCTION pulse.quote_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Quote content snapshots are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "QuoteContentSnapshot_immutable"
  BEFORE UPDATE OR DELETE ON pulse."QuoteContentSnapshot"
  FOR EACH ROW EXECUTE FUNCTION pulse.quote_snapshot_immutable();
