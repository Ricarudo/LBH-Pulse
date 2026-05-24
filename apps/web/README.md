# Pulse Web

Active Next.js + React + TypeScript app for Pulse.

## Current Scope

- Local development login.
- Shared Pulse shell with desktop and mobile navigation.
- Requests workspace backed by the Pulse NestJS API, Prisma, and PostgreSQL.
- Directory/Clients workflows backed by the Pulse NestJS API, Prisma, and PostgreSQL.
- Quote and Project starter workspaces.
- Activity timeline and local user support.
- Runtime `/api/...` proxy to `apps/api`; route-handler files remain as a transitional fallback during migration.

## Local Development

```bash
npm install
npm run dev
```

Default URL:

```text
http://localhost:4300
```

## Pulse API And Database

The default Compose stack runs the web app, NestJS API, and PostgreSQL together. Browser calls to `/api/...` stay stable and are proxied to the NestJS API through `PULSE_API_URL`.

Create `apps/web/.env` from `.env.example`:

```text
DATABASE_URL="postgresql://kuotesuite:kuotesuite_dev_password@localhost:5432/kuotesuite?schema=pulse"
PULSE_API_URL="http://localhost:3000"
PULSE_SESSION_SECRET="pulse-local-dev-session-secret"
```

Then run:

```bash
docker compose up --build
```

Useful database commands:

```bash
npm run prisma:generate
npm run db:push
npm run db:seed
```

## Local Test Accounts

These accounts are for workstation/local CRM testing only. Passwords are hashed in the local database with Node `scrypt`.

```text
Admin: admin@r2.local / PulseAdmin123!
Sales: sales@r2.local / PulseSales123!
Project Manager: project.manager@r2.local / PulsePm123!
Technician: technician@r2.local / PulseTech123!
```

## Current Versions

- Next.js 16.2.6
- React 19.2.6
- TypeScript 6.0.3

## Brand

The default UI font is Manrope. Current brand and UI notes are summarized in `docs/PULSE_OVERVIEW.md` and `docs/checkpoints/RESTART_CHECKPOINT.md`.
