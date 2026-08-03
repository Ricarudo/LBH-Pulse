[CmdletBinding()]
param(
  [string]$Root = "$env:ProgramData\LBH\Pulse",
  [Parameter(Mandatory = $true)][string]$BackupFile,
  [switch]$VerifyOnly,
  [switch]$Apply,
  [string]$PostgresVolume,
  [string]$MinioVolume,
  [string]$ProjectName = "pulse-restore-validation"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "Pulse.Install.psm1") -Force
$paths = Get-PulsePaths -Root $Root
if (-not (Test-Path -LiteralPath $BackupFile)) { throw "The encrypted backup file does not exist." }
$checksumFile = "$BackupFile.sha256"
if (-not (Test-Path -LiteralPath $checksumFile)) { throw "The backup checksum file is missing." }
$expected = ((Get-Content -LiteralPath $checksumFile -Raw).Trim() -split '\s+')[0]
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $BackupFile).Hash.ToLowerInvariant()
if ($expected -ne $actual) { throw "The encrypted backup checksum does not match." }

$workBase = Join-Path $paths.Installer ("work\restore-" + [guid]::NewGuid().ToString("N"))
[void](New-Item -ItemType Directory -Path $workBase -Force)
# Docker Desktop must be able to write the temporary restore staging directory.
Protect-PulsePath -Path $workBase -AllowCurrentUser
try {
  $env:PULSE_BACKUP_ARCHIVE_DIR = Split-Path -Parent $BackupFile
  $env:PULSE_RESTORE_WORK_DIR = $workBase
  $env:PULSE_BACKUP_AGE_IDENTITY_FILE = $paths.Identity
  $name = Split-Path -Leaf $BackupFile
  [void](Invoke-PulseCompose -Root $Root -Arguments @("--profile", "restore", "run", "--rm", "--no-deps", "-T", "backup-decrypt", "--decrypt", "-i", "/run/secrets/age-identity", "-o", "/restore/backup.tar.gz", "/archives/$name") -Stage "backup decryption" -Quiet)
  [void](Invoke-PulseCommand -FilePath "tar.exe" -Arguments @("-xzf", (Join-Path $workBase "backup.tar.gz"), "-C", $workBase) -Root $Root -Stage "backup extraction" -Quiet)
  foreach ($line in Get-Content -LiteralPath (Join-Path $workBase "MANIFEST.sha256")) {
    $parts = $line -split '\s+', 2
    $candidate = Join-Path $workBase $parts[1].Replace('/', '\')
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $candidate).Hash.ToLowerInvariant() -ne $parts[0]) { throw "Backup manifest verification failed for $($parts[1])." }
  }
  Write-PulseLog -Root $Root -Message "Encrypted backup checksum, decryption, and internal manifest verification passed."
  if ($VerifyOnly -or -not $Apply) { return [pscustomobject]@{ Status = "verified"; Sha256 = $actual } }

  if ($PostgresVolume -notmatch 'restore' -or $MinioVolume -notmatch 'restore') { throw "Restore volume names must contain 'restore'." }
  foreach ($volume in @($PostgresVolume, $MinioVolume)) {
    if ((Invoke-PulseCommand -FilePath "docker" -Arguments @("volume", "inspect", $volume) -Root $Root -Stage "restore volume check" -AllowFailure -Quiet).ExitCode -eq 0) {
      throw "Restore volume '$volume' already exists."
    }
  }
  $env:PULSE_POSTGRES_VOLUME = $PostgresVolume
  $env:PULSE_MINIO_VOLUME = $MinioVolume
  $prefix = Get-PulseComposeArguments -Root $Root
  $projectIndex = [Array]::IndexOf($prefix, "pulse-production")
  if ($projectIndex -ge 0) { $prefix[$projectIndex] = $ProjectName }
  [void](Invoke-PulseCommand -FilePath "docker" -Arguments ($prefix + @("up", "-d", "--no-build", "--wait", "--wait-timeout", "180", "postgres", "minio")) -Root $Root -Stage "isolated restore infrastructure")
  $postgres = (Invoke-PulseCommand -FilePath "docker" -Arguments ($prefix + @("ps", "-q", "postgres")) -Root $Root -Stage "restore PostgreSQL lookup" -Quiet).Output.Trim()
  [void](Invoke-PulseCommand -FilePath "docker" -Arguments @("cp", (Join-Path $workBase "postgres\pulse.dump"), "$postgres`:/tmp/pulse-restore.dump") -Root $Root -Stage "copy PostgreSQL restore")
  [void](Invoke-PulseCommand -FilePath "docker" -Arguments ($prefix + @("exec", "-T", "postgres", "sh", "-c", 'pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --exit-on-error /tmp/pulse-restore.dump')) -Root $Root -Stage "PostgreSQL isolated restore")
  [void](Invoke-PulseCommand -FilePath "docker" -Arguments ($prefix + @("--profile", "restore", "run", "--rm", "minio-restore")) -Root $Root -Stage "MinIO isolated restore")
  [pscustomobject]@{ Status = "restored"; Project = $ProjectName; PostgresVolume = $PostgresVolume; MinioVolume = $MinioVolume }
} finally {
  Remove-Item Env:PULSE_BACKUP_ARCHIVE_DIR, Env:PULSE_RESTORE_WORK_DIR, Env:PULSE_BACKUP_AGE_IDENTITY_FILE, Env:PULSE_POSTGRES_VOLUME, Env:PULSE_MINIO_VOLUME -ErrorAction SilentlyContinue
  Remove-PulseTemporaryDirectory -Path $workBase -Root $paths.Installer
}
