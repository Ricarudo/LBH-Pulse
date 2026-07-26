import { z } from "zod";

const truthy = new Set(["1", "true", "yes", "on"]);
const weakSecretPattern = /^(?:pulse|local|development|dev|test|changeme|password)/i;

function booleanValue(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((value) => value === undefined ? defaultValue : truthy.has(value.toLowerCase()));
}

function integerValue(defaultValue: number, minimum: number, maximum: number) {
  return z
    .string()
    .optional()
    .transform((value) => value === undefined ? defaultValue : Number(value))
    .pipe(z.number().int().min(minimum).max(maximum));
}

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  PULSE_DB_APP_USER: z.string().trim().optional(),
  PULSE_PUBLIC_URL: z.string().url(),
  PULSE_SESSION_SECRET: z.string().min(32),
  PULSE_SECURITY_PEPPER: z.string().min(32),
  PULSE_SETUP_TOKEN: z.string().trim().optional(),
  PULSE_SESSION_TTL_MINUTES: integerValue(480, 15, 1_440),
  PULSE_SESSION_IDLE_MINUTES: integerValue(30, 5, 720),
  PULSE_COOKIE_SECURE: booleanValue(false),
  PULSE_COOKIE_SAME_SITE: z.enum(["strict", "lax"]).default("lax"),
  PULSE_TRUST_PROXY_HOPS: integerValue(0, 0, 4),
  PULSE_ALLOWED_ORIGINS: z.string().min(1),
  PULSE_AUTH_RATE_LIMIT_ENABLED: booleanValue(true),
  PULSE_LOGIN_WINDOW_SECONDS: integerValue(900, 60, 86_400),
  PULSE_LOGIN_ACCOUNT_MAX_ATTEMPTS: integerValue(5, 3, 100),
  PULSE_LOGIN_IP_MAX_ATTEMPTS: integerValue(25, 5, 1_000),
  PULSE_LOGIN_LOCKOUT_SECONDS: integerValue(900, 60, 86_400),
  PULSE_REQUIRE_CREDENTIAL_CONTAINMENT: booleanValue(true),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().trim().min(1),
  S3_BUCKET: z.string().trim().min(3),
  S3_ACCESS_KEY: z.string().trim().min(3),
  S3_SECRET_KEY: z.string().min(12),
  MINIO_ROOT_USER: z.string().optional()
});

export type RuntimeEnvironment = {
  nodeEnv: "development" | "test" | "production";
  databaseUrl: string;
  publicUrl: URL;
  allowedOrigins: string[];
  sessionSecret: string;
  securityPepper: string;
  setupToken?: string;
  sessionTtlMinutes: number;
  sessionIdleMinutes: number;
  cookieSecure: boolean;
  cookieSameSite: "strict" | "lax";
  trustProxyHops: number;
  rateLimitEnabled: boolean;
  loginWindowSeconds: number;
  loginAccountMaxAttempts: number;
  loginIpMaxAttempts: number;
  loginLockoutSeconds: number;
  requireCredentialContainment: boolean;
};

export class RuntimeEnvironmentError extends Error {
  constructor(issues: string[]) {
    super(`Unsafe Pulse environment: ${issues.join("; ")}`);
    this.name = "RuntimeEnvironmentError";
  }
}

export function parseRuntimeEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): RuntimeEnvironment {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const names = Array.from(new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "environment"))));
    throw new RuntimeEnvironmentError(names.map((name) => `${name} is missing or invalid`));
  }

  const value = parsed.data;
  const issues: string[] = [];
  const publicUrl = new URL(value.PULSE_PUBLIC_URL);
  const databaseUrl = new URL(value.DATABASE_URL);
  const allowedOrigins = value.PULSE_ALLOWED_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        issues.push("PULSE_ALLOWED_ORIGINS contains an invalid origin");
        return "";
      }
    })
    .filter(Boolean);

  if (value.PULSE_SESSION_IDLE_MINUTES >= value.PULSE_SESSION_TTL_MINUTES) {
    issues.push("PULSE_SESSION_IDLE_MINUTES must be shorter than PULSE_SESSION_TTL_MINUTES");
  }
  if (value.PULSE_SESSION_SECRET === value.PULSE_SECURITY_PEPPER) {
    issues.push("PULSE_SESSION_SECRET and PULSE_SECURITY_PEPPER must be different");
  }
  if (value.PULSE_SETUP_TOKEN && [value.PULSE_SESSION_SECRET, value.PULSE_SECURITY_PEPPER].includes(value.PULSE_SETUP_TOKEN)) {
    issues.push("PULSE_SETUP_TOKEN must be different from session and security secrets");
  }
  if (weakSecretPattern.test(value.PULSE_SESSION_SECRET)) {
    issues.push("PULSE_SESSION_SECRET matches a prohibited development pattern");
  }
  if (weakSecretPattern.test(value.PULSE_SECURITY_PEPPER)) {
    issues.push("PULSE_SECURITY_PEPPER matches a prohibited development pattern");
  }
  if (!allowedOrigins.includes(publicUrl.origin)) {
    issues.push("PULSE_ALLOWED_ORIGINS must include PULSE_PUBLIC_URL exactly");
  }

  if (value.NODE_ENV === "production") {
    if (publicUrl.protocol !== "https:") issues.push("PULSE_PUBLIC_URL must use HTTPS in production");
    if (!value.PULSE_COOKIE_SECURE) issues.push("PULSE_COOKIE_SECURE must be true in production");
    if (value.PULSE_COOKIE_SAME_SITE !== "strict") issues.push("PULSE_COOKIE_SAME_SITE must be strict in production");
    if (!value.PULSE_AUTH_RATE_LIMIT_ENABLED) issues.push("PULSE_AUTH_RATE_LIMIT_ENABLED cannot be disabled in production");
    if (value.PULSE_SESSION_SECRET.length < 64) issues.push("PULSE_SESSION_SECRET must contain at least 64 characters in production");
    if (value.PULSE_SECURITY_PEPPER.length < 64) issues.push("PULSE_SECURITY_PEPPER must contain at least 64 characters in production");
    if (value.PULSE_SETUP_TOKEN && value.PULSE_SETUP_TOKEN.length < 64) issues.push("PULSE_SETUP_TOKEN must contain at least 64 characters in production");
    if (value.PULSE_SETUP_TOKEN && weakSecretPattern.test(value.PULSE_SETUP_TOKEN)) issues.push("PULSE_SETUP_TOKEN matches a prohibited development pattern");
    if (value.PULSE_TRUST_PROXY_HOPS !== 2) issues.push("PULSE_TRUST_PROXY_HOPS must be 2 for the production Caddy and Next topology");
    if (value.PULSE_DB_APP_USER && decodeURIComponent(databaseUrl.username) !== value.PULSE_DB_APP_USER) {
      issues.push("DATABASE_URL username must match PULSE_DB_APP_USER");
    }
    if (value.MINIO_ROOT_USER && value.MINIO_ROOT_USER === value.S3_ACCESS_KEY) {
      issues.push("S3_ACCESS_KEY must not be the MinIO root identity");
    }
  }

  if (issues.length) throw new RuntimeEnvironmentError(Array.from(new Set(issues)));

  return {
    nodeEnv: value.NODE_ENV,
    databaseUrl: value.DATABASE_URL,
    publicUrl,
    allowedOrigins,
    sessionSecret: value.PULSE_SESSION_SECRET,
    securityPepper: value.PULSE_SECURITY_PEPPER,
    setupToken: value.PULSE_SETUP_TOKEN || undefined,
    sessionTtlMinutes: value.PULSE_SESSION_TTL_MINUTES,
    sessionIdleMinutes: value.PULSE_SESSION_IDLE_MINUTES,
    cookieSecure: value.PULSE_COOKIE_SECURE,
    cookieSameSite: value.PULSE_COOKIE_SAME_SITE,
    trustProxyHops: value.PULSE_TRUST_PROXY_HOPS,
    rateLimitEnabled: value.PULSE_AUTH_RATE_LIMIT_ENABLED,
    loginWindowSeconds: value.PULSE_LOGIN_WINDOW_SECONDS,
    loginAccountMaxAttempts: value.PULSE_LOGIN_ACCOUNT_MAX_ATTEMPTS,
    loginIpMaxAttempts: value.PULSE_LOGIN_IP_MAX_ATTEMPTS,
    loginLockoutSeconds: value.PULSE_LOGIN_LOCKOUT_SECONDS,
    requireCredentialContainment: value.PULSE_REQUIRE_CREDENTIAL_CONTAINMENT
  };
}

let cachedEnvironment: RuntimeEnvironment | undefined;

export function runtimeEnvironment() {
  cachedEnvironment ??= parseRuntimeEnvironment();
  return cachedEnvironment;
}

export function resetRuntimeEnvironmentForTests() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Runtime environment cache can only be reset in tests.");
  }
  cachedEnvironment = undefined;
}

export async function assertProductionDatabaseSafety(config: RuntimeEnvironment) {
  if (config.nodeEnv !== "production") return;
  const { prisma } = await import("@/lib/db");

  const [role] = await prisma.$queryRaw<Array<{
    rolname: string;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    schema_create: boolean;
  }>>`
    SELECT
      r.rolname,
      r.rolsuper,
      r.rolcreatedb,
      r.rolcreaterole,
      r.rolreplication,
      r.rolbypassrls,
      has_schema_privilege(current_user, 'pulse', 'CREATE') AS schema_create
    FROM pg_roles r
    WHERE r.rolname = current_user
  `;

  if (!role || role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.rolbypassrls || role.schema_create) {
    throw new RuntimeEnvironmentError(["DATABASE_URL must use the restricted Pulse runtime role"]);
  }

  const [totalUsers, activeAdmins, activeDemoAccounts, referenceTemplateCount, interactiveSetupRows, containmentRows] = await Promise.all([
    prisma.localUser.count(),
    prisma.localUser.count({ where: { active: true, accessRole: { systemKey: "ADMIN", archivedAt: null } } }),
    prisma.localUser.count({ where: { active: true, isDemoAccount: true } }),
    prisma.requestChecklistTemplate.count({ where: { key: "general", active: true, archivedAt: null } }),
    prisma.maintenanceRun.count({
      where: {
        kind: "INTERACTIVE_ADMIN_SETUP",
        mode: "APPLY",
        completedAt: { not: null }
      }
    }),
    config.requireCredentialContainment
      ? prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM pulse."MaintenanceRun"
          WHERE mode = 'APPLY'
            AND "completedAt" IS NOT NULL
            AND (
              kind = 'CREDENTIAL_CONTAINMENT'
              OR kind = 'INTERACTIVE_ADMIN_SETUP'
              OR (
                kind = 'SECURE_ADMIN_BOOTSTRAP'
                AND summary ->> 'created' = 'true'
              )
            )
        `
      : Promise.resolve([{ count: 1n }])
  ]);

  const issues: string[] = [];
  if (!referenceTemplateCount) {
    issues.push("required reference data is missing; run the reviewed reference-data bootstrap");
  }
  if (totalUsers === 0) {
    if (interactiveSetupRows) {
      issues.push("the one-time setup is already recorded but no user accounts remain; use the controlled administrator recovery process");
    }
    if (!config.setupToken || config.setupToken.length < 64) {
      issues.push("PULSE_SETUP_TOKEN must contain at least 64 characters while the empty installation awaits first-run setup");
    }
    if (issues.length) throw new RuntimeEnvironmentError(issues);
    return;
  }
  if (!activeAdmins) issues.push("at least one active Administrator must be bootstrapped");
  if (activeDemoAccounts) issues.push("active development/demo accounts are prohibited in production");
  if (!Number(containmentRows[0]?.count ?? 0n)) {
    issues.push("credential containment or a clean-database administrator bootstrap has not been recorded");
  }
  if (issues.length) throw new RuntimeEnvironmentError(issues);
}
