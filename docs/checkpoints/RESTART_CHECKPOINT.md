# Restart Checkpoint

Date: 2026-05-09

Purpose: Save the current repository/startup state after moving the app to a PostgreSQL and Prisma-only runtime path and starting the UI modernization work.

## Latest Pulse CRM Checkpoint - 2026-05-11

This update captures the current Pulse work built beside the legacy KuoteSuite Angular/Express prototype. The legacy `gui/` and `backend/` paths remain historical reference and should not be treated as the final Pulse architecture.

## Requests / Directory Navigation Pass - 2026-05-11

Pulse navigation has started moving from the old CRM-centered structure toward the operations model documented in `docs/architecture/PULSE_REQUESTS_DIRECTORY_IMPACT_NOTE.md`.

- Primary sidebar now shows Hub, Requests, Quotes, Projects, Directory, Billing, Analytics, and Settings.
- Requests is the user-facing replacement for Leads in navigation and page language.
- `/requests` now serves the existing leads-backed workspace, while `/leads` redirects to `/requests` for compatibility.
- Leads remain internally database-backed through the existing Prisma `Lead` model and `/api/leads` routes. No Prisma models, tables, or lead API routes were renamed or removed in this pass.
- Directory is now a top-level navigation item with a landing page for Clients, Contacts, Sites / Locations, Vendors, Suppliers, Subcontractors, Manufacturers, and Reps / Partner Contacts.
- Clients moved under the Directory UI concept. Existing `/clients` and `/clients/new` routes remain active and database-backed, and `/directory/clients` redirects to `/clients`.
- Activity was removed from primary navigation only. The global `/activity` page, activity API, activity model, and embedded record timelines remain in place.
- Procurement and Field Ops were removed from primary navigation only. Existing `/procurement` and `/field` pages were not deleted.
- Verification from `apps/web`: `npm run typecheck` passed and `npm run build` passed.

## Requests Intake Queue Pass - 2026-05-11

The Requests workspace now behaves more like R2's intake queue while still using the existing Leads-backed implementation internally.

- `/requests` still renders `apps/web/src/modules/leads/LeadsModule.tsx`.
- The workspace continues to read and write through `/api/leads`, `leadService.ts`, Zod lead validation, and the Prisma `Lead` model. No Prisma model/table rename or migration was performed.
- User-facing labels were tightened around Requests, intake, service category, Directory company/contact context, follow-ups, and quote readiness.
- The Request list now prioritizes workflow fields: request name, company/contact, service category, status, priority, assigned person, next action, next follow-up, and last activity.
- Expected value is no longer shown in the Requests queue, detail panel, or create/edit form. The existing `estimatedValue` field remains in the API payload/model only for backward compatibility with the current Leads-backed data shape.
- Request status/source/category options were updated in TypeScript validation/type options to include intake-oriented values such as Assigned, Waiting on Client, Missing Info, Site Visit Scheduled, In Review, Ready for Quote, Converted to Quote, Call, Email, RFP / Bid, Drawing Package, Quote Request, Service-Related Quote, CCTV / Surveillance, Networking, Wireless / Wi-Fi, and Service / Support. Legacy values remain accepted for compatibility with existing rows.
- The detail panel now reads as an intake record with overview, Directory company/contact context, next action, intake checklist, missing information, workflow status actions, intake notes, follow-ups, files/drawings, related quote placeholder, and embedded activity timeline.
- Real fields currently surfaced: `name`, `companyName`, `contactName`, `contactTitle`, `email`, `phone`, `leadSource`, `serviceInterest`, `siteName`, `siteAddress`, `city`, `state`, `status`, `priority`, `assignedUserId`, `assignedOwner`, `nextFollowUpDate`, `notes`, `lastActivityAt`, `tasks`, `activities`, and `attachments`.
- Derived/placeholder behavior: missing information is derived from absent company/contact method/site fields and `Missing Info` status; site visit indicator is derived from status; due date uses existing `nextFollowUpDate`; related quote displays `convertedQuoteId` when present and otherwise shows a disabled "Create Quote Workspace" action.
- Existing `LeadTask` follow-ups and global `Activity` entries remain usable. A future generalized `Task`/`FollowUp` model should support Request, Quote, Project, Client, Contact, Site, and other related records.
- Recommended future Prisma changes remain: introduce a real `Request` model, add request type/source separation, dedicated due date, missing-information fields, site-visit fields, file/drawing relations, and explicit `relatedQuoteId`/`relatedProjectId` relations.
- Seed/demo data was refreshed toward Request terminology and intake-oriented statuses/sources/categories, but `db:seed` was not run during this pass.
- Verification from `apps/web`: `npm run typecheck` passed and `npm run build` passed. There is still no lint script in `apps/web/package.json`.

## Requests Domain Migration Pass - 2026-05-11

Pulse Requests are now first-class application records instead of a Leads-backed UI alias.

- Replaced the Prisma `Lead`, `LeadActivity`, `LeadTask`, `LeadNote`, and `LeadAttachment` models with `Request`, `RequestActivity`, `RequestTask`, `RequestNote`, and `RequestAttachment`.
- Added Request fields for request number, title, request type, source, service category, workflow status, priority, Directory client/contact/site links, assigned owner, received date, due date, next action, next follow-up, missing info, site visit needed, description, internal notes, related quote, creator, and activity timestamps.
- Added optional Request relations to `Client`, `ClientContact`, `ClientSite`, `Quote`, and `LocalUser`.
- Replaced `/api/leads` with `/api/requests`, including record detail, status changes, activity notes, follow-up tasks, task completion, archive, and convert-to-quote behavior.
- Deleted the old lead service, validation, types, module, and lead API route files.
- `/requests` now renders `apps/web/src/modules/requests/RequestsModule.tsx` and talks to `/api/requests`.
- `/leads` remains only as a documented redirect to `/requests` for old bookmarks; there is no `/api/leads` compatibility layer.
- Activity history now records Request activity with `relatedEntityType: "Request"`; the shared activity entity type list no longer includes `Lead`.
- Converting a Request can create a draft `Quote` record and link it through `Request.relatedQuoteId`. Quote pricing/BOM/proposal work remains outside this pass.
- Seed/demo data now creates six `Request` records with `RQ-2026-*` numbers and Request activity. The old Lead seed tables are gone.
- Development database schema was pushed with `npx prisma db push --accept-data-loss`, dropping non-empty Lead tables from the local `pulse` schema. This was intentional for the development clean-domain migration.
- The running Next.js dev server had to be stopped because Windows held Prisma's generated query engine DLL during `prisma generate`.
- CSS class names such as `lead-table` and `lead-detail-panel` still exist as shared styling selectors for the Requests and Clients layouts; they are not backend/domain compatibility.
- `apps/web/package.json` has no lint or test scripts at this checkpoint.
- Verification from `apps/web`: `npm run prisma:generate` passed, `npx prisma db push --accept-data-loss` passed, `npm run db:seed` passed, `npm run typecheck` passed, and `npm run build` passed.

Recommended next step: move permissions from the old `crm:*` names toward module-aware `requests:*` and `directory:*` permissions, then begin linking Requests to Directory clients/contacts/sites from the create/edit form.

## Request Intake Checklist Pass - 2026-05-11

Requests now behave as short-lived intake gates before quote work, not as a long sales pipeline.

- Request lifecycle was shortened to: `Received`, `Reviewing`, `Missing Info`, `Site Visit Required`, `Ready for Quote`, `Converted to Quote`, `No Bid`, `Cancelled`, and `Duplicate`.
- Added database-backed checklist templates through `RequestChecklistTemplate` and `RequestChecklistTemplateItem`.
- Added per-request checklist items through `RequestChecklistItem`, including label, optional description, required flag, applies condition, group, sort order, completed state, completed timestamp, completed-by user, and notes.
- Seeded five checklist templates: General Request Intake, Fiber Install Intake, Access Control Intake, CCTV / Surveillance Intake, and Structured Cabling Intake.
- New Requests receive a checklist from the best matching service-category template on creation. Changing service category later does not erase existing checklist progress.
- Readiness is computed in the Request service. A Request is ready for quote only when required applicable checklist items are complete, an owner is assigned, service category exists, client/company/contact context exists, and required site visits are completed.
- `Site visit completed` only blocks readiness when `siteVisitNeeded` is true.
- Optional checklist items do not block readiness.
- Checklist completion writes Request activity and global Activity records with `relatedEntityType: "Request"`.
- Added `/api/requests/[id]/checklist/[itemId]` for checklist item updates.
- Convert-to-quote is now blocked unless readiness is satisfied. The full Quote Workspace is still not built in this pass.
- The Requests page top hero was replaced with an intake lifecycle visual showing counts for Received, Reviewing, Missing Info, Site Visit Required, Ready for Quote, and Converted / Closed.
- The lifecycle visual highlights the largest active bottleneck and its cards act as status filters.
- Operational cards now show missing required items, site visits pending, ready for quote, unassigned, and overdue follow-ups.
- The Request table now shows checklist progress, missing required count, and site visit required/completed state.
- The Request detail panel now includes grouped checklist items, required/optional indicators, applicable/not-applicable state, progress, missing required summary, and Ready for Quote readiness.
- Seed/demo data now creates 7 Requests demonstrating Received, Missing Info, Site Visit Required, Reviewing, Ready for Quote, Converted to Quote, and No Bid examples.
- Prisma schema was pushed with `npm run db:push`; no accepted data loss was required for this additive checklist schema pass.
- The running Next.js dev server had to be stopped again because Windows held Prisma's generated query engine DLL during `prisma generate`.
- `apps/web/package.json` still has no lint or test scripts.
- Verification from `apps/web`: `npm run prisma:generate` passed, `npm run db:push` passed, `npm run db:seed` passed, `npm run typecheck` passed, and `npm run build` passed.

Recommended next step: add a small Settings area for Request Types and Intake Checklist Templates, then link Request checklist requirements to Directory client/contact/site selectors instead of only raw intake text.

### New Chat Context

This Leads pass was completed in a fresh ChatGPT 5.4 mini Codex chat after re-reading the repository docs, architecture notes, and this checkpoint before making changes.

The Leads page was already partially database-connected through `/api/leads`, Prisma, and PostgreSQL, but it still relied on string-based owner behavior and a fixed detail layout that did not yet follow the Clients close/open pattern cleanly.

### Pulse Workstation Development Context

Development has moved to the dedicated Pulse workstation environment, which is now the primary development and testing context going forward. Future work should continue from this workstation setup as Pulse is prepared for local network testing and end-user feedback. The current workstation frontend port is `4300` unless changed later. Future Codex sessions should review this checkpoint documentation before making changes.

### Workstation UI Fix - Top Bar Layout

Fixed the newest workstation build top bar layout issue where the blue create button could overlap the date selector. The header action grid now reserves explicit columns for search, filters, date range, create, theme, notifications, and profile controls at desktop breakpoints.

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
- Leads now store an assigned `LocalUser` through `Lead.assignedUserId` and the `assignedUser` relation, limited to active Admin and Sales users.
- The Leads API now returns the lead assignee list along with the lead records so the UI can use real user-backed assignment options.
- The Leads list and detail panel now show the assigned person from the database, and assignment changes record both lead-local and global activity entries.
- The Leads workspace now matches the Clients pattern more closely: the list stays visible, the detail panel opens beside it, and the detail panel can be closed to restore full list width.

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
- Leads still retains the legacy `assignedOwner` string as a fallback display field for compatibility, but the new `assignedUserId` relation is the source of truth for assignment behavior.

## Commit Practice

- Commit at stable checkpoints instead of carrying large uncommitted batches.
- Refresh this file before each checkpoint commit so crash/reboot recovery has the latest state.
- Latest pushed baseline: `805e56d1` (`Migrate app to PostgreSQL runtime`).
- Latest local checkpoint commit: `87797e43` (`Apply Manrope typography foundation`).

## Current Runtime

- PostgreSQL Docker service is running and healthy on port `5432`.
- Backend dev server is running on `http://localhost:3000`.
- Frontend dev server is running on `http://localhost:4300` from `apps/web`.
- Backend `GET /health` returns `{"status":"ok"}`.
- Backend `GET /health/database` returns `{"status":"ok","database":"postgres"}`.

### Local Network Access

- Pulse dev server is also running from the modern Pulse app at `apps/web`.
- The current Pulse dev server is bound to all interfaces at `http://0.0.0.0:4300`.
- Workstation LAN access is available at `http://192.168.1.12:4300`.
- Next.js remote development resources were enabled for the LAN host by adding `allowedDevOrigins: ["192.168.1.12"]` to `apps/web/next.config.ts`.
- PostgreSQL container `postgres-container` is confirmed running and healthy.
- No Windows Firewall rule changes were required for port `4300`.

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

## Pulse Workstation Auth And Activity Pass

- Added local/dev role-aware auth for Pulse with seeded password-based test users for Admin, Sales, Project Manager, and Technician.
- Introduced a shared global activity timeline model for Leads, Clients, Opportunities, and Quotes, with reusable record-level and global timeline UI.
- Workstation validation passed with `npm run db:setup`, `npm run typecheck`, and `npm run build` from `apps/web`; the dev server is listening on port `4300`.

## Sandbox Runner Investigation - 2026-05-11

- Recurring sandbox failures showed `windows sandbox: timed out after 15000ms connecting runner pipe-in`.
- The failing commands included simple non-piped probes: `pwd`, `Get-Location`, `Get-Date`, and `rg --version`.
- Because those commands do not search the repo, wait for stdin, or use shell pipes, the likely cause is the Windows sandbox runner failing during process/pipe startup rather than `rg`, large CSS output, or pipe behavior such as `rg ... | head`.
- The repo does contain large generated/vendor folders (`apps/web/node_modules`, `apps/web/.next`, `backend/node_modules`, and `gui/node_modules`), so broad recursive PowerShell commands can still be noisy and slow when the sandbox is healthy.
- Safer pattern going forward: target the relevant source directory and exclude generated folders, for example `rg "pattern" apps/web/src -n --glob '!node_modules' --glob '!dist' --glob '!build' --glob '!.angular' --glob '!coverage' --glob '!.next'`. Avoid `grep ... | head`, `cat ... | grep`, `find ... | xargs ...`, and broad repo-root recursion.
- See `docs/sandbox-command-guidelines.md` for the short command guide.

### Sandbox Availability Note

This workstation has a recurring Windows sandbox runner failure. The issue is not caused by PowerShell, Bash, WSL, ripgrep, repo size, broad searches, or piped commands.

Confirmed sandbox failures:

```text
cmd.exe /c echo hello
powershell.exe -NoProfile -Command "Write-Output hello"
bash.exe -lc pwd
wsl.exe pwd
```

All failed with:

```text
windows sandbox: timed out after 15000ms connecting runner pipe-in
```

Confirmed outside-sandbox behavior:

- `cmd.exe /c echo hello` works.
- `wsl.exe pwd` works.
- `bash.exe -lc pwd` may fail depending on the WSL context.

Conclusion: if a basic sandbox smoke test fails with the pipe-in timeout, treat the sandbox as unavailable for that run. Do not waste time retrying different shells. Use non-sandbox execution only when needed, keep commands targeted, and document any verification that could not be performed inside the sandbox.
