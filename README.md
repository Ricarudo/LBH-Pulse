# Pulse

Pulse is LBH's internal operations platform for the workflow:

```text
Request → Quote Workspace → Proposal → Project
```

The production boundary is Browser → Caddy → Next.js → NestJS → PostgreSQL/MinIO/ClamAV. NestJS is the only database and business-logic owner; Next.js owns the browser experience. See [the architecture overview](docs/architecture/overview.md).

## Release operations

Pulse 0.1 separates development and production deliberately:

- `compose.yaml` is development-only and retains source bind mounts/hot reload.
- `compose.production.yaml` builds immutable production API/web images and exposes only Caddy ports.
- `compose.maintenance.yaml` contains explicit role, migration, bootstrap, audit, backup, and restore jobs.
- `compose.release.yaml` is the installer-only digest-pinned image overlay; it never builds source.
- `compose.ci.yaml` is an isolated release-gate environment.

Windows operators should download `Pulse-Setup-0.1.1.exe` from the GitHub release and follow the [Windows installer guide](docs/production/windows-installer.md); source ZIP/TAR files are developer assets. The installer requires Docker but not Node.js, npm, Git, or source code. Advanced Linux/source operators should use the [production setup and future updates guide](docs/production/setup-and-updates.md). Detailed procedures remain in the [production runbook](docs/production/runbook.md), [first-run and import guide](docs/production/initial-setup.md), [operator checklist](docs/production/operator-checklist.md), [migration guide](docs/production/migrations.md), and [rollback guide](docs/production/rollback.md). Never run `db:setup`, `prisma db push`, `prisma migrate reset`, `db:reset:demo`, or migrations in `legacy-migrations-pre-0.1` against a database whose data matters.

## Local development

Use Node.js 24+ and Docker Compose v2. Generate an ignored environment file; its random demo credentials are development-only and are never printed:

```sh
./scripts/development/create-env.sh
docker compose --env-file .env.development --profile setup run --rm initialize
docker compose --env-file .env.development up -d --build
```

The initialization command refuses an already initialized database. On normal restarts, omit it:

```sh
docker compose --env-file .env.development up -d --build
docker compose --env-file .env.development ps
docker compose --env-file .env.development logs -f api web gateway
```

Do not use `docker compose down -v` for a database whose data matters. The `-v` flag deletes persistent volumes.

Development diagnostics are bound to localhost: web `4300`, API `3000`, PostgreSQL `5432`, and MinIO `9000/9001`. Users should access the configured HTTPS hostname through Caddy.

Install/check the workspace directly when needed:

```sh
npm ci
npm run typecheck
npm test
npm run responsive:check
npm run build
```

Application-specific conventions are in the [API README](apps/api/README.md) and [web README](apps/web/README.md).

## Isolated release gates

Generate ephemeral CI secrets and run the release stack without touching development/production volumes:

```sh
./scripts/ci/create-env.sh .env.ci
npm run verify:no-shipped-secrets
npm run verify:production-config -- .env.ci
docker compose --env-file .env.ci -f compose.ci.yaml build checks
docker compose --env-file .env.ci -f compose.ci.yaml up -d --build --wait
docker compose --env-file .env.ci -f compose.ci.yaml run --no-deps --rm checks
docker compose --env-file .env.ci -f compose.ci.yaml down -v --remove-orphans
```

The CI project validates type checks/tests/responsive checks/builds, clean migrations, representative pre-baseline adoption, restricted runtime privileges, authentication/CSRF/throttling, HTTP/document smoke tests, data-quality/lifecycle previews, and financial/revision/price-history/document consistency. The GitHub workflow additionally validates an encrypted PostgreSQL/MinIO restore.

## Safety invariants

- No production seed/demo account or default password is created automatically.
- Production refuses weak/missing secrets, elevated runtime database credentials, insecure cookies, wrong proxy trust, active demo accounts, missing reference data, or unsafe setup/account provenance. An empty installation starts only in protected first-run mode.
- Site placeholder creation and every data repair are preview-only unless an explicit, reviewed apply command is used.
- Backups are encrypted and restores target new isolated volumes; no script automatically cuts over or resets production.
- PostgreSQL and MinIO are not publicly exposed in production; only the gateway publishes ports 80/443.
- The local `client-list-cleaned.csv`, populated environment files, reports, plaintext secret files, and backup archives are excluded from Git and production build contexts.

Pulse 0.1 release scope and accepted limitations are recorded in the [0.1.1 release notes](docs/releases/0.1.1.md), [data-repair policy](docs/production/data-repairs.md), and the [technical-debt register](docs/technical-debt.md).
