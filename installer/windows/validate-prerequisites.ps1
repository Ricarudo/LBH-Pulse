[CmdletBinding()]
param(
  [ValidateSet("internal", "public")][string]$Mode = "internal",
  [string]$Hostname = "localhost",
  [int]$MinimumFreeGb = 20,
  [switch]$AllowOccupiedPorts,
  [switch]$SkipNetworkCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "Pulse.Install.psm1") -Force

if (-not [Environment]::Is64BitOperatingSystem) { throw "Pulse requires 64-bit Windows." }
$windows = [Environment]::OSVersion.Version
if ($windows.Major -lt 10 -or $windows.Build -lt 19045 -or ($windows.Build -ge 22000 -and $windows.Build -lt 22631)) {
  throw "Pulse requires Windows 10 22H2 build 19045 or Windows 11 23H2 build 22631 or newer."
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "Run Pulse Setup as an administrator." }
if ($PSVersionTable.PSVersion -lt [version]"5.1") { throw "PowerShell 5.1 or newer is required." }
$dockerAvailable = [bool](Get-Command docker -ErrorAction SilentlyContinue)
if (-not $dockerAvailable) { throw (Get-PulseDockerDiagnostic -DockerAvailable $false) }
if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { throw "Windows curl.exe is required for HTTPS health checks." }
if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) { throw "Windows tar.exe is required for encrypted backups and restore verification." }

$daemon = Invoke-PulseCommand -FilePath "docker" -Arguments @("info", "--format", "{{.OSType}}/{{.Architecture}}") -Stage "Docker daemon check" -AllowFailure -Quiet -NoLog
$compose = if ($daemon.ExitCode -eq 0) {
  Invoke-PulseCommand -FilePath "docker" -Arguments @("compose", "version", "--short") -Stage "Docker Compose v2 check" -AllowFailure -Quiet -NoLog
} else { [pscustomobject]@{ ExitCode = -1; Output = "" } }
$dockerFailure = Get-PulseDockerDiagnostic -DockerAvailable $dockerAvailable -DaemonExitCode $daemon.ExitCode -Engine $daemon.Output.Trim() -ComposeExitCode $compose.ExitCode -ComposeVersion $compose.Output.Trim()
if ($dockerFailure) { throw $dockerFailure }

$programDataDriveName = (Get-Item -LiteralPath $env:ProgramData -Force).PSDrive.Name
$drive = Get-PSDrive -Name $programDataDriveName
if (($drive.Free / 1GB) -lt $MinimumFreeGb) { throw "At least $MinimumFreeGb GB free space is required on the ProgramData drive." }
if (-not (Test-PulseHostname -Hostname $Hostname -AllowLocalhost:($Mode -eq "internal"))) { throw "The requested Pulse hostname is invalid." }

$ports = if ($Mode -eq "internal") { @(8080, 8443) } else { @(80, 443) }
foreach ($port in $ports) {
  $occupied = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
  if ($occupied -and -not $AllowOccupiedPorts) { throw "Required TCP port $port is already occupied." }
}
$udpOccupied = Get-NetUDPEndpoint -LocalPort $ports[-1] -ErrorAction SilentlyContinue
if ($udpOccupied -and -not $AllowOccupiedPorts) { throw "Required UDP port $($ports[-1]) is already occupied." }

if (-not $SkipNetworkCheck) {
  try {
    [void](Invoke-WebRequest -UseBasicParsing -Uri "https://ghcr.io/v2/" -Method Get -TimeoutSec 15)
  } catch {
    if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 401) {
      throw "GitHub Container Registry cannot be reached. Check DNS, proxy, firewall, and internet access."
    }
  }
}

[pscustomobject]@{ Status = "ok"; Docker = $daemon.Output.Trim(); Compose = $compose.Output.Trim(); Ports = $ports }
