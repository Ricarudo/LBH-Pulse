# Prisma migration baseline and deployment

Pulse 0.1 is the migration-history boundary. The files under `apps/api/prisma/legacy-migrations-pre-0.1/` are evidence only and must never be replayed. They describe incremental development history that the existing installation did not record consistently. The authoritative history begins with:

1. `202607210001_pulse_0_1_baseline` — the validated pre-0.1 schema.
2. `202607210002_enterprise_security` — authentication, maintenance provenance, placeholder-site metadata, and the conditional removal of the obsolete request foreign key and redundant unique index.

Production uses the migration identity (`PULSE_DATABASE_MIGRATION_URL`). The API always uses the restricted runtime identity (`DATABASE_URL`). The PostgreSQL administrator is used only by role provisioning and platform recovery.

## New empty environment

This is the standard Pulse 0.1 release path. Provision roles, let Prisma create the baseline and subsequent schema in order, then apply reviewed non-user reference data:

```sh
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm db-roles

docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm db-roles \
  npm run db:roles:apply -w @pulse/api

docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm migrate

docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm reference-data
```

The first command is a preview. Review its role/grant plan before the explicit apply command. `reference-data` is idempotent and creates checklist defaults only; it creates no user, client, item, quote, site, or demo record. The immutable API can then start in protected first-run mode.

## Existing pre-baseline environment

This path is retained for recovery and legacy compatibility. It is **not** the normal 0.1 release path, because the 0.1 release uses a new database populated through reviewed imports.

1. Stop application writes or schedule a maintenance window.
2. Create and validate an encrypted PostgreSQL and MinIO backup.
3. Restore that backup into isolated restore-only volumes and validate it before touching production.
4. Provision the restricted roles in preview, then explicit apply mode.
5. Preview baseline adoption:

```sh
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm baseline
```

Adoption refuses to continue unless every required table, column, type, index, and constraint matches the validated catalog. The only accepted pre-0.1 drift is `Request_currentStepId_fkey` and `Request_currentStepId_key`; the enterprise migration removes those objects conditionally. A populated or conflicting `_prisma_migrations` ledger is also refused.

6. Save the preview report with the release change ticket. If and only if it reports zero mismatches, adopt without replaying the baseline:

```sh
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm baseline \
  npm run db:baseline:apply -w @pulse/api
```

7. Deploy later migrations with the migration role:

```sh
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm migrate
```

8. Re-run baseline status, runtime-role verification, and data reconciliation before starting the new API image.

## Future production migrations

- Generate a deterministic SQL migration in development and review it in version control.
- Keep schema migrations separate from optional data backfills.
- Back up and validate a restore before deployment.
- Apply with `npm run db:migrate:deploy`; never use `prisma db push`.
- Run data-changing maintenance only from its default preview command, then with the script-specific `--apply` command and reviewed report digest.

`db:init:dev` and `db:init:test` first assert that the target database is uninitialized. They are only for new local or isolated test databases. `db:reset:demo` is intentionally destructive and development-only; a pre-reset assertion requires an explicit deletion acknowledgement and exact target database name before Prisma can execute.

## Failure and rollback

On a failed migration, stop the API rollout and preserve the database and logs. Do not rerun an unknown partial migration and do not edit Prisma’s ledger manually. Determine whether the transaction rolled back, correct the forward migration when safe, and test it against a fresh copy of the backup. If integrity cannot be proven, restore the pre-deployment archive into new restore-only volumes and cut over only after full reconciliation. Do not run `db:setup`, `prisma migrate reset`, `prisma db push`, or the legacy migration files against an existing production database.
