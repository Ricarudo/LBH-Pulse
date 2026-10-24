import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { prisma } from "@/lib/db";
import { inMaintenance } from "@/shared/maintenance";
import { updateStatus } from "@/lib/services/updateService";

@Injectable()
export class UpdateAuditService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private syncing = false;
  async sync() {
    if (!process.env.PULSE_UPDATER_URL || inMaintenance() || this.syncing) return;
    this.syncing = true;
    try {
      const status = await updateStatus();
      for (const job of status.history.filter(job => ["succeeded", "failed", "recovered"].includes(job.stage))) {
        await prisma.activity.upsert({
          where: { id: `system-update-${job.id}-${job.stage}` },
          update: {},
          create: {
            id: `system-update-${job.id}-${job.stage}`, relatedEntityType: "SystemUpdate", relatedEntityId: job.id,
            actorName: job.actor.name, actorRole: "Administrator", type: "Update Result",
            title: `Pulse ${job.releaseId}: ${job.stage}`, detail: job.error,
            metadata: { releaseId: job.releaseId, result: job.stage, actorId: job.actor.id, backupVerified: job.backupVerified }
          }
        });
      }
    } finally { this.syncing = false; }
  }
  onModuleInit() {
    const sync = () => void this.sync().catch(() => console.warn("Update audit synchronization will retry."));
    sync(); this.timer = setInterval(sync,60_000); this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
