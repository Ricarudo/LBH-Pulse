# Pulse API

`@pulse/api` is the sole owner of authentication, authorization, business logic, Prisma/PostgreSQL, MinIO document storage, and ClamAV inspection. Controllers stay thin; validate contracts and authorization before service calls, keep database work in services/transactions, and never leak database/storage errors or secrets.

## Development

Use the root development Compose workflow, or Node.js 24+ with services already running:

```sh
npm ci
npm run dev:api
```

Production uses the compiled `dist/main.js` image target and never `tsx watch`.

## Database commands

- `db:init:dev` / `db:init:test`: guarded initialization of a proven-empty local/test database, migrations followed by explicitly enabled demo seed.
- `db:migrate:deploy`: deterministic production migration deployment with the migration role.
- `db:reference-data:preview` / `db:reference-data:apply`: idempotent system checklist defaults; creates no user or business record.
- `db:baseline:preview` / `db:baseline:apply`: exact-catalog adoption for validated pre-0.1 databases; the apply marks the baseline as resolved and never replays it.
- `db:roles:preview` / `db:roles:apply` / `db:roles:verify`: least-privilege provisioning and verification.
- `db:seed:preview` / `db:seed:apply`: non-production-only demo data; requires explicit environment flags and supplied passwords.
- `data:*`, `lifecycle:*`, and `compatibility:*`: report-first maintenance; write commands require `--apply`, and sensitive repairs require the reviewed `PULSE_REPAIR_REPORT_DIGEST`.
- `db:reset:demo`: destructive and permitted only for disposable development data. Before Prisma runs, it requires development mode, both demo/destructive seed flags, `PULSE_ALLOW_DEMO_RESET=I_UNDERSTAND_THIS_DELETES_DISPOSABLE_DATA`, and `PULSE_DEMO_RESET_DATABASE` exactly matching the URL database name.

Never run `prisma db push`, a reset, `db:setup`, or files under `prisma/legacy-migrations-pre-0.1` against an existing production database. Follow the root [migration guide](../../docs/production/migrations.md).

## Security conventions

- Browser sessions are opaque database-backed tokens; only HMAC digests are stored.
- All cookie-authenticated mutations require same-origin/session-bound CSRF validation.
- Login and first-run protection persist account/token-identity and pseudonymous-IP buckets; responses are generic and logs contain no password/setup-code/token/cookie/secret.
- Production proxy trust is an exact hop count, never blanket forwarded-header trust.
- Production startup validates runtime environment, restricted database role, reference data, setup/Administrator state, demo-account absence, and provenance before listening. An empty database listens only when a strong one-time setup code enables the locked browser setup flow.

## Checks

```sh
npm run typecheck -w @pulse/api
npm test -w @pulse/api
npm run build -w @pulse/api
```

Database integration tests run when `PULSE_RUN_DB_TESTS=1`; the release CI sets it and supplies an isolated restricted-role database.
