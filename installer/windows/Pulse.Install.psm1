Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:PulseProjectName = "pulse-production"
$script:SecretValues = New-Object System.Collections.Generic.List[string]

function Get-PulsePaths {
  param([string]$Root = "$env:ProgramData\LBH\Pulse")
  [pscustomobject]@{
    Root = $Root
    Config = Join-Path $Root "config"
    Environment = Join-Path $Root "config\.env.production"
    SetupCode = Join-Path $Root "config\first-run-code.txt"
    Recovery = Join-Path $Root "config\recovery"
    Identity = Join-Path $Root "config\recovery\age-identity.txt"
    DisabledInput = Join-Path $Root "config\disabled-maintenance-input.txt"
    Deployment = Join-Path $Root "deployment"
    State = Join-Path $Root "installer\state.json"
    Logs = Join-Path $Root "logs"
    Backups = Join-Path $Root "backups"
    Installer = Join-Path $Root "installer"
  }
}

function Initialize-PulseDirectories {
  param([Parameter(Mandatory = $true)]$Paths, [string]$BackupPath)
  foreach ($path in @($Paths.Root, $Paths.Config, $Paths.Recovery, $Paths.Deployment, $Paths.Logs, $Paths.Backups, $Paths.Installer)) {
    [void](New-Item -ItemType Directory -Path $path -Force)
  }
  if ($BackupPath) { [void](New-Item -ItemType Directory -Path $BackupPath -Force) }
}

function Protect-PulsePath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $item = Get-Item -LiteralPath $Path
  $administrators = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")
  $system = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")
  if ($item.PSIsContainer) {
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $inherit = [System.Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit"
    $propagate = [System.Security.AccessControl.PropagationFlags]::None
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($administrators, "FullControl", $inherit, $propagate, "Allow")))
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($system, "FullControl", $inherit, $propagate, "Allow")))
  } else {
    $acl = New-Object System.Security.AccessControl.FileSecurity
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($administrators, "FullControl", "Allow")))
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($system, "FullControl", "Allow")))
  }
  $acl.SetAccessRuleProtection($true, $false)
  Set-Acl -LiteralPath $Path -AclObject $acl
}

function New-PulseSecret {
  param([int]$Bytes = 48)
  $buffer = New-Object byte[] $Bytes
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
  -join ($buffer | ForEach-Object { $_.ToString("x2") })
}

function Test-PulseReleaseManifest {
  param([Parameter(Mandatory = $true)]$Manifest)
  if ($Manifest.schemaVersion -ne 1 -or $Manifest.product -ne "Pulse" -or $Manifest.platform -ne "linux/amd64") { return $false }
  foreach ($name in @("api", "web", "maintenance", "minioInit", "clamav", "backupCrypto", "gatewayInternal", "gatewayPublic", "postgres", "minio", "minioMc")) {
    if ([string]$Manifest.images.$name -notmatch '@sha256:[a-f0-9]{64}$') { return $false }
  }
  return [string]$Manifest.version -match '^\d+\.\d+\.\d+$' -and [string]$Manifest.commit -match '^[a-f0-9]{40}$'
}

function Add-PulseSecretValue {
  param([string]$Value)
  if ($Value -and -not $script:SecretValues.Contains($Value)) { [void]$script:SecretValues.Add($Value) }
}

function Protect-PulseLogText {
  param([AllowEmptyString()][string]$Text)
  $safe = [string]$Text
  foreach ($secret in $script:SecretValues) {
    if ($secret) { $safe = $safe.Replace($secret, "[REDACTED]") }
  }
  $safe = [regex]::Replace($safe, '(?i)(password|secret|token|private[_-]?key)(\s*[:=]\s*)[^\s"'']+', '$1$2[REDACTED]')
  $safe = [regex]::Replace($safe, '(?i)postgres(?:ql)?://[^@\s]+@', 'postgresql://[REDACTED]@')
  return $safe
}

function Write-PulseLog {
  param(
    [Parameter(Mandatory = $true)][string]$Message,
    [string]$Root = "$env:ProgramData\LBH\Pulse",
    [ValidateSet("INFO", "WARN", "ERROR")][string]$Level = "INFO"
  )
  $paths = Get-PulsePaths -Root $Root
  if (-not (Test-Path -LiteralPath $paths.Logs)) { [void](New-Item -ItemType Directory -Path $paths.Logs -Force) }
  $line = "{0} [{1}] {2}" -f ([DateTime]::UtcNow.ToString("o")), $Level, (Protect-PulseLogText $Message)
  [IO.File]::AppendAllText((Join-Path $paths.Logs "installer.log"), "$line`r`n", (New-Object Text.UTF8Encoding($false)))
}

function Invoke-PulseCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [string]$Root = "$env:ProgramData\LBH\Pulse",
    [string]$Stage = "command",
    [switch]$AllowFailure,
    [switch]$Quiet,
    [switch]$NoLog
  )
  if (-not $NoLog) { Write-PulseLog -Root $Root -Message "Starting stage '$Stage' with $FilePath." }
  $output = & $FilePath @Arguments 2>&1 | Out-String
  $exitCode = $LASTEXITCODE
  if (-not $NoLog -and -not $Quiet -and $output.Trim()) { Write-PulseLog -Root $Root -Message $output.Trim() }
  if (-not $NoLog) { Write-PulseLog -Root $Root -Message "Stage '$Stage' exited with code $exitCode." }
  if ($exitCode -ne 0 -and -not $AllowFailure) {
    throw "Stage '$Stage' failed with exit code $exitCode. See the sanitized installer log."
  }
  [pscustomobject]@{ ExitCode = $exitCode; Output = $output }
}

function Get-PulseDockerDiagnostic {
  param(
    [bool]$DockerAvailable,
    [int]$DaemonExitCode = 0,
    [string]$Engine = "linux/amd64",
    [int]$ComposeExitCode = 0,
    [string]$ComposeVersion = "2.0.0"
  )
  if (-not $DockerAvailable) { return "Docker is not installed. Install and license an approved Docker runtime, then retry." }
  if ($DaemonExitCode -ne 0) { return "Docker is installed but the Docker daemon is not running." }
  if ($Engine -notin @("linux/x86_64", "linux/amd64")) { return "Pulse requires Docker configured for linux/amd64 containers." }
  if ($ComposeExitCode -ne 0 -or $ComposeVersion -notmatch '^v?2\.') { return "Docker Compose v2 is unavailable." }
  return $null
}

function Get-PulseComposeArguments {
  param([string]$Root = "$env:ProgramData\LBH\Pulse")
  $paths = Get-PulsePaths -Root $Root
  @(
    "compose", "--project-name", $script:PulseProjectName,
    "--env-file", $paths.Environment,
    "-f", (Join-Path $paths.Deployment "compose.production.yaml"),
    "-f", (Join-Path $paths.Deployment "compose.maintenance.yaml"),
    "-f", (Join-Path $paths.Deployment "compose.release.yaml")
  )
}

function Invoke-PulseCompose {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [string]$Root = "$env:ProgramData\LBH\Pulse",
    [string]$Stage = "Docker Compose",
    [switch]$AllowFailure,
    [switch]$Quiet
  )
  $prefix = Get-PulseComposeArguments -Root $Root
  Invoke-PulseCommand -FilePath "docker" -Arguments ($prefix + $Arguments) -Root $Root -Stage $Stage -AllowFailure:$AllowFailure -Quiet:$Quiet
}

function Read-PulseState {
  param([string]$Root = "$env:ProgramData\LBH\Pulse")
  $path = (Get-PulsePaths -Root $Root).State
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
}

function Write-PulseState {
  param([Parameter(Mandatory = $true)]$State, [string]$Root = "$env:ProgramData\LBH\Pulse")
  $path = (Get-PulsePaths -Root $Root).State
  $json = $State | ConvertTo-Json -Depth 10
  [IO.File]::WriteAllText($path, "$json`r`n", (New-Object Text.UTF8Encoding($false)))
  Protect-PulsePath -Path $path
}

function Set-PulseEnvironmentValue {
  param([string]$Path, [string]$Name, [AllowEmptyString()][string]$Value)
  $lines = if (Test-Path -LiteralPath $Path) { @(Get-Content -LiteralPath $Path) } else { @() }
  $replacement = "$Name=$Value"
  $found = $false
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match "^$([regex]::Escape($Name))=") { $lines[$index] = $replacement; $found = $true }
  }
  if (-not $found) { $lines += $replacement }
  $temporary = "$Path.new"
  [IO.File]::WriteAllLines($temporary, $lines, (New-Object Text.UTF8Encoding($false)))
  Protect-PulsePath -Path $temporary
  Move-Item -LiteralPath $temporary -Destination $Path -Force
  Protect-PulsePath -Path $Path
}

function Get-PulseEnvironmentValue {
  param([string]$Path, [string]$Name)
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -Last 1
  if ($null -eq $line) { return $null }
  return $line.Substring($Name.Length + 1)
}

function Remove-PulseTemporaryDirectory {
  param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Root)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $resolvedRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  $resolvedPath = [IO.Path]::GetFullPath($Path).TrimEnd('\')
  if (-not $resolvedPath.StartsWith("$resolvedRoot\", [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected temporary path $resolvedPath."
  }
  Remove-Item -LiteralPath $resolvedPath -Recurse -Force
}

function Test-PulseHostname {
  param([string]$Hostname, [switch]$AllowLocalhost)
  if ($AllowLocalhost -and $Hostname -eq "localhost") { return $true }
  return $Hostname -match '^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$'
}

function Get-PulseHealthUrl {
  param([string]$Root = "$env:ProgramData\LBH\Pulse", [string]$Path = "/api/health/ready")
  $state = Read-PulseState -Root $Root
  if (-not $state) { throw "Pulse installation state is missing." }
  return "$($state.url.TrimEnd('/'))$Path"
}

Export-ModuleMember -Function *
