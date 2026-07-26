import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRuntimeEnvironment, RuntimeEnvironmentError } from "@/config/runtimeEnvironment";

function environment(additions: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://pulse_app@example.invalid/pulse?schema=pulse",
    PULSE_DB_APP_USER: "pulse_app",
    PULSE_PUBLIC_URL: "https://pulse.example.test",
    PULSE_SESSION_SECRET: "S".repeat(64),
    PULSE_SECURITY_PEPPER: "Q".repeat(64),
    PULSE_COOKIE_SECURE: "true",
    PULSE_COOKIE_SAME_SITE: "strict",
    PULSE_TRUST_PROXY_HOPS: "2",
    PULSE_ALLOWED_ORIGINS: "https://pulse.example.test",
    PULSE_AUTH_RATE_LIMIT_ENABLED: "true",
    S3_ENDPOINT: "http://minio:9000",
    S3_REGION: "us-east-1",
    S3_BUCKET: "pulse-documents",
    S3_ACCESS_KEY: "pulse-app",
    S3_SECRET_KEY: "M".repeat(24),
    MINIO_ROOT_USER: "pulse-root",
    ...additions
  };
}

describe("production runtime environment", () => {
  it("accepts an explicit secure production configuration", () => {
    const parsed = parseRuntimeEnvironment(environment());
    assert.equal(parsed.nodeEnv, "production");
    assert.equal(parsed.trustProxyHops, 2);
    assert.equal(parsed.cookieSameSite, "strict");
  });

  it("fails safely for missing, shipped-pattern, or short session secrets", () => {
    for (const secret of [undefined, "local-session-secret-change-me", "short-secret-value"]) {
      assert.throws(
        () => parseRuntimeEnvironment(environment({ PULSE_SESSION_SECRET: secret })),
        RuntimeEnvironmentError
      );
    }
  });

  it("rejects global forwarded-header trust and insecure cookies", () => {
    assert.throws(
      () => parseRuntimeEnvironment(environment({ PULSE_TRUST_PROXY_HOPS: "0", PULSE_COOKIE_SECURE: "false" })),
      /PULSE_COOKIE_SECURE|PULSE_TRUST_PROXY_HOPS/
    );
  });

  it("accepts only an independent, strong first-run setup token when supplied", () => {
    const parsed = parseRuntimeEnvironment(environment({ PULSE_SETUP_TOKEN: "T".repeat(64) }));
    assert.equal(parsed.setupToken, "T".repeat(64));
    assert.throws(
      () => parseRuntimeEnvironment(environment({ PULSE_SETUP_TOKEN: "short-setup-token" })),
      /PULSE_SETUP_TOKEN/
    );
    assert.throws(
      () => parseRuntimeEnvironment(environment({ PULSE_SETUP_TOKEN: "S".repeat(64) })),
      /PULSE_SETUP_TOKEN/
    );
  });

  it("allows explicit test behavior without weakening production validation", () => {
    const parsed = parseRuntimeEnvironment(environment({
      NODE_ENV: "test",
      PULSE_PUBLIC_URL: "http://web:4300",
      PULSE_ALLOWED_ORIGINS: "http://web:4300",
      PULSE_COOKIE_SECURE: "false",
      PULSE_COOKIE_SAME_SITE: "lax",
      PULSE_TRUST_PROXY_HOPS: "0",
      PULSE_AUTH_RATE_LIMIT_ENABLED: "false"
    }));
    assert.equal(parsed.nodeEnv, "test");
    assert.equal(parsed.rateLimitEnabled, false);
  });
});
