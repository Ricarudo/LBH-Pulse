# Pulse post-0.1 technical-debt register

## Recommended immediately after 0.1

| Priority | Item | Exit criteria |
| --- | --- | --- |
| P0 | Production data-stewardship review | Every completeness/anomaly/lifecycle/checklist preview is attached to a change ticket; deterministic changes are approved or explicitly deferred; integrity reports pass afterward. |
| P0 | Automated off-host backup operations | Scheduled encrypted backups, immutable retention, failure alerts, key escrow, and one signed restore drill per quarter. |
| P0 | Observability and security alerting | External readiness/HTTPS checks, auth-lockout alert thresholds, PostgreSQL/MinIO capacity, certificate expiry, backup age, and redacted centralized logs. |
| P1 | Secret-manager integration and rotation drills | Host environment files are generated just-in-time; DB/MinIO/session rotations have tested dual-control procedures and audit evidence. |
| P1 | Pin support images by digest | PostgreSQL, Caddy, MinIO, mc, and ClamAV compatibility-tested digests are recorded in release metadata and updated through dependency review. |
| P1 | Dependency vulnerability policy | Runtime dependency audit/SBOM/image scanning are mandatory, severity exceptions expire, and remediation SLAs are documented. |

## Pulse 0.2 priorities

1. Retire legacy request write/read adapters after usage telemetry proves no active consumer; migrate remaining deterministic rows without deletion, then remove tables in a later migration.
2. Retire `/clients/bulk/*` after a compatibility window and explicit consumer inventory.
3. Resolve the 29 coexisting legacy checklist rows through a signed data-stewardship decision; preserve the 13 conflicting completion histories in an explicit archival representation.
4. Introduce explicit imported-legacy completeness state and stewardship queues; consider database constraints only after exceptions reach zero.
5. Strengthen lifecycle transition invariants at write time and build a temporal reporting projection with explicit confidence/lineage.
6. Split large request/work/analytics/import services along transactional domain boundaries with unchanged API contracts.
7. Move the global stylesheet into scoped modules/design tokens, reduce existing `!important` usage, and add visual-regression coverage before cleanup.

## Long term

- External identity provider/MFA/SSO and emergency-access controls.
- High-availability PostgreSQL and S3-compatible object storage with tested failover.
- Formal retention/legal-hold and privacy-erasure orchestration across PostgreSQL, MinIO, backups, and audit records.
- Signed images, provenance attestations, SBOM distribution, and policy-enforced deployment admission.
