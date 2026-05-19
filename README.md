# Pulse

Pulse is the modern internal operations platform for R2 Communications Group. It is replacing the inherited KuoteSuite prototype with a Next.js, React, TypeScript, Prisma, and PostgreSQL stack focused on the real operations flow:

```text
Request -> Quote Workspace -> Proposal -> Project
```

The old Angular frontend has been removed from the active repository structure. Any remaining KuoteSuite references are historical or compatibility notes, not active frontend architecture.

## Current Status

The active Pulse application is the Next.js app in `apps/web`. It contains the current UI, route-handler APIs, local development auth, Prisma schema, seed data, Requests, Directory/Clients, activity timeline work, and starter operational modules.

The Express backend in `backend/` is retained as compatibility/reference code while Pulse continues moving toward the modern app structure. Do not use the removed Angular app, Angular routing, Angular Material, or Angular build patterns for new work.

## Project Structure

```text
apps/web/                 Active Pulse Next.js app
apps/api/                 Future Pulse API placeholder
apps/worker/              Future background worker placeholder
backend/                  Legacy Express API/reference service; do not remove during Pulse cleanup
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
| Active app APIs | Next.js route handlers in `apps/web/src/app/api` |
| Compatibility backend | Node.js + Express 4 in `backend/` |
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

The `backend/` service still uses Prisma and PostgreSQL for the old KuoteSuite-compatible REST routes. Keep it available until its remaining useful business logic has been migrated or retired.

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
