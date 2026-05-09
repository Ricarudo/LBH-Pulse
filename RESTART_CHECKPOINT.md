# Restart Checkpoint

Date: 2026-05-09

Purpose: Save the current repository/startup state after moving the app to a PostgreSQL and Prisma-only runtime path.

## Current Runtime

- PostgreSQL Docker service is running and healthy on port `5432`.
- Backend dev server is running on `http://localhost:3000`.
- Frontend dev server is running on `http://localhost:4200`.
- Backend `GET /health` returns `{"status":"ok"}`.
- Backend `GET /health/database` returns `{"status":"ok","database":"postgres"}`.

## Database Path

- Backend routes use Prisma through `backend/config/prisma.js`.
- `DATABASE_URL` is the backend database connection setting.
- Prisma schema source: `backend/prisma/schema.prisma`.
- Seed source: `backend/prisma/seed.js`.
- Setup command: `cd backend` then `npm run db:setup`.

## Cleanup Completed

- Removed the legacy backend database handler and port wait helper.
- Removed the legacy backend database driver package from `backend/package.json` and `backend/package-lock.json`.
- Removed the old database Docker image/setup folder.
- Updated development, override, and CI compose files to use only the `postgres` service for database startup.
- Converted `database-azure-backup` to use `pg_dump`.
- Updated primary docs and reports to describe the current PostgreSQL/Prisma path.
- A repo-wide search for the old database engine name and driver-specific dump command returns no matches.

## Verification Passed

```text
cd backend
npm run prisma:validate
npm run db:setup
npm test
```

Result: Prisma validation passed, database setup passed, backend tests reported `23 passing`.

```text
cd gui
npm run build
```

Result: Frontend build passed with the existing Angular CommonJS optimization warnings.

```text
docker compose -f docker-compose.dev.yml config
docker compose -f docker-compose.override.yml config
docker compose -f docker-compose.ci.yml config
```

Result: Compose config validation passed.

## Notes

- Backend test output still logs handled 400 errors for negative-path tests. The suite passes.
- Frontend build still reports CommonJS optimization warnings for legacy chart/PDF dependencies.
- Local ignored artifacts include backend/frontend logs, `node_modules`, frontend `dist`, and backend `.env`.
