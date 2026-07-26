# Pulse 0.1 rollback guide

Rollback never deletes or overwrites the current PostgreSQL or MinIO volumes. Stop, preserve evidence, and choose the least destructive path.

## Initial-load rollback

The 0.1 release database is new; development/source volumes are never a rollback target.

- Before any import is accepted, stop the new stack and preserve its logs/import reports. With explicit change approval, abandon only the new release volumes and repeat clean initialization using different validated volume names. Never point production at the development database.
- After any import is accepted, treat the release volumes as production data. Create/retain the encrypted post-import archive and restore it into new volumes for rollback; do not reset the database or try to reverse individual CSV rows with ad-hoc SQL.
- A failed import transaction changes no selected row. Correct the source CSV, run a new preview, and retain both reports.
- If the accepted source contains quote BOM lines, revisions, or documents that the summary importer did not cover, stop release acceptance. This is an import-scope failure, not a reason to fabricate or discard records.

## Application-only rollback

Use this only when migration and reconciliation succeeded and the prior application has been tested against the forward-compatible 0.1 schema.

1. Record current image IDs, container status, health results, and non-sensitive logs.
2. Set `PULSE_RELEASE_TAG` to the last approved immutable tag; do not change secrets or volume names.
3. Re-render Compose and verify the referenced image IDs.
4. Redeploy API/web/gateway with `--no-build`, wait for readiness, then repeat login, document, quote-total, and revision checks.

```sh
docker compose --env-file .env.production -f compose.production.yaml \
  up -d --no-build --wait --wait-timeout 360 api web gateway
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs --since 15m api web gateway
```

Do not restore a compromised session secret or account password merely to make an old image work.

## Failed migration or uncertain data integrity

1. Keep API/web stopped and preserve the failed database, volumes, Prisma status, and logs.
2. Do not run `prisma migrate reset`, `prisma db push`, `db:setup`, a hand-written ledger update, a destructive down migration, or historical compatibility migrations.
3. Reproduce against a fresh isolated restore of the pre-release encrypted archive.
4. Prefer a reviewed forward repair when the migration transaction state and all data can be proven.
5. Otherwise validate the isolated restore completely, assign new production volume names/hostname routing through infrastructure change control, and cut over manually.
6. Retain failed and former volumes read-only until finance, revision, price-history, and document reconciliation is signed off.

## Repair rollback

Repairs require a pre-repair backup, preview report digest, actor, and change ticket. Exact lifecycle duplicates are not deleted; their disposition can be reversed only with a separate reviewed provenance change. Checklist adoption preserves every item and legacy table. If a known-anomaly repair proves wrong, stop writes and restore the pre-repair archive into new volumes; do not guess a reverse value.

## Recovery checklist

- [ ] Incident commander and data owner agree on application rollback versus isolated restore.
- [ ] Exact release/image IDs, migration ledger, archive checksum, and affected time window captured.
- [ ] No production volume was deleted, renamed, or reused as a restore target.
- [ ] Restored PostgreSQL role verification passed.
- [ ] Migration status and schema agreement passed.
- [ ] Quote totals/lines, revisions, item price history, lifecycle quality, PostgreSQL document metadata, and MinIO object size/hash passed.
- [ ] Authentication, CSRF, throttling, readiness, and document upload/download smoke passed.
- [ ] Manual DNS/load-balancer/volume cutover approved and recorded, if used.
- [ ] Former environment retained until business acceptance; recovery secrets returned to protected storage.
