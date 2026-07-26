import "dotenv/config";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const targetDatabase = process.env.PULSE_CI_FIRST_RUN_DATABASE?.trim() || "pulse_first_run_ci";
const safeDatabaseName = /^[a-z][a-z0-9_]{0,49}_first_run_ci$/;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function databaseUrl(source: string, database: string) {
  const url = new URL(source);
  url.pathname = `/${database}`;
  url.searchParams.set("schema", "pulse");
  return url.toString();
}

function connectionUrl(source: string, database: string) {
  const url = new URL(source);
  url.pathname = `/${database}`;
  url.searchParams.delete("schema");
  return url.toString();
}

function runScript(script: string, environment: NodeJS.ProcessEnv) {
  const result = spawnSync("npm", ["run", script], {
    cwd: process.cwd(),
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"]
  });
  if (result.status !== 0) throw new Error(`${script} failed in the isolated first-run CI database.`);
}

async function main() {
  if (!safeDatabaseName.test(targetDatabase)) {
    throw new Error("PULSE_CI_FIRST_RUN_DATABASE must be a safe name ending in _first_run_ci.");
  }
  if (process.env.NODE_ENV !== "test" || process.env.PULSE_ALLOW_CI_DATABASE_CREATE !== "1") {
    throw new Error("First-run verification is restricted to explicit isolated test environments.");
  }

  const adminSource = required("PULSE_DATABASE_ADMIN_URL");
  const migrationSource = required("PULSE_DATABASE_MIGRATION_URL");
  const appSource = required("PULSE_DATABASE_APP_URL");
  const sourceDatabase = new URL(adminSource).pathname.slice(1);
  const admin = new Client({ connectionString: connectionUrl(adminSource, sourceDatabase) });
  await admin.connect();
  try {
    const exists = await admin.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [targetDatabase]
    );
    if (exists.rows[0]?.exists) {
      throw new Error("The isolated first-run CI database already exists; refusing to reuse it.");
    }
    await admin.query(`CREATE DATABASE "${targetDatabase}"`);
  } finally {
    await admin.end();
  }

  const targetAdminUrl = databaseUrl(adminSource, targetDatabase);
  const targetMigrationUrl = databaseUrl(migrationSource, targetDatabase);
  const targetAppUrl = databaseUrl(appSource, targetDatabase);
  const targetEnvironment = {
    ...process.env,
    DATABASE_URL: targetMigrationUrl,
    PULSE_DATABASE_ADMIN_URL: targetAdminUrl,
    PULSE_DATABASE_MIGRATION_URL: targetMigrationUrl,
    PULSE_DATABASE_APP_URL: targetAppUrl
  };
  runScript("db:roles:apply", targetEnvironment);
  runScript("db:migrate:deploy", targetEnvironment);
  runScript("db:reference-data:apply", targetEnvironment);
  runScript("db:roles:apply", targetEnvironment);
  runScript("db:roles:verify", { ...targetEnvironment, DATABASE_URL: targetAppUrl });

  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: targetAppUrl,
    PULSE_PUBLIC_URL: "http://web:4300",
    PULSE_SESSION_SECRET: "S".repeat(64),
    PULSE_SECURITY_PEPPER: "Q".repeat(64),
    PULSE_SETUP_TOKEN: "T".repeat(64),
    PULSE_COOKIE_SECURE: "false",
    PULSE_COOKIE_SAME_SITE: "lax",
    PULSE_TRUST_PROXY_HOPS: "0",
    PULSE_ALLOWED_ORIGINS: "http://web:4300",
    PULSE_AUTH_RATE_LIMIT_ENABLED: "true",
    S3_ENDPOINT: "http://minio:9000",
    S3_REGION: "us-east-1",
    S3_BUCKET: "pulse-ci-documents",
    S3_ACCESS_KEY: "pulse-ci-app",
    S3_SECRET_KEY: "M".repeat(24)
  });

  const [{ FirstRunSetupService }, { prisma }] = await Promise.all([
    import("@/shared/first-run-setup.service"),
    import("@/lib/db")
  ]);
  try {
    const service = new FirstRunSetupService();
    const before = await service.status();
    if (!before.setupRequired || !service.tokenMatches("T".repeat(64)) || service.tokenMatches("incorrect-token")) {
      throw new Error("The empty database did not expose only the configured first-run setup state.");
    }
    const administrator = await service.createAdministrator({
      name: "CI Initial Administrator",
      email: "ci-first-run-admin@example.invalid",
      password: "A-CI-first-run-password-123456789"
    });
    const after = await service.status();
    const [users, roles, setupRuns, clients, items, quotes] = await Promise.all([
      prisma.localUser.count(),
      prisma.accessRole.count(),
      prisma.maintenanceRun.count({ where: { kind: "INTERACTIVE_ADMIN_SETUP", completedAt: { not: null } } }),
      prisma.client.count(),
      prisma.item.count(),
      prisma.quote.count()
    ]);
    let repeatedSetupRejected = false;
    try {
      await service.createAdministrator({
        name: "Repeated Administrator",
        email: "ci-repeated-admin@example.invalid",
        password: "A-CI-repeated-password-123456789"
      });
    } catch (error) {
      repeatedSetupRejected = error instanceof Error && error.message === "INITIAL_SETUP_NOT_AVAILABLE";
    }
    const valid = administrator.isSystemAdmin && !administrator.mustChangePassword &&
      !after.setupRequired && users === 1 && roles === 4 && setupRuns === 1 &&
      clients === 0 && items === 0 && quotes === 0 && repeatedSetupRejected;
    console.log(JSON.stringify({
      status: valid ? "ok" : "failed",
      targetDatabase,
      setupRequiredBefore: before.setupRequired,
      setupRequiredAfter: after.setupRequired,
      users,
      roles,
      setupRuns,
      businessRecords: { clients, items, quotes },
      repeatedSetupRejected
    }, null, 2));
    if (!valid) throw new Error("First-run integration verification failed.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "First-run CI verification failed.");
  process.exitCode = 1;
});
