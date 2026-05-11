# KuoteSuite PostgreSQL and Prisma Plan

## Current State

KuoteSuite now uses PostgreSQL as its application database and Prisma as the backend data access layer. The Express routes call Prisma models directly through `backend/config/prisma.js`.

## Runtime Path

- Local database service: `postgres` in `docker-compose.dev.yml`.
- Backend connection string: `DATABASE_URL`.
- Schema source: `backend/prisma/schema.prisma`.
- Seed source: `backend/prisma/seed.js`.
- Setup command: `npm run db:setup` from `backend`.

## Schema Notes

The Prisma schema intentionally keeps the original table and column names through `@map` and `@@map` so the frontend API contract can remain stable while the internal data model is refined.

Known cleanup work:

1. Add explicit Prisma relations.
2. Add indexes for high-traffic lookups.
3. Normalize date fields from strings to proper date/time types.
4. Review nullable fields after real sample data is available.
5. Add focused tests around route behavior and seed data assumptions.

## Operational Notes

Docker Compose starts PostgreSQL with a health check. The backend container runs Prisma generation, schema push, seed, and then app startup in the development stack.

Use Prisma migrations for durable production schema changes once the schema stabilizes beyond local development.
