# Pulse Web

Small starter Next.js + React + TypeScript app for the Pulse transition.

This app runs independently from the legacy Angular frontend so both can be compared during transition.

## Current Scope

- Local development login.
- Shared Pulse shell with left navigation.
- Leads page.
- Quotes page.
- Statistics page.
- Leads API routes backed by Prisma and a local development database.

## Local Development

```bash
npm install
npm run db:setup
npm run dev
```

Default URL:

```text
http://localhost:4300
```

Angular remains on:

```text
http://localhost:4200
```

## Leads Database

The first Pulse backend slice lives inside this Next app and uses Prisma with PostgreSQL. It can share the existing local PostgreSQL container while keeping Pulse tables isolated in the `pulse` schema.

Create `apps/web/.env` from `.env.example`:

```text
DATABASE_URL="postgresql://kuotesuite:kuotesuite_dev_password@localhost:5432/kuotesuite?schema=pulse"
```

Then run:

```bash
docker compose -f ../../docker-compose.dev.yml up -d postgres
npm run db:setup
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

The default UI font is Manrope, matching `docs/brand/BRAND_STANDARDS.md`.
