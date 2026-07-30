# Pulse production setup and future updates

This guide is the production operator's entrypoint for a new Pulse installation
and for later releases. It summarizes the safe order of operations; the
[production runbook](./runbook.md), [first-run and import guide](./initial-setup.md),
[operator checklist](./operator-checklist.md), [migration guide](./migrations.md),
and [rollback guide](./rollback.md) remain the detailed sources of truth.

For a local development environment, use the
[Local development section in the repository README](../../README.md#local-development)
instead.

## Production prerequisites

Prepare these before an installation or update:

- a protected host with Docker Engine and Docker Compose v2;
- Node.js 24 or newer for the repository verification commands;
- an approved immutable source revision and its release notes;
- an HTTPS hostname with DNS and firewall rules that expose only Caddy on ports
  80 and 443;
- an ignored, mode-`0600` `.env.production` populated from the organization's
  secret manager;
- distinct PostgreSQL administrator, migration, and runtime identities;
- distinct MinIO root and bucket-scoped application identities;
- independent session, security-pepper, and first-run setup secrets;
- an off-repository backup destination, an escrowed `age` recovery identity,
  and its public recipient; and
- an approved change window, acceptance owner, and rollback decision point.

Do not put secrets in Git, tickets, shell output, support bundles, or the
repository backup directory. `.env.production` is deployment state: protect it
and update it in place rather than replacing it with `.env.example`.

## Initial production installation

Pulse 0.1 installs into new, explicitly named PostgreSQL and MinIO volumes. It
does not promote, adopt, restore over, or modify the development database.

### 1. Select the release and prepare the environment

Check out and verify the approved immutable source revision. Copy the template
only for a new installation:

```sh
cp .env.example .env.production
chmod 0600 .env.production
```

Replace every placeholder using the secret manager. Set
`PULSE_RELEASE_TAG` to the approved revision or release identifier, use unique
production volume names, and configure `PULSE_PUBLIC_URL`,
`PULSE_HOSTNAME`, and `PULSE_ALLOWED_ORIGINS` for the exact HTTPS origin.
The supported Caddy-to-Next-to-API topology requires
`PULSE_TRUST_PROXY_HOPS=2`.

The first-run `PULSE_SETUP_TOKEN` must be an independently generated value of
at least 64 random characters. It is a one-time setup code, not an
Administrator password.

Validate the release before building:

```sh
npm run verify:no-shipped-secrets
npm run verify:production-config -- .env.production
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml config --quiet
```

Resolve every error before proceeding. Record the approved source revision and
rendered configuration review in the change ticket without copying secret
values.

### 2. Build immutable production images

```sh
docker compose --env-file .env.production -f compose.production.yaml \
  build --pull api web gateway minio-init clamav

docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance build db-roles

docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile backup build backup-encrypt
```

Record the resulting image IDs or digests. Do not use a moving or unreviewed
tag for `PULSE_RELEASE_TAG`.

### 3. Start storage and provision restricted access

```sh
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  up -d postgres minio clamav

docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm db-roles
```

Review the role/grant preview and confirm the database, schema, administrator,
migration, runtime, and optional legacy role names. Then apply the reviewed
plan:

```sh
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm db-roles \
  npm run db:roles:apply -w @pulse/api

docker compose --env-file .env.production -f compose.production.yaml \
  up minio-init
```

The API must use only the restricted runtime database identity and the
bucket-scoped MinIO application identity.

### 4. Deploy the schema and reference data

```sh
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm migrate

docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm reference-data

docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm db-role-verify
```

The reference-data operation is idempotent and creates no user or business
record. Follow the [clean-environment migration path](./migrations.md#new-empty-environment);
the existing-database baseline path is not the normal Pulse 0.1 installation.

### 5. Complete protected first-run setup

Start the already-built stack:

```sh
docker compose --env-file .env.production -f compose.production.yaml \
  up -d --no-build --wait --wait-timeout 360

docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml \
  logs --since 10m api web gateway
curl --fail --silent --show-error https://<pulse-hostname>/api/health/live
curl --fail --silent --show-error https://<pulse-hostname>/api/health/ready
```

Open the HTTPS site and confirm that Pulse displays **Set up Pulse**, not a
login form. Supply the protected setup code and the real Administrator's name,
email, and final password. The transaction creates exactly one non-demo
Administrator and permanently closes first-run setup.

After Pulse opens **Settings → Users & access**:

1. remove `PULSE_SETUP_TOKEN` from `.env.production` and the secret manager;
2. redeploy the API with the production Compose file;
3. confirm that setup cannot be reopened; and
4. confirm that the Administrator can sign in normally.

### 6. Create users and import initial data

Use [the first-run and import guide](./initial-setup.md) for the authoritative
contracts and reconciliation rules:

1. create the real operational users in **Settings → Users & access**;
2. preview, review, select, and apply clients;
3. preview, review, select, and apply catalog items; and
4. preview, review, select, and apply legacy quote summaries.

Do not import quotes before their clients and active owners exist. Do not
invent contacts, sites, or assignees to make imports pass. The Pulse 0.1
quote-summary importer does not cover BOM lines, revision files, or document
objects.

### 7. Verify, back up, and prove recovery

Complete the [operator checklist](./operator-checklist.md), including HTTPS
health, authentication, CSRF, throttling, document upload/download and
antivirus, import reconciliation, and critical workflow checks.

Create the first encrypted production backup:

```sh
export PULSE_BACKUP_DIR=/absolute/off-repository/path
export PULSE_BACKUP_AGE_RECIPIENT=<age-public-recipient>
./scripts/operations/backup.sh \
  --environment production \
  --env-file .env.production
```

Verify the archive's companion SHA-256 file, then preview an isolated restore
into new volume names containing `restore`:

```sh
export PULSE_BACKUP_AGE_IDENTITY_FILE=/secure/path/age-identity.txt
export PULSE_RESTORE_POSTGRES_VOLUME=pulse-restore-<date>-postgres
export PULSE_RESTORE_MINIO_VOLUME=pulse-restore-<date>-minio
./scripts/operations/restore.sh \
  --env-file .env.production \
  --backup-file /absolute/path/pulse-production-<timestamp>.tar.gz.age \
  --project pulse-restore-validation
```

Review the project and volume names, repeat the restore command with `--apply`,
then provision roles, deploy migrations, and run the integrity and application
checks described in
[Restore and validate without overwriting production](./runbook.md#5-restore-and-validate-without-overwriting-production).
Do not accept the installation until the restored data and MinIO objects
reconcile with production.

## Installing future updates

Apply each future release as a controlled production change. Release notes may
add release-specific checks, configuration, migrations, or compatibility
requirements; those instructions take precedence over this common sequence.

### 1. Review and preserve the current release

Before changing the deployed checkout:

1. read the target release notes and confirm its supported upgrade path;
2. record the current source revision, `PULSE_RELEASE_TAG`, Compose status, and
   image IDs or digests;
3. review new `.env.example` keys and prepare corresponding secret-manager
   values without overwriting `.env.production`;
4. define the maintenance window, acceptance checks, and rollback owner; and
5. confirm that the target revision passed the isolated release gates.

Create an encrypted production backup using the current release's
`scripts/operations/backup.sh`. Verify its checksum and complete an isolated
restore validation before the update window. Keep the pre-update archive,
current immutable images, and prior configuration available throughout the
rollback window.

### 2. Prepare the approved update

Check out and verify the approved immutable target revision. Add only newly
required configuration to the protected `.env.production`; do not reset
existing secrets or volume names unless the release notes explicitly require
an approved rotation or migration. Set `PULSE_RELEASE_TAG` to the new immutable
release identifier.

Run the production checks and render Compose:

```sh
npm run verify:no-shipped-secrets
npm run verify:production-config -- .env.production
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml config --quiet
```

Build the new release without redeploying it:

```sh
docker compose --env-file .env.production -f compose.production.yaml \
  build --pull api web gateway minio-init clamav

docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance build db-roles

docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile backup build backup-encrypt
```

Record the new image IDs or digests and verify that they use the intended
release tag.

### 3. Enter the maintenance window and migrate

Quiesce application writes before applying a schema or data migration:

```sh
docker compose --env-file .env.production -f compose.production.yaml \
  stop gateway web api
```

If the release changes database roles or grants, run `db-roles` in preview
mode, review it, and use the explicit apply command from the
[production runbook](./runbook.md#3-start-stateful-dependencies-and-provision-access).
Then deploy forward migrations, apply idempotent reference data, and verify the
runtime role:

```sh
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm migrate

docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm reference-data

docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm db-role-verify
```

Stop the rollout if any maintenance command fails. Preserve the output and
migration state; do not repeatedly rerun an unknown partial migration.

### 4. Deploy and verify the update

Start only the images that were built and reviewed:

```sh
docker compose --env-file .env.production -f compose.production.yaml \
  up -d --no-build --wait --wait-timeout 360

docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml \
  logs --since 10m api web gateway
curl --fail --silent --show-error https://<pulse-hostname>/api/health/live
curl --fail --silent --show-error https://<pulse-hostname>/api/health/ready
```

At minimum, verify Administrator login, logout invalidation, a critical
request/quote workflow, document upload/download and antivirus scanning, and
the release-specific acceptance cases. Reconcile any data affected by the
migration, record the deployed image IDs, and create a new encrypted backup
after acceptance.

### 5. Roll back safely when required

Use the [rollback guide](./rollback.md) to choose the recovery path:

- **Application failure with proven-good data:** redeploy the last approved
  immutable application images only if the previous application was validated
  against the resulting forward-compatible schema.
- **Failed migration or uncertain data integrity:** keep API and web writes
  stopped, preserve the failed environment, and restore the pre-update
  encrypted archive into new isolated volumes. Validate it fully before any
  separately approved manual cutover.

Never attempt a destructive down migration or overwrite the production
volumes to make a rollback faster.

## Commands prohibited against production data

Never run any of the following against a database or volume whose data matters:

- `db:setup`, `db:reset:demo`, or `prisma migrate reset`;
- `prisma db push`;
- migrations under `legacy-migrations-pre-0.1`;
- unreviewed ad-hoc SQL or data-repair apply commands;
- `docker compose down -v`; or
- broad `docker volume rm` or other volume-deletion commands.

Production migrations move forward through reviewed, versioned SQL. When data
integrity is uncertain, preserve evidence and restore into new isolated
volumes instead of resetting, overwriting, or deleting the current ones.
