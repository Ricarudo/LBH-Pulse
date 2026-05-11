# Dependency Modernization Report

## Current State

KuoteSuite has been modernized conservatively while preserving the Angular frontend and Express backend. The backend database runtime now uses Prisma with PostgreSQL.

## Backend

Key backend packages:

| Package | Purpose |
| --- | --- |
| `@prisma/client` | Runtime database client |
| `prisma` | Schema, generation, and database setup tooling |
| `express` | REST API server |
| `express-validator` | Request validation |
| `dotenv` | Local environment loading |

The legacy direct SQL driver has been removed from backend dependencies.

## Frontend

The frontend remains on Angular 12. Build scripts still set `NODE_OPTIONS=--openssl-legacy-provider` because this toolchain predates current OpenSSL defaults.

Known frontend warnings remain around CommonJS packages used by charting and PDF-related dependencies.

## Verification

Use these checks after dependency changes:

```bash
cd backend
npm run prisma:validate
npm run db:setup
npm test
```

```bash
cd gui
npm run build
```

## Follow-Up

1. Add focused backend tests for Prisma route behavior.
2. Plan an Angular upgrade path.
3. Replace deprecated view/template dependencies if backend-rendered error pages remain in use.
4. Continue auditing dependencies after the framework upgrades are planned.
