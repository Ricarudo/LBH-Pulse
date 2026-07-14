import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { prisma } from "@/lib/db";
import {
  activityRetentionPolicy,
  securityAuditEntityTypes
} from "@/lib/activityPolicy";

const retentionIntervalMs = 24 * 60 * 60 * 1000;

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

@Injectable()
export class ActivityRetentionService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;

  async enforce(now = new Date()) {
    const policy = activityRetentionPolicy();
    return prisma.activity.deleteMany({
      where: {
        OR: [
          {
            relatedEntityType: { in: [...securityAuditEntityTypes] },
            createdAt: { lt: daysAgo(now, policy.auditRetentionDays) }
          },
          {
            relatedEntityType: { notIn: [...securityAuditEntityTypes] },
            createdAt: { lt: daysAgo(now, policy.operationalRetentionDays) }
          }
        ]
      }
    });
  }

  async onModuleInit() {
    await this.enforce();
    this.timer = setInterval(() => {
      void this.enforce().catch((error: unknown) => {
        console.error("Activity retention enforcement failed.", error);
      });
    }, retentionIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
