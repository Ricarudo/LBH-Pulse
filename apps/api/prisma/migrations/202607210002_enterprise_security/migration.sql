-- Pulse 0.1 drift cleanup. These objects were created by an imperative legacy
-- migration but are not part of the validated Prisma model. Multiple requests
-- may refer to the same canonical timeline update, so uniqueness was unsafe.
ALTER TABLE "Request" DROP CONSTRAINT IF EXISTS "Request_currentStepId_fkey";
DROP INDEX IF EXISTS "Request_currentStepId_key";

-- AlterTable
ALTER TABLE "LocalUser" ADD COLUMN     "isDemoAccount" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ClientSite" ADD COLUMN     "isPlaceholder" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthThrottleBucket" (
    "kind" TEXT NOT NULL,
    "keyDigest" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthThrottleBucket_pkey" PRIMARY KEY ("kind","keyDigest")
);

-- CreateTable
CREATE TABLE "MaintenanceRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "reportDigest" TEXT,
    "actorUserId" TEXT,
    "actorEmailSnapshot" TEXT,
    "summary" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MaintenanceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifecycleEventDisposition" (
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "maintenanceRunId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LifecycleEventDisposition_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenDigest_key" ON "AuthSession"("tokenDigest");

-- CreateIndex
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_idleExpiresAt_idx" ON "AuthSession"("idleExpiresAt");

-- CreateIndex
CREATE INDEX "AuthThrottleBucket_blockedUntil_idx" ON "AuthThrottleBucket"("blockedUntil");

-- CreateIndex
CREATE INDEX "AuthThrottleBucket_expiresAt_idx" ON "AuthThrottleBucket"("expiresAt");

-- CreateIndex
CREATE INDEX "MaintenanceRun_kind_completedAt_idx" ON "MaintenanceRun"("kind", "completedAt");

-- CreateIndex
CREATE INDEX "MaintenanceRun_actorUserId_idx" ON "MaintenanceRun"("actorUserId");

-- CreateIndex
CREATE INDEX "MaintenanceRun_reportDigest_idx" ON "MaintenanceRun"("reportDigest");

-- CreateIndex
CREATE INDEX "LifecycleEventDisposition_status_idx" ON "LifecycleEventDisposition"("status");

-- CreateIndex
CREATE INDEX "LifecycleEventDisposition_maintenanceRunId_idx" ON "LifecycleEventDisposition"("maintenanceRunId");

-- CreateIndex
CREATE INDEX "LifecycleEventDisposition_reviewedById_idx" ON "LifecycleEventDisposition"("reviewedById");

-- CreateIndex
CREATE INDEX "LocalUser_isDemoAccount_idx" ON "LocalUser"("isDemoAccount");

-- CreateIndex
CREATE INDEX "ClientSite_isPlaceholder_idx" ON "ClientSite"("isPlaceholder");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "LocalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRun" ADD CONSTRAINT "MaintenanceRun_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleEventDisposition" ADD CONSTRAINT "LifecycleEventDisposition_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "LifecycleStatusEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleEventDisposition" ADD CONSTRAINT "LifecycleEventDisposition_maintenanceRunId_fkey" FOREIGN KEY ("maintenanceRunId") REFERENCES "MaintenanceRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleEventDisposition" ADD CONSTRAINT "LifecycleEventDisposition_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "LocalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
