[CmdletBinding()]
param(
  [string]$Root = "$env:ProgramData\LBH\Pulse",
  [string]$PayloadDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "Pulse.Install.psm1") -Force
$paths = Get-PulsePaths -Root $Root
$current = Read-PulseState -Root $Root
if (-not $current) { throw "Pulse installation state is missing; update cannot continue." }
if (-not $PayloadDirectory) { $PayloadDirectory = Join-Path $paths.Installer "payload\deployment" }
$targetManifestPath = Join-Path $PayloadDirectory "release-manifest.json"
$target = Get-Content -LiteralPath $targetManifestPath -Raw | ConvertFrom-Json
if (-not (Test-PulseReleaseManifest -Manifest $target)) { throw "The bundled update manifest is invalid or contains an unpinned image." }
if ([version]$target.version -le [version]$current.version) {
  foreach ($name in @("compose.production.yaml", "compose.maintenance.yaml", "compose.release.yaml", "release-manifest.json")) {
    Copy-Item -LiteralPath (Join-Path $PayloadDirectory $name) -Destination (Join-Path $paths.Deployment $name) -Force
  }
  Write-PulseLog -Root $Root -Message "Pulse $($current.version) is already installed; running repair verification."
  & (Join-Path $PSScriptRoot "manage-pulse.ps1") -Root $Root -Action Start
  exit 0
}

$history = Join-Path $paths.Installer ("history\" + $current.version)
[void](New-Item -ItemType Directory -Path $history -Force)
foreach ($name in @("compose.production.yaml", "compose.maintenance.yaml", "compose.release.yaml", "release-manifest.json")) {
  Copy-Item -LiteralPath (Join-Path $paths.Deployment $name) -Destination (Join-Path $history $name) -Force
}
$backup = & (Join-Path $PSScriptRoot "backup-pulse.ps1") -Root $Root
$migrationStarted = $false

function Set-ReleaseImages($manifest) {
  $gateway = if ($current.mode -eq "internal") { $manifest.images.gatewayInternal } else { $manifest.images.gatewayPublic }
  $mapping = [ordered]@{
    PULSE_RELEASE_TAG = $manifest.version
    PULSE_API_IMAGE = $manifest.images.api
    PULSE_WEB_IMAGE = $manifest.images.web
    PULSE_MAINTENANCE_IMAGE = $manifest.images.maintenance
    PULSE_MINIO_INIT_IMAGE = $manifest.images.minioInit
    PULSE_CLAMAV_IMAGE = $manifest.images.clamav
    PULSE_BACKUP_CRYPTO_IMAGE = $manifest.images.backupCrypto
    PULSE_GATEWAY_IMAGE = $gateway
    PULSE_POSTGRES_IMAGE = $manifest.images.postgres
    PULSE_MINIO_IMAGE = $manifest.images.minio
    PULSE_MINIO_MC_IMAGE = $manifest.images.minioMc
  }
  foreach ($entry in $mapping.GetEnumerator()) { Set-PulseEnvironmentValue -Path $paths.Environment -Name $entry.Key -Value ([string]$entry.Value) }
}

try {
  Set-ReleaseImages $target
  [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "maintenance", "--profile", "backup", "pull", "postgres", "minio", "minio-init", "clamav", "api", "web", "gateway", "db-roles", "backup-encrypt", "minio-backup") -Stage "update image pull")
  [void](Invoke-PulseCompose -Root $Root -Arguments @("stop", "gateway", "web", "api") -Stage "enter update maintenance window")
  $migrationStarted = $true
  [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "maintenance", "run", "--rm", "migrate") -Stage "update migrations")
  [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "maintenance", "run", "--rm", "reference-data") -Stage "update reference data")
  [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "maintenance", "run", "--rm", "db-role-verify") -Stage "updated runtime role verification")
  foreach ($name in @("compose.production.yaml", "compose.maintenance.yaml", "compose.release.yaml", "release-manifest.json")) {
    Copy-Item -LiteralPath (Join-Path $PayloadDirectory $name) -Destination (Join-Path $paths.Deployment $name) -Force
  }
  [void](Invoke-PulseCompose -Root $Root -Arguments @("up", "-d", "--no-build", "--wait", "--wait-timeout", "360") -Stage "updated Pulse startup")
  & (Join-Path $PSScriptRoot "test-installation.ps1") -Root $Root
  $current.version = [string]$target.version
  $current.commit = [string]$target.commit
  $current.images = $target.images
  $current.updatedAt = [DateTime]::UtcNow.ToString("o")
  $current.preUpdateBackup = $backup.Archive
  Write-PulseState -State $current -Root $Root
  Write-PulseLog -Root $Root -Message "Pulse update to $($target.version) completed."
} catch {
  Write-PulseLog -Root $Root -Level ERROR -Message "Pulse update failed: $($_.Exception.Message)"
  if (-not $migrationStarted) {
    Set-ReleaseImages $current
    [void](Invoke-PulseCompose -Root $Root -Arguments @("up", "-d", "--no-build", "--wait", "--wait-timeout", "360") -Stage "pre-migration update rollback" -AllowFailure)
  } else {
    Write-PulseLog -Root $Root -Level ERROR -Message "Migration began; automatic downgrade is prohibited. Keep writes stopped and restore the verified backup into new volumes."
  }
  throw
}
