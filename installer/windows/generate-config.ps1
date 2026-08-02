[CmdletBinding()]
param(
  [string]$Root = "$env:ProgramData\LBH\Pulse",
  [Parameter(Mandatory = $true)][string]$ManifestPath,
  [ValidateSet("internal", "public")][string]$Mode = "internal",
  [string]$Hostname = "localhost",
  [string]$AcmeEmail = "operator@example.invalid",
  [string]$BackupPath,
  [switch]$TrustInternalCa
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "Pulse.Install.psm1") -Force

if ($Mode -eq "internal") { $Hostname = "localhost" }
if (-not (Test-PulseHostname -Hostname $Hostname -AllowLocalhost:($Mode -eq "internal"))) {
  throw "The Pulse hostname is invalid."
}
if ($Mode -eq "public") {
  try { $mailAddress = New-Object Net.Mail.MailAddress -ArgumentList $AcmeEmail } catch { throw "The ACME contact email is invalid." }
  if ($mailAddress.Address -ne $AcmeEmail) { throw "The ACME contact email is invalid." }
}

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if (-not (Test-PulseReleaseManifest -Manifest $manifest)) { throw "The release manifest is invalid or contains an unpinned image." }

$paths = Get-PulsePaths -Root $Root
if (-not $BackupPath) { $BackupPath = $paths.Backups }
if (-not [IO.Path]::IsPathRooted($BackupPath)) { throw "The backup destination must be an absolute Windows path." }
Initialize-PulseDirectories -Paths $paths -BackupPath $BackupPath
Protect-PulsePath -Path $paths.Config
Protect-PulsePath -Path $paths.Recovery
[IO.File]::WriteAllText($paths.DisabledInput, "", (New-Object Text.UTF8Encoding($false)))
Protect-PulsePath -Path $paths.DisabledInput

$postgresAdminPassword = New-PulseSecret
$migrationPassword = New-PulseSecret
$appPassword = New-PulseSecret
$minioRootPassword = New-PulseSecret
$minioAppPassword = New-PulseSecret
$sessionSecret = New-PulseSecret
$securityPepper = New-PulseSecret
$setupToken = New-PulseSecret
foreach ($secret in @($postgresAdminPassword, $migrationPassword, $appPassword, $minioRootPassword, $minioAppPassword, $sessionSecret, $securityPepper, $setupToken)) {
  Add-PulseSecretValue -Value $secret
}

$httpPort = if ($Mode -eq "internal") { 8080 } else { 80 }
$httpsPort = if ($Mode -eq "internal") { 8443 } else { 443 }
$publicUrl = if ($httpsPort -eq 443) { "https://$Hostname" } else { "https://$Hostname`:$httpsPort" }
$gatewayImage = if ($Mode -eq "internal") { $manifest.images.gatewayInternal } else { $manifest.images.gatewayPublic }
$lines = @(
  "NODE_ENV=production",
  "PULSE_RELEASE_TAG=$($manifest.version)",
  "PULSE_PUBLIC_URL=$publicUrl",
  "PULSE_HOSTNAME=$Hostname",
  "PULSE_CADDY_TARGET=$Mode",
  "PULSE_CADDY_EMAIL=$AcmeEmail",
  "PULSE_HTTP_PORT=$httpPort",
  "PULSE_HTTPS_PORT=$httpsPort",
  "POSTGRES_DB=pulse",
  "POSTGRES_ADMIN_USER=pulse_admin",
  "POSTGRES_ADMIN_PASSWORD=$postgresAdminPassword",
  "PULSE_DB_MIGRATION_USER=pulse_migrator",
  "PULSE_DB_MIGRATION_PASSWORD=$migrationPassword",
  "PULSE_DB_APP_USER=pulse_app",
  "PULSE_DB_APP_PASSWORD=$appPassword",
  "PULSE_DATABASE_ADMIN_URL=postgresql://pulse_admin:$([uri]::EscapeDataString($postgresAdminPassword))@postgres:5432/pulse?schema=pulse",
  "PULSE_DATABASE_MIGRATION_URL=postgresql://pulse_migrator:$([uri]::EscapeDataString($migrationPassword))@postgres:5432/pulse?schema=pulse",
  "DATABASE_URL=postgresql://pulse_app:$([uri]::EscapeDataString($appPassword))@postgres:5432/pulse?schema=pulse",
  "PULSE_LEGACY_DATABASE_ROLE=",
  "PULSE_POSTGRES_VOLUME=pulse-production-postgres",
  "MINIO_ROOT_USER=pulse_root",
  "MINIO_ROOT_PASSWORD=$minioRootPassword",
  "S3_ENDPOINT=http://minio:9000",
  "S3_REGION=us-east-1",
  "S3_BUCKET=pulse-documents",
  "S3_ACCESS_KEY=pulse_app",
  "S3_SECRET_KEY=$minioAppPassword",
  "S3_FORCE_PATH_STYLE=true",
  "PULSE_MINIO_VOLUME=pulse-production-minio",
  "PULSE_SESSION_SECRET=$sessionSecret",
  "PULSE_SECURITY_PEPPER=$securityPepper",
  "PULSE_SETUP_TOKEN=$setupToken",
  "PULSE_SESSION_TTL_MINUTES=480",
  "PULSE_SESSION_IDLE_MINUTES=30",
  "PULSE_COOKIE_SECURE=true",
  "PULSE_COOKIE_SAME_SITE=strict",
  "PULSE_TRUST_PROXY_HOPS=2",
  "PULSE_ALLOWED_ORIGINS=$publicUrl",
  "PULSE_AUTH_RATE_LIMIT_ENABLED=true",
  "PULSE_LOGIN_WINDOW_SECONDS=900",
  "PULSE_LOGIN_ACCOUNT_MAX_ATTEMPTS=5",
  "PULSE_LOGIN_IP_MAX_ATTEMPTS=25",
  "PULSE_LOGIN_LOCKOUT_SECONDS=900",
  "PULSE_REQUIRE_CREDENTIAL_CONTAINMENT=true",
  "PULSE_MAINTENANCE_ACTOR_EMAIL=pulse-installer@localhost.invalid",
  "PULSE_BOOTSTRAP_ADMIN_NAME=disabled-installer-service",
  "PULSE_BOOTSTRAP_ADMIN_EMAIL=disabled@localhost.invalid",
  "PULSE_BOOTSTRAP_ADMIN_PASSWORD_FILE=$($paths.DisabledInput)",
  "PULSE_CREDENTIAL_CONTAINMENT_FILE=$($paths.DisabledInput)",
  "CLAMAV_HOST=clamav",
  "CLAMAV_PLATFORM=linux/amd64",
  "CLAMAV_PORT=3310",
  "CLAMAV_TIMEOUT_MS=180000",
  "DOCUMENT_TEMP_DIR=/tmp/pulse-uploads",
  "PULSE_AUDIT_RETENTION_DAYS=365",
  "PULSE_OPERATIONAL_RETENTION_DAYS=730",
  "PULSE_BACKUP_DIR=$BackupPath",
  "PULSE_BACKUP_WORK_DIR=$($paths.Installer)\work",
  "PULSE_RESTORE_WORK_DIR=$($paths.Installer)\work",
  "PULSE_BACKUP_ARCHIVE_DIR=$($paths.Recovery)",
  "PULSE_BACKUP_AGE_RECIPIENT=",
  "PULSE_BACKUP_AGE_IDENTITY_FILE=$($paths.Identity)",
  "PULSE_BACKUP_RETENTION_DAYS=30",
  "PULSE_BACKUP_PRUNE=0",
  "PULSE_BACKUP_CONTAINER_USER=0:0",
  "PULSE_API_IMAGE=$($manifest.images.api)",
  "PULSE_WEB_IMAGE=$($manifest.images.web)",
  "PULSE_MAINTENANCE_IMAGE=$($manifest.images.maintenance)",
  "PULSE_MINIO_INIT_IMAGE=$($manifest.images.minioInit)",
  "PULSE_CLAMAV_IMAGE=$($manifest.images.clamav)",
  "PULSE_BACKUP_CRYPTO_IMAGE=$($manifest.images.backupCrypto)",
  "PULSE_GATEWAY_IMAGE=$gatewayImage",
  "PULSE_POSTGRES_IMAGE=$($manifest.images.postgres)",
  "PULSE_MINIO_IMAGE=$($manifest.images.minio)",
  "PULSE_MINIO_MC_IMAGE=$($manifest.images.minioMc)"
)

[IO.File]::WriteAllLines($paths.Environment, $lines, (New-Object Text.UTF8Encoding($false)))
[IO.File]::WriteAllText($paths.SetupCode, $setupToken, (New-Object Text.UTF8Encoding($false)))
Protect-PulsePath -Path $paths.Environment
Protect-PulsePath -Path $paths.SetupCode

$state = [ordered]@{
  schemaVersion = 1
  product = "Pulse"
  version = [string]$manifest.version
  commit = [string]$manifest.commit
  mode = $Mode
  url = $publicUrl
  installedAt = [DateTime]::UtcNow.ToString("o")
  firstRunComplete = $false
  trustInternalCaRequested = [bool]$TrustInternalCa
  caThumbprint = $null
  volumes = @("pulse-production-postgres", "pulse-production-minio", "pulse-production_clamav-data", "pulse-production_caddy-data", "pulse-production_caddy-config")
  images = $manifest.images
}
Write-PulseState -State $state -Root $Root
Write-PulseLog -Root $Root -Message "Generated protected production configuration for Pulse $($manifest.version)."
