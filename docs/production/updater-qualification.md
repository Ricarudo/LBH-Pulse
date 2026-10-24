# Managed updater qualification

The management service owns Docker administration. The application receives only
an authenticated, fixed-operation API. Do not expose updater port 9050 publicly,
mount the Docker socket in the API/web/status containers, or enroll Pulse
containers in external automatic container updaters.

## Reproducible source checks

```sh
docker compose -f services/updater/compose.test.yaml run --rm unit
docker compose -f services/updater/compose.test.yaml build image checks
docker compose -f services/updater/compose.test.yaml run --rm checks
docker compose -f services/updater/compose.test.yaml run --rm config
docker compose -f services/updater/compose.test.yaml run --rm config --test services/updater/test/publishing.test.mts
docker compose -f services/updater/compose.gateway-test.yaml run --rm tests
docker compose -f services/updater/compose.operations-test.yaml build maintenance-image minio-init-image
docker compose -f services/updater/compose.operations-test.yaml run --rm tests
```

The unit suite verifies signatures, bundle identity, upgrade boundaries,
idempotency and the migration/recovery state machine with injected failures.
The check image isolates dependency installation and generated artifacts from
the developer's worktree and running database.
The gateway test verifies actual Caddy routing with an unprivileged status
service. The operations test runs the updater's encrypted backup and isolated
PostgreSQL/MinIO restore, verifies referenced document contents and financial
record preservation, and rejects changed history and tampered archives. It uses
only generated disposable database volumes. Remove test resources with
`docker compose -f services/updater/compose.gateway-test.yaml down -v` and the
equivalent command for `compose.operations-test.yaml`.

For development on an ARM Docker host, `PULSE_TEST_PLATFORM=linux/arm64` can be
set for the operations test build/run. This overrides platform selection only
inside the test harness; it does not qualify or enable ARM production support.

## Release acceptance evidence

Qualify the exact commit and signed images on both Linux amd64 Docker Engine and
an amd64 Windows Docker Desktop host using Linux containers. Use disposable,
uniquely named projects and generated fixture credentials, never production.
Record Docker/Compose versions, release/image digests and these outcomes:

1. New local-only installation, internal CA export, browser administrator setup,
   token retirement, recovery-key export and escrow confirmation.
2. Completed installer 0.1.2 adoption with unchanged volume IDs, secrets,
   certificates, URLs and representative historical records/documents.
3. Successful update from each declared source ledger. Add files immediately
   before maintenance; verify the restored database references exactly the
   corresponding MinIO objects. Compare historical quotes, revisions, projects,
   financial records and document digests before/after.
4. Simultaneous administrators, repeated request keys and browser refresh/closure:
   one job, one migration execution, persistent progress.
5. Unreachable GitHub/registry, altered signature/bundle/image, insufficient disk,
   missing recovery key and unsupported architecture/source ledger: no migration.
6. Kill the worker or restart Docker at every persisted stage. Before migration,
   verify prior deployment restoration; afterward verify maintenance remains
   closed and no migration repeats.
7. Fail backup, object restore, migration, readiness and updater handoff. Exercise
   preview → isolated restore → explicit cutover. Confirm original failed volumes
   remain intact and recovered object/record fingerprints match the backup.
8. Upgrade the updater image itself. Confirm the detached worker survives,
   authenticates with preserved credentials and publishes the terminal result.
9. Verify public access exposes only Caddy; status credentials cannot control
   updates or read unrelated jobs. Test non-admin apply and CSRF denial. Inspect
   logs, HTTP responses and archives for unintended secret exposure.
10. Reboot during initialization and after browser setup; recover initialization
    without regenerating credentials and verify setup cannot reopen.

Do not mark `PULSE_DOCKER_QUALIFIED_COMMIT` until both host reports pass. Windows
Docker Desktop qualification requires a real Linux-container-enabled host; an
ordinary Windows CI runner is not equivalent. Existing 0.1 release artifacts
remain historical recovery tools, not an alternate updater for managed installs.
