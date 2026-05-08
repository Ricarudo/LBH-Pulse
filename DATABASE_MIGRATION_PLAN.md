# KuoteSuite Database Migration Plan

## Executive Summary

KuoteSuite currently runs its backend on Express routes that open MySQL connections directly and execute SQL from each route file. The safest migration path is to keep MySQL in place while introducing PostgreSQL and Prisma ORM as a parallel database layer. This lets the application continue running while one low-risk route is migrated and tested as a proof of concept.

Prisma is recommended over direct `pg` for the target architecture because the project needs stronger schema ownership, generated query APIs, safer parameterization, repeatable migrations, and a cleaner shared database layer. Direct `pg` would be smaller, but it would leave more room for the same raw SQL patterns that are currently creating risk.

This phase adds Prisma 6.19.3, an initial PostgreSQL Prisma schema, PostgreSQL Docker Compose service, and environment examples. It does not convert runtime routes yet; the active application database remains MySQL.

## Current MySQL Schema Summary

The current schema is defined in `database/sql-scripts/setup.sql`.

| Table | Purpose | Notable columns |
| --- | --- | --- |
| `Client` | Customer/company records | `client_id`, `companyName`, `comments` |
| `ClientSite` | Client locations/sites | `client_site_id`, `client_id`, `name`, `address`, `comments` |
| `PointOfContact` | Client contact people | `point_of_contact_id`, `client_id`, `name`, `email`, `phone`, `job_title` |
| `Supplier` | Supplier/vendor records | `supplier_id`, `name`, `email`, `phone`, `point_of_contact_id` |
| `Item` | Quoted catalog/material items | `item_id`, `name`, `partNumber`, `manufacturer`, `description` |
| `Lead` | Incoming quoting opportunities | `lead_id`, client/contact references, assigned employee, dates, project description |
| `Quote` | Quote/proposal headers | `quote_id`, `r2_id`, lead/client/contact references, dates, title, employee, proposal specifications |
| `BillOfMaterials_Entry` | Quote line items/BOM entries | `bill_of_materials_entry_id`, `quote_id`, `item_id`, quantity/cost fields |
| `MaterialCost` | Material-cost breakdowns | quote/BOM references, cost fields, supplier fields |
| `LaborCost` | Labor-cost breakdowns | quote/BOM references, worker/hour/cost fields |
| `Attachment` | Attachment metadata | `attachment_id`, `title`, `file`, `description` |
| `User` | Application user records | `user_id`, `name`, `email` |
| `State` | Status/state lookup table | `state_id`, `name` |

## Recommended PostgreSQL Schema Approach

The initial Prisma schema intentionally mirrors the current MySQL table names and column names using Prisma `@map` and `@@map`. This reduces frontend/API disruption and gives us a safe bridge while the app still runs against MySQL.

Recommended cleanup before a final PostgreSQL migration:

- Add explicit foreign keys after verifying existing data relationships.
- Convert date strings such as `dueDate`, `dateReceived`, and `dateCreated` into proper `DateTime` or `Date` fields.
- Convert `ClientSite.client_id` from text to integer.
- Convert `MaterialCost.supplier_id` from float to integer.
- Decide whether phone numbers should be text rather than integer.
- Fix the `MaterialCost.contigency` typo or map it intentionally if backwards compatibility is required.
- Add indexes for quote, lead, client, contact, and assigned-user lookups.
- Add created/updated timestamps for CRM auditability.

## Prisma vs Direct `pg`

| Option | Strengths | Weaknesses | Recommendation |
| --- | --- | --- | --- |
| Direct `pg` | Minimal dependency, familiar SQL, easy to introduce one query at a time | Still relies on hand-written SQL, easier to keep unsafe interpolation patterns, no built-in migration/schema model | Not preferred unless Prisma proves too heavy |
| Prisma ORM | Generated client, parameterized queries by default, schema file, migration workflow, easier future refactors | Requires schema discipline, some legacy column types need mapping/cleanup, Prisma 7 currently requires Node 20.19+ | Recommended with Prisma 6.19.3 for Node 18 compatibility |

## Migration Risks

- Current routes mix HTTP handling, validation, SQL construction, and response mapping in the same files.
- Several queries interpolate request params/body values directly into SQL strings.
- There are no declared foreign keys in the MySQL setup script.
- Several fields use loose types that should be cleaned before enforcing a relational PostgreSQL schema.
- Quote/BOM logic has existing bugs that should be fixed during route migration, not hidden by the database switch.
- MSAL authentication exists on the frontend/login side, but backend API routes are not currently protected by middleware.
- The current Docker backend command runs tests before start, which can make container startup fragile while database services initialize.

## Tables That Can Migrate Easily

- `Client`
- `Item`
- `Attachment`
- `State`
- `User`
- `Supplier`, after deciding whether `phone` should remain numeric

These tables have limited relationships and relatively simple fields.

## Tables That Need Cleanup

- `ClientSite`: `client_id` is text in MySQL even though related tables use integers.
- `PointOfContact`: should receive a foreign key to `Client`.
- `Lead`: should receive foreign keys to `State`, `Client`, `ClientSite`, `PointOfContact`, and `User`.
- `Quote`: should receive foreign keys and proper date types.
- `BillOfMaterials_Entry`: should receive foreign keys to `Quote` and `Item`.
- `MaterialCost`: has `supplier_id` as float and typo `contigency`.
- `LaborCost`: should receive foreign keys to `Quote` and BOM entries.

## Route Files That Use Raw SQL

The following route files call `connection.query` directly:

- `backend/routes/clients.js`
- `backend/routes/items.js`
- `backend/routes/leads.js`
- `backend/routes/quotes.js`
- `backend/routes/suppliers.js`
- `backend/routes/users.js`

`backend/routes/index.js` and `backend/routes/login.js` do not appear to be database CRUD route files.

## Security Improvements From Prisma

Prisma queries parameterize values by default, which directly reduces SQL injection risk compared with string interpolation. Moving database access into shared services will also make it easier to add authorization checks, consistent validation, consistent error handling, and database connection pooling in one place.

Prisma does not replace authentication or authorization. Backend API middleware is still required before local-network hosting is safe for company use.

## Docker Compose Changes Needed

This phase adds a PostgreSQL service beside the existing MySQL service:

- MySQL remains on port `3306` for current runtime routes.
- PostgreSQL is added on port `5432` for Prisma migration work.
- PostgreSQL data persists in a named Docker volume, `postgres-data`.
- The backend receives `DATABASE_URL` for Prisma, but existing routes still use the MySQL environment variables.

Future Docker cleanup should:

- Replace `links` with service networking.
- Add health checks for MySQL and PostgreSQL.
- Avoid running `npm test && npm start` as the backend container startup command.
- Add separate development and production compose files.
- Add a migration job/container once PostgreSQL becomes the primary database.

## Environment Variable Changes Needed

Existing MySQL variables should remain during migration:

```bash
DATABASE_HOST=localhost
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=testingpassword
MYSQL_DATABASE=KuoteSuite
MYSQL_PORT=3306
```

New PostgreSQL/Prisma variables:

```bash
DATABASE_URL=postgresql://kuotesuite:kuotesuite_dev_password@localhost:5432/kuotesuite?schema=public
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=kuotesuite
POSTGRES_PASSWORD=kuotesuite_dev_password
POSTGRES_DB=kuotesuite
```

Prisma commands load `DATABASE_URL` from `backend/.env` or the shell environment. Keep `backend/.env.example` as the template and do not commit real tenant secrets.

## Recommended Phased Migration

1. Keep the current app on MySQL and add Prisma/PostgreSQL scaffolding. This phase is now started.
2. Generate and validate the Prisma client from the mirrored schema.
3. Start PostgreSQL in Docker and create an initial migration or use `prisma db push` only for a local scratch database.
4. Create a shared Prisma client module under `backend/config` or `backend/services`.
5. Migrate `backend/routes/items.js` first as a proof of concept because it is small, low-relationship, and already exposes a complete CRUD shape.
6. Add focused API tests around the migrated `items` route.
7. Migrate `clients.js`, then `suppliers.js`, then `users.js`.
8. Migrate `leads.js` and `quotes.js` after relationships and date-field cleanup are decided.
9. Add backend authentication/authorization middleware before expanding CRM capabilities.
10. Plan a real data migration from MySQL exports into PostgreSQL after the route conversion pattern is proven.

## Phase 1 Verification Notes

- `npm run prisma:validate` passed when `DATABASE_URL` was provided in the shell environment.
- `npm run prisma:generate` generated Prisma Client v6.19.3 successfully.
- `docker compose -f docker-compose.dev.yml config` validated the compose file and reported the existing obsolete `version` warning.
- `docker compose -f docker-compose.dev.yml up -d postgres` pulled and started `postgres:16-alpine` successfully.
- No Express routes were switched from MySQL to Prisma in this phase.

## Immediate Fixes Before Broad Route Migration

- Add a shared database access module instead of route-level database connections.
- Replace interpolated SQL in MySQL routes while they still exist, especially reads/updates/deletes that include URL params.
- Decide canonical PostgreSQL column types before creating production migrations.
- Fix obvious quote/BOM bugs during route-specific migration:
  - Quote response mapping uses `projectSpecifications` while schema column is `proposalSpecifications`.
  - Quote response maps `lead_id` from `quote_id` in multiple places.
  - BOM create route should use `req.params.quote_id` or validate body consistency.
  - BOM update SQL has a trailing comma before `WHERE`.
