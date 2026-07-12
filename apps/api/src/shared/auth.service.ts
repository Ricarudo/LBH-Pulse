import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
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

const sessionCookieName = "pulse.session";
const sessionTtlSeconds = 60 * 60 * 12;

type SessionPayload = {
  userId: string;
  exp: number;
};

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

function sessionSecret() {
  return process.env.PULSE_SESSION_SECRET || "pulse-local-dev-session-secret";
}

function secureCookies() {
  return process.env.PULSE_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function createToken(payload: SessionPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function readToken(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");

  if (!encoded || !signature) {
    return null;
  }

  const expected = sign(encoded);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string) {
  const header = request.headers.cookie;

  if (!header) {
    return undefined;
  }

  const cookies = header.split(";").map((cookie) => cookie.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

@Injectable()
export class AuthService {
  async getCurrentUser(request: Request): Promise<AuthenticatedUser | null> {
    const token = cookieValue(request, sessionCookieName);

    if (!token) {
      return null;
    }

    const payload = readToken(token);

    if (!payload) {
      return null;
    }

    const user = await prisma.localUser.findUnique({
      where: { id: payload.userId },
      include: { accessRole: { include: accessRoleInclude } }
    });

    if (!user || !user.active || user.accessRole.archivedAt) {
      return null;
    }

    return toAuthenticatedUser({
      ...user,
      accessRole: roleSummary(user.accessRole),
      permissions: effectiveRolePermissions(user.accessRole),
      isSystemAdmin: user.accessRole.protected && user.accessRole.systemKey === "ADMIN"
    });
  }

  async requireUser(request: Request, requirement?: PermissionRequirement) {
    const user = await this.getCurrentUser(request);

    if (!user) {
      throw new AuthError("Authentication required.", 401);
    }

    if (requirement && user.mustChangePassword) {
      throw new AuthError("Password change required before accessing Pulse.", 403);
    }

    const allOf = typeof requirement === "string"
      ? [requirement]
      : requirement?.allOf ?? [];
    const anyOf = typeof requirement === "string"
      ? []
      : requirement?.anyOf ?? [];
    const hasAll = allOf.every((permission) => user.permissions.includes(permission));
    const hasAny = !anyOf.length || anyOf.some((permission) => user.permissions.includes(permission));
    if (requirement && (!hasAll || !hasAny)) {
      throw new AuthError("You do not have permission to perform this action.", 403);
    }

    return user;
  }

  async requireSystemAdmin(request: Request) {
    const user = await this.requireUser(request, "roles:manage");
    if (!user.isSystemAdmin) {
      throw new AuthError("Administrator access is required.", 403);
    }
    return user;
  }

  setSessionCookie(response: Response, userId: string) {
    const exp = Math.floor(Date.now() / 1000) + sessionTtlSeconds;

    response.cookie(sessionCookieName, createToken({ userId, exp }), {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies(),
      path: "/",
      maxAge: sessionTtlSeconds * 1000
    });
  }

  clearSessionCookie(response: Response) {
    response.cookie(sessionCookieName, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies(),
      path: "/",
      maxAge: 0
    });
  }
}
