# Pulse 0.1 production runbook

This runbook assumes Docker Engine with Compose v2, a protected host, an off-repository backup destination, and an organization secret manager. Commands are run from the checked-out release directory. Replace `.env.production` only with an ignored, mode-`0600` file populated from the secret manager. Never paste secret values into tickets, shell history, logs, or reports.

Pulse 0.1 uses a **new empty release database**. The current development database is not the release target and must not be adopted or cut over. Follow [initial-setup.md](./initial-setup.md) for the user-visible setup and import contract. Existing-database baseline adoption remains a recovery/legacy tool only.

## 1. Prepare the environment

1. Select and verify the immutable source revision. Set `PULSE_RELEASE_TAG` to that revision or approved release identifier.
2. Copy `.env.example` to `.env.production`, set mode `0600`, and replace every placeholder. Use distinct identities and independently generated values for PostgreSQL admin/migration/runtime, MinIO root/application, session signing, security pepper, and the one-time first-run setup token.
3. Generate secrets with the organization password generator. If an offline generator is required, write directly to a protected file, for example `umask 077; openssl rand -hex 48 > /secure/path/pulse-session-secret`; import it into the secret manager without printing it.
4. Use an HTTPS `PULSE_PUBLIC_URL`; set `PULSE_ALLOWED_ORIGINS` to its exact origin. The production Caddy → Next → API topology requires exactly `PULSE_TRUST_PROXY_HOPS=2`. Do not expose PostgreSQL or MinIO host ports.
5. Deliver the one-time setup code to the initial Administrator through a protected channel. Remove `PULSE_SETUP_TOKEN` from the production environment and redeploy immediately after browser setup succeeds.

Validate interpolation and security policy before building:

```sh
npm run verify:no-shipped-secrets
npm run verify:production-config -- .env.production
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml config --quiet
```

Production startup rejects missing/weak/reused secrets, non-HTTPS public URLs, insecure cookies, disabled throttling, incorrect proxy hops, elevated database credentials, active demo users, missing reference data, and unsafe account state. A truly empty database may start only in protected first-run mode with a 64+ character setup token.

## 2. Build immutable images

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

Record image IDs/digests with the change ticket. API and web run compiled production servers as non-root users, with read-only filesystems, no source bind mounts, no dependency installation at startup, and no hot reload.

The published ClamAV image currently requires `CLAMAV_PLATFORM=linux/amd64`; this is the safe template default and also permits builds on ARM operator workstations through Docker emulation. Change it only after validating an upstream image for the deployment architecture.

## 3. Start stateful dependencies and provision access

```sh
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  up -d postgres minio clamav

docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm db-roles
```

Review the role/grant preview. Apply only after confirming the admin, migration, runtime, database, schema, and optional legacy-role names:

```sh
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm db-roles \
  npm run db:roles:apply -w @pulse/api
```

The runtime role must not be superuser, create databases/roles, replicate, bypass RLS, create in `pulse`, or own application relations. Verify after migration:

```sh
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm db-role-verify
```

Provision MinIO’s private bucket and bucket-scoped application identity:

```sh
docker compose --env-file .env.production -f compose.production.yaml \
  up minio-init
```

## 4. Preserve the non-release source before export

The development database is not promoted to release. If it is used to produce or validate any accepted import file, preserve it as a read-only source before exporting: quiesce writes and create a consistent encrypted archive.

```sh
docker compose --env-file .env.source -f compose.yaml stop api web
export PULSE_BACKUP_DIR=/absolute/off-repository/path
export PULSE_BACKUP_AGE_RECIPIENT=<age-public-recipient>
./scripts/operations/backup.sh --environment development --env-file .env.source
docker compose --env-file .env.source -f compose.yaml start api web
```

If an age identity has not already been escrowed, create it directly in a protected off-repository directory with the network-isolated release image, then store the identity in the organization secret manager:

```sh
export PULSE_BACKUP_ARCHIVE_DIR=/secure/off-repository/key-staging
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile backup run --rm --no-deps \
  --entrypoint age-keygen backup-encrypt \
  -o /archives/age-identity.txt
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile backup run --rm --no-deps \
  --entrypoint age-keygen backup-encrypt \
  -y /archives/age-identity.txt
```

The second command prints only the public recipient; export that value as `PULSE_BACKUP_AGE_RECIPIENT`. Never print or copy the private identity into a ticket or environment file.

Use the actual ignored source-stack environment filename in place of `.env.source`; never point this command at the new release volumes. The backup contains a PostgreSQL custom dump, MinIO objects/object manifest, and declarative deployment/configuration files. It explicitly excludes environment files, plaintext secrets, and the local client CSV. The output is timestamped, encrypted with `age` inside the release-tagged network-isolated backup image, and accompanied by a SHA-256 file. The host does not install encryption dependencies at backup time. Retain this archive until the imported release database has passed reconciliation and restore validation.

Optional pruning is explicit: set `PULSE_BACKUP_PRUNE=1` and `PULSE_BACKUP_RETENTION_DAYS`; review the destination before enabling it.

## 5. Restore and validate without overwriting production

Always choose new volume names containing `restore`. Preview first:

```sh
export PULSE_BACKUP_AGE_IDENTITY_FILE=/secure/path/age-identity.txt
export PULSE_RESTORE_POSTGRES_VOLUME=pulse-restore-20260721-postgres
export PULSE_RESTORE_MINIO_VOLUME=pulse-restore-20260721-minio
./scripts/operations/restore.sh \
  --env-file .env.production \
  --backup-file /absolute/path/pulse-production-<timestamp>.tar.gz.age \
  --project pulse-restore-validation
```

After confirming that neither volume exists and the target project is isolated, repeat with `--apply`. The script decrypts, verifies the internal manifest, restores PostgreSQL and MinIO into new volumes, and never cuts over automatically. Before every follow-up Compose command, export `PULSE_POSTGRES_VOLUME=$PULSE_RESTORE_POSTGRES_VOLUME` and `PULSE_MINIO_VOLUME=$PULSE_RESTORE_MINIO_VOLUME`; child-script exports cannot alter the operator shell.

Provision roles, deploy migrations, start the restored application on non-production ports/hostname, then run:

```sh
docker compose -p pulse-restore-validation --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm db-role-verify

docker compose -p pulse-restore-validation --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm data-integrity \
  npm run verify:data-integrity:deep -w @pulse/api
```

For a non-release source archive, validate the records used to produce imports and retain the restored copy only as isolated evidence; never cut it over as the release database. For the first post-import release backup, validate supported quote totals, item price history, document metadata/object presence/size/SHA-256, login/logout/CSRF/throttling, and a representative document download. Record the archive checksum and results before accepting the initial load.

## 6. Deploy migrations and reference data to the empty database

Follow [migrations.md](./migrations.md). The release database uses only the clean-environment path:

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

The reference-data command is idempotent, creates no user or business record, and supplies the reviewed request checklist defaults required by production startup. Existing pre-baseline adoption is not part of the 0.1 release deployment; it remains available only for a separately approved recovery/legacy exercise. Never run `db:setup`, `prisma db push`, `prisma migrate reset`, or files under `legacy-migrations-pre-0.1`.

## 7. Start protected first-run mode

Set a newly generated 64+ character `PULSE_SETUP_TOKEN`, then start the immutable stack:

```sh
docker compose --env-file .env.production -f compose.production.yaml \
  up -d --no-build --wait --wait-timeout 360

docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs --since 10m api web gateway
curl --fail --silent --show-error https://<pulse-hostname>/api/health/live
curl --fail --silent --show-error https://<pulse-hostname>/api/health/ready
```

Open the HTTPS URL. Pulse shows **Set up Pulse**, not the login form. Supply the protected setup code and choose the real Administrator name, email, and final password. Setup creates exactly one account and closes permanently. It does not seed demo users or business data.

After the browser opens **Settings → Users & access**, remove `PULSE_SETUP_TOKEN` from `.env.production`/the secret manager and redeploy the API. Confirm the setup page cannot be reopened and the Administrator can sign in normally.

The file-based `bootstrap-admin` maintenance job is retained only for controlled recovery and password rotation; it is not the standard clean-release first-run path. Credential containment applies only to a separately approved legacy database and is not run against the empty release database.

## 8. Create users and import initial data

Follow [initial-setup.md](./initial-setup.md):

1. create every real operational user in **Settings → Users & access**;
2. open **Settings → Import & export**;
3. preview, review, select, and apply clients;
4. preview, review, select, and apply items; and
5. preview, review, select, and apply legacy quote summaries.

Do not import quotes until their client identities and active owner emails resolve. Do not invent contacts, sites, or assignees to make a row pass. Archive every accepted source file encrypted outside the repository and record its SHA-256 and resulting import batch ID.

After import, run reconciliation and the first encrypted backup/isolated restore drill. The quote-summary importer does not cover Pulse BOM lines, revision files, or document objects; if those exist in the accepted source, the release remains blocked until a reviewed importer covers them.

## 9. Verify the deployed release

```sh
docker compose --env-file .env.production -f compose.production.yaml \
  up -d --no-build --wait --wait-timeout 360

docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs --since 10m api web gateway
curl --fail --silent --show-error https://<pulse-hostname>/api/health/live
curl --fail --silent --show-error https://<pulse-hostname>/api/health/ready
```

Verify a successful administrator login, user first-login password change, a generic invalid-login response, lockout after the configured threshold, cooldown recovery, CSRF rejection without the session token/origin, logout invalidation, quote/request/client creation validation, import reconciliation, and document upload/download/antivirus scanning. Security logs may contain pseudonymous bucket IDs and event type, never passwords, setup codes, cookies, session tokens, CSRF tokens, or MinIO/database secrets.

## 10. Rotation procedures

- Administrator password: write a new value to the bootstrap password file, set a unique `PULSE_ADMIN_ROTATION_ID` change-ticket identifier, preview, then run the bootstrap service with `npm run auth:bootstrap:rotate -w @pulse/api`. All administrator sessions are revoked and another password change is required.
- User password: use the authenticated account administration flow. Deactivation and reset revoke all sessions.
- Session secret: create a new independent 64+ character value, update the secret manager/environment, and redeploy every API container at once. Existing cookies become unusable; expect every user to log in again. Keep the former value only for the approved rollback window, then destroy it.
- Security pepper: rotation invalidates throttle pseudonyms and should occur in a scheduled maintenance window; it does not replace session-secret rotation.
- PostgreSQL runtime password: preview/apply role provisioning with the new value, immediately update `DATABASE_URL`, and redeploy. Verify the role again. Keep admin/migration credentials out of the API.
- MinIO application credentials: use a new `S3_ACCESS_KEY` and secret, run `minio-init` to create/attach the restricted identity, redeploy API, verify documents, then disable the old application identity through a reviewed MinIO administrative command. Never switch API to the root identity.

## 11. Failed deployment or migration

For an application failure with healthy data, preserve volumes and logs, then redeploy the last approved immutable `PULSE_RELEASE_TAG`. A forward-compatible schema may remain; verify the prior application against the restored-copy test first. Do not use a destructive down migration.

For a failed/partial migration, keep the API stopped. Inspect Prisma status using the migration identity, retain logs, and reproduce on a fresh restored copy. Prefer a reviewed forward correction. If schema/data integrity cannot be proven, restore the pre-deployment archive into new volumes, validate it fully, and perform a manual infrastructure/DNS cutover. The old volumes remain the recovery source until acceptance.

See [rollback.md](./rollback.md) for the release checklist.

## 12. Stale one-off web container

The verified stale container is `lbh-pulse-web-run-46f0533cc90e`. Confirm its labels and exact name before removal:

```sh
docker inspect --format '{{.Name}} project={{index .Config.Labels "com.docker.compose.project"}} service={{index .Config.Labels "com.docker.compose.service"}}' \
  lbh-pulse-web-run-46f0533cc90e
docker container stop lbh-pulse-web-run-46f0533cc90e
docker container rm lbh-pulse-web-run-46f0533cc90e
```

Expected labels are project `lbh-pulse`, service `web`. Do not use a wildcard, project-wide removal, or volume flag. This cleanup does not affect application logic or persistent data.

## 13. Sensitive local client CSV

`client-list-cleaned.csv` is Git-ignored and explicitly excluded from Docker build context and declarative backups. Do not delete it until import totals and sampled records are accepted. To archive it, encrypt directly to an off-repository destination with an approved `age` recipient, verify the encrypted checksum, then use the organization’s secure-erasure/trash policy for the original. Recheck with:

```sh
git check-ignore -v client-list-cleaned.csv
rg -n '^client-list-cleaned\.csv$' .dockerignore
age -r <age-public-recipient> -o /off-repository/archive/client-list-cleaned.csv.age client-list-cleaned.csv
shasum -a 256 /off-repository/archive/client-list-cleaned.csv.age
docker run --rm --entrypoint sh pulse-api:<release-tag> -c 'test ! -e /workspace/client-list-cleaned.csv'
docker run --rm --entrypoint sh pulse-web:<release-tag> -c 'test ! -e /workspace/client-list-cleaned.csv'
```

Never include the plaintext CSV in a production image, ordinary backup, or support bundle. After import validation and encrypted-archive verification, remove the local plaintext only through the organization’s approved secure-disposal procedure.
