# Pulse Overview

Pulse is the modern internal operations platform for R2 Communications Group. It replaces the inherited KuoteSuite prototype with a Next.js, React, TypeScript, NestJS, Prisma, and PostgreSQL stack focused on the real operations flow:

```text
Request -> Quote Workspace -> Proposal -> Project
```

For deeper history and restart context, read `docs/checkpoints/RESTART_CHECKPOINT.md`.

## Current Stack

- `apps/web`: active Pulse Next.js app on `http://localhost:4300`.
- `apps/api`: active NestJS API on `http://localhost:3000/api`.
- `postgres`: PostgreSQL 16 with Pulse data in the `pulse` schema.
- `backend`: legacy Express compatibility/reference API, outside the default runtime.
- `packages`: future shared packages for UI, config, database helpers, types, and PDF/document work.

Start the default stack:

```bash
docker compose up --build
```

Common health checks:

```text
Web: http://localhost:4300
API through web: http://localhost:4300/api/health
Direct API: http://localhost:3000/api/health
Database health: http://localhost:4300/api/health/database
```

## Active Product Shape

- Requests are the intake gate before quote work. They carry lifecycle state, service category, readiness checks, checklist items, site-visit state, request detail routes, and activity history.
- Directory/Clients is the account foundation for clients, sites, contacts, billing preferences, technology preferences, and future relationships.
- Settings includes local account management for Admin users, password-change enforcement, and account activation/deactivation.
- Global Activity records cross-module history.
- Quotes, Projects, Billing, and Analytics are present as starter workspaces and still need full production workflows.

## Development Notes

- New UI work belongs in `apps/web`.
- New active API work belongs in `apps/api`.
- Browser `/api/...` calls stay stable through the web proxy to the NestJS API.
- The removed Angular `gui/` app and Angular patterns are historical only.
- The legacy Express backend should stay available until its useful behavior is migrated or explicitly retired.
- Some web/API domain code is duplicated from the initial NestJS parity pass; consolidate it into shared packages after the service boundary settles.

## Common Commands

From `apps/api`:

```bash
npm install
npm run db:setup
npm run typecheck
npm run build
npm test
npm run dev
```

From `apps/web`:

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

Useful Prisma/database commands from the relevant app folder:

```bash
npm run prisma:generate
npm run db:push
npm run db:seed
```

Review Prisma data-loss warnings before accepting schema changes, and do not run destructive seeds against data that must be preserved.

## Local Accounts

Local workstation test accounts are listed in `README.md`. They are for development only.

## Current Gaps

- Build the real database-backed Quote Workspace, BOM/pricing model, proposal/PDF generation, and project handoff.
- Add Settings workflows for Request Types and Intake Checklist Templates.
- Connect Request readiness/checklist requirements to Directory client/contact/site selectors.
- Expand module-specific mobile workflows beyond the Requests proof point.
- Move duplicated web/API domain code into shared packages.
- Migrate or retire the remaining useful legacy Express backend behavior.
