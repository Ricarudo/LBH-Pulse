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
  CHECK ("publicationState" <> 'SENT' OR "frozenSnapshotId" IS NOT NULL),
  CHECK ("outcome" NOT IN ('ACCEPTED', 'REJECTED', 'SUPERSEDED', 'CORRECTED') OR "publicationState" = 'SENT')
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

-- Enforce the frozen boundary even if an old write path reaches a managed Quote.
-- Operational ownership, activity, outcomes and archiving remain separate.
CREATE FUNCTION pulse.quote_family_commercial_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'Quote' THEN
    target_id := OLD.id;
  ELSIF TG_OP = 'INSERT' THEN
    target_id := NEW."quoteId";
  ELSE
    target_id := OLD."quoteId";
  END IF;
  -- Item writers and send serialize on the same parent; include the destination
  -- when moving a line so a line cannot be inserted into a frozen quote.
  IF TG_TABLE_NAME = 'QuoteItem' THEN
    PERFORM id FROM pulse."Quote" WHERE id = target_id FOR UPDATE;
    IF TG_OP = 'UPDATE' AND NEW."quoteId" <> OLD."quoteId" THEN
      PERFORM id FROM pulse."Quote" WHERE id = NEW."quoteId" FOR UPDATE;
      IF EXISTS (SELECT 1 FROM pulse."QuoteVersion" WHERE "quoteId" = NEW."quoteId" AND "publicationState" = 'SENT') THEN
        RAISE EXCEPTION 'Sent quote content is immutable' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pulse."QuoteVersion" WHERE "quoteId" = target_id AND ("publicationState" = 'SENT' OR outcome IS NOT NULL)) THEN
    IF TG_TABLE_NAME = 'Quote' AND TG_OP = 'UPDATE' THEN
      IF (to_jsonb(NEW) - ARRAY['status','owner','assignedToId','currentStepId','updatedAt','archivedAt'])
         = (to_jsonb(OLD) - ARRAY['status','owner','assignedToId','currentStepId','updatedAt','archivedAt']) THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'Sent quote content is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE TRIGGER "Quote_family_commercial_guard" BEFORE UPDATE OR DELETE ON pulse."Quote"
  FOR EACH ROW EXECUTE FUNCTION pulse.quote_family_commercial_guard();
CREATE TRIGGER "QuoteItem_family_commercial_guard" BEFORE INSERT OR UPDATE OR DELETE ON pulse."QuoteItem"
  FOR EACH ROW EXECUTE FUNCTION pulse.quote_family_commercial_guard();

CREATE FUNCTION pulse.quote_version_frozen_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.outcome IS NOT NULL THEN
    IF TG_OP = 'DELETE' OR NEW.outcome IS DISTINCT FROM OLD.outcome THEN
      RAISE EXCEPTION 'Closed quote versions cannot be reopened' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF OLD."publicationState" = 'SENT' OR OLD.outcome IS NOT NULL THEN
    IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - ARRAY['outcome','nextFollowUpOn','onHold','holdReason'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['outcome','nextFollowUpOn','onHold','holdReason']) THEN
      RAISE EXCEPTION 'Sent quote version cannot be reopened or rewritten' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE TRIGGER "QuoteVersion_frozen_guard" BEFORE UPDATE OR DELETE ON pulse."QuoteVersion"
  FOR EACH ROW EXECUTE FUNCTION pulse.quote_version_frozen_guard();

-- Existing draft writers can participate without silently retaining old readiness.
-- A command may change several lines; contentVersion is a monotonic token, not an edit count.
CREATE FUNCTION pulse.quote_draft_content_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'Quote' THEN
    IF (to_jsonb(NEW) - ARRAY['status','owner','assignedToId','currentStepId','updatedAt','archivedAt','sentAt','sentAtPrecision'])
       = (to_jsonb(OLD) - ARRAY['status','owner','assignedToId','currentStepId','updatedAt','archivedAt','sentAt','sentAtPrecision']) THEN RETURN NEW; END IF;
    target_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'LifecycleContext' THEN
    IF NEW.details IS NOT DISTINCT FROM OLD.details THEN RETURN NEW; END IF;
    UPDATE pulse."QuoteVersion" SET "contentVersion" = "contentVersion" + 1, "readyContentVersion" = NULL
      WHERE "publicationState" = 'DRAFT' AND outcome IS NULL
        AND "quoteId" IN (SELECT id FROM pulse."Quote" WHERE "lifecycleContextId" = NEW.id);
    RETURN NEW;
  ELSE
    IF TG_OP = 'DELETE' THEN target_id := OLD."quoteId"; ELSE target_id := NEW."quoteId"; END IF;
  END IF;
  UPDATE pulse."QuoteVersion" SET "contentVersion" = "contentVersion" + 1, "readyContentVersion" = NULL
    WHERE "quoteId" = target_id AND "publicationState" = 'DRAFT' AND outcome IS NULL;
  IF TG_TABLE_NAME = 'QuoteItem' THEN
    IF TG_OP = 'UPDATE' AND OLD."quoteId" <> NEW."quoteId" THEN
      UPDATE pulse."QuoteVersion" SET "contentVersion" = "contentVersion" + 1, "readyContentVersion" = NULL
        WHERE "quoteId" = OLD."quoteId" AND "publicationState" = 'DRAFT' AND outcome IS NULL;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "Quote_draft_content_changed" AFTER UPDATE ON pulse."Quote"
  FOR EACH ROW EXECUTE FUNCTION pulse.quote_draft_content_changed();
CREATE TRIGGER "QuoteItem_draft_content_changed" AFTER INSERT OR UPDATE OR DELETE ON pulse."QuoteItem"
  FOR EACH ROW EXECUTE FUNCTION pulse.quote_draft_content_changed();
CREATE TRIGGER "LifecycleContext_draft_content_changed" AFTER UPDATE ON pulse."LifecycleContext"
  FOR EACH ROW EXECUTE FUNCTION pulse.quote_draft_content_changed();
