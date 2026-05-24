# Restart Checkpoint

Date: 2026-05-24

Purpose: Primary restart source of truth for Pulse after documentation consolidation. Use `docs/PULSE_OVERVIEW.md` for a quick orientation and this checkpoint for current state, condensed history, and recovery notes.

## Documentation Consolidation Checkpoint - 2026-05-24

Documentation entry points are now intentionally small:

- `README.md`: repository quick start, stack, commands, and local accounts.
- `docs/PULSE_OVERVIEW.md`: practical Pulse overview for fast context.
- `docs/checkpoints/RESTART_CHECKPOINT.md`: canonical current state, historical checkpoints, architecture notes, and recovery guidance.

Consolidation completed:

- Former transition, ADR, architecture, brand, report, and sandbox docs under `docs/` were summarized into this checkpoint and the Pulse overview.
- App, package, backend, and Prisma READMEs remain local setup notes.
- `lan-html-inspect.txt` is intentionally unchanged because it is a tracked inspection artifact outside the docs-folder consolidation scope.

Current runtime:

- The default Pulse stack is Docker Compose with `postgres`, `api`, and `web`.
- `postgres` runs PostgreSQL 16 with Pulse data in the `pulse` schema.
- `api` is the active NestJS service in `apps/api`, serving `/api/...` on port `3000`.
- `web` is the active Next.js app in `apps/web`, serving Pulse on port `4300` and proxying browser `/api/...` calls to the NestJS API through `PULSE_API_URL`.
- The legacy Express backend in `backend/` is compatibility/reference code only. It is available through the legacy Compose profile and is not part of the default runtime.

Active architecture decisions:

- Pulse is the modern internal operations platform for R2 Communications, replacing the inherited KuoteSuite prototype.
- The primary business flow is `Request -> Quote Workspace -> Proposal -> Project`.
- New work should target `apps/web` for UI and `apps/api` for active API behavior.
- The current architecture is a modular monolith path, not a microservice split.
- Prisma and PostgreSQL are the active persistence path. Review data-loss prompts before schema pushes and do not run destructive seeds against data that must be preserved.
- Some domain services, types, validations, Prisma schema, and seed logic were copied between `apps/web` and `apps/api` during the first NestJS parity pass. Consolidate shared code into packages after the runtime boundary settles.
- The removed Angular `gui/` app, Angular routing, Angular Material patterns, and old frontend build assumptions must not be used for new work.

Product and module state:

- Requests are the active intake object and replace Leads in user-facing navigation and language.
- Requests are short-lived intake gates before quote work, with lifecycle states, service categories, readiness rules, checklist templates, site-visit handling, request detail routes, and activity history.
- Directory/Clients is the active account lookup and relationship foundation. It stores clients, sites, contacts, billing preferences, technology preferences, and client activity.
- Quotes and Projects exist as starter workspaces; the real database-backed Quote Workspace, BOM/pricing model, proposal generation, and project handoff remain future work.
- Settings includes local account management for Admin users, including account lifecycle fields, activation/deactivation, role edits, temporary password resets, and forced password changes.
- Global Activity exists for cross-record history. Password hashes must never be serialized to frontend account responses.

UI, mobile, and brand state:

- `PulseShell` is the persistent app shell with dark top bar, collapsible desktop sidebar, compact page headers, and mobile navigation.
- Requests is the first desktop and mobile workflow proof point.
- Mobile foundation work added shared mobile primitives and a bottom navigation pattern; other modules still need module-specific mobile workflows.
- Page/view transitions should stay subtle, fast, and respectful of reduced-motion preferences.
- Manrope is the default Pulse application font. UI should use the existing custom Pulse CSS patterns and `lucide-react` icons.

Preserved legacy business concepts:

- The removed KuoteSuite prototype remains useful only as historical business reference.
- Preserved concepts include request/lead intake fields, Directory client/site/contact ideas, lead-to-quote handoff, QM-style quote numbering, quote approval/revision states, BOM and quote-line fields, labor/material cost formulas, and proposal/PDF field ideas.
- Old Leads module planning is historical. The active direction is Requests plus Directory, with legacy lead export/import support documented in `apps/api/README.md`.

Operational notes:

- Local web URL: `http://localhost:4300`.
- Direct API health: `http://localhost:3000/api/health`.
- Proxied API health through web: `http://localhost:4300/api/health`.
- Workstation LAN access has previously used `http://192.168.1.12:4300`; verify the current LAN address before relying on it.
- Local test accounts are listed in `README.md` and app READMEs.
- The Windows sandbox runner can fail before process startup. Prefer targeted commands, exclude generated folders, avoid broad recursive scans, and document when non-sandbox execution is required for verification.

Near-term priorities:

- Build the real Quote Workspace, pricing/BOM model, proposal/PDF flow, and project handoff.
- Consolidate duplicated API/web domain code into shared packages when the NestJS boundary settles.
- Add Settings workflows for Request Types and Intake Checklist Templates.
- Link Request checklist requirements to Directory client/contact/site selectors instead of only raw intake text.
- Migrate or explicitly retire remaining useful behavior from the legacy Express backend.
- Add browser-level interaction checks for shell/sidebar/menu behavior and key mobile Request workflows.

## Pulse NestJS API And Compose Stack Checkpoint - 2026-05-20

The default Pulse runtime now uses a single Docker Compose app:

- `postgres`: PostgreSQL 16 with persistent local volume.
- `api`: NestJS app in `apps/api`, serving `/api/...` on port `3000`.
- `web`: Next.js app in `apps/web`, serving Pulse on port `4300` and proxying browser `/api/...` calls to NestJS through `PULSE_API_URL`.

Implementation notes:

- Active Pulse API parity was scaffolded in NestJS for health, auth/session/password changes, activity, settings/accounts, request checklist templates, clients, and requests.
- The initial NestJS parity slice mechanically copied the existing Pulse domain services, types, validations, Prisma schema, and seed from `apps/web` into `apps/api`; consolidate this into shared packages after the runtime boundary settles.
- The legacy Express backend remains in `backend/` but is no longer part of the default Compose stack. It is available through `docker-compose.legacy.yml`.
- `docker-compose.yml`, `docker-compose.dev.yml`, and `docker-compose.ci.yml` now resolve default services as `postgres`, `api`, and `web`.
- The dev/default API container generates Prisma at startup, but does not push schema changes or run the destructive demo seed automatically.
- `apps/web` now runs Prisma generation and Next type generation before typecheck to avoid stale generated client and route-type failures.

Verification:

```text
docker compose config --services                  # postgres, api, web
docker compose -f docker-compose.dev.yml config --services  # postgres, api, web
docker compose -f docker-compose.ci.yml config --services   # postgres, api, web
cd apps/api && npm run typecheck                  # passed
cd apps/api && npm run build                      # passed
cd apps/api && npm test                           # passed
cd apps/web && npm run typecheck                  # passed
cd apps/web && npm run build                      # passed
```

Docker Desktop became available late in implementation, and the API image build passed. A live `docker compose up --build -d api web` smoke check initially exposed that automatic `prisma db push` would refuse to drop old non-empty Lead tables, so schema push was removed from normal startup.

Live smoke checks then passed:

```text
http://localhost:3000/api/health           # 200, Nest API health
http://localhost:4300/api/health           # 200, web proxy to Nest API health
http://localhost:3000/api/health/database  # 200, Postgres reachable
http://localhost:4300/api/health/database  # 200, web proxy to database health
http://localhost:3000/api/auth/session     # 200, no-cookie session returns null user
http://localhost:4300/api/auth/session     # 200, web proxy no-cookie session returns null user
http://localhost:4300                      # 200, Pulse web app
```

Admin login could not complete against the current local database because the `pulse.LocalUser` table is not present yet. The API now returns a clear `503` schema-not-ready response for missing Prisma tables instead of a generic `500`.

## Pulse Shell, Request Detail, And Local Accounts Checkpoint - 2026-05-19

Three new local commits were prepared after the Pulse shell, Request navigation, and local account-management work:

- `b9df2e6` - `feat: make request detail the primary workflow`
- `01cb1dd` - `feat: add local account management`
- `c2211b0` - `fix: keep Pulse shell mounted during navigation`

Request navigation / detail access:

- `/requests/[id]` is now the canonical Request workspace.
- Desktop Request rows navigate to the full detail route.
- Desktop queue rows have a separate Preview action that opens the existing side panel.
- The side panel now includes an `Open Full Request` action.
- Mobile Request cards navigate directly to the full detail route instead of using the old inline expanded panel.
- The Request detail page now has more parity with the old panel: contact methods, missing info, internal notes, follow-ups, files/drawings, related quote action, checklist summary, and global activity timeline.

Local account management MVP:

- `LocalUser` remains the single local account model.
- Added account lifecycle/future-SSO fields: `mustChangePassword`, `authProvider`, `entraObjectId`, `lastLoginAt`, and `deactivatedAt`.
- `entraObjectId` is indexed but not unique in this checkpoint because `prisma db push` warned about adding a new unique constraint; uniqueness can be added with the real Entra migration.
- Added Admin-only account APIs under `/api/settings/accounts`.
- Added `/api/auth/change-password`.
- Settings now includes an Admin-only Accounts section for creating users, editing name/email/role/status, deactivating/reactivating users, and setting temporary passwords.
- Admin password reset stores only a new hash and sets `mustChangePassword = true`.
- Users with `mustChangePassword` are held on a focused password-change screen before entering Pulse.
- Permission-gated APIs now reject normal app access while `mustChangePassword` is true.
- Password hashes are not serialized to frontend account responses.
- Activity logging was added for user creation, role changes, activation/deactivation, password resets, and user password changes.
- The destructive `npm run db:seed` command was not run. Existing local/demo accounts were preserved.

Shell / route stability:

- The root layout now mounts a persistent `PulseShell`.
- Nested page-level `PulseShell` usage is safely ignored when a parent shell is already mounted.
- Route loading is content-only so the shell/sidebar/topbar do not flash away during normal navigation.
- Desktop shell scrolling is viewport-owned: sidebar stays locked, and main content owns vertical scrolling.
- Mobile bottom navigation and mobile shell behavior were preserved.

Verification from `apps/web`:

```text
npm run prisma:generate  # passed
npm run db:push          # passed, non-destructive; no seed run
npm run typecheck        # passed
npm run build            # passed
```

Runtime / smoke checks:

```text
Invoke-WebRequest http://localhost:4300              # 200 OK
Invoke-WebRequest http://192.168.1.12:4300           # 200 OK
Admin login + GET /api/settings/accounts             # 200 OK, response did not contain passwordHash
Sales login + GET /api/settings/accounts             # 403 Forbidden
```

Operational notes:

- The Pulse dev server is running from `apps/web` on port `4300` and is reachable from the workstation LAN at `http://192.168.1.12:4300`.
- `npm run db:push` synced the local PostgreSQL `pulse` schema for the new account fields.
- `next-env.d.ts` was restored after `next build` flipped its generated route-types import.
- Manual UI checks still recommended: Settings Accounts create/edit/deactivate/reset flows, forced password-change screen, Request row Preview vs full navigation, mobile Request tap-to-detail, and sidebar collapse persistence.
- Existing stateless sessions are not force-revoked by password reset until the client reloads or checks session again.
- Do not run the current destructive seed script on data that must be preserved.

## Angular Framework Removal / Pulse Stack Cleanup - 2026-05-14

The legacy Angular `gui/` application has been removed from the active repository structure. Angular dependencies, Angular CLI/build scripts, Angular routing, Angular Material UI code, legacy browser PDF packages, Angular Dockerfile/config files, and the root-only empty `package-lock.json` were removed with it.

Useful business concepts from the removed Angular prototype are summarized in the 2026-05-24 consolidation checkpoint above, including Request/Lead intake fields, Directory client/site/contact ideas, lead-to-quote handoff, QM-style quote numbering, quote approval/revision states, BOM/quote-line fields, labor/material cost formula ideas, and early proposal/PDF field concepts.

The active Pulse stack is now:

- `apps/web`: Next.js 16, React 19, TypeScript, route-handler APIs, Prisma, Zod, local development auth, Requests, Directory/Clients, activity, and starter operational workspaces.
- PostgreSQL 16 with Pulse data in the `pulse` schema for `apps/web`.
- `backend/`: compatibility/reference Express API using Prisma/PostgreSQL; do not remove until useful logic is migrated or explicitly retired.
- `apps/api`, `apps/worker`, and `packages/*`: planned placeholders.

Cleanup completed:

- Removed `gui/` and its Angular package files, source, assets, test config, Dockerfile, and lockfile.
- Removed the obsolete root `package-lock.json` that had no root package entries.
- Updated root/app/backend documentation to point to `apps/web` and port `4300`.
- Updated Docker Compose files to remove the Angular `gui` service and add a `web` service for the Pulse Next app on port `4300`.
- Updated backend CORS/default frontend wording from Angular/4200 to Pulse web/4300.
- Updated reports, ADR, transition notes, brand docs, sandbox notes, and architecture notes for the new boundary.

Safe commands run:

```text
rg targeted Angular/reference searches with generated-folder exclusions
Resolve-Path .; Resolve-Path gui
Remove-Item -LiteralPath <verified repo>\gui -Recurse -Force
npm run typecheck            # from apps/web, passed
npm run build                # from apps/web, passed
docker compose -f docker-compose.dev.yml config       # passed
docker compose -f docker-compose.override.yml config  # passed
docker compose -f docker-compose.ci.yml config        # passed
Start-Process npm.cmd run dev # from apps/web
Invoke-WebRequest http://localhost:4300               # returned 200 OK
```

Command limitations encountered:

- The Windows sandbox runner again failed before command startup, so targeted non-sandbox commands were used and documented.
- The first verified `Remove-Item` for `gui/` timed out while deleting the old `node_modules` tree; the same verified target was retried with a longer timeout and completed.
- Docker Desktop was not running, so Docker API/container status checks failed. Compose config validation still succeeded because it does not require the daemon.
- Backend `npm test` was attempted once and failed because `DATABASE_URL` was not set in the current shell/environment. Do not repeatedly retry backend DB tests until PostgreSQL/Docker and `DATABASE_URL` are available.

Follow-up cleanup still needed:

- Decide when to migrate or retire remaining compatibility Express backend routes and old Prisma compatibility tables.
- Build the real database-backed Quote Workspace and proposal/PDF flow using the preserved pricing and proposal concepts.
- Revisit Compose web service ergonomics after Docker Desktop is available, because the updated dev service uses `node:24-alpine` with `npm ci` at container startup.
- Some historical docs intentionally still mention Angular and `gui/` as removed reference context.

## Desktop Enterprise App Shell Pass - 2026-05-14

Pulse now has a stronger desktop-focused enterprise shell in the active Next.js app. This pass did not reintroduce Angular patterns and did not touch backend, Prisma, or database workflows.

New shell structure:

- `PulseShell` renders a global dark top bar, a dark collapsible left sidebar, and a light content canvas by default.
- The Pulse mark and full Pulse name moved from the sidebar into the global top bar.
- The top bar now contains app-wide search, a visible `Local Dev` environment badge, visual-only notifications, profile menu, and active role indicator.
- The sidebar is a flat primary-module list: Hub, Requests, Quotes, Projects, Directory, Billing, Analytics, Settings.
- Expanded sidebar shows icon + label. Collapsed sidebar uses icon-only navigation with native hover tooltips and the same active route highlighting.
- Page-level controls remain in page content. The old global filter/date/create controls were removed from the shell.
- Each shell page now gets a compact page header below the top bar with a short title and breadcrumb pattern such as `Home / Requests`.
- Full dark mode support remains available through the profile menu theme toggle.
- Follow-up transition fix replaced the old route loading skeleton (`104px sidebar + content`) with a loading shell that matches the new dark topbar, dark collapsed sidebar, compact page header, and light content canvas.

Files modified in this pass:

- `apps/web/src/components/PulseShell.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/loading.tsx`
- `docs/checkpoints/RESTART_CHECKPOINT.md`

Safe commands run:

```text
npm run typecheck  # from apps/web, passed
npm run build      # from apps/web, passed
Invoke-WebRequest http://localhost:4300/requests  # returned 200 OK
Get-NetTCPConnection targeted to 4300/3000/5432
rg targeted shell cleanup/class searches
rg targeted route-loading class searches
```

Command limitations observed:

- Continued using targeted non-sandbox PowerShell because the Windows sandbox runner is documented as unreliable on this workstation.
- Did not retry Docker Compose for this UI pass. The previous attempt reached Docker Desktop but public image pulls were blocked by a Docker credential helper/session error.
- Did not run backend tests because this shell pass does not modify backend code and the previous backend test attempt lacked `DATABASE_URL`.

Remaining UI follow-up:

- Add browser-level interaction checks with Playwright or another approved local browser workflow for sidebar collapse, profile menu opening, and active route visual states.
- Tune module-specific page headers where nested routes need richer breadcrumbs, for example Request detail/edit pages.
- Decide whether to add a real global search command palette or backend-backed search API in a later pass.

## Global Mobile Foundation Planning - 2026-05-12

Global mobile UI planning and first-pass implementation are continuing from the Pulse workstation environment, with Requests as the first proof point. The active target remains `apps/web` on port `4300`; the local frontend responded successfully at `http://localhost:4300`, and PostgreSQL is healthy on port `5432`. Use Windows PowerShell-compatible commands from the correct package folders. The sandbox runner may still fail with `windows sandbox: timed out after 15000ms connecting runner pipe-in`, so targeted non-sandbox verification may be required and should be documented.

- Added shared mobile primitives under `apps/web/src/components/mobile`.
- Replaced mobile top navigation with a fixed global bottom navigation rendered by `PulseShell`.
- Added `RequestsMobileView` as the first workflow proof point using real Request data and capability-based permissions.
- Stabilized mobile shell sizing so the collapsed desktop sidebar does not squeeze mobile content.
- Added Hub-specific mobile scaling fixes so dashboard cards and command tables do not preserve desktop ratios on phones.
- Captured global mobile foundation guidance for future module adoption; it is now summarized in the 2026-05-24 consolidation checkpoint above.
- Known limitation: Clients, Quotes, Projects, and other modules currently inherit the global mobile shell first; their module-specific mobile workflows should be added in later passes. Quotes and Projects remain starter-data modules and are not the current focus.

## Desktop Requests Simplification Pass - 2026-05-12

Requests is now also the first desktop workbench simplification proof point. The sidebar starts collapsed, `/requests` uses a compact command-bar shell with no large page title/subtitle block, and the landing view is focused on intake summary cards, a reduced queue, and a lightweight selected-request preview. Deeper intake work has route-backed entry points at `/requests/new`, `/requests/[id]`, and `/requests/[id]/edit`. Verification from `apps/web`: `npm run typecheck` passed, `npm run build` passed, and `http://localhost:4300/requests` plus `http://localhost:4300/requests/new` returned `200 OK`. The Windows sandbox runner pipe issue still applies, so targeted non-sandbox verification was used and documented.

## End-of-Day Pulse UI / Requests Pass - 2026-05-12

Today's workstation pass added the global mobile foundation, Requests as the first mobile proof point, the desktop Requests simplification pattern, route-backed request create/view/edit pages, softer route transitions, a global loading skeleton, collapsed desktop navigation behavior, and a subtle global background gradient for light/dark themes. A real CCCPR Spanish email thread was used as a workflow smoke test and produced four local Request records: Forward Center antenna service, CID-Hospital-Forward Center star connection, 30K/40K battery backup capacity review, and CID security system verification. The battery backup request exposed a category gap, so `Power / UPS` was added as a first-class request category with a dedicated intake checklist template and applied to `RQ-2026-1010` in the local database. Future pass: add a Requests filter by service category so users can quickly isolate Fiber, CCTV, Access Control, Network, AV, Service, Power / UPS, and other intake types.

## Mobile Navigation Optimization Pass - 2026-05-12

Pulse web app navigation was optimized for mobile and responsive design.

- Follow-up mobile nav pass added a true top navigation strip below 980px in `PulseShell`.
- Mobile now hides the desktop sidebar entirely, giving Requests and other modules the full viewport width.
- Mobile topbar keeps global actions icon-first and keeps primary module navigation horizontally scrollable.
- Requests queue rows now render as labeled mobile cards below 760px instead of relying on horizontal table scrolling.
- Captured a focused mobile refactor analysis for the Requests page; it is now summarized in the 2026-05-24 consolidation checkpoint above.
- Desktop: Sidebar now starts in collapsed state (icon-only, 104px width) by default. Users can expand with toggle button at top of sidebar.
- Mobile (< 980px): Sidebar is hidden and replaced by the top navigation strip to preserve screen space for content.
- Mobile: Collapse/expand toggle button remains hidden on viewports below 980px.
- Topbar (page title, search, actions) now uses `position: sticky` to remain visible while scrolling through page content.
- Collapse toggle button moved from sidebar bottom to top-right of sidebar brand area.
- `handleCollapsedToggle()` function added to prevent sidebar expansion on mobile viewports.
- Sidebar brand layout updated to flex with space-between for proper button positioning.
- All existing navigation functionality preserved; no routes or features removed.
- Visual hierarchy simplified: icons always visible, labels revealed on demand (desktop) or hidden permanently (mobile).
- Improved mobile content visibility by preventing sidebar from taking full viewport width.
- Verification: Layout tested across desktop (1540px, 1260px, 980px+) and mobile (620px, < 980px) breakpoints.

## Latest Pulse CRM Checkpoint - 2026-05-11

This update captures the current Pulse work built beside the legacy KuoteSuite Angular/Express prototype. The legacy `gui/` and `backend/` paths remain historical reference and should not be treated as the final Pulse architecture.

## Requests / Directory Navigation Pass - 2026-05-11

Pulse navigation has started moving from the old CRM-centered structure toward the operations model summarized in the 2026-05-24 consolidation checkpoint above.

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

- Baseline Pulse brand standards are now summarized in the 2026-05-24 consolidation checkpoint above.
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
- The repo does contain large generated/vendor folders such as `apps/web/node_modules`, `apps/web/.next`, and `backend/node_modules`, so broad recursive PowerShell commands can still be noisy and slow when the sandbox is healthy. The old `gui/node_modules` tree was removed with the Angular cleanup on 2026-05-14.
- Safer pattern going forward: target the relevant source directory and exclude generated folders, for example `rg "pattern" apps/web/src -n --glob '!node_modules' --glob '!dist' --glob '!build' --glob '!.angular' --glob '!coverage' --glob '!.next'`. Avoid `grep ... | head`, `cat ... | grep`, `find ... | xargs ...`, and broad repo-root recursion.
- See the 2026-05-24 consolidation checkpoint above for the short command guide.

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
