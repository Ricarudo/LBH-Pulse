import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { Request, Response } from "express";
import { AuthController } from "@/controllers/auth.controller";
import { resetRuntimeEnvironmentForTests } from "@/config/runtimeEnvironment";
import { prisma } from "@/lib/db";
import { AuthProtectionService } from "@/shared/auth-protection.service";
import { CsrfMiddleware } from "@/shared/csrf.middleware";

const originalFindUnique = prisma.localUser.findUnique.bind(prisma.localUser);
const originalUpdate = prisma.localUser.update.bind(prisma.localUser);
const originalActivityCreate = prisma.activity.create.bind(prisma.activity);
const originalThrottleFind = prisma.authThrottleBucket.findMany.bind(prisma.authThrottleBucket);
const originalThrottleDelete = prisma.authThrottleBucket.deleteMany.bind(prisma.authThrottleBucket);
const originalTransaction = prisma.$transaction.bind(prisma);

function configureTestEnvironment(rateLimit = true) {
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: process.env.DATABASE_URL || "postgresql://test@example.invalid/pulse?schema=pulse",
    PULSE_PUBLIC_URL: "http://web:4300",
    PULSE_SESSION_SECRET: "S".repeat(64),
    PULSE_SECURITY_PEPPER: "Q".repeat(64),
    PULSE_COOKIE_SECURE: "false",
    PULSE_COOKIE_SAME_SITE: "lax",
    PULSE_TRUST_PROXY_HOPS: "0",
    PULSE_ALLOWED_ORIGINS: "http://web:4300",
    PULSE_AUTH_RATE_LIMIT_ENABLED: String(rateLimit),
    PULSE_LOGIN_ACCOUNT_MAX_ATTEMPTS: "5",
    PULSE_LOGIN_IP_MAX_ATTEMPTS: "25",
    PULSE_LOGIN_WINDOW_SECONDS: "900",
    PULSE_LOGIN_LOCKOUT_SECONDS: "900",
    S3_ENDPOINT: "http://minio:9000",
    S3_REGION: "us-east-1",
    S3_BUCKET: "pulse-documents",
    S3_ACCESS_KEY: "pulse-app",
    S3_SECRET_KEY: "M".repeat(24)
  });
  resetRuntimeEnvironmentForTests();
}

beforeEach(() => configureTestEnvironment());
afterEach(() => {
  (prisma.localUser as unknown as { findUnique: typeof prisma.localUser.findUnique }).findUnique = originalFindUnique;
  (prisma.localUser as unknown as { update: typeof prisma.localUser.update }).update = originalUpdate;
  (prisma.activity as unknown as { create: typeof prisma.activity.create }).create = originalActivityCreate;
  (prisma.authThrottleBucket as unknown as { findMany: typeof prisma.authThrottleBucket.findMany }).findMany = originalThrottleFind;
  (prisma.authThrottleBucket as unknown as { deleteMany: typeof prisma.authThrottleBucket.deleteMany }).deleteMany = originalThrottleDelete;
  (prisma as unknown as { $transaction: typeof prisma.$transaction }).$transaction = originalTransaction;
});

function request(headers: Record<string, string> = {}) {
  return {
    ip: "192.0.2.1",
    socket: { remoteAddress: "192.0.2.1" },
    originalUrl: "/api/auth/login",
    method: "POST",
    header(name: string) { return headers[name.toLowerCase()]; }
  } as unknown as Request;
}

function response() {
  const headers = new Map<string, string>();
  const target = {
    statusCode: 200,
    status(code: number) { target.statusCode = code; return target; },
    set(name: string, value: string) { headers.set(name.toLowerCase(), value); return target; },
    getHeader(name: string) { return headers.get(name.toLowerCase()); },
    cookie() { return target; },
    json() { return target; }
  };
  return target as unknown as Response & { statusCode: number; getHeader(name: string): string | undefined };
}

describe("authentication endpoint protection", () => {
  it("returns a successful generic login contract and rotates the session", async () => {
    const user = {
      id: "user-1", name: "Operator", email: "operator@example.test", role: "Admin",
      passwordHash: "unused", active: true, isDemoAccount: false, authProvider: "LOCAL",
      mustChangePassword: false,
      accessRole: { id: "Admin", name: "Administrator", normalizedName: "administrator", color: "#000000", systemKey: "ADMIN", protected: true, archivedAt: null, version: 1, createdAt: new Date(), updatedAt: new Date(), permissions: [] },
      themeMode: "system", accentTheme: "blue", motionMode: "subtle", dashboardPreferences: null,
      entraObjectId: null, lastLoginAt: null, deactivatedAt: null, createdAt: new Date(), updatedAt: new Date()
    };
    (prisma.localUser as any).findUnique = async () => user;
    (prisma.localUser as any).update = async () => ({ ...user, lastLoginAt: new Date() });
    (prisma.activity as any).create = async ({ data }: any) => data;
    const auth = { issueSession: async () => "csrf-token" };
    const protection = {
      keys: () => ({ account: "account", ip: "ip" }),
      getBlockStatus: async () => ({ blocked: false, blockedUntil: null }),
      passwordMatches: () => true, recordSuccess: async () => undefined,
      recordFailureStatus: async () => ({ blocked: false, blockedUntil: null }),
      recordSecurityEvent: async () => undefined
    };
    const controller = new AuthController(auth as any, protection as any, {} as any);
    const result = await controller.login(request(), { email: user.email, password: "correct password" }, response());
    assert.equal("user" in result && result.user?.email, user.email);
    assert.equal("csrfToken" in result && result.csrfToken, "csrf-token");
  });

  it("does not reveal whether an account exists", async () => {
    const auth = { issueSession: async () => "unused" };
    const protection = {
      keys: () => ({ account: "account", ip: "ip" }),
      getBlockStatus: async () => ({ blocked: false, blockedUntil: null }),
      passwordMatches: () => false, recordSuccess: async () => undefined,
      recordFailureStatus: async () => ({ blocked: false, blockedUntil: null }),
      recordSecurityEvent: async () => undefined
    };
    const controller = new AuthController(auth as any, protection as any, {} as any);
    const attempts = [];
    for (const existing of [false, true]) {
      (prisma.localUser as any).findUnique = async () => existing ? {
        id: "user-1", active: true, isDemoAccount: false, authProvider: "LOCAL", passwordHash: "hash",
        accessRole: { archivedAt: null }
      } : null;
      const target = response();
      const result = await controller.login(request(), { email: existing ? "known@example.test" : "unknown@example.test", password: "wrong" }, target);
      attempts.push({ status: target.statusCode, result });
    }
    assert.deepEqual(attempts[0], attempts[1]);
    assert.deepEqual(attempts[0], { status: 401, result: { error: "Unable to sign in." } });
  });

  it("returns lockout notification metadata without looking up the account", async () => {
    let accountLookedUp = false;
    (prisma.localUser as any).findUnique = async () => {
      accountLookedUp = true;
      return null;
    };
    const blockedUntil = new Date(Date.now() + 120_000);
    const protection = {
      keys: () => ({ account: "account", ip: "ip" }),
      getBlockStatus: async () => ({ blocked: true, blockedUntil }),
      recordSecurityEvent: async () => undefined
    };
    const controller = new AuthController({} as any, protection as any, {} as any);
    const target = response();
    const result = await controller.login(
      request(),
      { email: "operator@example.test", password: "wrong" },
      target
    );

    assert.equal(target.statusCode, 429);
    assert.equal("error" in result && result.error, "Sign-in is temporarily locked.");
    const retryAfter = "retryAfterSeconds" in result ? result.retryAfterSeconds : 0;
    assert.ok(retryAfter >= 119 && retryAfter <= 120);
    assert.equal(target.getHeader("Retry-After"), String(retryAfter));
    assert.equal(accountLookedUp, false);
  });

  it("locks repeated username failures and recovers after the cooldown", async () => {
    const protection = new AuthProtectionService({
      hashSecurityIdentifier: (label: string, value: string) => `${label}:${value}`
    } as any);
    let accountAttempts = 0;
    (protection as any).incrementBucket = async (kind: string, _key: string, maximum: number, now: Date) => {
      const attempts = kind === "ACCOUNT" ? ++accountAttempts : 1;
      return { attempts, blockedUntil: attempts >= maximum ? new Date(now.getTime() + 900_000) : null };
    };
    (protection as any).recordSecurityEvent = async () => undefined;
    const keys = protection.keys("operator@example.test", "192.0.2.1");
    for (let attempt = 1; attempt < 5; attempt += 1) assert.equal(await protection.recordFailure(keys), false);
    assert.equal(await protection.recordFailure(keys), true);

    const blockedUntil = new Date("2026-01-01T00:15:00Z");
    (prisma.authThrottleBucket as any).findMany = async ({ where }: any) =>
      blockedUntil > where.blockedUntil.gt ? [{ blockedUntil }] : [];
    assert.equal(await protection.isBlocked(keys, new Date("2026-01-01T00:10:00Z")), true);
    assert.equal(await protection.isBlocked(keys, new Date("2026-01-01T00:16:00Z")), false);
  });

  it("reports the longest active account or IP lock", async () => {
    const protection = new AuthProtectionService({
      hashSecurityIdentifier: (label: string, value: string) => `${label}:${value}`
    } as any);
    const accountBlockedUntil = new Date("2026-01-01T00:12:00Z");
    const ipBlockedUntil = new Date("2026-01-01T00:15:00Z");
    (prisma.authThrottleBucket as any).findMany = async () => [
      { blockedUntil: accountBlockedUntil },
      { blockedUntil: ipBlockedUntil }
    ];

    const status = await protection.getBlockStatus(
      protection.keys("operator@example.test", "192.0.2.1"),
      new Date("2026-01-01T00:10:00Z")
    );
    assert.deepEqual(status, { blocked: true, blockedUntil: ipBlockedUntil });
  });

  it("clears only the account throttle bucket for a password reset", async () => {
    const protection = new AuthProtectionService({
      hashSecurityIdentifier: (label: string, value: string) => `${label}:${value}`
    } as any);
    let deletedWhere: unknown;
    (prisma as any).$transaction = async (callback: (transaction: any) => Promise<unknown>) => callback({
      $executeRaw: async () => 0,
      authThrottleBucket: {
        deleteMany: async ({ where }: any) => {
          deletedWhere = where;
          return { count: 1 };
        }
      }
    });

    await protection.clearAccountFailures("Operator@Example.Test");
    assert.deepEqual(deletedWhere, {
      kind: "ACCOUNT",
      keyDigest: "login-account:operator@example.test"
    });
  });

  it("uses independent pseudonymous username and IP keys", () => {
    const protection = new AuthProtectionService({
      hashSecurityIdentifier: (label: string, value: string) => `${label}:${value}`
    } as any);
    const keys = protection.keys("Operator@Example.Test", "192.0.2.1");
    assert.equal(keys.account, "login-account:operator@example.test");
    assert.equal(keys.ip, "login-ip:192.0.2.1");
  });

  it("creates the one-time Administrator only with the configured setup token", async () => {
    const user = { id: "admin-1", email: "admin@example.test" };
    const auth = { issueSession: async () => "csrf-token" };
    const protection = {
      keys: () => ({ account: "setup-account", ip: "setup-ip" }),
      isBlocked: async () => false,
      recordFailure: async () => false,
      recordSuccess: async () => undefined,
      recordSecurityEvent: async () => undefined
    };
    const firstRun = {
      status: async () => ({ setupRequired: true }),
      tokenMatches: (token: string): boolean => token === "correct-setup-token",
      createAdministrator: async () => user
    };
    const controller = new AuthController(auth as any, protection as any, firstRun as any);
    const target = response();
    const result = await controller.setup(request(), {
      setupToken: "correct-setup-token",
      name: "Initial Operator",
      email: user.email,
      password: "A-strong-initial-password-12345"
    }, target);
    assert.equal(target.statusCode, 200);
    assert.deepEqual(result, { user, csrfToken: "csrf-token", setupRequired: false });

    firstRun.tokenMatches = () => false;
    const rejected = response();
    const failure = await controller.setup(request(), {
      setupToken: "incorrect-setup-token",
      name: "Initial Operator",
      email: user.email,
      password: "A-strong-initial-password-12345"
    }, rejected);
    assert.equal(rejected.statusCode, 403);
    assert.deepEqual(failure, { error: "Setup could not be completed." });
  });
});

describe("CSRF middleware", () => {
  it("requires same-origin login requests with the browser marker", async () => {
    const middleware = new CsrfMiddleware({ recordSecurityEvent: async () => undefined } as any);
    let passed = false;
    await middleware.use(
      request({ origin: "http://web:4300", "sec-fetch-site": "same-origin", "x-pulse-request": "browser" }),
      response(),
      () => { passed = true; },
      { verifyCsrf: async () => false } as any
    );
    assert.equal(passed, true);
  });

  it("applies the same origin and browser-marker control to first-run setup", async () => {
    const middleware = new CsrfMiddleware({ recordSecurityEvent: async () => undefined } as any);
    const setupRequest = request({ origin: "http://web:4300", "sec-fetch-site": "same-origin", "x-pulse-request": "browser" });
    setupRequest.originalUrl = "/api/auth/setup";
    let passed = false;
    await middleware.use(
      setupRequest,
      response(),
      () => { passed = true; },
      { verifyCsrf: async () => false } as any
    );
    assert.equal(passed, true);
  });

  it("rejects cross-origin state changes with a generic response", async () => {
    const middleware = new CsrfMiddleware({ recordSecurityEvent: async () => undefined } as any);
    const target = response();
    let passed = false;
    await middleware.use(
      request({ origin: "https://attacker.example", "x-pulse-request": "browser" }),
      target,
      () => { passed = true; },
      { verifyCsrf: async () => true } as any
    );
    assert.equal(passed, false);
    assert.equal(target.statusCode, 403);
  });
});
