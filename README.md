# KuoteSuite

KuoteSuite is an unfinished CRM and quoting platform for R2 Communications Group. The existing application supports early quote, lead, client, contact, item, and dashboard workflows.

The current goal is to stabilize and modernize the downloaded codebase without rewriting it from scratch. Long term, this project should run locally on the company network in Docker and become a full CRM/quoting system.

## Current Status

The application currently runs as an Angular frontend, Express backend, and PostgreSQL database.

Backend API routes use Prisma against PostgreSQL. The legacy database runtime path has been removed from the app startup flow.

## Project Structure

```text
backend/                  Express REST API
backend/prisma/           Prisma schema and seed data for PostgreSQL
gui/                      Angular 12 frontend
dev-tools/                Legacy development helper scripts
proxy/                    Proxy Dockerfile
docker-compose.dev.yml    Local development compose stack
PROJECT_ASSESSMENT.md     Technical assessment of the inherited project
DEPENDENCY_MODERNIZATION_REPORT.md
DATABASE_MIGRATION_PLAN.md
```

## Technology Stack

| Area | Current Choice |
| --- | --- |
| Frontend | Angular 12 |
| Backend | Node.js + Express 4 |
| Database | PostgreSQL 16 |
| ORM | Prisma 6.19.3 |
| Authentication | Local development login |
| Package manager | npm |
| UI | Angular Material, Angular CDK, custom CSS |
| Containerization | Docker Compose files are present but still need cleanup |

## Prerequisites

- Node.js 18 with npm is the recommended runtime for this phase.
- Docker Desktop is recommended for the PostgreSQL service.

Newer Node versions may work, but Angular 12 still needs `NODE_OPTIONS=--openssl-legacy-provider` in frontend scripts because its Webpack toolchain predates modern OpenSSL defaults.

## Environment Setup

For backend local work, copy the template:

```bash
cd backend
copy .env.example .env
```

The backend no longer requires Microsoft/Azure auth values for local startup.

Important backend variables:

```bash
PORT=3000

DATABASE_URL=postgresql://kuotesuite:kuotesuite_dev_password@localhost:5432/kuotesuite?schema=public
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=kuotesuite
POSTGRES_PASSWORD=kuotesuite_dev_password
POSTGRES_DB=kuotesuite
```

Frontend API configuration currently lives in:

```text
gui/src/environments/environment.ts
gui/src/environments/environment.prod.ts
```

Default API URL:

```text
http://localhost:3000
```

## Local Development Login

Azure/MSAL login has been removed from the active runtime path. The Angular app now provides a local development login with four built-in users:

- Admin
- Sales
- Project Manager
- Technician

This login is frontend-only and is not secure enough for production or company-network deployment. Backend API routes are still unprotected until JWT validation and role enforcement are added.

## Install Dependencies

Install backend dependencies:

```bash
cd backend
npm ci
```

Install frontend dependencies:

```bash
cd gui
npm ci
```

## Run Locally

Start PostgreSQL if you are using Docker for the database:

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

Apply the Prisma schema and seed data:

```bash
cd backend
npm run db:setup
```

Start the backend:

```bash
cd backend
npm start
```

Start the frontend:

```bash
cd gui
npm start
```

Local URLs:

```text
Frontend: http://localhost:4200
Backend:  http://localhost:3000
```

## Build

Build the frontend:

```bash
cd gui
npm run build
```

## Tests

Run backend tests:

```bash
cd backend
npm test
```

The backend tests require PostgreSQL to be running and reachable through `DATABASE_URL`.

## Docker Development

Start the full development stack:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Start only PostgreSQL for Prisma migration work:

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

Docker is usable for local development, but the compose files still need production/local-network hardening before company deployment.

## PostgreSQL and Prisma

Prisma 6.19.3 is installed because it supports the current Node 18 baseline. Prisma 7 currently requires Node 20.19+ and was intentionally not used in this phase.

Current behavior:

- Express routes use Prisma models backed by PostgreSQL.
- PostgreSQL is the only database service in the development compose stack.
- `backend/prisma/schema.prisma` mirrors the original application tables as a compatibility starting point.

Useful Prisma commands:

```bash
cd backend
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate
```

If `backend/.env` does not exist, set `DATABASE_URL` in your shell before running Prisma commands.

Read `DATABASE_MIGRATION_PLAN.md` before converting routes.

## Known Issues

- Backend API routes are not protected by backend authentication middleware.
- Local development login is frontend-only and should be replaced or backed by server-side token validation before company use.
- Frontend services reference labor/material cost endpoints that do not appear to exist in the backend.
- The frontend remains on Angular 12 and has not been migrated to a modern Angular version.
- Frontend builds still show CommonJS optimization warnings from legacy chart/PDF packages.
- `jade` is deprecated and should eventually be replaced with `pug` or removed.
- npm audit still reports vulnerabilities mostly tied to Angular 12-era tooling and legacy packages.
- Docker Compose reports that the top-level `version` field is obsolete.

## Recommended Next Steps

1. Add focused backend tests around the Prisma route behavior.
2. Add backend authentication and authorization middleware with JWT validation.
3. Continue refining Prisma schema relations, indexes, and data types.
4. Modernize Docker Compose for local-network hosting.
5. Expand CRM features only after the backend/database foundation is stable.

## Project Documentation

- `PROJECT_ASSESSMENT.md`: inherited project assessment and setup-readiness review.
- `DEPENDENCY_MODERNIZATION_REPORT.md`: dependency modernization work and remaining package risks.
- `DATABASE_MIGRATION_PLAN.md`: PostgreSQL/Prisma migration strategy.
