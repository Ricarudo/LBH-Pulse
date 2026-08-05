CREATE TABLE "LifecycleCollaborator" (
    "id" TEXT NOT NULL,
    "lifecycleContextId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LifecycleCollaborator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LifecycleCollaborator_lifecycleContextId_userId_key" ON "LifecycleCollaborator"("lifecycleContextId", "userId");
CREATE INDEX "LifecycleCollaborator_userId_idx" ON "LifecycleCollaborator"("userId");
ALTER TABLE "LifecycleCollaborator" ADD CONSTRAINT "LifecycleCollaborator_lifecycleContextId_fkey" FOREIGN KEY ("lifecycleContextId") REFERENCES "LifecycleContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifecycleCollaborator" ADD CONSTRAINT "LifecycleCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "LocalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifecycleCollaborator" ADD CONSTRAINT "LifecycleCollaborator_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "LifecycleCollaborator" ("id", "lifecycleContextId", "userId", "addedById", "createdAt")
SELECT DISTINCT ON (r."lifecycleContextId", rc."userId")
  rc."id", r."lifecycleContextId", rc."userId", rc."addedById", rc."createdAt"
FROM "RequestCollaborator" rc
JOIN "Request" r ON r."id" = rc."requestId"
WHERE r."lifecycleContextId" IS NOT NULL
ORDER BY r."lifecycleContextId", rc."userId", rc."createdAt" ASC;
