# Pulse API

NestJS backend API for the active Pulse stack.

## Current Scope

- Health checks at `/api/health` and `/api/health/database`.
- Local cookie session auth using `pulse.session`.
- RBAC checks for the existing Pulse local roles.
- Requests, Clients/Directory, Settings/Accounts, request checklist templates, and Activity APIs.
- Prisma + PostgreSQL using the Pulse schema.

The domain services and validation contracts were migrated from `apps/web` as the first parity step. The web app now proxies `/api/...` to this service in the default Compose runtime.

## Local Development

Use the repository-level `./first-run.sh` only for a brand-new Pulse database.
It refuses to seed when the Pulse schema already exists.

```bash
npm install
npm run db:setup
npm run dev
```

`db:setup` generates Prisma and applies the schema without running the demo
seed.

Default API URL:

```text
http://localhost:3000/api/health
```

Expected local environment:

```text
DATABASE_URL="postgresql://kuotesuite:kuotesuite_dev_password@localhost:5432/kuotesuite?schema=pulse"
PULSE_SESSION_SECRET="pulse-local-dev-session-secret"
FRONTEND_ORIGIN="http://localhost:4300"
```

## Useful Commands

```bash
npm run prisma:generate
npm run db:push
npm run db:push:accept-data-loss
npm run db:bootstrap
npm run db:initialize
npm run db:seed
npm run db:setup
npm run db:reset-demo
npm run legacy-leads:export
npm run legacy-leads:import -- --apply
npm run typecheck
npm run build
npm test
```

`db:initialize` is guarded and succeeds only when the Pulse schema has no
tables. Direct `db:seed` is also guarded and requires the deliberate
`PULSE_ALLOW_DESTRUCTIVE_SEED=1` override. `db:reset-demo` supplies that override
and deletes/recreates demo application data, including users and document
metadata.

## Legacy Lead Preservation

When a local database still has the old `pulse."Lead"` tables, export them before
applying a schema change that drops those tables:

```bash
npm run legacy-leads:export
npm run db:push:accept-data-loss
npm run db:bootstrap
npm run legacy-leads:import -- --apply
```

The export writes JSON files and a manifest under
`database/local-backups/legacy-leads/<timestamp>/`, which is ignored by Git. The
import is idempotent by `requestNumber`; running it again skips already-imported
Requests unless `--replace` is passed.

Inside Docker Compose, the API service mounts the same ignored backup directory
at `/usr/src/pulse-backups`, so `docker compose exec api npm run
legacy-leads:export` also preserves the export on the host.
