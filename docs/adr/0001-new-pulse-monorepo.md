# ADR 0001: Create A New Pulse Monorepo Beside The KuoteSuite Prototype

Date: 2026-05-09

Status: Accepted

## Context

The current repository contains an inherited KuoteSuite prototype built with Angular 12, Express, PostgreSQL, and Prisma. Recent stabilization work moved the backend to a PostgreSQL/Prisma runtime and removed active Azure/MSAL requirements from local development.

The product vision has expanded beyond quote generation. Pulse is intended to become a centralized internal operations platform for R2 Communications, supporting the lifecycle from lead capture through opportunities, quotes, proposals, approvals, projects, procurement, field work, job costing, billing, service, maintenance, and analytics.

The current prototype contains useful workflow and domain references, but its frontend framework, route structure, quote model, auth approach, and PDF generation approach are not a strong final foundation for Pulse.

## Decision

Create a new Pulse monorepo scaffold beside the existing KuoteSuite prototype.

The new structure will use:

- `apps/web` for the future Next.js frontend.
- `apps/api` for the future NestJS backend API.
- `apps/worker` for future background jobs.
- `packages/ui` for shared UI primitives.
- `packages/database` for database client helpers and migrations-facing utilities.
- `packages/types` for shared TypeScript contracts.
- `packages/config` for shared configuration.
- `packages/pdf` for proposal/PDF rendering helpers.
- `prisma` for the future Pulse domain schema.
- `docs` for transition plans, ADRs, and architecture notes.

The existing `gui/` and `backend/` folders will remain untouched during the initial scaffold. They are treated as a legacy prototype and reference implementation, not the final architecture.

## Consequences

Positive consequences:

- Pulse can adopt a modern TypeScript architecture without forcing risky in-place Angular 12 modernization.
- The old prototype remains available while the new platform is built.
- Domain concepts can be redesigned around Pulse instead of copied from the inherited schema.
- Quote line items can be modeled as unified material/labor rows from the start.
- Backend auth, RBAC, OpenAPI docs, audit logs, and PDF generation can be designed cleanly.

Tradeoffs:

- Two application structures will exist in the repository during transition.
- The team must be clear about which app is prototype reference and which app is the Pulse target.
- Data migration will need a later, explicit plan.
- Build tooling and Docker Compose will need follow-up work after the scaffold.

## Alternatives Considered

### Modernize The Existing Angular App In Place

This would keep all work in the current `gui/` and `backend/` folders.

Rejected because Angular 12, legacy PDF dependencies, frontend-only auth, and the current quote structure would continue to shape the product too strongly.

### Hybrid Bridge Without A New Monorepo

This would gradually add modern modules around the current app without a clean target structure.

Rejected as the primary direction because it risks producing a mixed architecture that is harder to reason about than either the prototype or a clean Pulse foundation.

### New Monorepo Beside The Prototype

Accepted because it gives Pulse a clean architecture while preserving the existing working prototype for reference.

## Guardrails

- Do not delete or move legacy prototype folders during scaffold setup.
- Do not copy the split BOM/material/labor quote design into the final Pulse quote model.
- Keep local development auth separate from future Microsoft Entra ID integration.
- Prefer backend-enforced permissions over frontend-only role checks.
- Keep the first implementation phase focused on CRM, quoting, proposal proof of concept, and project creation.

