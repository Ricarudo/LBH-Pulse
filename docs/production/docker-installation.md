# Install and update Pulse with Docker

Pulse's managed deployment uses Linux containers on an amd64 Linux Docker Engine
host or Windows Docker Desktop in Linux-container mode. Docker and Compose are
prerequisites. Pulse does not install or update Docker itself. Windows Server,
ARM, automatic installation of releases, and native Unraid templates are outside
this release's support matrix.

The Docker distribution replaces the Pulse `.exe`. Historical installer releases
remain available for historical recovery; do not rerun them against an adopted
installation. Development/source stacks must be migrated deliberately, not
automatically adopted.

## Fresh installation

1. Download and extract the versioned `pulse-docker-VERSION.tar.gz` from the
   official `Ricarudo/LBH-Pulse` GitHub release. The bundle's Compose file pins the
   bootstrap image by digest. Obtain this first trust anchor from the official
   publisher, not a third-party Compose template. The bootstrap image contains
   the public keys used to verify the detached manifest signature and bundle hash.
2. Create an existing, protected backup directory. Copy `.env.example` to `.env`.
   Set `PULSE_BACKUP_PATH` to its absolute path (on Windows use, for example,
   `D:/PulseBackups`). Leave `PULSE_PROJECT=pulse-production` for normal use.
3. Choose `PULSE_MODE=internal` for local-only HTTPS on port 8443. For LAN use
   `PULSE_MODE=lan` and a DNS hostname resolvable by client devices. For public
   HTTPS use `PULSE_MODE=public`, a public hostname and `PULSE_CADDY_EMAIL`.
4. From the extracted bundle, run the same commands in a Linux shell or PowerShell:

```text
docker compose run --rm updater init
docker compose run --rm updater setup-code
```

Initialization generates independent credentials and preserves them in private
Docker volumes. Do not copy an example environment over generated credentials.
The initializer starts the management and application services; closing the
bootstrap container does not stop them. Retrieve the setup code only in a private
terminal, then create the Administrator in the browser at the URL printed by
initialization. The manager removes the setup token after setup completes.

For internal HTTPS, initialization exports `pulse-root-ca.crt` to the backup
directory. Explicitly trust this certificate on authorized client devices.
No automated command changes the host certificate store.

Export the backup recovery key to a separate protected destination:

```text
docker compose run --rm -v /absolute/existing/escrow-directory:/export updater export-recovery-key
docker compose run --rm updater confirm-escrow --confirmed
```

Use a Windows path such as `D:/SeparateEscrow:/export` in PowerShell. Move the
exported key into your secret manager or offline escrow, separately from the
host and backups, before confirming. The key is never returned by the web API.
Without escrow confirmation the updater refuses installation of new releases.

## Existing Windows installer installation

Adoption requires a completed 0.1.2 installation and its original protected
configuration, installer state, image manifest, volumes and recovery identity.
Use the new bundle without executing another `.exe`. Mount the old installation
read-only and use the original backup destination in `.env`:

```text
docker compose run --rm -v C:/ProgramData/LBH/Pulse:/legacy:ro updater adopt
docker compose run --rm -v C:/ProgramData/LBH/Pulse:/legacy:ro updater adopt --apply
```

Preview displays only version, URL and volume identities. Adoption checks
container digests, migration history and storage ownership. It does not migrate
business data or accept arbitrary development volumes. The old unsigned
installation is trusted only through this explicit host-operator adoption;
subsequent downloaded releases require publisher signatures.

After adoption, export/confirm the existing recovery key and initiate the first
managed update from the bundle:

```text
docker compose run --rm updater update
```

The old 0.1.2 UI has no update screen, so this first transition needs that command.
Afterward use **Settings → Updates**. For 0.1.1, use `upgrade-legacy` in place of `adopt` in the two commands above.
After management adoption, export/confirm escrow and run
`docker compose run --rm updater upgrade-legacy --apply` again. This installs
the separately signed 0.1.2 compatibility release. Wait for success in `doctor`,
then run `update` to install the bundled 0.2 release. Adoption never skips the
0.1.2 migration boundary.

## Routine updates

Pulse checks the stable channel daily. Administrators can check immediately,
review release notes and select **Update Pulse → Back up and update**. Ask users
to save work first. Downloads happen before the maintenance window. The window
includes a full backup/restore verification, so its duration depends on database
and document size; it is not guaranteed to be a few seconds.

The updater blocks access, stops writers, captures an encrypted consistent
backup, restores into isolated volumes, validates data and objects, deploys
migrations, recreates containers, and checks readiness before reopening access.
Keep sufficient free space for images, staging, backups and restored copies.
Backups and failed volumes are retained; there is no automatic deletion policy.

Refreshes and browser closure do not cancel jobs. The read-only maintenance
endpoint keeps the initiating browser informed across API replacement. A Docker
restart retains maintenance state. An interrupted migration is never retried
automatically.

## Inspect and recover

From the deployment bundle:

```text
docker compose run --rm updater doctor
docker compose run --rm updater recover JOB_ID
docker compose run --rm updater recover JOB_ID --restore
docker compose run --rm updater recover JOB_ID --cutover
```

Use `run`, not `exec`: recovery must survive replacement of the manager itself.
Recovery is explicit. The first command previews; `--restore` decrypts the saved
backup and verifies it in new isolated volumes; `--cutover` stops writers, selects
the restored volumes, starts the prior application release and rechecks data
before opening access. Original failed volumes and backup archives are retained.
If recovery itself fails, keep maintenance enabled and retain all evidence.
If the preview reports that no migration started, use `recover JOB_ID --rollback`
to verify and restart the prior deployment. That command refuses to run after
migration intent has been recorded, even if the migration result is unknown.

The initial protocol permits additive schema changes while
requiring existing historical business records to remain unchanged. The updater
compares source-column hashes for quotes, revisions, documents, relationships and
financial records before reopening access. A release that intentionally rewrites
those records needs a separately qualified migration procedure.

Never run `docker compose down -v`, delete production volumes, or reset Prisma
to repair an update. Infrastructure major upgrades need their own reviewed
migration procedure. Keep an independently escrowed recovery key and copies of
the deployment bundle outside this machine.

## Publisher configuration and qualification

The source trust store is intentionally empty. A local development build cannot
install unsigned updates. Configure the release environment with:

- `PULSE_RELEASE_PUBLIC_KEYS`: JSON array of Ed25519 PEM public keys, exposed to
  image builds as a repository variable. Include old and new keys during rotation.
- `PULSE_RELEASE_SIGNING_KEY`: Ed25519 PEM private key in protected CI secrets.
- `PULSE_DOCKER_QUALIFIED_COMMIT`: the exact commit independently qualified on
  Linux and Windows Docker Desktop, in the protected release environment.

Never commit the private key. Key rotation first publishes a release trusting
both keys, then changes the signing key, then eventually removes the retired key.
All supported update paths must cross the trust-expansion release.

Publishing is blocked unless the signature key matches an embedded verification
key and the protected qualification commit matches the release commit. Source
unit tests alone do not qualify a release. See `updater-qualification.md` for the
required real-Docker and failure-injection evidence.
