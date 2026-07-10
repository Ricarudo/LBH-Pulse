# Pulse API

`@pulse/api` is the NestJS backend for Pulse. It is the only owner of business
logic, authorization, Prisma access, PostgreSQL schema changes, MinIO document
storage, and ClamAV upload inspection.

The supported runtime is the repository-level Docker Compose stack:

```bash
docker compose up -d --build --remove-orphans
docker compose logs -f api
```

The host-only health endpoint is `http://localhost:3000/api/health`.

## Ownership and structure

- `src/controllers` contains established HTTP adapters.
- `src/items`, `src/item-relations`, and `src/modules` contain feature modules,
  controllers, and focused services for newer domains.
- `src/lib/services` owns shared business rules and database/storage
  orchestration.
- `src/shared` contains cross-cutting NestJS concerns such as authentication and
  consistent exception responses.
- `prisma` is the sole schema, migration-history, constraint, and seed location.
- `@pulse/contracts` supplies framework-independent payloads, enums, constants,
  and the Zod schemas used to validate external input.

Controllers should stay thin. Authenticate and authorize access before loading
or mutating protected records, validate every external payload, keep Prisma
queries inside API services, and use transactions for multi-record operations.
Map expected failures through the shared API exception format instead of
leaking Prisma or storage errors.

The web application must never import API services, Prisma clients, or generated
database types. Public response shapes should remain compatible; intentional
breaking changes require documentation and coordinated web updates.

## Local development

Use Node.js 24 or newer and install dependencies once from the repository root:

```bash
npm ci
DATABASE_URL="postgresql://pulse:pulse_dev_password@localhost:5432/pulse?schema=pulse" \
  npm run dev:api
```

PostgreSQL and any storage services used by the endpoint must already be
available. Docker Compose remains the preferred way to run the complete stack.

## Database and seed commands

Run database commands from the repository root so the API workspace owns every
Prisma invocation:

```bash
npm run db:setup
npm run db:seed
```

`db:setup` generates the API client, applies the current schema with Prisma, and
ensures repository constraints. First-time initialization is guarded:

```bash
npm run db:initialize
```

For the supported container workflow, use the initialization and recovery
commands in the root README. The following command is destructive and is only
for disposable demo data:

```bash
npm run db:reset-demo --workspace @pulse/api
```

Migration folders under `apps/api/prisma/migrations` are compatibility history.
Do not edit an already-applied migration; add an ordered corrective migration
instead. Do not introduce a second Prisma schema, seed, or migration directory.

## Module conventions

- Register controllers and injectable services through NestJS modules.
- Keep calculation, authorization, transaction, and integration logic out of
  controllers.
- Use shared contracts at the HTTP boundary and API-local types only for
  backend implementation details.
- Keep MinIO and ClamAV credentials and clients server-side.
- Add focused service tests for calculations and transaction planning, plus
  integration coverage for authorization and rollback behavior.

## Checks

Run all checks from the repository root:

```bash
npm run typecheck --workspace @pulse/api
npm test --workspace @pulse/api
npm run build --workspace @pulse/api
```

Run `npm run typecheck`, `npm test`, and `npm run build` without a workspace
selector before merging to verify shared-contract and web compatibility too.
