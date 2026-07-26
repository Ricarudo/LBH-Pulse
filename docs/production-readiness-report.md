# Pulse 0.1 production-readiness report

Date: 2026-07-22

Release candidate: `0.1.0`

Decision: **release candidate implementation validated; production GO remains blocked until the clean first-run import and post-import restore gates are completed**

## Executive assessment

The repository now contains a secure, repeatable clean-install deployment path with immutable API/web images, explicit environment validation, restricted PostgreSQL access, a protected browser-based first-run Administrator flow, preview-first client/item/quote imports, encrypted PostgreSQL/MinIO recovery, controlled Prisma history, lifecycle-safe analytics, compatibility adapters, CI release gates, and operator/rollback documentation.

No production row, schema object, credential, object-storage object, or live container was changed during this implementation. The existing development stack is not the release database and will not be upgraded or cut over. Production readiness must not be declared until an operator initializes new volumes, completes first-run setup, applies the accepted imports, reconciles them, and proves a restore of the resulting release data.

## Safety and preservation evidence

- `db:setup`, `prisma db push`, reset, and historical migration replay were not run against the existing database.
- No synthetic site was created. Placeholder-site creation remains behind a dedicated explicit write flag.
- No production repair or compatibility adoption was applied.
- The read-only legacy baseline preview found an exact catalog match with only the two explicitly allowed legacy objects, but this is recovery evidence only and is not a release deployment step.
- Preserved live counts were: Client 216, PointOfContact 263, ClientSite 13, Request 13, RequestUpdate 331, Quote 321, QuoteItem 231, QuoteRevision 74, Item 21, ItemPriceHistory 21, Project 4, Invoice 3, LifecycleDocument 2, and LifecycleStatusEvent 494.
- Deep live read-only reconciliation passed for all 321 quotes, 231 quote lines, 21 items, and two documents. Quote/line totals, revision history, item price history, PostgreSQL document metadata, MinIO object presence/size, and object SHA-256 had no reported failure.

## Security controls delivered

- Production cannot start with missing, weak, reused, or retired-pattern session/security secrets, insecure cookie/HTTPS settings, globally trusted forwarded headers, disabled login protection, elevated database credentials, active demo accounts, missing reference data, or unsafe setup/account state.
- A clean empty installation starts only with an independent 64+ character one-time setup code. The origin-protected, throttled browser flow creates exactly one Administrator plus built-in roles in a locked transaction, records credential-free provenance, issues a rotated session, and cannot reopen.
- Login protection persists pseudonymous username/IP buckets, uses generic failures and fake verification, enforces threshold/lockout/cooldown, and logs no credential, cookie, session, CSRF, or token value.
- Sessions are opaque, HMAC-digested database records with secure/HTTP-only/same-site cookies, idle and absolute expiry, login rotation, logout/revocation, and session-bound CSRF.
- Production seeding has no literal credentials and cannot create demo users without an explicit non-production flag and apply command.
- The destructive demo-reset command is blocked before Prisma runs unless development mode, both demo/destructive flags, an explicit deletion acknowledgement, and the exact target database name all match.
- Maintenance-only Administrator recovery/rotation and affected-account containment accept credentials only from protected files, revoke sessions, force password changes where applicable, and record credential-free provenance.
- Runtime dependency pins were upgraded to Prisma 7.9.0 and Next.js 16.2.11 with patched `fast-uri`, `postcss`, and `sharp` overrides. The release workflow blocks high-severity advisories; that online lookup must pass on the final release commit.

## Database and migration controls delivered

- `202607210001_pulse_0_1_baseline` is the authoritative clean-environment schema; pre-0.1 migration artifacts are retained outside the active Prisma migration directory.
- The standard release deploys migrations normally to a new empty database and then applies idempotent non-user reference data. Existing pre-baseline adoption is retained only for separately approved recovery/legacy use; the baseline SQL is never replayed there.
- `202607210002_enterprise_security` adds authentication, maintenance provenance, lifecycle disposition, and placeholder-site metadata, and conditionally removes only the obsolete request FK/index.
- The migrator owns the `pulse` schema. The runtime role owns no relations, cannot create databases/roles/schema objects, replicate, bypass RLS, or become superuser, and receives only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on application relations plus required sequence use.
- Isolated tests passed both clean migration deployment and representative pre-baseline adoption. The verifier compared its generated preservation digest before and after adoption and found no change; both migrations were recorded and both obsolete compatibility objects were removed.

## Non-release source observations

These read-only findings describe the current development database. They are not release cutover tasks. They matter only where that database is used to generate or validate an accepted import source.

- Completeness findings were reconfirmed read-only: 205 clients without sites, 316 quotes without sites, 310 quotes without assignees, one unresolved quote contact, one superseded current-step reference, and two sent-before-version anomalies.
- The targeted known-anomaly preview could not prove a safe replacement for any of the three known anomaly groups. No write is proposed without human evidence.
- Lifecycle preview: 494 events, 48 affected entities, 75 chain breaks, 73 legacy quote-chain breaks, six latest-event/current-status disagreements, zero payload-identical duplicates, and zero deterministic repairs. The two transition-identity collisions contain different value/provenance payloads and remain untouched.
- Checklist preview: 90 legacy null-instance rows. Sixty-one rows across five legacy-only requests have a deterministic no-delete adoption plan. Twenty-nine coexisting rows are deferred: 16 are payload-equivalent duplicates and 13 conflict with canonical completion state.

Historical analytics now uses only a validated chain, excludes reviewed dispositions, falls back to the current entity status where reconstruction is untrustworthy, and marks the entity/period unreliable instead of presenting timestamp/ID order as fact.

## Compatibility decision

- `RequestUpdate` is the only 0.1 request timeline read/write model. Legacy activity/task/note data is retained for historical compatibility; new legacy writes are disabled.
- Checklist instances are canonical. Legacy-only requests can be adopted without recreating/deleting items; ambiguous coexisting records remain preserved and excluded from automatic writes.
- `/importers/clients/*` is the canonical import implementation. `/clients/bulk/*` is a deprecated delegating adapter with equivalent behavior tests and deprecation headers, not a separate business-logic path.
- `/importers/items/*` and `/importers/legacy-quotes/*` use the same canonical preview/commit framework. The Import page presents clients → items → quote summaries in dependency order.
- The local 443-row client file passes the actual application validator with 443 valid rows and zero invalid rows; it includes 241 contact-bearing rows and no site-bearing rows.

## Release-gate results

The clean isolated release rehearsal completed on 2026-07-22:

| Gate | Result |
| --- | --- |
| Production Compose interpolation/policy | Passed; gateway-only ports, internal data networks, no bind mounts/dev commands, production targets, health/restart/read-only/capability controls |
| Shipped credential/session fallback/reset-guard scanner | Passed |
| Production dependency audit | Pending on the final hosted release job; the current environment denied the external advisory request, so this run does not claim an online audit result |
| Production images | API, web, gateway, MinIO initializer, ClamAV, maintenance, and network-isolated backup crypto built successfully |
| HTTP onboarding/security smoke | Passed through Next.js to NestJS: first-run setup closure, login/session/CSRF/logout, client/item/quote preview-commit-idempotency, and scanned document upload/download |
| Contract tests | 27 passed, 0 failed, 0 skipped |
| API tests | 127 passed, 0 failed, 0 skipped; isolated PostgreSQL integration tests executed |
| Web tests | 28 passed, 0 failed, 0 skipped |
| Type checks / responsive checks / builds | Passed |
| Clean Prisma deployment | Passed; both migrations applied |
| Representative baseline adoption | Passed with preserved digest and no historical replay |
| Restricted PostgreSQL role | Passed; no elevated flags/ownership/schema create; DML-only relation grants |
| Data reconciliation | Passed on the isolated onboarding fixture: 2 quotes, 3 quote lines, 28 items, and 1 document; totals, revisions, price history, metadata, object size, and SHA-256 agreed |
| Encrypted backup/restore | Passed into new PostgreSQL/MinIO volumes; archive/internal hashes, 53-byte test object, migrations, role checks, deep restored-object integrity, and the critical release-data fingerprint matched before backup and after restore |
| Shell syntax / patch whitespace | Passed |

## Manual gates before production GO

1. Approve the source revision, require the hosted CI job (including the online dependency audit) to pass that exact commit, and record the immutable release tag, new release-volume names, secret-manager values, accepted import sources, rollback owner, and acceptance window.
2. Preserve the development database/MinIO read-only if they are used as import evidence. Do not adopt, migrate, or cut those volumes over.
3. Preview/apply PostgreSQL migration/runtime role provisioning against the new empty release database; deploy migrations, apply reference data, and verify the runtime role from the production network.
4. Provision the private MinIO bucket-scoped application identity and verify the API does not use root credentials.
5. Start protected first-run mode, create the one initial Administrator in the browser, remove the one-time setup code, redeploy, and prove setup cannot reopen.
6. Create the real operational users whose emails are referenced by imported quotes. Verify temporary-password replacement and session revocation.
7. On the Import page, preview/review/apply clients, items, then quote summaries. Record source digests, batch IDs, counts, conflicts, deferrals, and operator approvals.
8. Reconcile every supported client/contact/site, item/price-history, quote relationship, and quote-level financial total. The known client file preflight is valid, but the authoritative preview must run against the new release database.
9. Determine whether the accepted quote source includes BOM lines, revision files, or documents. The current quote-summary importer does not preserve them; production GO is blocked until a reviewed import path exists if they are required.
10. Create the first encrypted release PostgreSQL/MinIO archive after import, restore it into new isolated volumes, and repeat integrity and application acceptance checks.
11. Complete HTTPS health, login, setup-closure, throttling, CSRF, logout, role, import, and document tests; inspect/remove only the exact stale one-off development container if still present.
12. Record image digests, import evidence, backup checksum, restore evidence, migration output, role verification, operator acceptance, and rollback decision in the release ticket.

## Rollback position

Before initial-load acceptance, the new release environment can be abandoned and recreated using new explicitly named volumes while preserving the development/source volumes. After accepted imports, application failure rolls back by redeploying the last approved immutable image; data uncertainty requires restoring the post-import encrypted archive into new volumes and validating it before manual cutover. Destructive down migrations and resets are prohibited. See [rollback.md](production/rollback.md) and [runbook.md](production/runbook.md).

## Accepted 0.1 limitations

- Ambiguous historical lifecycle chains and the two non-equivalent collision pairs remain preserved and flagged.
- Historical relationship gaps require human stewardship; 0.1 does not invent sites, contacts, or assignees.
- Twenty-nine coexisting legacy checklist rows remain archived in place pending review.
- Legacy tables and the deprecated client bulk route remain for one compatibility window.
- Large service modules/global CSS remain post-release refactoring work.
- High availability, SSO/MFA, centralized observability, scheduled immutable backups, and signed/SBOM-enforced deployment are post-0.1 controls.
- The 0.1 CSV quote path imports legacy quote summaries only; BOM lines, revision files, and document objects are outside that format.

## Final decision

The repository is a locally validated Pulse 0.1 release candidate for a clean installation. Production is **not yet GO** because the final hosted CI job, browser setup, real initial imports, source-to-Pulse reconciliation, post-import encrypted backup/restore, and operator acceptance remain outstanding. The current development database is not a release blocker unless it contains data that the approved import sources fail to represent.
