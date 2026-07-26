# Pulse 0.1 operator release checklist

Release/change ticket: __________  Release tag: __________  Operator: __________  UTC start: __________

## Before the window

- [ ] Approved source revision and immutable image tag recorded.
- [ ] `.env.production` is ignored, mode `0600`, contains no placeholders, and came from the secret manager.
- [ ] Database admin, migration, runtime, MinIO root/application, session, and pepper values are all distinct.
- [ ] HTTPS hostname/DNS/firewall are ready; only gateway ports 80/443 are published.
- [ ] `verify:no-shipped-secrets`, production Compose policy, interpolation, image builds, and CI release gates passed.
- [ ] Backup destination and `age` recovery identity are accessible to the recovery operator.
- [ ] A new, independently generated 64+ character first-run setup code is protected and delivered out of band.
- [ ] Current development database is identified as read-only source evidence, not a release/cutover target.
- [ ] Accepted client, item, and quote source files have owners and SHA-256 values; unsupported quote BOM/revision/document data is explicitly resolved.
- [ ] Maintenance owner, communications, rollback decision point, and outage window are approved.

## Deployment

- [ ] Any development/source writes quiesced and a timestamped encrypted source archive captured before exports.
- [ ] New explicitly named PostgreSQL and MinIO release volumes confirmed empty and distinct from development/source volumes.
- [ ] Restricted roles previewed, approved, applied, and verified non-elevated.
- [ ] Clean `prisma migrate deploy` completed with the migration identity; reference-data bootstrap applied.
- [ ] Existing-database baseline adoption was not used for the standard clean release.
- [ ] No `db push`, reset, `db:setup`, legacy migration, synthetic-site, or unreviewed repair command ran.
- [ ] Browser displayed protected first-run setup and created exactly one active, non-demo Administrator.
- [ ] Setup code removed from the production environment/secret manager; redeploy completed; setup cannot reopen.
- [ ] Administrator created the required real user accounts; temporary user passwords require first-login replacement.
- [ ] MinIO bucket/application policy provisioned; runtime credentials are not root credentials.
- [ ] Production stack started with `--no-build --wait`; expected image IDs match ticket.
- [ ] Clients previewed/applied first, items second, and legacy quote summaries third; batch IDs and source digests recorded.

## Acceptance

- [ ] Gateway HTTPS, API live, and API readiness checks pass.
- [ ] PostgreSQL and MinIO have no public host ports; API/web have no bind mounts or development commands.
- [ ] Valid login works; invalid login is generic; throttling/lockout/cooldown and CSRF checks work.
- [ ] New-user forced password change and logout invalidation work.
- [ ] Client/request/quote creation rejects missing required site/contact/assignee relationships.
- [ ] Client/contact/site, item/price-history, and supported quote-summary counts and financial totals reconcile to accepted sources.
- [ ] No release claim includes BOM lines, revisions, or documents unless a separately reviewed importer and reconciliation covered them.
- [ ] First post-import encrypted PostgreSQL + MinIO backup restored into isolated volumes and revalidated.
- [ ] Data-quality, lifecycle, known-anomaly, and checklist reports were previewed only unless a separate approved digest was executed.
- [ ] Historical analytics identifies unreliable entities/periods rather than silently inventing status.
- [ ] Logs contain no passwords, environment secrets, cookies, session/CSRF tokens, or storage/database credentials.
- [ ] Operator acceptance and UTC completion recorded.

## Rollback decision

- [ ] If application-only failure: prior immutable image tested and redeployed without changing volumes.
- [ ] Before import acceptance: abandon only the new release volumes through an approved explicit action and recreate; development/source volumes remain untouched.
- [ ] After import acceptance or if integrity is uncertain: API stopped; no destructive down migration attempted; isolated post-import restore selected for manual cutover.
- [ ] Old volumes and pre-release archive retained until release acceptance period ends.
- [ ] Incident/change notes include exact commands, image IDs, migration state, checksums, and non-sensitive validation results.
