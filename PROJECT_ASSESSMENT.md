# KuoteSuite Project Assessment

Assessment date: 2026-05-08

## Project Summary

KuoteSuite is an unfinished prototype for a quoting workflow platform for R2 Communications Group. The current codebase is not a single full-stack framework; it is a three-service application made of an Angular frontend, an Express REST API backend, and a MySQL database initialized from SQL scripts. Existing functionality focuses on leads, clients, contacts, quotes, quote state tracking, bill-of-materials entries, item management, basic statistics, Microsoft Entra ID / Azure AD login, and PDF export from screens.

The project is useful and worth preserving, but it is not production-ready yet. The safest path is to stabilize the existing Angular/Express/MySQL stack, fix setup and security blockers, then incrementally extend it into the CRM modules R2 needs.

## Technology Stack

- Frontend framework: Angular 12 application in `gui/`.
- Backend framework: Node.js + Express 4 application in `backend/`.
- Database/storage: MySQL 8 Docker image with schema in `database/sql-scripts/setup.sql`.
- Authentication: Microsoft MSAL / Azure AD / Microsoft Entra ID is wired into Angular with `@azure/msal-angular` and partly wired into the backend with `@azure/msal-node`.
- Authorization: Angular route guards check role claims in ID tokens. Backend routes do not currently enforce auth.
- Package manager: npm lockfiles are present for `backend/` and `gui/`; no yarn or pnpm config is present.
- Build tool: Angular CLI for frontend builds. Backend runs directly with Node.
- Styling/UI: Angular Material, custom CSS, Angular CDK, Material prebuilt theme, and `angular2-chartjs`.
- PDF/export tooling: `jspdf`, `html2canvas`, `pdf-lib`, and `ngx-filesaver`.
- Existing Docker configuration: Dockerfiles exist for `gui`, `backend`, `database`, `database-azure-backup`, and `proxy`; compose files exist for dev, override, and CI.

## Current Folder Structure

- `.github/`: GitHub Actions workflow and a leftover `simplebackend` folder.
- `backend/`: Express API, route handlers, model classes, tests, config, Jade views, and public assets.
- `backend/app.js`: Express application setup, CORS, route registration, and backend MSAL prototype code.
- `backend/bin/www`: Express-generator style HTTP server entrypoint used by `npm start`.
- `backend/config/DataBaseHandler.js`: MySQL connection factory. Currently hard-coded to Docker service host `database`, root user, and `testingpassword`.
- `backend/routes/`: REST route handlers for users, clients, leads, items, quotes, suppliers, login, and index.
- `backend/models/`: JavaScript model classes for client, client site, item, lead, quote, supplier, and user. These appear mostly unused by the current route code.
- `backend/test/`: Unit/integration test scaffolding and mock data.
- `database/`: MySQL Dockerfile and SQL schema setup script.
- `database/sql-scripts/setup.sql`: Creates the current relational schema.
- `database-azure-backup/`: Backup container scripts for Azure-oriented backup work.
- `dev-tools/`: Shell and PowerShell helper scripts for Docker, backend, MySQL, integration testing, and releases.
- `gui/`: Angular application.
- `gui/src/app/app.routing.ts`: Hash-based Angular route configuration with MSAL and role guards.
- `gui/src/app/auth-config.ts`: MSAL browser configuration, protected API endpoint, and role constants.
- `gui/src/app/_components/`: Main Angular screens and dialogs.
- `gui/src/app/_models/`: Frontend TypeScript models for leads, quotes, clients, items, users, entries, todos, and profiles.
- `gui/src/app/_services/`: HTTP API service, quote cost calculator, and role guard.
- `gui/src/app/utils/pdf_generator.ts`: Prototype PDF generator.
- `proxy/`: Minimal nginx Dockerfile, not currently integrated into compose.

## Routing Structure

Frontend routes use Angular hash routing:

- `/`: Home/login screen.
- `/lead-page/create`: Create a lead.
- `/lead-page/:id`: View or edit a lead.
- `/lDashboard`: Leads dashboard.
- `/qDashboard`: Quotes dashboard.
- `/quote-page/:id`: View or edit a quote and its BOM entries.
- `/statistics`: Statistics dashboard.
- `/state`, `/code`, `/error`: Auth redirect/hash helper routes.

Backend REST routes mounted by `backend/app.js`:

- `/users/`: User CRUD.
- `/quotes/`: Quote CRUD, user-specific quotes, and BOM entry CRUD.
- `/leads/`: Lead CRUD.
- `/items/`: Item CRUD.
- `/clients/`: Client, client site, and point-of-contact CRUD.

Backend route files that exist but are not mounted in `app.js`:

- `backend/routes/suppliers.js`: Supplier CRUD.
- `backend/routes/index.js`: Express-generator index route with incomplete auth references.
- `backend/routes/login.js`: Incomplete login route with undefined `pca`.

## Database and Schema Notes

The database is currently expected to be MySQL, not PostgreSQL or SQLite.

Tables created by `database/sql-scripts/setup.sql`:

- `Client`
- `ClientSite`
- `PointOfContact`
- `Supplier`
- `MaterialCost`
- `LaborCost`
- `BillOfMaterials_Entry`
- `Item`
- `Attachment`
- `User`
- `State`
- `Lead`
- `Quote`

There is no migration tool. The schema is created by a single init script copied into the MySQL Docker image. There are no seed rows for `State`; the frontend currently maps state IDs to names in code instead.

## How the Existing System Appears to Work

The intended workflow appears to be:

1. A user signs in with Microsoft.
2. The Angular home component reads ID token claims.
3. The app stores the signed-in user in the backend `User` table if they do not already exist.
4. The user creates or edits clients, client sites, and points of contact through dialogs.
5. The user creates a lead with client/site/contact data and assigns it to an employee.
6. A lead can be converted into a quote.
7. Quote creation generates an R2 quote ID like `QMYY####`.
8. The quote page allows editing quote details and adding bill-of-materials line items.
9. The frontend calculates material/labor quote costs in the browser.
10. Quote states can move through active, qualified, archived, won, lost, waiting approval, approved, and on revision.
11. Managers appear intended to approve/revise quotes.
12. Quote/lead pages can be exported to PDF through browser-side rendering.

## Existing Features

- Microsoft login UI and MSAL frontend integration.
- Role-guarded Angular routes.
- Lead dashboard and lead create/edit page.
- Quote dashboard and quote edit/detail page.
- Client management dialogs.
- Client site management dialogs.
- Point-of-contact management dialogs.
- Item management dialogs.
- Quote BOM entry form and persistence for new entries.
- Browser-side quote material/labor calculations.
- Basic quotes-by-month chart.
- Express REST endpoints for core entities.
- MySQL schema and Docker-oriented setup.
- Backend tests and mock data, although they could not be run in this environment.

## Missing or Incomplete Features

- No full CRM modules yet for accounts beyond basic clients, opportunities, projects, tickets, tasks, follow-ups, or activity history.
- No backend authentication middleware protecting API routes.
- No backend authorization/role enforcement.
- No password login exists; authentication is external Microsoft identity only.
- No password hashes exist because there are no local passwords.
- No upload storage or attachment workflow is implemented beyond an `Attachment` table.
- `Supplier` route exists but is not mounted in `backend/app.js`.
- Frontend calls for `/laborcosts` and `/materialcosts` exist, but matching backend routes were not found.
- `State` table exists but is not populated or used by routes.
- Several backend SQL updates/deletes interpolate request values directly.
- Quote GET responses use `element.projectSpecifications` while the database column is `proposalSpecifications`, so proposal text likely returns incorrectly.
- The quote BOM update query has a trailing comma before `WHERE`, which will fail when that endpoint is used.
- The backend database connection is hard-coded and not environment-driven.
- Production Angular environment lacks `msAuthority` and `msClientId`, so production builds may fail under strict TypeScript once dependencies are installed.
- The root has a `package-lock.json` but no root `package.json`.
- Docker compose files contain named volumes/paths that do not mount source code as likely intended.
- Docker images use old Node versions, and frontend dependencies mix Angular 12 with Angular Material 13.

## Current Errors and Blockers

Local environment blockers found during this assessment:

- `npm` is not available in PATH.
- `yarn` is not available in PATH.
- `pnpm` is not available in PATH.
- `docker` is not available in PATH.
- `git` is not available in PATH.
- `backend/node_modules` does not exist.
- `gui/node_modules` does not exist.

Application blockers found by inspection:

- Backend cannot start without installing dependencies. The direct `node backend/bin/www` attempt failed with `Cannot find module 'http-errors'`.
- Angular cannot install, serve, or build in the current environment because npm is missing.
- Docker compose cannot be verified in the current environment because Docker is missing.
- The backend listens in two places: `backend/app.js` calls `app.listen(...)`, while `backend/bin/www` also creates and listens with an HTTP server.
- `backend/app.js` uses bitwise `|` instead of logical/defaulting `||` for ports and hosts, which can produce unexpected values.
- Backend CORS is hard-coded to `http://localhost:4200`.
- Backend SQL is vulnerable to injection in multiple read/update/delete paths.
- Authentication is only enforced client-side; direct API access is currently unprotected.

## Steps Attempted to Run the App

Commands attempted from the project root:

- `node --version`
- `npm --version`
- `docker --version`
- `git status --short`
- `Test-Path backend/node_modules`
- `Test-Path gui/node_modules`
- `node --check backend/app.js`
- `Get-ChildItem backend -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }`
- `node backend/bin/www`
- `npm ci` in `backend/`
- `npm ci` in `gui/`
- `npm run build` in `gui/`
- `npm start` in `gui/`
- `npm start` in `backend/`
- `npm test` in `backend/`

Results:

- Node exists as `v24.14.0`.
- Backend JavaScript syntax checks passed.
- Backend runtime failed because dependencies are not installed.
- npm, Docker, and Git commands failed because the executables are not in PATH.
- Dependency installation and Angular build could not be completed in this environment.

## Required Environment Variables

Known backend variables from docs, workflow, compose, and code:

- `PORT`: Backend port. Existing code defaults inconsistently and should be cleaned up.
- `FRONTEND_PORT`: Intended frontend port; currently not used safely.
- `FRONTEND_HOST`: Intended frontend host; currently not used safely.
- `FRONTEND`: Present in code but not clearly used.
- `CLIENTID`: Microsoft app registration client ID for backend MSAL.
- `AUTHORITY`: Microsoft identity authority URL for backend MSAL.
- `CLIENTSECRET`: Microsoft app registration client secret for backend MSAL.
- `DATABASE_HOST`: Docker compose sets this to `database`.
- `MYSQL_HOST`: Present in compose override/CI but not used by `DataBaseHandler.js`.
- `MYSQL_USER`: Present in compose override/CI but not used by `DataBaseHandler.js`.
- `MYSQL_PASSWORD` or `MY_SQL_PWD`: Present in compose/docs but not used consistently.
- `MYSQL_DB` or `DB_HOST`: Present in compose/CI but naming is inconsistent and not used by the backend connection.

Known frontend environment values:

- `msAuthority`: Microsoft authority URL in `gui/src/environments/environment.ts`.
- `msClientId`: Microsoft client ID in `gui/src/environments/environment.ts`.

Important note: `gui/src/environments/environment.prod.ts` currently only contains `production: true`, so production builds likely need `msAuthority` and `msClientId` added or provided through another config strategy.

## Database Setup Notes

The intended database service is MySQL 8. The current Dockerfile sets:

- `MYSQL_ROOT_PASSWORD=testingpassword`
- `MYSQL_DATABASE=KuoteSuite`
- `MYSQL_USER=users`
- `MYSQL_PASSWORD=testingpassword`

The backend currently connects to:

- Host: `database`
- User: `root`
- Password: `testingpassword`
- Database: `KuoteSuite`
- Port: `3306`

For local non-Docker development, the backend will fail unless a MySQL host named `database` is resolvable or the connection code is changed to use environment variables.

## Docker Readiness Notes

Existing Docker assets:

- `backend/Dockerfile`
- `gui/Dockerfile`
- `database/Dockerfile`
- `database-azure-backup/Dockerfile`
- `proxy/Dockerfile`
- `docker-compose.dev.yml`
- `docker-compose.override.yml`
- `docker-compose.ci.yml`

Services needed for local network hosting:

- Frontend web application.
- Backend API.
- MySQL database.
- Optional reverse proxy for a single LAN hostname/port.
- Optional persistent upload volume if attachments/files are implemented.
- Optional database backup service.

Ports currently implied:

- Frontend dev server: `4200`.
- Backend API: `3000`, with confusing extra auth listener logic around `6000`.
- MySQL: `3306`.
- Proxy, if used: `80`.

Persistent volumes needed:

- MySQL data volume, for example `/var/lib/mysql`.
- Future uploads/attachments volume, for example `/app/uploads`.
- Backup output volume if database backups are enabled.

Docker readiness issues:

- Compose files do not define a proper persistent MySQL data mount.
- Compose environment variable names are inconsistent with backend code.
- The backend image installs dependencies using `npm i` instead of reproducible `npm ci`.
- The frontend image installs extra packages beyond the lockfile.
- The backend Dockerfile has no active final `CMD`; compose supplies commands.
- The GUI Dockerfile runs Angular dev server, which is fine for development but not ideal for local network production hosting.
- The proxy image is not wired into compose and does not include an nginx config for routing frontend/API traffic.

## Recommended Local Docker Deployment Approach

Use Docker Compose with four services for the eventual local-network deployment:

- `proxy`: nginx listening on port `80`, serving the Angular production build and proxying `/api` to the backend.
- `api`: Node/Express backend listening internally on `3000`.
- `db`: MySQL 8 with a named volume for `/var/lib/mysql`.
- `backup`: optional scheduled backup container or host scheduled task.

Recommended architecture:

- Build Angular once with production configuration.
- Serve static Angular files through nginx.
- Route API calls through the proxy as `/api/...` instead of hard-coded `http://localhost:3000`.
- Put MySQL credentials in `.env` and Docker secrets where possible.
- Persist MySQL data in a named Docker volume.
- Add a future `uploads` volume only when file attachments are implemented.
- Bind only the proxy to the LAN by default; avoid exposing MySQL to the whole network unless required.

## Security and Local Network Hosting Review

Current security posture:

- Login exists in the frontend via Microsoft MSAL.
- There are no local passwords and therefore no password hashing.
- API routes are not protected by backend middleware.
- Frontend role guards are helpful for UX but are not sufficient security.
- Direct calls to `http://backend:3000` or `http://localhost:3000` can bypass frontend guards.
- Raw SQL string interpolation creates SQL injection risk.
- Hard-coded database root credentials appear in source and Dockerfile.
- CORS is hard-coded and not environment-aware.
- Backend logs may expose too much auth/runtime information.
- Secrets are inconsistently handled between `.env`, compose environment values, and Docker secrets.

Minimum security work before company network use:

- Add backend JWT/access-token validation for every API route.
- Enforce roles/permissions in backend middleware.
- Replace raw SQL interpolation with parameterized queries everywhere.
- Use a non-root database user for the application.
- Move DB credentials and MSAL secrets to environment variables or Docker secrets.
- Add request validation and consistent error handling.
- Restrict CORS to the actual local LAN origin/proxy origin.
- Avoid exposing MySQL outside the Docker network for normal app use.
- Add basic audit/activity logging for future CRM workflows.

## Recommended Next Development Phases

Phase 2 - Stabilize setup and runtime:

- Install a compatible Node/npm toolchain.
- Install backend and frontend dependencies.
- Normalize Node versions for local and Docker.
- Fix backend config defaults and remove duplicate listener behavior.
- Move database connection settings to environment variables.
- Verify MySQL startup and schema initialization.
- Make backend and frontend run locally at the same time.
- Run backend tests and Angular build.

Phase 3 - Security hardening:

- Add backend MSAL/JWT token validation middleware.
- Add backend role/permission checks.
- Parameterize all SQL.
- Replace root DB access with least-privileged app user.
- Add environment templates and secret handling.

Phase 4 - Quote workflow completion:

- Fix quote response field mismatches.
- Finish BOM update/delete behavior.
- Implement labor/material cost persistence or remove unused frontend calls.
- Add supplier route mounting and UI integration if suppliers are needed.
- Add state seed data or a real states API.

Phase 5 - CRM expansion:

- Add accounts/companies, contacts, leads, opportunities, quotes/proposals, projects, tickets, tasks/follow-ups, and activity history.
- Add role-specific dashboards and reporting.
- Add import/export and backup/restore workflows.

Phase 6 - Local Docker hosting:

- Add production compose file.
- Add nginx reverse proxy config.
- Build Angular as static assets.
- Add MySQL volume and backup process.
- Document LAN deployment and recovery steps.

## Immediate Fixes Required Before Building CRM Features

- Install or expose npm in PATH and use an older compatible Node LTS version for this project, likely Node 14 or 16 for Angular 12.
- Install backend dependencies with `npm ci` in `backend/`.
- Install frontend dependencies with `npm ci` in `gui/`.
- Add or confirm frontend MSAL production environment values.
- Make backend database connection environment-driven.
- Fix `backend/app.js` port/default handling and duplicate listener behavior.
- Confirm the backend can connect to MySQL.
- Verify Docker availability or install Docker Desktop for local container testing.
- Fix obvious route bugs in quote/BOM endpoints.
- Add backend auth middleware before exposing the app on the company network.
- Create a clean `.env.example` for backend and a documented frontend config strategy.
