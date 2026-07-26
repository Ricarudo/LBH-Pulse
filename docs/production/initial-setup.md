# Pulse 0.1 first-run setup and initial import

Pulse 0.1 is released into a newly initialized database. The current development database is not promoted, adopted, restored, or modified as part of the release. It may be retained read-only as source evidence while exports are reconciled.

The new database initially contains only the Prisma schema and reviewed Pulse reference data. It contains no customers, catalog items, quotes, documents, demo users, or default passwords.

## Operator preparation

Before the browser is opened, the operator must:

1. provision the PostgreSQL migration and restricted runtime roles;
2. deploy the Prisma migrations to the empty database;
3. apply the idempotent reference-data bootstrap;
4. provision the private MinIO bucket and application identity;
5. generate an independent `PULSE_SETUP_TOKEN` containing at least 64 random characters; and
6. start the immutable production stack.

The API permits an empty production database to start only when the setup token is present, the required reference data exists, and the runtime database identity is restricted. It otherwise fails closed. The setup token is not a user password.

## Browser setup

When no user and no completed first-run record exists, every Pulse page displays **Set up Pulse** instead of the login form.

The operator supplies:

- the one-time setup code from the protected release channel;
- the Administrator's real name and email; and
- a new Administrator password of at least 20 characters with upper-case, lower-case, and numeric characters.

The setup request is HTTPS-only in production, same-origin/CSRF-header protected, IP and token-identity rate limited, and uses a constant-time token comparison. Passwords and setup codes are never logged.

One serializable, advisory-locked transaction creates:

- the four built-in roles and their current permissions;
- the one initial, active, non-demo Administrator;
- default workspace settings;
- a completed `INTERACTIVE_ADMIN_SETUP` maintenance record; and
- a credential-free administrative activity record.

On commit, Pulse rotates into a normal authenticated session and opens **Settings → Users & access**. Concurrent or repeated setup requests are rejected. Deleting every user does not reopen setup; Administrator recovery must use the controlled maintenance process.

After successful setup, remove `PULSE_SETUP_TOKEN` from the production environment/secret manager and redeploy. Pulse continues to start because setup is already complete.

## Create users

The initial Administrator creates the real operational users before importing quotes. Each new user receives a generated or operator-supplied temporary password of at least 14 characters and must replace it at first sign-in. Role assignment, password reset, deactivation, and session revocation remain in **Settings → Users & access**.

Create every user whose email appears as a quote owner in the quote import file. The quote importer resolves only active Pulse users.

## Import order

Open **Settings → Import & export** and import in this order:

1. **Clients.** Download the exact template, upload the reviewed CSV, inspect every invalid/conflict row, then explicitly select and apply valid rows. Supplied real contacts and sites are created; blank site columns create no site. Pulse never creates a synthetic site during import.
2. **Items.** Import the reusable catalog. SKU, part number, or a fallback exact name provides idempotent matching. Each new item receives an initial price-history row; cost or sell-price updates append history.
3. **Quotes.** Import the legacy quote-summary CSV after clients and users exist. Each new row must resolve to an existing client and active owner. A supplied contact email must match a contact on that client. External quote number is the idempotent import key; a canonical `QMYYNNNN` value is also preserved as the Pulse quote number and advances the current-year sequence.

Every importer:

- accepts only its exact UTF-8 CSV contract;
- limits files to 5 MB and 2,000 rows;
- defaults to a read-only preview;
- displays new, changed, unchanged, conflict, and invalid rows;
- requires an explicit row selection and confirmation;
- re-previews the digest and optimistic timestamps before writing;
- applies the selected batch atomically; and
- records the batch identifier, file digest, selected row numbers, and actor without logging CSV content or credentials.

The local `client-list-cleaned.csv` preflight result for this release is 443 rows, 443 valid, zero invalid. It contains 241 rows with contact data and no site data, so its import proposes no synthetic or placeholder sites. The application Import page remains the authoritative final preview against the new database.

## Quote-import boundary

The Pulse 0.1 quote CSV imports legacy quote-level financial summaries and relationship/lifecycle snapshots. It does not import Pulse BOM line rows, quote-revision files, or document objects. Do not describe a summary-only import as preserving those records.

If the accepted release source includes BOM lines, historical revisions, or quote documents, release acceptance is blocked until a separately reviewed import bundle and reconciliation procedure covers them. Do not copy such data with ad-hoc SQL or silently discard it.

## Acceptance and first backup

After all approved imports:

1. record import batch IDs and file SHA-256 values;
2. reconcile source and Pulse counts for clients, contacts, sites, items, price history, quotes, and each supported financial total;
3. sample relationship resolution and verify every rejected row has an owner;
4. export each imported record type and compare it with the accepted source;
5. create the first encrypted PostgreSQL and MinIO backup; and
6. restore that archive into new isolated volumes and repeat the reconciliation.

The initial load is not accepted until preview exceptions are resolved or explicitly signed off and the post-import restore drill passes.

## Rollback

Before an import is accepted, the new release environment may be abandoned and recreated from new explicitly named volumes; never repurpose or delete the current development volumes. After any accepted data exists, rollback uses the last encrypted post-import backup restored into new volumes. Never use `db:setup`, `prisma db push`, `prisma migrate reset`, a historical migration replay, or an unreviewed data rewrite.
