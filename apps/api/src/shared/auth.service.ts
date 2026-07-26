import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { runtimeEnvironment } from "@/config/runtimeEnvironment";
import {
  toAuthenticatedUser,
  type AuthenticatedUser
} from "@pulse/contracts/auth";
import type { Permission } from "@pulse/contracts/access-control";
import {
  accessRoleInclude,
  effectiveRolePermissions,
  roleSummary
} from "@/lib/services/roleAccessService";

export type PermissionRequirement = Permission | {
  allOf?: Permission[];
  anyOf?: Permission[];
};

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type SessionContext = {
  id: string;
  token: string;
  user: AuthenticatedUser;
};

const sessionUserInclude = {
  accessRole: { include: accessRoleInclude }
} satisfies Prisma.LocalUserInclude;

type SessionUser = Prisma.LocalUserGetPayload<{ include: typeof sessionUserInclude }>;

function cookieValue(request: Request, name: string) {
  const header = request.headers.cookie;
  if (!header) return undefined;

  for (const item of header.split(";")) {
    const [rawName, ...rawValue] = item.trim().split("=");
    if (rawName !== name) continue;
    try {
      return decodeURIComponent(rawValue.join("="));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

@Injectable()
export class AuthService {
  private readonly requestSessions = new WeakMap<Request, Promise<SessionContext | null>>();

  private config() {
    return runtimeEnvironment();
  }

  private cookieName() {
    return this.config().nodeEnv === "production" ? "__Host-pulse.session" : "pulse.session";
  }

  private digest(label: string, value: string) {
    return createHmac("sha256", this.config().sessionSecret)
      .update(`${label}\0${value}`)
      .digest("base64url");
  }

  hashSecurityIdentifier(label: string, value: string) {
    return createHmac("sha256", this.config().securityPepper)
      .update(`${label}\0${value}`)
      .digest("base64url");
  }

  private tokenDigest(token: string) {
    return this.digest("session-token", token);
  }

  private csrfToken(token: string) {
    return this.digest("csrf-token", token);
  }

  private toUser(user: SessionUser) {
    return toAuthenticatedUser({
      ...user,
      accessRole: roleSummary(user.accessRole),
      permissions: effectiveRolePermissions(user.accessRole),
      isSystemAdmin: user.accessRole.protected && user.accessRole.systemKey === "ADMIN"
    });
  }

  private async loadSession(request: Request): Promise<SessionContext | null> {
    const token = cookieValue(request, this.cookieName());
    if (!token || token.length < 32 || token.length > 256) return null;

    const session = await prisma.authSession.findUnique({
      where: { tokenDigest: this.tokenDigest(token) },
      include: {
        user: { include: sessionUserInclude }
      }
    });
    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.idleExpiresAt <= now ||
      !session.user.active ||
      session.user.accessRole.archivedAt
    ) {
      return null;
    }

    if (now.getTime() - session.lastSeenAt.getTime() >= 5 * 60_000) {
      const proposedIdleExpiry = new Date(now.getTime() + this.config().sessionIdleMinutes * 60_000);
      await prisma.authSession.update({
        where: { id: session.id },
        data: {
          lastSeenAt: now,
          idleExpiresAt: proposedIdleExpiry < session.expiresAt ? proposedIdleExpiry : session.expiresAt
        }
      });
    }

    return {
      id: session.id,
      token,
      user: this.toUser(session.user)
    };
  }

  private sessionFor(request: Request) {
    let pending = this.requestSessions.get(request);
    if (!pending) {
      pending = this.loadSession(request);
      this.requestSessions.set(request, pending);
    }
    return pending;
  }

  async getCurrentUser(request: Request): Promise<AuthenticatedUser | null> {
    return (await this.sessionFor(request))?.user ?? null;
  }

  async getCsrfToken(request: Request) {
    const session = await this.sessionFor(request);
    return session ? this.csrfToken(session.token) : null;
  }

  async verifyCsrf(request: Request) {
    const supplied = request.header("X-Pulse-CSRF") ?? "";
    const expected = await this.getCsrfToken(request);
    return Boolean(expected && supplied && safeEqual(expected, supplied));
  }

  async requireUser(request: Request, requirement?: PermissionRequirement) {
    const user = await this.getCurrentUser(request);
    if (!user) throw new AuthError("Authentication required.", 401);
    if (requirement && user.mustChangePassword) {
      throw new AuthError("Password change required before accessing Pulse.", 403);
    }

    const allOf = typeof requirement === "string" ? [requirement] : requirement?.allOf ?? [];
    const anyOf = typeof requirement === "string" ? [] : requirement?.anyOf ?? [];
    const hasAll = allOf.every((permission) => user.permissions.includes(permission));
    const hasAny = !anyOf.length || anyOf.some((permission) => user.permissions.includes(permission));
    if (requirement && (!hasAll || !hasAny)) {
      throw new AuthError("You do not have permission to perform this action.", 403);
    }
    return user;
  }

  async requireSystemAdmin(request: Request) {
    const user = await this.requireUser(request, "roles:manage");
    if (!user.isSystemAdmin) throw new AuthError("Administrator access is required.", 403);
    return user;
  }

  private cookieOptions(maxAge: number) {
    const config = this.config();
    return {
      httpOnly: true,
      sameSite: config.cookieSameSite,
      secure: config.cookieSecure,
      path: "/",
      maxAge
    } as const;
  }

  async issueSession(request: Request, response: Response, userId: string) {
    await this.revokeCurrentSession(request);
    const config = this.config();
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.sessionTtlMinutes * 60_000);
    const idleExpiresAt = new Date(now.getTime() + config.sessionIdleMinutes * 60_000);
    const remoteAddress = request.ip || request.socket.remoteAddress || "unknown";
    const userAgent = request.header("user-agent") || "unknown";

    await prisma.authSession.create({
      data: {
        userId,
        tokenDigest: this.tokenDigest(token),
        ipHash: this.hashSecurityIdentifier("session-ip", remoteAddress),
        userAgentHash: this.hashSecurityIdentifier("session-user-agent", userAgent),
        idleExpiresAt,
        expiresAt
      }
    });
    await prisma.authSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(now.getTime() - 86_400_000) } },
          { revokedAt: { lt: new Date(now.getTime() - 86_400_000) } }
        ]
      }
    });

    response.cookie(this.cookieName(), token, this.cookieOptions(config.sessionTtlMinutes * 60_000));
    this.requestSessions.delete(request);
    return this.csrfToken(token);
  }

  async revokeCurrentSession(request: Request) {
    const token = cookieValue(request, this.cookieName());
    if (token) {
      await prisma.authSession.updateMany({
        where: { tokenDigest: this.tokenDigest(token), revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }
    this.requestSessions.delete(request);
  }

  async revokeAllUserSessions(userId: string) {
    await prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  async logout(request: Request, response: Response) {
    await this.revokeCurrentSession(request);
    response.cookie(this.cookieName(), "", this.cookieOptions(0));
  }
}
