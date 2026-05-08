# KuoteSuite
---
<p>
Kuote Suite provides a unique platform to interact with quotes in all its phases eliminating the need of using other tools such as Excel[11], QuickBooks[12], etc. Our solution will streamline the quoting process by outlining critical dates, maintaining client information tabulated and presenting analytics on quotes in a dashboard view. This new process will save estimators and managers time while producing quotes and turn potential losses for the R2 Communications Group into profit. In this way, instead of using different platforms, everything will be condensed in one place, from the registration of leads to creating the Proposal Page. In addition, there will be no duplication of information since everything will be connected to a database that will store the information of all its phases for quick and effective access. This project is a potential prototype for companies to create, manage, and monitor their quotes.
</p>

---

## Architecture
---
### Client-Server
> - Frontend
> - Backend
>   - REST API
> - Middleware
>   - CRUD API
> - Database Layer
>   - Clients
>   - Suppliers
>   - Quotes  
> - Dev Tooling
---
## Testing

- Unit Testing
- Integration Testing
  - mocking
  - spies
  - GitHub Actions

> To Run Unit Tests Use:
```bash
npm test
```
> Assumes in cwd: ~/backend/..
---
## Documentation Standards
---
- [Google JSDoc Standards](https://google.github.io/styleguide/jsguide.html#jsdoc)
---
## References
>
-
-
-
>
## Examples
``` javascript
    () => {Console.log("Willkommen")}
```

---

## Current Local Setup Notes

This repository currently contains three main runtime pieces:

- `gui/`: Angular 12 frontend.
- `backend/`: Node/Express REST API.
- `database/`: MySQL schema and Dockerfile.

The project is still in a setup-readiness phase. Before adding new CRM features, confirm that the existing app can install, run, build, and connect to MySQL.

### Prerequisites

- Node.js with npm. Node 18 is the recommended compatibility runtime for this stabilized Angular 12 / Express 4 phase.
- Newer Node versions may work, but the frontend scripts use `NODE_OPTIONS=--openssl-legacy-provider` because Angular 12's Webpack toolchain is not fully modern-OpenSSL-native.
- Docker Desktop if using the provided Docker/MySQL setup.
- A Microsoft Entra ID / Azure AD app registration for MSAL login.

### Required Environment Variables

Backend variables expected by the existing code/docs:

```bash
PORT=3000
CLIENTID=your-microsoft-app-client-id
AUTHORITY=https://login.microsoftonline.com/your-tenant-id
CLIENTSECRET=your-microsoft-app-client-secret
DATABASE_HOST=database
MYSQL_USER=root
MYSQL_PASSWORD=testingpassword
MYSQL_DATABASE=KuoteSuite
MYSQL_PORT=3306

# Prisma/PostgreSQL migration variables. The current API still runs on MySQL,
# but these are used by the new parallel migration scaffold.
DATABASE_URL=postgresql://kuotesuite:kuotesuite_dev_password@localhost:5432/kuotesuite?schema=public
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=kuotesuite
POSTGRES_PASSWORD=kuotesuite_dev_password
POSTGRES_DB=kuotesuite
```

For local backend work, copy `backend/.env.example` to `backend/.env` and replace placeholder Microsoft values. Prisma commands require `DATABASE_URL` to be available through `backend/.env` or the shell environment.

Frontend MSAL values currently live in `gui/src/environments/environment.ts`:

```ts
msAuthority: 'https://login.microsoftonline.com/<tenant-id>'
msClientId: '<client-id>'
```

`gui/src/environments/environment.prod.ts` includes the same public MSAL authority/client ID values so production builds compile. Review these before deployment to a real tenant/environment.

### Install Dependencies

```bash
cd backend
npm ci

cd ../gui
npm ci
```

### Development Commands

Start the backend:

```bash
cd backend
npm start
```

Run backend tests. These require MySQL to be running and reachable with the configured database settings:

```bash
cd backend
npm test
```

Start the frontend:

```bash
cd gui
npm start
```

Frontend default URL:

```text
http://localhost:4200
```

Backend default URL:

```text
http://localhost:3000
```

### Build Command

```bash
cd gui
npm run build
```

### Docker Development

The repository includes `docker-compose.dev.yml`. The dev stack builds with Docker Compose, but it still needs cleanup before it should be treated as reliable production/local-network hosting.

```bash
docker compose -f docker-compose.dev.yml up --build
```

To start only MySQL for backend testing:

```bash
docker compose -f docker-compose.dev.yml up -d database
```

To start the PostgreSQL service for Prisma migration work:

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

### PostgreSQL / Prisma Migration Note

The backend now includes an initial Prisma 6.x scaffold for a future PostgreSQL migration. Prisma 6.19.3 is pinned because it supports the current Node 18 baseline; Prisma 7 currently requires Node 20.19+.

The existing Express routes still run against MySQL. Use these commands from `backend/` when working on the parallel Prisma layer:

```bash
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate
```

If you have not created `backend/.env`, set `DATABASE_URL` in your shell before running Prisma commands.

See `DATABASE_MIGRATION_PLAN.md` before converting routes.

### Known Issues

- The backend database connection is now environment-driven, but the app still opens one MySQL connection per route module at import time.
- Backend API routes are not protected by backend authentication middleware.
- Several SQL statements interpolate request data directly and should be parameterized.
- The frontend remains on Angular 12. It has been patched to the latest Angular 12.2 line, not migrated to modern Angular yet.
- Production builds disable Angular font inlining to avoid requiring internet access for Google Fonts during local/Docker builds.
- Frontend builds still report CommonJS optimization warnings from legacy chart/PDF dependencies.
- `jade` is still deprecated and should eventually be migrated to `pug` or removed if server-rendered error views are not needed.
- Supplier routes exist but are not mounted by the backend app.
- Frontend service methods reference labor/material cost endpoints that do not appear to exist in the backend.
- npm audit still reports dependency vulnerabilities, mostly from Angular 12-era tooling and legacy packages. See `DEPENDENCY_MODERNIZATION_REPORT.md`.
- PostgreSQL/Prisma has been added as a migration scaffold only; MySQL remains the active runtime database until routes are converted.

### Next Steps

See `PROJECT_ASSESSMENT.md` for the setup-readiness review, `DEPENDENCY_MODERNIZATION_REPORT.md` for dependency modernization details, and `DATABASE_MIGRATION_PLAN.md` for the database migration strategy.
