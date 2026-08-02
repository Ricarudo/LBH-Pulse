# Pulse 0.1 Windows installer

`Pulse-Setup-0.1.0.exe` is the normal installation path for a Windows operator. It installs the existing production Docker Compose deployment; it is not a desktop wrapper. The operator does not need the Pulse source, Git, Node.js, or npm.

## Prerequisites

- Windows 10 22H2 (build 19045) or newer, or Windows 11 23H2 or newer, on x64.
- Administrator access and PowerShell 5.1 or newer.
- A running Docker engine configured for Linux/amd64 containers and Docker Compose v2.
- At least 20 GB free on the ProgramData drive and internet access to `ghcr.io`.
- Local mode: ports 8080 and 8443 available. Public mode: ports 80 and 443 available, public DNS already pointing at the machine, and inbound firewall/NAT configured.

Docker Desktop is not installed by Pulse. Review the current [Docker Desktop Windows requirements](https://docs.docker.com/desktop/setup/install/windows-install/) and [Docker subscription terms](https://www.docker.com/legal/docker-subscription-service-agreement/) before organizational or commercial use. Docker Desktop is not supported on Windows Server; use a reviewed Linux server deployment for external or enterprise production.

The release process uses Inno Setup 6.7.3. Review [Inno Setup licensing](https://jrsoftware.org/isorder.php) before commercial distribution.

## Install

1. Download `Pulse-Setup-0.1.0.exe` and its `.sha256` file from the GitHub release, not the developer source archives.
2. Verify it in PowerShell:

   ```powershell
   (Get-FileHash .\Pulse-Setup-0.1.0.exe -Algorithm SHA256).Hash.ToLowerInvariant()
   Get-Content .\Pulse-Setup-0.1.0.exe.sha256
   Get-AuthenticodeSignature .\Pulse-Setup-0.1.0.exe
   ```

3. Start the installer as Administrator. Choose local-only HTTPS unless the machine already has a public hostname and ports 80/443.
4. Choose an encrypted-backup destination. Docker continues to manage the PostgreSQL and MinIO named volumes; this selection does not move live data.
5. In local mode, explicitly choose whether to trust the Pulse internal Caddy CA in `LocalMachine\Root`.
6. When Pulse opens, enter the one-time setup code shown on the final installer page, then create the Administrator in the browser.
7. Use **Pulse > Complete first-run setup** from the Start Menu. It verifies setup, removes the setup token and temporary code file, recreates the API, and reruns HTTPS health checks.

An unsigned release is identified prominently in its GitHub release notes. A checksum proves download integrity, not publisher identity; organizations should configure the repository signing secrets before distribution.

## Installed layout and data

```text
C:\ProgramData\LBH\Pulse\
├── config\       protected environment, recovery identity, local CA export
├── deployment\   versioned Compose files and release manifest
├── logs\         sanitized installer and service diagnostics
├── backups\      encrypted backup archives by default
└── installer\    management scripts and non-secret state.json
```

The environment and recovery files inherit no user ACLs; only local Administrators and SYSTEM receive access. `state.json` contains the installed version, commit, URL, mode, volume names, image digests, CA thumbprint, and timestamps—never passwords, tokens, database URLs, or private keys.

Docker named volumes hold live application data. The default names are `pulse-production-postgres`, `pulse-production-minio`, plus Compose-managed ClamAV and Caddy volumes. PostgreSQL, MinIO, and ClamAV are not published on host ports. Docker must start after a reboot for containers with `restart: unless-stopped` to return automatically.

Escrow a protected copy of `config\recovery\age-identity.txt` separately from the machine and its backups. Losing both the installed identity and escrow copy makes encrypted backups unrecoverable.

## Everyday operation

The Pulse Start Menu folder contains shortcuts to open, start, stop, health-check, finalize first-run setup, and write/view sanitized recent service logs. The underlying command is:

```powershell
& 'C:\ProgramData\LBH\Pulse\installer\manage-pulse.ps1' -Action Health
```

Every Docker action uses the same prefix:

```powershell
docker compose --project-name pulse-production `
  --env-file C:\ProgramData\LBH\Pulse\config\.env.production `
  -f C:\ProgramData\LBH\Pulse\deployment\compose.production.yaml `
  -f C:\ProgramData\LBH\Pulse\deployment\compose.maintenance.yaml `
  -f C:\ProgramData\LBH\Pulse\deployment\compose.release.yaml
```

The new-install sequence is `config --quiet`, digest-only `pull`, infrastructure `up`, database-role preview/apply, MinIO provisioning, migrations, reference data, role verification, full `up --no-build --wait`, and HTTPS readiness checks. It never runs `prisma migrate reset`, `prisma db push`, or `docker compose down -v`.

## Repair, backup, update, and restore

Rerunning the same installer detects protected state, preserves secrets and volumes, and performs a repair/start verification. It refuses to initialize a protected configuration or unmanaged Pulse volume without matching installer state.

Create and verify an encrypted backup:

```powershell
& 'C:\ProgramData\LBH\Pulse\installer\backup-pulse.ps1'
```

A newer versioned installer uses its bundled manifest; there is no moving “latest” channel. Before migrations it creates and verifies an encrypted PostgreSQL/MinIO backup and retains the previous manifest. A failure before migrations returns to the previous images. Once a migration begins, automatic downgrade is prohibited because schema compatibility is not assumed. Keep services stopped, preserve diagnostics, and restore the verified backup into new volume names:

```powershell
& 'C:\ProgramData\LBH\Pulse\installer\restore-pulse.ps1' `
  -BackupFile 'D:\Pulse Backups\pulse-production-<timestamp>.tar.gz.age' `
  -Apply `
  -PostgresVolume pulse-restore-<date>-postgres `
  -MinioVolume pulse-restore-<date>-minio
```

Review the isolated restored project before any separately approved cutover. Restore never overwrites the production volumes.

## Uninstall

Windows Apps and Features stops and removes installer-managed containers. Configuration, backups, recovery keys, images, and named volumes are preserved by default. Removing the recorded internal CA is a separate confirmation.

Persistent deletion is never available in silent uninstall. Interactive deletion requires selecting the separate data-removal option and typing exactly `DELETE PULSE DATA`; only the volume names recorded in `state.json` are considered. Backups and the recovery identity remain operator-managed even after data-volume deletion.

## Release engineering

GHCR packages must be public before a customer release. Run the release workflow manually once with `bootstrap_packages=true`, then an organization owner makes each resulting package public. A tagged release later proves anonymous digest pulls before building the installer.

Build locally after supplying a generated release manifest:

```powershell
choco install innosetup --version=6.7.3 --require-checksums
Copy-Item .\release-manifest.json .\installer\windows\generated\release-manifest.json
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" `
  /DAppVersion=0.1.0 /DSourceRoot="$PWD" .\installer\windows\pulse-setup.iss
```

Create a release only from a clean, reviewed commit whose `package.json` version matches the tag:

```sh
git tag -a v0.1.0 -m "Pulse 0.1.0"
git push origin v0.1.0
```

The workflow reruns Linux release gates, resolves build bases, builds Linux/amd64 images, publishes semantic/minor/full-SHA tags, records immutable digests, proves anonymous pulls, runs PowerShell/Pester/PSScriptAnalyzer checks, compiles and optionally Authenticode-signs Setup and Uninstall, writes SHA-256, then publishes the draft GitHub release only after every job succeeds.

## Required clean-machine release test

Before publishing, test a Windows VM with no previous Pulse state:

1. Confirm missing/stopped Docker and occupied-port messages are distinct and occur before initialization.
2. Install in local mode, exercise both CA-consent choices, create the browser Administrator, and finalize setup.
3. Reboot Windows and verify Docker starts Pulse and HTTPS readiness passes.
4. Rerun 0.1.0 for repair, then test a staged newer manifest and verified pre-update backup.
5. Uninstall once with preservation and reinstall against the retained volumes/configuration.
6. On a disposable second install, confirm data deletion requires the exact phrase and removes only enumerated Pulse volumes.
7. Inspect `logs` and `state.json` for secrets and verify the recovery identity is ACL-protected.

Offline image bundles are not part of 0.1. A future release can pair the same manifest with verified `docker save`/`docker load` archives without changing the installed Compose model.
