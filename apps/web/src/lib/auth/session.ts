import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canRole,
  toAuthenticatedUser,
  type AuthenticatedUser,
  type Permission
} from "@/lib/auth/permissions";

const sessionCookieName = "pulse.session";
const sessionTtlSeconds = 60 * 60 * 12;

type SessionPayload = {
  userId: string;
  exp: number;
};

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function base64Url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function sessionSecret() {
  return process.env.PULSE_SESSION_SECRET || "pulse-local-dev-session-secret";
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function createToken(payload: SessionPayload) {
  const encoded = base64Url(JSON.stringify(payload));
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

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  const payload = readToken(token);

  if (!payload) {
    return null;
  }

  const user = await prisma.localUser.findUnique({
    where: { id: payload.userId }
  });

  if (!user || !user.active) {
    return null;
  }

  return toAuthenticatedUser(user);
}

export async function requireUser(permission?: Permission) {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthError("Authentication required.", 401);
  }

  if (permission && !canRole(user.role, permission)) {
    throw new AuthError("You do not have permission to perform this action.", 403);
  }

  return user;
}

export function setSessionCookie(response: NextResponse, userId: string) {
  const exp = Math.floor(Date.now() / 1000) + sessionTtlSeconds;
  response.cookies.set(sessionCookieName, createToken({ userId, exp }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlSeconds
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}
