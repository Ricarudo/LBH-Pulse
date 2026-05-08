# KuoteSuite

KuoteSuite is an unfinished CRM and quoting platform for R2 Communications Group. The existing application supports early quote, lead, client, contact, item, and dashboard workflows.

The current goal is to stabilize and modernize the downloaded codebase without rewriting it from scratch. Long term, this project should run locally on the company network in Docker and become a full CRM/quoting system.

## Current Status

The application currently runs as an Angular frontend, Express backend, and MySQL database.

PostgreSQL and Prisma have been added as a migration scaffold only. Existing API routes still use MySQL until they are converted one at a time.

## Project Structure

```text
backend/                  Express REST API
backend/prisma/           Initial Prisma schema for PostgreSQL migration
database/                 Existing MySQL Docker image and setup SQL
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
| Current database | MySQL 8 |
| Migration database | PostgreSQL 16 |
| Migration ORM | Prisma 6.19.3 |
| Authentication | Microsoft MSAL / Microsoft Entra ID |
| Package manager | npm |
| UI | Angular Material, Angular CDK, custom CSS |
| Containerization | Docker Compose files are present but still need cleanup |

## Prerequisites

- Node.js 18 with npm is the recommended runtime for this phase.
- Docker Desktop is recommended for MySQL/PostgreSQL services.
- Microsoft Entra ID / Azure AD app registration is needed for real MSAL login.

Newer Node versions may work, but Angular 12 still needs `NODE_OPTIONS=--openssl-legacy-provider` in frontend scripts because its Webpack toolchain predates modern OpenSSL defaults.

## Environment Setup

For backend local work, copy the template:

```bash
cd backend
copy .env.example .env
```

Then update the Microsoft values in `backend/.env`.

Important backend variables:

```bash
PORT=3000
CLIENTID=your-microsoft-app-client-id
AUTHORITY=https://login.microsoftonline.com/your-tenant-id
CLIENTSECRET=your-microsoft-app-client-secret

DATABASE_HOST=localhost
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=testingpassword
MYSQL_DATABASE=KuoteSuite
MYSQL_PORT=3306

DATABASE_URL=postgresql://kuotesuite:kuotesuite_dev_password@localhost:5432/kuotesuite?schema=public
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=kuotesuite
POSTGRES_PASSWORD=kuotesuite_dev_password
POSTGRES_DB=kuotesuite
```

Frontend MSAL values currently live in:

```text
gui/src/environments/environment.ts
gui/src/environments/environment.prod.ts
```

Review those values before deploying against a real Microsoft tenant.

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

Start MySQL if you are using Docker for the database:

```bash
docker compose -f docker-compose.dev.yml up -d database
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

The backend tests require MySQL to be running and reachable with the configured database settings.

## Docker Development

Start the full development stack:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Start only MySQL:

```bash
docker compose -f docker-compose.dev.yml up -d database
```

Start only PostgreSQL for Prisma migration work:

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

Docker is usable for local development, but the compose files still need production/local-network hardening before company deployment.

## PostgreSQL and Prisma Migration

Prisma 6.19.3 is installed because it supports the current Node 18 baseline. Prisma 7 currently requires Node 20.19+ and was intentionally not used in this phase.

Current behavior:

- Existing Express routes still run on MySQL.
- PostgreSQL is available as a parallel Docker service.
- `backend/prisma/schema.prisma` mirrors the legacy MySQL tables as a starting point.
- Routes should be migrated gradually instead of switching the full app at once.

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

- Backend routes still open MySQL connections at route-module import time.
- Several backend SQL statements interpolate request data directly.
- Backend API routes are not protected by backend authentication middleware.
- Supplier routes exist but are not mounted by the backend app.
- Frontend services reference labor/material cost endpoints that do not appear to exist in the backend.
- The frontend remains on Angular 12 and has not been migrated to a modern Angular version.
- Frontend builds still show CommonJS optimization warnings from legacy chart/PDF packages.
- `jade` is deprecated and should eventually be replaced with `pug` or removed.
- npm audit still reports vulnerabilities mostly tied to Angular 12-era tooling and legacy packages.
- Docker Compose reports that the top-level `version` field is obsolete.

## Recommended Next Steps

1. Convert `backend/routes/items.js` from MySQL raw SQL to Prisma/PostgreSQL as the first proof of concept.
2. Add focused backend tests for the migrated items route.
3. Create a shared backend database client/service layer.
4. Replace route-level SQL interpolation with Prisma or parameterized queries.
5. Add backend authentication and authorization middleware.
6. Continue PostgreSQL migration route by route.
7. Modernize Docker Compose for local-network hosting.
8. Expand CRM features only after the backend/database foundation is stable.

## Project Documentation

- `PROJECT_ASSESSMENT.md`: inherited project assessment and setup-readiness review.
- `DEPENDENCY_MODERNIZATION_REPORT.md`: dependency modernization work and remaining package risks.
- `DATABASE_MIGRATION_PLAN.md`: MySQL-to-PostgreSQL/Prisma migration strategy.
