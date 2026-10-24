# Docker updater implementation status

The 0.2 updater is implemented in source. Production acceptance and publication
remain gated on the exact signed release's Linux/Windows qualification.

## Components

- `services/updater/src`: signature verification, constrained Compose rendering,
  initialization/adoption, durable jobs and locking, backup/restore, migration
  orchestration, detached updater replacement and explicit recovery.
- `docker/updater`: containerized operational CLI and management/status services.
- `scripts/release/create-deployment-bundle.mjs`: signed deployment metadata and
  standalone Docker distribution, including the legacy 0.1.2 compatibility path.
- `apps/api/src/controllers/updates.controller.ts`: permission-checked update
  endpoints using the existing global CSRF enforcement and audit trail.
- `apps/web/src/components/SettingsUpdatesSection.tsx`: administrator update
  discovery, confirmation, progress, release notes and history.
- Caddy and API maintenance gates remain closed on missing or invalid durable
  state. The unprivileged status service has no Docker socket or control route.

The detached worker holds the installation lock across manager replacement.
Migration intent is persisted before executing a migration; ambiguous outcomes
require recovery. Backups happen after writers stop and must pass an actual
isolated restore before migration. Recovery selects new volumes only after an
explicit operator cutover, preserving failed volumes. Existing source columns in
historical business tables are hashed before migration and compared afterward.

## Validation performed in the implementation workspace

- API, web and updater TypeScript checks.
- 28 signature, eligibility, idempotency and stage-failure/restart unit tests.
- Real Compose rendering for local, LAN, public, management and isolated restore
  topologies; publisher signing/verification with ephemeral fixture keys.
- Real Caddy/status routing, job credential scope and maintenance failure closure.
- Real encrypted PostgreSQL/MinIO backup and isolated restoration, referenced
  document checksum verification, historical financial-record verification,
  changed-record rejection and corrupted-archive rejection.
- Update API permission/transport tests, existing authentication/CSRF tests and
  historical release-manifest tests.

The storage test ran natively on an ARM Docker Desktop development host using
the test-only platform override and an existing cached MinIO provisioning image.
The amd64 maintenance image built successfully; the pinned amd64 MinIO client
pull failed with a registry `insufficient_scope` response. This is not amd64 or
Windows production qualification. No running user deployment was modified.

The existing production dependency audit currently fails with 13 findings
(4 moderate, 8 high, 1 critical). The dependency lockfile was not changed by this
feature. The existing audit gate remains mandatory; resolve and test those
dependency changes before publishing.

## Remaining release gates

Configure publisher public keys, the protected signing secret and qualification
commit as described in [Docker installation](docker-installation.md). The source
trust store is intentionally empty, and no unsigned-update bypass exists.

Run the complete [qualification matrix](updater-qualification.md) on Linux amd64
and Windows Docker Desktop, including real 0.1.1/0.1.2 adoption, host restart at
every stage, manager self-replacement, and recovery cutover. These require the
actual signed release images and disposable supported hosts. This implementation
does not claim those external acceptance tests have passed.

Workspace/package versions remain at the existing 0.1.2 baseline. The release
owner must complete the normal 0.2 version and migration metadata preparation
when the rest of that release is ready. The release workflow publishes Docker
assets after all gates pass and no longer builds a new Windows installer.
