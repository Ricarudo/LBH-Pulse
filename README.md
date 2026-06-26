# Pulse

Pulse is the modern internal operations platform for R2 Communications Group. It is replacing the inherited KuoteSuite prototype with a Next.js, React, TypeScript, NestJS, Prisma, and PostgreSQL stack focused on the real operations flow:

```text
Request -> Quote Workspace -> Proposal -> Project
```

The old Angular frontend has been removed from the active repository structure. Any remaining KuoteSuite references are historical or compatibility notes, not active frontend architecture.

## Current Status

The active Pulse application is the Next.js app in `apps/web` backed by the NestJS API in `apps/api`. The default runtime is now a single Docker Compose app with `web`, `api`, and `postgres`.

The current repository still includes the legacy Express backend in `backend/` as compatibility/reference code. It is no longer part of the default Pulse runtime; use `docker-compose.legacy.yml` only when explicitly checking old KuoteSuite-compatible routes.

Do not use the removed Angular app, Angular routing, Angular Material, or Angular build patterns for new work.

## Why This README Update Matters

Pulse is the current platform direction, but the working repository still has an old backend dependency. This README separates what exists today from where the platform is going so developers do not accidentally build against the wrong assumptions.

- Current working runtime: `apps/web`, `apps/api`, PostgreSQL, and Prisma.
- Legacy backend still in use: `backend/` should be preserved until its useful runtime behavior and business logic are migrated or explicitly retired.
- Active backend direction: new Pulse API work should continue in `apps/api`.
- Active frontend direction: new Pulse UI work should continue in `apps/web`, with browser `/api/...` calls proxied to NestJS.

This framing is grounded in `backend/package.json`, `backend/app.js`, `backend/prisma/schema.prisma`, `docker-compose.dev.yml`, `docs/PULSE_OVERVIEW.md`, `docs/checkpoints/RESTART_CHECKPOINT.md`, and `apps/api/README.md`.

## Project Structure

```text
apps/web/                 Active Pulse Next.js app
apps/api/                 Active Pulse NestJS API
apps/worker/              Future background worker placeholder
backend/                  Legacy Express API compatibility/reference; do not remove yet
packages/                 Future shared package placeholders
prisma/                   Top-level future Prisma workspace placeholder
database-azure-backup/    PostgreSQL dump helper
dev-tools/                Legacy helper scripts
proxy/                    Legacy proxy Dockerfile
docs/                     Pulse overview and restart checkpoint
docker-compose.yml        Default Pulse compose stack
docker-compose.dev.yml    Explicit local development compose stack
docker-compose.legacy.yml Optional legacy Express compose service
```

## Technology Stack

| Area | Current Choice |
| --- | --- |
| Frontend | Next.js 16 + React 19 + TypeScript |
| Active Pulse APIs | NestJS in `apps/api`, reached through `/api/...` |
| Transitional web API fallback | Next.js route handlers in `apps/web/src/app/api` remain during migration |
| Current legacy backend | Node.js + Express 4 in `backend/`; preserved outside the default runtime |
| Database | PostgreSQL 16 |
| ORM | Prisma 6.19.3 |
| Validation | Zod in the Pulse web app |
| Authentication | Local development cookie/session flow in `apps/api` |
| Package manager | npm |
| UI | React, custom Pulse CSS, lucide-react icons |
| Containerization | Docker Compose for `web`, `api`, and `postgres` |

## Prerequisites

- Node.js compatible with the active Next.js app.
- npm.
- Docker Desktop for the default Pulse stack.

## Default Pulse Stack

For a brand-new workstation/database only, run:

```bash
./first-run.sh
```

`first-run.sh` refuses to continue when the Pulse schema already contains
tables. It will not reseed an existing environment. After initialization, use
the normal startup command:

Start the full local stack:

```bash
docker compose up --build
```

Default URLs:

```text
Web: http://localhost:4300
API health: http://localhost:4300/api/health
Direct API health: http://localhost:3000/api/health
```

The API development command generates Prisma but does not push schema changes
or seed automatically. `db:setup` updates the schema without seeding. The demo
seed is destructive and is never part of normal setup or startup.

## Manual App Commands

From `apps/api`:

```bash
npm install
npm run db:setup
npm run typecheck
npm run build
npm run dev
```

From `apps/web`:

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

## Local Test Accounts

These accounts are for workstation/local testing only:

```text
Admin: admin@r2.local / PulseAdmin123!
Sales: sales@r2.local / PulseSales123!
Project Manager: project.manager@r2.local / PulsePm123!
Technician: technician@r2.local / PulseTech123!
```

## Useful Pulse Commands

From `apps/api` or `apps/web`:

```bash
npm run prisma:generate
npm run db:push
npm run db:setup
npm run typecheck
npm run build
npm run dev
```

Destructive demo data commands must be run explicitly:

```bash
npm run db:reset-demo  # accept schema data loss, then destructive seed
```

Direct `npm run db:seed` is guarded and refuses unless
`PULSE_ALLOW_DESTRUCTIVE_SEED=1` is deliberately supplied. Do not run the reset
or override against an environment containing users, uploaded documents, or
other data that must be preserved.

## Compatibility Backend

The `backend/` service still uses Express, Prisma, and PostgreSQL for old KuoteSuite-compatible REST routes. Keep it available until its remaining useful business logic has been migrated or explicitly retired.

It is available through a separate legacy Compose file and is not part of `docker compose up`:

```bash
docker compose -f docker-compose.yml -f docker-compose.legacy.yml --profile legacy up legacy-backend
```

Useful backend commands:

```bash
cd backend
npm run prisma:validate
npm run db:setup
npm test
```

## Documentation

- `docs/PULSE_OVERVIEW.md`: short practical overview of Pulse.
- `docs/checkpoints/RESTART_CHECKPOINT.md`: source of truth for current state, condensed history, architecture notes, and recovery guidance.

## Known Issues

- Legacy API routes in `backend/` are still not production-authenticated.
- Some active Pulse service code is intentionally copied between `apps/web` and `apps/api` during the first NestJS parity pass; consolidate into shared packages after runtime migration settles.
- Quotes and Projects in `apps/web` are still starter workflows and need real quote workspace/database implementation.
- Some compatibility docs and backend code still mention legacy KuoteSuite table names because the Express backend has not been fully retired.
- The Windows sandbox runner can fail before process startup; see `docs/checkpoints/RESTART_CHECKPOINT.md` for command guidance.
