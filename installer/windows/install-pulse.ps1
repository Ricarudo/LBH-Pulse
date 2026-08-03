[CmdletBinding()]
param(
  [string]$Root = "$env:ProgramData\LBH\Pulse",
  [ValidateSet("internal", "public")][string]$Mode = "internal",
  [string]$Hostname = "localhost",
  [string]$AcmeEmail = "operator@example.invalid",
  [string]$BackupPath,
  [switch]$TrustInternalCa
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "Pulse.Install.psm1") -Force
$paths = Get-PulsePaths -Root $Root
$existingState = Read-PulseState -Root $Root
$existingStatus = if ($existingState -and $existingState.PSObject.Properties["installationStatus"]) {
  [string]$existingState.installationStatus
} elseif ($existingState) {
  # Installers released before this marker could not pass recovery-key generation, so their state is resumable partial state.
  "initializing"
} else {
  $null
}

if ($existingState) {
  $Mode = [string]$existingState.mode
  $Hostname = ([uri][string]$existingState.url).Host
}

try {
  & (Join-Path $PSScriptRoot "validate-prerequisites.ps1") -Mode $Mode -Hostname $Hostname -AllowOccupiedPorts:([bool]$existingState)
  Initialize-PulseDirectories -Paths $paths -BackupPath $BackupPath
  $payload = Join-Path $paths.Installer "payload\deployment"
  foreach ($name in @("compose.production.yaml", "compose.maintenance.yaml", "compose.release.yaml", "release-manifest.json")) {
    Copy-Item -LiteralPath (Join-Path $payload $name) -Destination (Join-Path $paths.Deployment $name) -Force
  }

  if ($existingState -and $existingStatus -eq "installed") {
    Write-PulseLog -Root $Root -Message "Existing Pulse $($existingState.version) installation detected; preserving configuration and data."
    [void](Invoke-PulseCompose -Root $Root -Arguments @("up", "-d", "--no-build", "--wait", "--wait-timeout", "360") -Stage "repair existing stack")
    & (Join-Path $PSScriptRoot "test-installation.ps1") -Root $Root
    exit 0
  }

  if (-not $existingState) {
    if (Test-Path -LiteralPath $paths.Environment) { throw "Protected Pulse configuration exists without installer state. Refusing to initialize or replace it." }
    foreach ($volume in @("pulse-production-postgres", "pulse-production-minio", "pulse-production_clamav-data", "pulse-production_caddy-data", "pulse-production_caddy-config")) {
      $probe = Invoke-PulseCommand -FilePath "docker" -Arguments @("volume", "inspect", $volume) -Root $Root -Stage "existing volume check" -AllowFailure -Quiet
      if ($probe.ExitCode -eq 0) { throw "Docker volume '$volume' already exists without installer state. Refusing to initialize it." }
    }
    $manifest = Join-Path $paths.Deployment "release-manifest.json"
    & (Join-Path $PSScriptRoot "generate-config.ps1") -Root $Root -ManifestPath $manifest -Mode $Mode -Hostname $Hostname -AcmeEmail $AcmeEmail -BackupPath $BackupPath -TrustInternalCa:$TrustInternalCa
  } else {
    Write-PulseLog -Root $Root -Message "Resuming the incomplete Pulse $($existingState.version) initialization with its existing protected configuration."
  }

  # Keep secrets locked down while allowing only the installing account's Docker Desktop backend to use this bind mount.
  Protect-PulsePath -Path $paths.Recovery -AllowCurrentUser

  [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "maintenance", "--profile", "backup", "config", "--quiet") -Stage "release configuration validation")
  [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "maintenance", "--profile", "backup", "pull", "postgres", "minio", "minio-init", "clamav", "api", "web", "gateway", "db-roles", "backup-encrypt", "minio-backup") -Stage "immutable image pull")

  if (-not (Test-Path -LiteralPath $paths.Identity)) {
    [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "backup", "run", "--rm", "--no-deps", "-T", "--entrypoint", "age-keygen", "backup-encrypt", "-o", "/archives/age-identity.txt") -Stage "recovery identity generation" -Quiet)
    $recipient = Invoke-PulseCompose -Root $Root -Arguments @("--profile", "backup", "run", "--rm", "--no-deps", "-T", "--entrypoint", "age-keygen", "backup-encrypt", "-y", "/archives/age-identity.txt") -Stage "recovery recipient derivation" -Quiet
    $publicRecipient = ($recipient.Output -split "`r?`n" | Where-Object { $_ -match '^age1' } | Select-Object -Last 1).Trim()
    if ($publicRecipient -notmatch '^age1[a-z0-9]+$') { throw "The backup recovery recipient was not produced." }
    Set-PulseEnvironmentValue -Path $paths.Environment -Name "PULSE_BACKUP_AGE_RECIPIENT" -Value $publicRecipient
    Protect-PulsePath -Path $paths.Identity -AllowCurrentUser
  }

  [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "maintenance", "up", "-d", "--no-build", "--wait", "--wait-timeout", "360", "postgres", "minio", "clamav") -Stage "stateful infrastructure startup")
  [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "maintenance", "run", "--rm", "db-roles") -Stage "database role preview")
  [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "maintenance", "run", "--rm", "db-roles", "npm", "run", "db:roles:apply", "-w", "@pulse/api") -Stage "database role apply")
  [void](Invoke-PulseCompose -Root $Root -Arguments @("up", "-d", "--no-build", "minio-init") -Stage "MinIO application identity provisioning")
  $minioInitContainer = (Invoke-PulseCompose -Root $Root -Arguments @("ps", "-a", "-q", "minio-init") -Stage "MinIO initializer lookup" -Quiet).Output.Trim()
  if ($minioInitContainer -notmatch '^[a-f0-9]{12,64}$') { throw "The MinIO initializer container could not be identified." }
  $minioInitExit = (Invoke-PulseCommand -FilePath "docker" -Arguments @("wait", $minioInitContainer) -Root $Root -Stage "MinIO initializer completion" -Quiet).Output.Trim()
  if ($minioInitExit -ne "0") { throw "MinIO application identity provisioning failed with exit code $minioInitExit." }
  [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "maintenance", "run", "--rm", "migrate") -Stage "database migrations")
  [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "maintenance", "run", "--rm", "reference-data") -Stage "reference data")
  [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "maintenance", "run", "--rm", "db-role-verify") -Stage "runtime database role verification")
  [void](Invoke-PulseCompose -Root $Root -Arguments @("up", "-d", "--no-build", "--wait", "--wait-timeout", "360") -Stage "Pulse application startup")

  if ($Mode -eq "internal") {
    $gateway = Invoke-PulseCompose -Root $Root -Arguments @("ps", "-q", "gateway") -Stage "gateway container lookup" -Quiet
    $containerId = $gateway.Output.Trim()
    if ($containerId -notmatch '^[a-f0-9]{12,64}$') { throw "The Pulse gateway container could not be identified." }
    $certificatePath = Join-Path $paths.Config "caddy-root.crt"
    [void](Invoke-PulseCommand -FilePath "docker" -Arguments @("cp", "$containerId`:/data/caddy/pki/authorities/local/root.crt", $certificatePath) -Root $Root -Stage "internal CA export" -Quiet)
    Protect-PulsePath -Path $certificatePath
    if ($TrustInternalCa) {
      $certificate = Import-Certificate -FilePath $certificatePath -CertStoreLocation "Cert:\LocalMachine\Root"
      $state = Read-PulseState -Root $Root
      $state.caThumbprint = $certificate.Thumbprint
      Write-PulseState -State $state -Root $Root
      Write-PulseLog -Root $Root -Message "Imported the operator-approved Pulse internal CA certificate with thumbprint $($certificate.Thumbprint)."
    }
  }

  & (Join-Path $PSScriptRoot "test-installation.ps1") -Root $Root
  $state = Read-PulseState -Root $Root
  $state | Add-Member -NotePropertyName "installationStatus" -NotePropertyValue "installed" -Force
  Write-PulseState -State $state -Root $Root
  Write-PulseLog -Root $Root -Message "Pulse installation completed and awaits protected browser setup."
} catch {
  Write-PulseLog -Root $Root -Level "ERROR" -Message "Installation failed: $($_.Exception.Message)"
  throw
}
