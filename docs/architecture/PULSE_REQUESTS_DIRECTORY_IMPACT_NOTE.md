# Pulse Requests and Directory Architecture Impact Note

Date: 2026-05-11

Status: Implemented through the Requests domain migration pass on 2026-05-11

## Purpose

Pulse is moving away from a generic CRM shape toward R2 Communications Group's actual operations flow:

```text
Request -> Quote Workspace -> Proposal -> Project
```

This note documents the impact on the current codebase before any navigation, database, or module refactor.

## 1. What Exists Today

The repository contains three relevant application layers:

- `apps/web`: the current Pulse target app, built with Next.js, React, TypeScript, Prisma, PostgreSQL, Zod validation, local cookie auth, and route-handler APIs.
- `gui`: the legacy Angular 12 KuoteSuite UI, retained as workflow reference.
- `backend`: the legacy Express API, retained as compatibility/reference code and using Prisma against the old mapped PostgreSQL tables.

The active Pulse app currently has these user-facing routes:

- `/hub`
- `/leads`
- `/clients`
- `/clients/new`
- `/quotes`
- `/projects`
- `/procurement`
- `/field`
- `/billing`
- `/statistics`
- `/activity`
- `/settings`

Navigation currently groups `Leads` and `Clients` under a top-level `CRM` parent in `apps/web/src/components/PulseShell.tsx`. `Quotes`, `Projects`, `Procurement`, `Field Ops`, `Billing`, `Analytics`, `Activity`, and `Settings` are top-level sidebar items.

Database-backed Pulse modules:

- Leads are database-backed through `apps/web/src/app/api/leads`, `apps/web/src/lib/services/leadService.ts`, `apps/web/src/lib/validations/lead.ts`, `apps/web/src/types/lead.ts`, and `apps/web/prisma/schema.prisma`.
- Clients are database-backed through `apps/web/src/app/api/clients`, `apps/web/src/lib/services/clientService.ts`, `apps/web/src/lib/validations/client.ts`, `apps/web/src/types/client.ts`, and `apps/web/prisma/schema.prisma`.
- Local users and activity are database-backed through `LocalUser` and `Activity`.

Starter/static modules:

- Quotes, Projects, Procurement, Field Ops, Billing, Hub cards, and the Statistics page are still mostly driven by `apps/web/src/lib/starterData.ts` and shared `OperationsWorkspace` UI.
- The Pulse `Quote` and `Opportunity` Prisma models exist, but current quote/project UI does not yet use real route APIs or full database workflows.

Legacy reference:

- `backend/prisma/schema.prisma` mirrors old KuoteSuite tables such as `Lead`, `Quote`, `Client`, `ClientSite`, `PointOfContact`, `Supplier`, `Item`, BOM, material cost, and labor cost.
- Legacy `Lead` and `Quote` include old workflow ideas, but dates are strings, relations are incomplete, and the shape should not drive the final Pulse domain.

## 2. What Needs To Be Renamed Or Restructured

Navigation should move from:

```text
Hub
CRM
  Leads
  Clients
Quotes
Projects
Procurement
Field Ops
Billing
Analytics
Activity
Settings
```

to:

```text
Hub
Requests
Quotes
Projects
Directory
Billing
Analytics
Settings
```

Conceptual changes:

- `Leads` should become `Requests`.
- `Clients` should move under `Directory`.
- `CRM` should stop being the main navigation concept.
- `Activity` should leave the main sidebar and become embedded in Requests, Quotes, Projects, and Directory records.
- `Procurement` and `Field Ops` should leave the main sidebar for now and become Project subareas or future dashboards.
- `Statistics` should be labeled `Analytics`.

Route impact:

- Add `/requests` as the preferred route.
- Add `/directory` as a directory landing/search route.
- Keep `/leads` temporarily as a compatibility redirect or deprecated route during migration.
- Keep `/clients` temporarily, but make it a Directory subview or redirect once Directory is implemented.
- Keep `/activity` only as a temporary admin/audit route until global audit moves under Settings or Analytics.
- Move `/procurement` and `/field` out of top-level navigation before removing routes.

## 3. What Can Be Reused

Reusable code and concepts:

- The Leads module list/detail split is close to the desired Requests working queue.
- Lead assignment via `assignedUserId -> LocalUser` is useful for Requests.
- Lead tasks and activities are useful starting points for request follow-ups.
- The global `Activity` table and `ActivityTimeline` component can support embedded record history.
- `Client`, `ClientContact`, and `ClientSite` models are strong starting points for Directory.
- Local role-aware auth and `requireUser()` can remain the short-term authorization foundation.
- Existing API/service/validation/type layering in `apps/web` is the right implementation pattern for near-term Pulse work.
- Legacy KuoteSuite quote fields and quote-number ideas are useful reference for QM numbering and quote handoff.

## 4. What Should Be Deprecated

Deprecate, but do not delete immediately:

- Lead terminology in user-facing UI.
- `estimatedValue` as a Request field. It belongs in Quotes or a later Opportunity model.
- Lead statuses such as `Estimating`, `Proposal Needed`, and `Proposal Sent` as request statuses. These are quote/proposal workflow concepts.
- The top-level `CRM` navigation group.
- Top-level `Activity`, `Procurement`, and `Field Ops` sidebar entries.
- String fallback ownership such as `assignedOwner` as source of truth. Keep it only as compatibility display data.
- Static starter data for operational modules once real database APIs are introduced.

## 5. Proposed Navigation Changes

First navigation pass should be low-risk and mostly presentational:

- Replace the CRM parent group with top-level `Requests`.
- Add top-level `Directory`.
- Move Clients into Directory, either as `/directory/clients` or an initial `/directory` view with Client records first.
- Keep Quotes, Projects, Billing, Analytics, and Settings top-level.
- Remove Activity from the sidebar after embedded timelines are confirmed in Requests and Clients/Directory.
- Hide or demote Procurement and Field Ops from sidebar and expose them later from Project records.
- Update quick-create actions from `Lead` to `Request`, and from `Client` to a Directory client creation flow.

## 6. Proposed Database And Domain Model Changes

Preferred near-term model direction:

- Create a new `Request` model instead of renaming `Lead` in place immediately.
- Keep the current `Lead` model during transition and map/migrate it deliberately.
- Add optional relations from Request to `Client`, `ClientContact`, and `ClientSite`.
- Add future relations from Request to Quote and Project after quote/project models become real.
- Use `LocalUser` for assignment.
- Generalize `LeadTask` into a polymorphic `Task` or `FollowUp` model tied to Request, Quote, Project, Client, Contact, Site, or other records.
- Generalize record-local `LeadActivity` and `ClientActivity` into the existing global `Activity` model over time, or keep local tables only as compatibility history.

Recommended Request fields:

- `requestNumber`
- `name`
- `requestType`
- `clientId`, plus raw `companyName` for unknown/new prospects
- `contactId`, plus raw contact fields where needed
- `siteId`, plus raw site fields where needed
- `source`
- `serviceCategory`
- `status`
- `priority`
- `assignedUserId`
- `receivedAt`
- `dueAt`
- `nextFollowUpAt`
- `missingInformation`
- `siteVisitNeeded`
- `filesReceived`
- `notes`
- `relatedQuoteId`
- `relatedProjectId`
- `archivedAt`
- `lastActivityAt`
- timestamps

Recommended Request statuses:

- New
- Assigned
- Waiting on Client
- Missing Info
- Site Visit Needed
- Site Visit Scheduled
- In Review
- Ready for Quote
- Converted to Quote
- No Bid
- Cancelled
- Closed

Do not put expected value on Request. Quote pricing, BOM, labor, margin, sell price, and proposal amounts belong in Quotes.

Directory model direction:

- Keep and extend `Client`, `ClientContact`, and `ClientSite`.
- Add directory record types for Vendor, Supplier, Subcontractor, Manufacturer, and Partner/Rep Contact.
- Decide whether Vendor/Supplier/Subcontractor/Manufacturer are separate models or a shared `Organization` model with typed relationships after first Directory UX is clearer.

## 7. Proposed Migration Path From Leads/CRM To Requests/Directory

Recommended sequence:

1. Add navigation aliases first: `Requests` points to current Leads module with user-facing labels changed where safe.
2. Remove/hide expected value from request capture and list views while keeping `Lead.estimatedValue` in the database for compatibility.
3. Introduce Request-oriented status/source/service category labels in TypeScript and validation.
4. Add a real `Request` Prisma model and `/api/requests` route handlers.
5. Write a one-time migration or seed bridge from existing `Lead` rows into `Request` rows.
6. Keep `/leads` as a redirect or read-only legacy compatibility route until users stop relying on it.
7. Build `/directory` around current Clients, Contacts, and Sites.
8. Later connect Requests to Quotes with an actual quote creation flow instead of conversion placeholders.

Decision still needed:

- If current Lead data is disposable local seed data, a new `Request` model is cleaner.
- If current Lead data must be preserved as production-like history, keep Lead and Request side-by-side until migration scripts and redirects are tested.

## 8. Risks And Refactoring Areas

Key risks:

- The current Leads module is already database-connected, so a careless rename could break working APIs, validations, seed data, and activity history.
- Current request-like work still includes `estimatedValue`, qualification budget fields, and proposal/estimating statuses that conflict with the new Request definition.
- `LeadTask` is too narrow for the desired cross-object follow-up model.
- `Activity` is polymorphic by string fields, which is flexible but easy to misuse without constants and conventions.
- Quotes and Projects currently look real in the UI but are mostly starter-data workspaces.
- Existing `Opportunity` and `Quote` Prisma models are skeletal and not enough for R2 quote work.
- Directory may become too client-centric unless vendor/supplier/subcontractor/manufacturer/rep records are planned early.
- Role permissions are currently CRM-oriented (`crm:read`, `crm:write`) and should become module-aware as Requests, Directory, Quotes, and Projects mature.
- There are many uncommitted existing changes in the worktree, so implementation should stay tightly scoped and avoid broad formatting churn.

## 9. Recommended First Implementation Step

Start with a small, reversible navigation and terminology slice:

1. Update `PulseShell` navigation to show `Requests` and `Directory` using existing routes/components.
2. Point `Requests` to the current database-backed Leads module temporarily.
3. Point `Directory` to the current database-backed Clients module temporarily.
4. Update visible labels and quick-create text, but keep API routes and Prisma models unchanged in this first pass.
5. After that works, create the real `Request` model and `/api/requests` route family.

This gives users the correct product mental model before the deeper database migration, while preserving the working Leads and Clients implementations.

## Research Notes

The sandbox runner failed with `windows sandbox: timed out after 15000ms connecting runner pipe-in`, so repository inspection used targeted non-sandbox reads consistent with `docs/sandbox-command-guidelines.md`. No app code was changed as part of this research note.

## Implementation Update - 2026-05-11

The first cautious navigation and UI passes have been followed by a clean development migration from Leads to Requests.

- `apps/web/prisma/schema.prisma` now has a first-class `Request` model and Request-local activity/task/note/attachment models.
- The old Prisma Lead models and `/api/leads` route family were removed.
- `/api/requests` is the active Request API family.
- `/requests` renders the Request module and no longer calls the old Lead service.
- Activity records use `relatedEntityType: "Request"` for Request timelines.
- Seed data now creates `RQ-2026-*` Request records instead of `LD-*` Lead records.
- The local development database was intentionally pushed with accepted data loss to drop old Lead tables.

The remaining planned direction still applies: Directory should mature beyond Clients, permissions should move away from `crm:*`, and Request-to-Quote handoff should grow into a real Quote Workspace rather than doing quote financial work inside Requests.

## Request Intake Checklist Update - 2026-05-11

Requests have been refined into a short intake gate for quote readiness.

- Active lifecycle: `Received`, `Reviewing`, `Missing Info`, `Site Visit Required`, `Ready for Quote`, `Converted to Quote`, `No Bid`, `Cancelled`, and `Duplicate`.
- Checklist templates are database-backed and seeded for General, Fiber, Access Control, CCTV / Surveillance, and Structured Cabling intake.
- Each Request stores its own checklist item copies so progress is stable even if templates change later.
- Readiness for Quote is service-computed from required applicable checklist items plus owner, service category, client/company/contact context, and site visit completion when required.
- The Requests page now surfaces lifecycle bottlenecks, checklist progress, missing required items, and grouped intake checklist details.

Future architecture work should add Settings screens for Request Types and Intake Checklist Templates, then connect checklist requirements to richer Directory and file/drawing records.
