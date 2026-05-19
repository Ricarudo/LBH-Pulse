# Pulse

Pulse is the modern internal operations platform for R2 Communications Group. It is replacing the inherited KuoteSuite prototype with a Next.js, React, TypeScript, Prisma, and PostgreSQL stack focused on the real operations flow:

```text
Request -> Quote Workspace -> Proposal -> Project
```

The old Angular frontend has been removed from the active repository structure. Any remaining KuoteSuite references are historical or compatibility notes, not active frontend architecture.

## Current Status

The active Pulse application is the Next.js app in `apps/web`. It contains the current UI, route-handler APIs, local development auth, Prisma schema, seed data, Requests, Directory/Clients, activity timeline work, and starter operational modules.

The current repository still includes and may depend on the legacy Express backend in `backend/` while the modern Pulse architecture is built out. Treat `backend/` as a current compatibility dependency and reference boundary, not as dead code. NestJS is the planned future backend direction in `apps/api`, but there is no implemented NestJS backend in this checkout.

Do not use the removed Angular app, Angular routing, Angular Material, or Angular build patterns for new work.

## Why This README Update Matters

Pulse is the current platform direction, but the working repository still has an old backend dependency. This README separates what exists today from where the platform is going so developers do not accidentally build against the wrong assumptions.

- Current working runtime: `apps/web`, PostgreSQL, Prisma, and the legacy Express backend where needed.
- Legacy backend still in use: `backend/` should be preserved until its useful runtime behavior and business logic are migrated or explicitly retired.
- Planned backend direction: `apps/api` is a NestJS placeholder only.
- Active frontend direction: new Pulse UI and route-handler work should continue in `apps/web`.

This framing is grounded in `backend/package.json`, `backend/app.js`, `backend/prisma/schema.prisma`, `docker-compose.dev.yml`, `docs/checkpoints/RESTART_CHECKPOINT.md`, `docs/PULSE_TRANSITION_PLAN.md`, and `apps/api/README.md`.

## Project Structure

```text
apps/web/                 Active Pulse Next.js app
apps/api/                 Planned NestJS API placeholder; not implemented yet
apps/worker/              Future background worker placeholder
backend/                  Legacy Express API compatibility dependency/reference; do not remove yet
packages/                 Future shared package placeholders
prisma/                   Top-level future Prisma workspace placeholder
database-azure-backup/    PostgreSQL dump helper
dev-tools/                Legacy helper scripts
proxy/                    Legacy proxy Dockerfile
docs/                     Architecture notes, reports, ADRs, checkpoints, and legacy references
docker-compose.dev.yml    Local development compose stack
```

## Technology Stack

| Area | Current Choice |
| --- | --- |
| Frontend | Next.js 16 + React 19 + TypeScript |
| Active Pulse web APIs | Next.js route handlers in `apps/web/src/app/api` |
| Current legacy backend | Node.js + Express 4 in `backend/`; still included and may be required for compatibility flows |
| Planned backend direction | NestJS in `apps/api`; placeholder only, not implemented |
| Database | PostgreSQL 16 |
| ORM | Prisma 6.19.3 |
| Validation | Zod in the Pulse web app |
| Authentication | Local development cookie/session flow in `apps/web` |
| Package manager | npm |
| UI | React, custom Pulse CSS, lucide-react icons |
| Containerization | Docker Compose for PostgreSQL and compatibility services |

## Prerequisites

- Node.js compatible with the active Next.js app.
- npm.
- Docker Desktop for PostgreSQL.

## Active Pulse Web App

Create `apps/web/.env` from the local template if needed:

```text
DATABASE_URL="postgresql://kuotesuite:kuotesuite_dev_password@localhost:5432/kuotesuite?schema=pulse"
```

Start PostgreSQL:

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

Set up the Pulse database and run the app:

```bash
cd apps/web
npm install
npm run db:setup
npm run dev
```

Default URL:

```text
http://localhost:4300
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

From `apps/web`:

```bash
npm run prisma:generate
npm run db:push
npm run db:seed
npm run db:setup
npm run typecheck
npm run build
npm run dev
```

## Compatibility Backend

The `backend/` service still uses Express, Prisma, and PostgreSQL for old KuoteSuite-compatible REST routes and current compatibility needs. Keep it available until its remaining runtime responsibilities and useful business logic have been migrated or explicitly retired.

Do not assume `apps/api` is ready to replace it yet. `apps/api` documents the future NestJS direction only.

Useful backend commands:

```bash
cd backend
npm run prisma:validate
npm run db:setup
npm test
```

## Documentation

- `docs/checkpoints/RESTART_CHECKPOINT.md`: latest restart/checkpoint state.
- `docs/sandbox-command-guidelines.md`: command patterns for this Windows runner.
- `docs/architecture/PULSE_REQUESTS_DIRECTORY_IMPACT_NOTE.md`: Requests and Directory architecture direction.
- `docs/architecture/LEGACY_KUOTESUITE_REFERENCE.md`: preserved concepts from the removed Angular prototype.
- `docs/brand/BRAND_STANDARDS.md`: Pulse brand standards.

## Known Issues

- Backend API routes in `backend/` are still not production-authenticated.
- Quotes and Projects in `apps/web` are still starter workflows and need real quote workspace/database implementation.
- Some compatibility docs and backend code still mention legacy KuoteSuite table names because the Express backend has not been fully retired.
- The Windows sandbox runner can fail before process startup; follow `docs/sandbox-command-guidelines.md`.
