import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const components = [
  "api",
  "web",
  "maintenance",
  "minioInit",
  "clamav",
  "backupCrypto",
  "gatewayInternal",
  "gatewayPublic",
  "postgres",
  "minio",
  "minioMc"
];

test("generates a digest-pinned 0.1.1 manifest with an exact upgrade contract", () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "pulse-release-manifest-"));
  const input = resolve(temporaryRoot, "digests");
  const output = resolve(temporaryRoot, "output");
  const bases = resolve(temporaryRoot, "build-bases.json");
  try {
    mkdirSync(input, { recursive: true });
    for (const [index, component] of components.entries()) {
      writeFileSync(
        resolve(input, `${component}.json`),
        `${JSON.stringify({ component, reference: `ghcr.io/ricarudo/pulse-${component.toLowerCase()}@sha256:${String(index + 1).padStart(64, "0")}` })}\n`
      );
    }
    writeFileSync(
      bases,
      `${JSON.stringify({ node: `node@sha256:${"a".repeat(64)}` })}\n`
    );

    const result = spawnSync(process.execPath, [
      "scripts/release/create-release-manifest.mjs",
      "--version", "0.1.1",
      "--commit", "b".repeat(40),
      "--input", input,
      "--build-bases", bases,
      "--output", output
    ], {
      cwd: repositoryRoot,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const manifest = JSON.parse(readFileSync(resolve(output, "release-manifest.json"), "utf8"));
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.version, "0.1.1");
    assert.equal(manifest.tag, "v0.1.1");
    assert.equal(manifest.upgrade.minimumVersion, "0.1.0");
    assert.deepEqual(manifest.upgrade.sourceMigrations, [
      "202607210001_pulse_0_1_baseline",
      "202607210002_enterprise_security",
      "202607290001_record_number_sequences",
      "202607300001_client_consolidation"
    ]);
    assert.deepEqual(manifest.upgrade.targetMigrations, [
      "202608030001_quote_due_date",
      "202608030002_lifecycle_collaborators"
    ]);
    assert.equal(manifest.upgrade.rollbackPolicy, "restore-required-after-migration");
    assert.deepEqual(Object.keys(manifest.images).sort(), [...components].sort());
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("accepts the release tag only when every workspace version agrees", () => {
  const result = spawnSync(process.execPath, ["scripts/release/validate-version.mjs", "v0.1.1"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(JSON.parse(result.stdout), { tag: "v0.1.1", version: "0.1.1", minor: "0.1" });
});

test("keeps exact release tags immutable while allowing the minor channel to advance", () => {
  const workflow = readFileSync(resolve(repositoryRoot, ".github/workflows/release.yml"), "utf8");
  const guardStart = workflow.indexOf("- name: Refuse semantic-tag replacement");
  const buildStart = workflow.indexOf("- id: build", guardStart);
  assert.notEqual(guardStart, -1);
  assert.notEqual(buildStart, -1);

  const guard = workflow.slice(guardStart, buildStart);
  assert.match(guard, /needs\.validate\.outputs\.version/);
  assert.doesNotMatch(guard, /needs\.validate\.outputs\.minor/);
  assert.match(guard, /replacesUnpublishedRevision/);
  assert.match(workflow.slice(buildStart), /needs\.validate\.outputs\.minor/);

  const releaseMetadata = JSON.parse(readFileSync(resolve(repositoryRoot, "docs/releases/0.1.1.json"), "utf8"));
  assert.match(releaseMetadata.replacesUnpublishedRevision, /^[a-f0-9]{40}$/);
});
