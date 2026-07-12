-- Request updates replace the overlapping next-action, task, and note writers.
-- The legacy columns/tables remain for one compatibility release; reads are
-- derived from RequestUpdate after this migration.

ALTER TABLE "Request"
  ADD COLUMN IF NOT EXISTS "currentStepId" TEXT;

CREATE TABLE IF NOT EXISTS "RequestUpdate" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT,
  "body" TEXT,
  "authorId" TEXT,
  "authorNameSnapshot" TEXT NOT NULL DEFAULT 'Pulse System',
  "authorEmailSnapshot" TEXT,
  "authorRoleSnapshot" TEXT,
  "assigneeId" TEXT,
  "assigneeNameSnapshot" TEXT,
  "assigneeEmailSnapshot" TEXT,
  "targetDate" TIMESTAMP(3),
  "stepStatus" TEXT,
  "supersedesId" TEXT,
  "legacyTaskId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RequestUpdate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RequestCollaborator" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "addedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestCollaborator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RequestUpdateMention" (
  "id" TEXT NOT NULL,
  "updateId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestUpdateMention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Request_currentStepId_key"
  ON "Request"("currentStepId");
CREATE INDEX IF NOT EXISTS "Request_currentStepId_idx"
  ON "Request"("currentStepId");
CREATE UNIQUE INDEX IF NOT EXISTS "RequestUpdate_legacyTaskId_key"
  ON "RequestUpdate"("legacyTaskId");
CREATE INDEX IF NOT EXISTS "RequestUpdate_requestId_createdAt_idx"
  ON "RequestUpdate"("requestId", "createdAt");
CREATE INDEX IF NOT EXISTS "RequestUpdate_requestId_kind_stepStatus_idx"
  ON "RequestUpdate"("requestId", "kind", "stepStatus");
CREATE INDEX IF NOT EXISTS "RequestUpdate_assigneeId_stepStatus_idx"
  ON "RequestUpdate"("assigneeId", "stepStatus");
CREATE INDEX IF NOT EXISTS "RequestUpdate_supersedesId_idx"
  ON "RequestUpdate"("supersedesId");
CREATE UNIQUE INDEX IF NOT EXISTS "RequestCollaborator_requestId_userId_key"
  ON "RequestCollaborator"("requestId", "userId");
CREATE INDEX IF NOT EXISTS "RequestCollaborator_userId_idx"
  ON "RequestCollaborator"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "RequestUpdateMention_updateId_userId_key"
  ON "RequestUpdateMention"("updateId", "userId");
CREATE INDEX IF NOT EXISTS "RequestUpdateMention_userId_readAt_idx"
  ON "RequestUpdateMention"("userId", "readAt");

DO $$ BEGIN
  ALTER TABLE "RequestUpdate" ADD CONSTRAINT "RequestUpdate_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RequestUpdate" ADD CONSTRAINT "RequestUpdate_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RequestUpdate" ADD CONSTRAINT "RequestUpdate_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RequestUpdate" ADD CONSTRAINT "RequestUpdate_supersedesId_fkey"
    FOREIGN KEY ("supersedesId") REFERENCES "RequestUpdate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RequestCollaborator" ADD CONSTRAINT "RequestCollaborator_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RequestCollaborator" ADD CONSTRAINT "RequestCollaborator_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "LocalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RequestCollaborator" ADD CONSTRAINT "RequestCollaborator_addedById_fkey"
    FOREIGN KEY ("addedById") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RequestUpdateMention" ADD CONSTRAINT "RequestUpdateMention_updateId_fkey"
    FOREIGN KEY ("updateId") REFERENCES "RequestUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RequestUpdateMention" ADD CONSTRAINT "RequestUpdateMention_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "LocalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Request" ADD CONSTRAINT "Request_currentStepId_fkey"
    FOREIGN KEY ("currentStepId") REFERENCES "RequestUpdate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Preserve every old activity/task as an immutable feed record. Task records
-- retain their legacy id so old task links can be adapted during the release.
INSERT INTO "RequestUpdate" (
  "id", "requestId", "kind", "title", "body", "authorNameSnapshot",
  "createdAt", "updatedAt"
)
SELECT
  'migr-activity-' || activity."id",
  activity."requestId",
  'system',
  activity."title",
  activity."body",
  COALESCE(NULLIF(TRIM(activity."actor"), ''), 'Pulse System'),
  activity."createdAt",
  activity."createdAt"
FROM "RequestActivity" activity
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "RequestUpdate" (
  "id", "requestId", "kind", "title", "body", "authorId",
  "authorNameSnapshot", "authorEmailSnapshot", "authorRoleSnapshot",
  "assigneeId", "assigneeNameSnapshot", "assigneeEmailSnapshot",
  "targetDate", "stepStatus", "legacyTaskId", "createdAt", "updatedAt"
)
SELECT
  'migr-task-' || task."id",
  task."requestId",
  'step',
  task."title",
  task."title",
  request."createdById",
  COALESCE(creator."name", 'Pulse System'),
  creator."email",
  creator."role",
  assignee."id",
  assignee."name",
  assignee."email",
  task."dueAt",
  CASE WHEN task."completedAt" IS NULL THEN 'open' ELSE 'completed' END,
  task."id",
  task."createdAt",
  task."updatedAt"
FROM "RequestTask" task
JOIN "Request" request ON request."id" = task."requestId"
LEFT JOIN "LocalUser" creator ON creator."id" = request."createdById"
LEFT JOIN "LocalUser" assignee
  ON assignee."active" = TRUE
 AND LOWER(TRIM(assignee."name")) = LOWER(TRIM(task."owner"))
ON CONFLICT ("legacyTaskId") DO NOTHING;

-- An explicit nextAction wins unless an unfinished legacy task has the same
-- normalized title. This avoids showing the same instruction twice.
INSERT INTO "RequestUpdate" (
  "id", "requestId", "kind", "title", "body", "authorId",
  "authorNameSnapshot", "authorEmailSnapshot", "authorRoleSnapshot",
  "assigneeId", "assigneeNameSnapshot", "assigneeEmailSnapshot",
  "targetDate", "stepStatus", "createdAt", "updatedAt"
)
SELECT
  'migr-next-action-' || request."id",
  request."id",
  'step',
  TRIM(request."nextAction"),
  TRIM(request."nextAction"),
  request."createdById",
  COALESCE(creator."name", 'Pulse System'),
  creator."email",
  creator."role",
  lead."id",
  lead."name",
  lead."email",
  request."nextFollowUpAt",
  'open',
  COALESCE(request."updatedAt", request."createdAt"),
  COALESCE(request."updatedAt", request."createdAt")
FROM "Request" request
LEFT JOIN "LocalUser" creator ON creator."id" = request."createdById"
LEFT JOIN "LocalUser" lead ON lead."id" = request."assignedToId"
WHERE NULLIF(TRIM(request."nextAction"), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "RequestTask" task
    WHERE task."requestId" = request."id"
      AND task."completedAt" IS NULL
      AND REGEXP_REPLACE(LOWER(TRIM(task."title")), '\\s+', ' ', 'g') =
          REGEXP_REPLACE(LOWER(TRIM(request."nextAction")), '\\s+', ' ', 'g')
  )
ON CONFLICT ("id") DO NOTHING;

-- Closed/converted requests retain their update history but never retain a
-- current step. For active requests select explicit nextAction, then the
-- matching unfinished task, then the earliest unfinished task.
WITH candidates AS (
  SELECT
    request."id" AS request_id,
    CASE
      WHEN request."status" IN ('No Bid', 'Cancelled', 'Duplicate', 'Converted to Quote') THEN NULL
      WHEN NULLIF(TRIM(request."nextAction"), '') IS NOT NULL THEN COALESCE(
        (
          SELECT update_record."id"
          FROM "RequestUpdate" update_record
          JOIN "RequestTask" task ON task."id" = update_record."legacyTaskId"
          WHERE update_record."requestId" = request."id"
            AND update_record."kind" = 'step'
            AND update_record."stepStatus" = 'open'
            AND task."completedAt" IS NULL
            AND REGEXP_REPLACE(LOWER(TRIM(task."title")), '\\s+', ' ', 'g') =
                REGEXP_REPLACE(LOWER(TRIM(request."nextAction")), '\\s+', ' ', 'g')
          ORDER BY task."createdAt" ASC, task."id" ASC
          LIMIT 1
        ),
        'migr-next-action-' || request."id"
      )
      ELSE (
        SELECT update_record."id"
        FROM "RequestUpdate" update_record
        WHERE update_record."requestId" = request."id"
          AND update_record."kind" = 'step'
          AND update_record."stepStatus" = 'open'
        ORDER BY update_record."createdAt" ASC, update_record."id" ASC
        LIMIT 1
      )
    END AS current_id
  FROM "Request" request
)
UPDATE "Request" request
SET "currentStepId" = candidates.current_id
FROM candidates
WHERE request."id" = candidates.request_id;

UPDATE "RequestUpdate" update_record
SET "stepStatus" = 'superseded', "updatedAt" = CURRENT_TIMESTAMP
WHERE update_record."kind" = 'step'
  AND update_record."stepStatus" = 'open'
  AND NOT EXISTS (
    SELECT 1 FROM "Request" request WHERE request."currentStepId" = update_record."id"
  );
