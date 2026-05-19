# Dependency Modernization Report

## Current State

Pulse has moved past the inherited Angular frontend. The Angular framework dependencies and `gui/` application are no longer part of the active repository structure. The compatibility Express backend still uses Prisma with PostgreSQL while active Pulse work continues in `apps/web`.

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

The active frontend is `apps/web`, built with Next.js, React, TypeScript, Prisma, Zod, and `lucide-react`.

The removed Angular app previously depended on Angular 12, Angular Material, Angular CDK, legacy Webpack/OpenSSL flags, charting packages, and browser PDF packages. Useful quote/pricing/proposal concepts from that code were preserved in `docs/architecture/LEGACY_KUOTESUITE_REFERENCE.md`.

## Verification

Use these checks after dependency changes:

```bash
cd backend
npm run prisma:validate
npm run db:setup
npm test
```

```bash
cd apps/web
npm run typecheck
npm run build
```

## Follow-Up

1. Add focused backend tests for Prisma route behavior.
2. Continue replacing compatibility backend routes with modern Pulse APIs where appropriate.
3. Replace deprecated view/template dependencies if backend-rendered error pages remain in use.
4. Continue auditing dependencies as the Quote Workspace and proposal/PDF generation are implemented.
