import { Inject, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { runtimeEnvironment } from "@/config/runtimeEnvironment";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/services/activityService";
import { AuthService } from "@/shared/auth.service";

const fakePasswordHash = hashPassword(randomBytes(32).toString("base64url"));

type LoginKeys = {
  account: string;
  ip: string;
};

@Injectable()
export class AuthProtectionService {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  keys(email: string, ip: string): LoginKeys {
    return {
      account: this.auth.hashSecurityIdentifier("login-account", email.trim().toLowerCase()),
      ip: this.auth.hashSecurityIdentifier("login-ip", ip || "unknown")
    };
  }

  passwordMatches(password: string, passwordHash?: string | null) {
    return verifyPassword(password, passwordHash || fakePasswordHash);
  }

  async isBlocked(keys: LoginKeys, now = new Date()) {
    if (!runtimeEnvironment().rateLimitEnabled) return false;
    const buckets = await prisma.authThrottleBucket.findMany({
      where: {
        OR: [
          { kind: "ACCOUNT", keyDigest: keys.account },
          { kind: "IP", keyDigest: keys.ip }
        ],
        blockedUntil: { gt: now }
      },
      select: { kind: true }
    });
    return buckets.length > 0;
  }

  private async incrementBucket(
    kind: "ACCOUNT" | "IP",
    keyDigest: string,
    maximumAttempts: number,
    now: Date
  ) {
    const config = runtimeEnvironment();
    const windowStartLimit = new Date(now.getTime() - config.loginWindowSeconds * 1_000);
    const expiresAt = new Date(now.getTime() + Math.max(config.loginWindowSeconds, config.loginLockoutSeconds, 86_400) * 1_000);

    return prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${kind}:${keyDigest}`}))`;
      const existing = await transaction.authThrottleBucket.findUnique({
        where: { kind_keyDigest: { kind, keyDigest } }
      });
      const attempts = !existing || existing.windowStartedAt < windowStartLimit
        ? 1
        : existing.attempts + 1;
      const blockedUntil = attempts >= maximumAttempts
        ? new Date(now.getTime() + config.loginLockoutSeconds * 1_000)
        : existing?.blockedUntil && existing.blockedUntil > now
          ? existing.blockedUntil
          : null;

      return transaction.authThrottleBucket.upsert({
        where: { kind_keyDigest: { kind, keyDigest } },
        create: {
          kind,
          keyDigest,
          attempts,
          windowStartedAt: now,
          blockedUntil,
          expiresAt
        },
        update: {
          attempts,
          windowStartedAt: !existing || existing.windowStartedAt < windowStartLimit ? now : existing.windowStartedAt,
          blockedUntil,
          expiresAt
        }
      });
    });
  }

  async recordFailure(keys: LoginKeys, now = new Date()) {
    if (!runtimeEnvironment().rateLimitEnabled) return false;
    const config = runtimeEnvironment();
    const [account, ip] = await Promise.all([
      this.incrementBucket("ACCOUNT", keys.account, config.loginAccountMaxAttempts, now),
      this.incrementBucket("IP", keys.ip, config.loginIpMaxAttempts, now)
    ]);
    const blocked = Boolean(
      (account.blockedUntil && account.blockedUntil > now) ||
      (ip.blockedUntil && ip.blockedUntil > now)
    );
    await this.recordSecurityEvent(blocked ? "LOGIN_LOCKED" : "LOGIN_FAILED", keys, {
      blocked
    });
    return blocked;
  }

  async recordSuccess(keys: LoginKeys) {
    if (!runtimeEnvironment().rateLimitEnabled) return;
    await prisma.authThrottleBucket.deleteMany({
      where: { kind: "ACCOUNT", keyDigest: keys.account }
    });
    await prisma.authThrottleBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }

  async recordSecurityEvent(
    event: string,
    keys?: Partial<LoginKeys>,
    metadata: Record<string, string | number | boolean> = {}
  ) {
    const identifier = keys?.account || keys?.ip || "unattributed";
    await recordActivity({
      relatedEntityType: "Authentication",
      relatedEntityId: identifier.slice(0, 24),
      type: event,
      title: "Authentication security event",
      detail: "Pulse recorded an authentication control event.",
      metadata: {
        event,
        accountKey: keys?.account?.slice(0, 24) ?? null,
        ipKey: keys?.ip?.slice(0, 24) ?? null,
        ...metadata
      }
    });
  }
}
