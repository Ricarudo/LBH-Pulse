[CmdletBinding()]
param(
  [string]$Root = "$env:ProgramData\LBH\Pulse",
  [string]$Destination,
  [switch]$SkipVerification
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "Pulse.Install.psm1") -Force
$paths = Get-PulsePaths -Root $Root
$state = Read-PulseState -Root $Root
if (-not $state) { throw "Pulse installation state is missing." }
if (-not $Destination) { $Destination = $paths.Backups }
[void](New-Item -ItemType Directory -Path $Destination -Force)
$workBase = Join-Path $paths.Installer ("work\backup-" + [guid]::NewGuid().ToString("N"))
$payload = Join-Path $workBase "payload"
[void](New-Item -ItemType Directory -Path (Join-Path $payload "postgres") -Force)
[void](New-Item -ItemType Directory -Path (Join-Path $payload "config") -Force)
# The temporary plaintext staging directory is deleted in finally, but Docker Desktop must be able to mount it.
Protect-PulsePath -Path $workBase -AllowCurrentUser

try {
  [void](Invoke-PulseCompose -Root $Root -Arguments @("exec", "-T", "postgres", "sh", "-c", 'pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner --no-privileges --file=/tmp/pulse-installer.dump') -Stage "PostgreSQL backup")
  $postgres = (Invoke-PulseCompose -Root $Root -Arguments @("ps", "-q", "postgres") -Stage "PostgreSQL container lookup" -Quiet).Output.Trim()
  [void](Invoke-PulseCommand -FilePath "docker" -Arguments @("cp", "$postgres`:/tmp/pulse-installer.dump", (Join-Path $payload "postgres\pulse.dump")) -Root $Root -Stage "copy PostgreSQL backup" -Quiet)
  [void](Invoke-PulseCompose -Root $Root -Arguments @("exec", "-T", "postgres", "rm", "-f", "/tmp/pulse-installer.dump") -Stage "remove container backup staging" -Quiet)

  $env:PULSE_BACKUP_WORK_DIR = $payload
  [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "backup", "run", "--rm", "minio-backup") -Stage "MinIO backup")
  [void](Invoke-PulseCommand -FilePath "tar.exe" -Arguments @("-czf", (Join-Path $payload "config\deployment-config.tar.gz"), "-C", $paths.Deployment, ".") -Root $Root -Stage "sanitized deployment archive" -Quiet)

  $manifestLines = Get-ChildItem -LiteralPath $payload -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($payload.Length + 1).Replace('\', '/')
    "{0}  {1}" -f (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant(), $relative
  }
  [IO.File]::WriteAllLines((Join-Path $payload "MANIFEST.sha256"), $manifestLines, (New-Object Text.UTF8Encoding($false)))

  $plainArchive = Join-Path $workBase "pulse-backup.tar.gz"
  [void](Invoke-PulseCommand -FilePath "tar.exe" -Arguments @("-czf", $plainArchive, "-C", $payload, ".") -Root $Root -Stage "backup payload packaging" -Quiet)
  $timestamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
  $archiveName = "pulse-production-$timestamp.tar.gz.age"
  $archive = Join-Path $Destination $archiveName
  $recipient = Get-PulseEnvironmentValue -Path $paths.Environment -Name "PULSE_BACKUP_AGE_RECIPIENT"
  if ($recipient -notmatch '^age1[a-z0-9]+$') { throw "The Pulse backup recovery recipient is missing or invalid." }
  $env:PULSE_BACKUP_ARCHIVE_DIR = $Destination
  [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "backup", "run", "--rm", "--no-deps", "-T", "-v", "$plainArchive`:/input/backup.tar.gz:ro", "backup-encrypt", "-r", $recipient, "-o", "/archives/$archiveName", "/input/backup.tar.gz") -Stage "backup encryption" -Quiet)
  if (-not (Test-Path -LiteralPath $archive) -or (Get-Item $archive).Length -eq 0) { throw "The encrypted backup archive was not created." }
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText("$archive.sha256", "$hash  $archiveName`r`n", (New-Object Text.ASCIIEncoding))
  if (-not $SkipVerification) { [void](& (Join-Path $PSScriptRoot "restore-pulse.ps1") -Root $Root -BackupFile $archive -VerifyOnly) }
  Write-PulseLog -Root $Root -Message "Encrypted Pulse backup created and verified: $archiveName"
  [pscustomobject]@{ Archive = $archive; Checksum = "$archive.sha256"; Sha256 = $hash }
} finally {
  Remove-Item Env:PULSE_BACKUP_WORK_DIR, Env:PULSE_BACKUP_ARCHIVE_DIR -ErrorAction SilentlyContinue
  Remove-PulseTemporaryDirectory -Path $workBase -Root $paths.Installer
}
