# Pulse Transition Plan

Date: 2026-05-09

Status: Historical transition scaffold, superseded by active Pulse implementation

## 2026-05-14 Angular Removal Update

The initial preserve-beside-it phase has ended for the Angular frontend. The old `gui/` Angular application has been removed from the active repository structure, and useful business concepts from that prototype were preserved in `docs/architecture/LEGACY_KUOTESUITE_REFERENCE.md`.

Going forward:

- `apps/web` is the active Pulse application.
- Angular dependencies, routing, Material UI, and build patterns should not be reintroduced.
- `backend/` remains compatibility/reference code until its remaining useful logic is migrated or retired.
- Quote, proposal, pricing, and workflow ideas from the prototype should be treated as documented reference, not implementation shape.

## Purpose

This document defines the first transition step from the current KuoteSuite prototype toward Pulse, the broader internal operations platform for R2 Communications.

This was intentionally not started as a rewrite of the existing application. The original Angular and Express application was first kept in place as a working prototype and reference source while the new Pulse architecture was introduced beside it. As of 2026-05-14, the Angular app has been removed after preserving useful domain concepts.

## Original Starting Point

The repository currently contains:

- `gui/`: removed Angular 12 frontend for the inherited KuoteSuite prototype.
- `backend/`: Express REST API using Prisma and PostgreSQL.
- `backend/prisma/`: Current compatibility Prisma schema and seed data.
- `docker-compose.dev.yml`: Local development stack with PostgreSQL.
- Checkpoint and assessment documents under `docs/` describing the latest stabilized state.

The latest checkpoint states that:

- PostgreSQL is now the active database runtime.
- Prisma is the backend data access path.
- Active Azure/MSAL startup requirements have been removed for local development.
- Local development login is frontend-only.
- Backend routes are not protected yet.
- Angular UI modernization had started, but that path has been retired.

## Transition Principle

Preserve first, build beside it, migrate deliberately.

The existing KuoteSuite folders were not deleted, moved, or heavily reshaped during the initial Pulse setup. They provided useful reference for:

- lead creation and assignment
- lead-to-quote conversion
- customers, sites, and contacts
- quote status workflows
- quote numbering ideas
- estimating and cost calculation concepts
- early proposal/PDF experiments

They should not define the final Pulse architecture.

## Target Direction

Pulse should become a modular monorepo with:

- Next.js + React + TypeScript frontend
- NestJS + TypeScript backend API
- PostgreSQL database
- Prisma ORM
- background worker for PDFs, reminders, reporting, and sync jobs
- shared packages for UI, types, configuration, database access, and PDF rendering
- server-side proposal PDF generation
- local development login first
- future Microsoft Entra ID integration
- backend-enforced RBAC
- audit logs and activity timelines
- OpenAPI documentation

## Initial Scaffold

The initial scaffold introduces these top-level folders:

```text
apps/
  web/
  api/
  worker/

packages/
  ui/
  database/
  types/
  config/
  pdf/

prisma/

docs/
  adr/
  architecture/
  checkpoints/
  reports/
```

At this stage, these folders contain placeholder README files only. No business features are implemented in this step.

## Legacy Prototype Boundary

The following folders were preserved during the initial scaffold step:

- `gui/` (removed on 2026-05-14 after reference preservation)
- `backend/`
- `database-azure-backup/`
- `dev-tools/`
- `proxy/`

The Angular `gui/` folder was removed on 2026-05-14 after useful workflow concepts were documented in `docs/architecture/LEGACY_KUOTESUITE_REFERENCE.md`. `backend/` remains compatibility/reference code.

## First Pulse Domain Priorities

The first implementation phase should focus on the smallest useful operations core:

- local/dev login
- central hub shell
- customers
- contacts
- sites
- leads
- opportunities
- quotes
- unified quote line items
- proposal PDF proof of concept
- approved proposal to project creation
- activity timeline
- basic roles and permissions
- audit logs

## Current Product Scope Adjustment

The current Pulse starter navigation treats these areas as top-level modules:

- Hub
- CRM
- Quotes
- Projects
- Procurement
- Field Ops
- Billing
- Analytics
- Settings

Proposal outputs are no longer a top-level module. They are managed as a subcategory of Quotes because a quote should produce the client-ready proposal document.

Job Costing is no longer a top-level module. It is managed as a subcategory of Projects because costing should be tied to project execution, labor, procurement, and closeout.

Service is out of scope for the current starter app. It can be revisited after the core Lead -> Quote -> Project -> Procurement -> Field Ops -> Billing path is stable.

## Quote Model Direction

Pulse should not carry forward the current split between unrelated BOM, material cost, and labor cost tables as the final quote design.

The new quote model should use a unified `QuoteLineItem` concept where one line can contain:

- item image
- item name
- description
- quantity
- material unit cost
- material subtotal
- labor hours
- labor rate
- labor subtotal
- line total

A line item may be material and labor, material only, or labor only.

## Proposal Direction

Proposal generation should move out of the browser and into a server-side PDF workflow.

The first proof of concept should generate a branded R2 Communications proposal containing:

- R2 Communications branding
- "Prepared with Pulse" or similar
- proposal number
- date issued
- valid-until date
- prepared for / prepared by
- customer and contact information
- executive summary
- project snapshot
- itemized quote table
- pricing summary
- scope of work / inclusions
- approval section
- R2 footer contact information

## Near-Term Engineering Sequence

1. Preserve checkpoint and assessment documents.
2. Add this transition plan and ADR.
3. Add the monorepo scaffold with placeholder READMEs.
4. Add root workspace/package tooling in a later step.
5. Define shared TypeScript domain types.
6. Create the first Prisma schema for the Pulse domain.
7. Scaffold the NestJS API.
8. Scaffold the Next.js frontend.
9. Add local development auth.
10. Add Customer, Contact, and Site CRUD.
11. Add Opportunity, Quote, and QuoteLineItem models.
12. Add proposal PDF proof of concept.

## Non-Goals For This Step

- Do not implement business features.
- Do not migrate data.
- Do not delete legacy files.
- Do not remove `backend/` until its remaining useful logic has been migrated or explicitly retired.
- Do not introduce production authentication yet.
- Do not replace Docker Compose yet.

## Open Decisions

- Package manager and workspace tooling.
- Exact Next.js and NestJS versions.
- Prisma schema ownership between `/prisma` and `packages/database`.
- PDF rendering library.
- Background job backend.
- Local file storage versus Azure Blob for generated documents.
- Future accounting integration target.
