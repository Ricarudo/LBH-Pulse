# Pulse 0.1 production-readiness implementation plan

This plan is the release boundary for Pulse 0.1. It deliberately excludes broad UI, CSS, and service-layer rewrites. Production data changes are never coupled to schema deployment, default to preview, and require a reviewed report plus an explicit execution flag.

## Required for 0.1

| Phase | Risk | Data impact | Deployment impact | Required validation | Rollback |
| --- | --- | --- | --- | --- | --- |
| 1. Credentials, authentication, sessions | High | Clean first-run creates exactly one Administrator; recovery rotation revokes affected sessions | One-time protected setup mode, secure cookies, CSRF, exact proxy trust, persistent login/setup throttling | First-run closure/concurrency tests; authentication tests; unsafe-secret startup tests; reverse-proxy smoke test | Before data acceptance recreate only the new release environment; afterward use audited Administrator recovery and never restore a compromised password. |
| 2. Production runtime | High | None | Immutable production targets, production servers, health checks, internal data services, named volumes, gateway-only ports | Build API/web/gateway/support images; render and statically inspect Compose; live/readiness checks | Redeploy the prior immutable release tag. Do not remove persistent volumes. |
| 3. Restricted PostgreSQL access | High | Role and grant metadata only | Admin, migration, and runtime credentials become separate | Idempotent role preview/apply; verify runtime role flags, ownership, schema and table grants | Restore previous grants from an operator-reviewed SQL record; keep the runtime role non-elevated. |
| 4. Backup and recovery | High | Read-only backup; restore targets new isolated volumes | Adds encrypted PostgreSQL/MinIO/config backup and isolated restore workflow | Archive checksum, manifest verification, restored migration deployment, deep data/document reconciliation | Delete only operator-confirmed restore-only resources after validation; production remains untouched until a manual cutover. |
| 5. Prisma baseline | High | Clean release creates schema/ledger; enterprise migration adds security metadata | New release installations deploy normally; legacy adoption remains a recovery test only; `db push` is forbidden | Empty deployment, reference data, representative recovery adoption, and post-migration drift check | Stop deployment on failure. Recreate only an unaccepted new environment or restore accepted data into new volumes. Never replay legacy migrations. |
| 6. Completeness audits and known repairs | High | Preview is read-only. Any approved repair is targeted, idempotent, and provenance-recorded | No synthetic site dependency; new interactive records require site/contact/assignee | Entity-level reports with proposal/confidence/review flags; repeated preview; post-apply reconciliation | Restore only from the pre-repair backup if an approved repair proves incorrect; retain report and change ticket. |
| 7. Lifecycle ledger and analytics | High | Exact duplicates may be marked superseded, not deleted; ambiguous history remains intact | Analytics uses validated canonical events and exposes unreliable intervals | Broken-chain, duplicate, tie, superseded-event, and current-status-disagreement tests; preview digest; repeated apply no-op | Clear only the disposition created by the reviewed maintenance run, or restore from backup; do not fabricate events. |
| 8. Compatibility and import path | Medium | Deterministic checklist adoption re-parents records without deleting legacy rows; selected CSV batches create reviewed clients/items/quote summaries | `RequestUpdate` and `/importers/*` are canonical; client legacy endpoints delegate; Import page enforces dependency order | Compatibility adapter tests; item/client CSV tests; real client-file preflight; checklist preview before apply; API contract tests | Retain legacy tables/read adapters; abandon an unaccepted batch only by recreating the new environment or restore the accepted post-import backup. |
| 9. Risk-reducing cleanup | Low | None | Sensitive CSV excluded from Git/build/config backups; one proven-unused CSS selector removed | Git-ignore/build-context checks; repository search; image inspection | Restore the selector from version control if visual regression is found. Local CSV disposition remains an operator action. |
| 10. Release validation and operations | High | Integration data is isolated | CI gates production builds, migration paths, restricted role, backup/restore, smoke tests, and reconciliations | Every release gate in the readiness report must pass; operator acceptance on a restored copy | Abort release or redeploy the last approved immutable tag. No partial readiness claim. |

## Recommended immediately after 0.1

- Run reviewed production previews for data completeness, known anomalies, lifecycle disposition, and legacy checklist adoption; execute only deterministic, approved changes.
- Add off-host scheduled backup automation and quarterly documented restore drills with operator sign-off.
- Put runtime, migration, MinIO, and encryption identities into the organization secret manager and implement dual-key rotation procedures.
- Replace moving support-image tags with digest-pinned images after the first release compatibility bake.
- Add an external availability check and alerting for gateway, API readiness, PostgreSQL capacity, MinIO capacity, certificate expiry, and authentication lockouts.

## Long-term refactoring

- Split the large service modules along transactional domain boundaries.
- Replace the global stylesheet with scoped modules/design tokens and remove accumulated `!important` rules incrementally.
- Retire legacy request activities, tasks, notes, checklist tables, and client bulk routes only after telemetry and a compatibility release prove there are no consumers.
- Model imported-legacy completeness explicitly and, after data stewardship, consider stronger database constraints for site/contact/assignee.
- Introduce a purpose-built immutable lifecycle ledger with stronger transition invariants and a warehouse-quality temporal reporting model.
