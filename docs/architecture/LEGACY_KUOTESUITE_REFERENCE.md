# Legacy KuoteSuite Reference

Date: 2026-05-14

Status: Preserved reference after Angular framework removal

## Purpose

The old `gui/` Angular application has been removed from the active repository structure. This note preserves the useful business and workflow ideas found during the removal pass so Pulse can keep the domain learning without carrying Angular dependencies, routing, Material UI, browser PDF experiments, or old build tooling.

The compatibility Express backend in `backend/` still contains old KuoteSuite route and Prisma concepts. Treat that code as reference/compatibility while Pulse work continues in `apps/web`.

## Reviewed Legacy Sources

- `gui/src/app/_models/lead.ts`
- `gui/src/app/_models/quote.ts`
- `gui/src/app/_models/client.ts`
- `gui/src/app/_models/entry.ts`
- `gui/src/app/_models/item.ts`
- `gui/src/app/_services/httpRequest.service.ts`
- `gui/src/app/_services/costCalculator.service.ts`
- `gui/src/app/_components/lead-page/lead-page.ts`
- `gui/src/app/_components/lDashboard/lDashboard.ts`
- `gui/src/app/_components/quote-page/quote-page.ts`
- `gui/src/app/_components/qDashboard/qDashboard.ts`
- `gui/src/app/utils/pdf_generator.ts`

## Useful Concepts To Preserve

### Request / Lead Intake

The old Lead shape captured a work request title, project description, client, site, point of contact, assigned employee, received date, due date, state, and comments. Pulse Requests already cover this direction with stronger Request terminology, local users, checklist readiness, activity, and Directory links.

Preserve the operational idea that intake should tie together:

- company/client context
- site/location context
- point-of-contact context
- assigned owner
- received/due dates
- project/request description
- internal comments or notes

### Directory

The old `Client`, `ClientSite`, and `PointOfContact` concepts remain useful and map to Pulse Directory:

- `Client` -> `Client` / account organization
- `ClientSite` -> `ClientSite` / physical location
- `PointOfContact` -> `ClientContact`

The Angular forms allowed creating/editing client, site, and contact records from intake and quote screens. Pulse should keep that workflow goal, but implement it through modern Directory selectors and APIs rather than dialog-driven Angular components.

### Lead-To-Quote Handoff

The legacy lead page could create a quote from a qualified lead/request. It copied client, site, point-of-contact, assigned employee, description, dates, and comments into the quote shape.

Pulse should keep the handoff idea, with these changes:

- conversion should be transactional on the server
- Request should remain a Request and link to a Quote
- Quote should own pricing, line items, proposal content, approval state, and customer-facing totals
- conversion should write Activity events

### Quote Numbering

The old frontend generated quote numbers with a `QM` prefix, two-digit year, and a zero-padded internal ID, for example:

```text
QM260001
```

Pulse can use this as reference when finalizing quote numbering, but should generate numbers server-side to avoid collisions.

### Quote Workflow States

The old quote states were:

- Active
- Qualified
- Archived
- Won
- Lost
- Waiting Approval
- Approved
- On Revision

Pulse should not copy the numeric `state_id` pattern, but the approval and revision concepts are valuable for the future Quote Workspace.

### Quote Line / BOM Concepts

The old quote page grouped quote line input around:

- item
- item name
- quantity
- workers
- unit hours
- labor rate
- material cost
- contingency
- freight
- profit
- taxes
- supplier
- exit material cost
- unit labor cost

This supports the existing Pulse direction toward a unified `QuoteLineItem` where material and labor can live on the same line.

### Labor Cost Formula Ideas

The old cost calculator contained these default factors:

- FSE percent: `0.016`
- labor contingency percent: `0.1`
- payroll burden percent: `0.2`
- overhead/profit factor: `0.5`
- overhead expenses for COVID, vehicle, rent, FBI, lodging, and per diem

It also modeled administrative labor roles:

| Role | Percent | Rate |
| --- | ---: | ---: |
| Ops Supt | 0.10 | 1000 |
| Supt | 0.15 | 790 |
| Supv | 0.50 | 600 |
| Mktg | 0.05 | 500 |
| Runner | 0.05 | 400 |
| Admin | 0.10 | 500 |
| Whse | 0.05 | 400 |

The broad calculation flow was:

1. Calculate total unit hours from quantity, workers, and unit hours.
2. Calculate labor exit cost from total unit hours and rate.
3. Estimate project length from total hours and average worker count.
4. Add administrative cost based on project length.
5. Add payroll burden and labor contingency.
6. Add overhead expenses.
7. Apply overhead/profit and FSE factors.
8. Compute a labor ratio and allocate labor cost back to line items.

These numbers should be reviewed with R2 before becoming production defaults.

### Material Cost Formula Ideas

The old material defaults were:

- freight percent: `0.05`
- contingency percent: `0.1`
- tax percent: `0.115`
- profit divisor: `0.75`

The old material flow calculated material exit cost from quantity and material unit cost, then added freight, contingency, taxes, and profit markup. Preserve the concept, but implement it as auditable quote-pricing rules in Pulse.

### Proposal / PDF Field Ideas

The removed Angular code experimented with browser-generated PDFs using `jspdf`, `html2canvas`, and `pdf-lib`. Do not carry that implementation forward.

Useful proposal fields from the prototype:

- title
- date received
- due date
- client
- client site
- point of contact
- assigned employee
- project description
- comments
- proposal specifications

Pulse should continue toward server-side proposal/PDF generation.

## Concepts Not Preserved As Implementation

- Angular 12 framework code
- Angular routing and module structure
- Angular Material dialogs/tables
- frontend-only mutation flows
- `alert()`-based UX
- browser screenshot-to-PDF generation
- N+1 frontend lookups for client/site/contact names
- numeric `state_id` as the primary workflow representation
- frontend-generated quote numbers
