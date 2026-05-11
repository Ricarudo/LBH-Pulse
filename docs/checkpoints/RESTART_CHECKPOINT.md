# Restart Checkpoint

Date: 2026-05-09

Purpose: Save the current repository/startup state after moving the app to a PostgreSQL and Prisma-only runtime path and starting the UI modernization work.

## Latest Pulse CRM Checkpoint - 2026-05-11

This update captures the current Pulse work built beside the legacy KuoteSuite Angular/Express prototype. The legacy `gui/` and `backend/` paths remain historical reference and should not be treated as the final Pulse architecture.

### Leads Module Progress

The Pulse Leads MVP has been implemented in the new Next.js app with a database-backed structure.

- Prisma models exist for `Lead`, `LeadActivity`, `LeadTask`, `LeadNote`, and `LeadAttachment`.
- The Leads UI includes a list, rich search/filter controls, saved-style views, and a lead detail panel.
- Lead list filtering supports status, source, owner, priority, and search-oriented lookup patterns.
- Lead metrics summarize open leads, follow-ups, qualified leads, and open value.
- Lead create/edit behavior is available from the Leads module UI.
- Lead records support activity timeline entries, notes, tasks, and task completion toggles.
- The conversion flow exists as a placeholder workflow for future Opportunity, Quote, and Project records.
- Backend/API work is present under `apps/web/src/app/api/leads`.
- Lead validation and persistence use `apps/web/src/lib/validations/lead.ts`, `apps/web/src/lib/services/leadService.ts`, Prisma, and PostgreSQL.
- Seed/sample lead data exists for realistic R2 Communications use cases.

### Clients Module Progress

The CRM Clients area and Add Client workflow have been implemented and refined as database-backed Pulse modules.

- The Clients page reads from the Pulse PostgreSQL database through the Next.js API route and client service layer.
- The Client creation page persists core client account data, nested sites, contacts, preferences, and activity records.
- The Add Client experience was refactored into a multi-step wizard:
  - Client Overview
  - Billing & Terms
  - Sites / Locations
  - Points of Contact
  - Technology & Brand Preferences
  - Review & Create
- Client overview fields include legal name, display name, client type, industry, website, phone, email, status, owner, and preferred language.
- Billing and payment terms include payment terms, billing email, preferred currency, purchase order required, billing requirements, invoice notes, and optional tax identifier.
- Clients can have multiple sites with site type, address, Google Maps URL, operational hours, access instructions, parking instructions, security requirements, notes, and primary site support.
- Clients can have multiple contacts with site assignment, role flags, primary contact support, billing contact support, technical contact support, decision-maker support, and notes.
- Technology and brand preferences include preferred camera, access control, network, cabling, vendors, documentation requirements, insurance/compliance notes, service profile, and general technology preferences.
- Client models currently include `Client`, `ClientSite`, `ClientContact`, `ClientService`, and `ClientActivity`.
- The Clients list is connected to the database and now correctly shows newly created clients.
- Fixed the issue where metrics saw loaded accounts but the visible list stayed empty. Root cause: the filtered list memo did not include `clients` as a dependency, so it stayed stuck on the initial empty array after the API response.
- The Clients page was refactored into a practical account lookup layout.
- The right-side client detail panel now appears only after selecting a client and can be closed with an X button.
- The detail panel uses real selected-client database data and includes an edit-ready action placeholder.
- Removed unnecessary descriptive, marketing-style, and database-explanation sections from the Clients page.
- Removed top metric cards and the Add Follow-Up button from the Clients page after UX review.
- Added relationship/history placeholders for future quotes, proposals, projects, service tickets, invoices, payments, purchase orders, site visits, follow-ups, notes, and activities.
- Improved responsive behavior so the list uses full available width when no client is selected, the detail panel is wider on large/ultrawide screens, and smaller screens stack the detail view.

### Architecture Notes

- Pulse is evolving from KuoteSuite into a modern internal operations platform for R2 Communications.
- Original KuoteSuite paths remain useful for historical workflow reference but should not drive the final architecture.
- New CRM modules should use the modern database-backed architecture in the Next.js app: API route handlers, Prisma, PostgreSQL, Zod validation, service/repository-style data access, and shared TypeScript types.
- Clients are now treated as a core business object that will later connect to leads, opportunities, quotes, proposals, projects, procurement, field work, billing, service tickets, and reporting.
- Leads and Clients should remain separate but connected CRM objects. Leads represent pre-qualified demand and can later convert into Client/Contact/Site/Opportunity/Quote records.
- The current implementation is intentionally a modular monolith path, not a microservice split.

### Current Known UX Observation

- Page changes currently feel too instant/harsh.
- The app needs softer transitions between pages and major views.
- Initial transition work has started with lightweight CSS-based page, panel, modal, and wizard-step transitions. Continue to keep motion subtle, fast, and respectful of reduced-motion preferences.

## Commit Practice

- Commit at stable checkpoints instead of carrying large uncommitted batches.
- Refresh this file before each checkpoint commit so crash/reboot recovery has the latest state.
- Latest pushed baseline: `805e56d1` (`Migrate app to PostgreSQL runtime`).
- Latest local checkpoint commit: `87797e43` (`Apply Manrope typography foundation`).

## Current Runtime

- PostgreSQL Docker service is running and healthy on port `5432`.
- Backend dev server is running on `http://localhost:3000`.
- Frontend dev server is running on `http://localhost:4200`.
- Backend `GET /health` returns `{"status":"ok"}`.
- Backend `GET /health/database` returns `{"status":"ok","database":"postgres"}`.

## Database Path

- Backend routes use Prisma through `backend/config/prisma.js`.
- `DATABASE_URL` is the backend database connection setting.
- Prisma schema source: `backend/prisma/schema.prisma`.
- Seed source: `backend/prisma/seed.js`.
- Setup command: `cd backend` then `npm run db:setup`.

## Cleanup Completed

- Removed the legacy backend database handler and port wait helper.
- Removed the legacy backend database driver package from `backend/package.json` and `backend/package-lock.json`.
- Removed the old database Docker image/setup folder.
- Updated development, override, and CI compose files to use only the `postgres` service for database startup.
- Converted `database-azure-backup` to use `pg_dump`.
- Updated primary docs and reports to describe the current PostgreSQL/Prisma path.
- A repo-wide search for the old database engine name and driver-specific dump command returns no matches.

## Verification Passed

```text
cd backend
npm run prisma:validate
npm run db:setup
npm test
```

Result: Prisma validation passed, database setup passed, backend tests reported `23 passing`.

```text
cd gui
npm run build
```

Result: Frontend build passed with the existing Angular CommonJS optimization warnings.

## UI Foundation Progress

- Global app font changed to Manrope.
- `gui/src/index.html` now loads Manrope from Google Fonts while keeping Material Icons intact.
- `gui/src/styles.css` applies Manrope to body text, forms, buttons, selects, menus, cards, and dialog text.
- `gui/src/theme.scss` configures Angular Material typography to use Manrope.
- Remaining direct Roboto Condensed usages were replaced in the app shell and client-manager dialog styles.

Verification:

```text
cd gui
npm run build
```

Result: Frontend build passed with the existing Angular CommonJS optimization warnings.

## Brand Standards

- Baseline Pulse brand standards now live in `docs/brand/BRAND_STANDARDS.md`.
- Manrope is the default application font for both the legacy Angular modernization path and the new Pulse web app.

## GUI Refresh Progress

Completed first low-risk Material Design 3-inspired refresh slice:

- Added shared visual foundation tokens in `gui/src/styles.css`:
  - color roles
  - surface/background roles
  - spacing scale
  - typography helpers
  - radius and elevation tokens
  - hover, focus, active, and disabled state styling
- Added reusable `ks-*` page, card, table, and badge classes.
- Updated Angular Material theme colors in `gui/src/theme.scss`.
- Refreshed app shell/sidebar styling through the shared foundation layer.
- Applied representative page styling to:
  - Statistics dashboard
  - Quotes list/dashboard
- No business logic, database logic, authentication, or data-loading code was changed.

Verification:

```text
cd gui
npm run build
```

Result: Frontend build passed. Only existing CommonJS optimization warnings remain.

Runtime smoke check:

```text
http://localhost:4200/#/statistics
http://localhost:4200/#/qDashboard
http://localhost:3000/health/database
```

Result: Angular dev server returned the app for both routes, and backend database health returned `{"status":"ok","database":"postgres"}`.

```text
docker compose -f docker-compose.dev.yml config
docker compose -f docker-compose.override.yml config
docker compose -f docker-compose.ci.yml config
```

Result: Compose config validation passed.

## Notes

- Backend test output still logs handled 400 errors for negative-path tests. The suite passes.
- Frontend build still reports CommonJS optimization warnings for legacy chart/PDF dependencies.
- Local ignored artifacts include backend/frontend logs, `node_modules`, frontend `dist`, and backend `.env`.
