[CmdletBinding(DefaultParameterSetName = "Installed")]
param(
  [Parameter(ParameterSetName = "Installed")][string]$Root = "$env:ProgramData\LBH\Pulse",
  [Parameter(ParameterSetName = "Repository", Mandatory = $true)][string]$RepositoryRoot,
  [int]$TimeoutSeconds = 360
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($PSCmdlet.ParameterSetName -eq "Repository") {
  $installerRoot = Join-Path $RepositoryRoot "installer\windows"
  $files = Get-ChildItem -LiteralPath $installerRoot -Recurse -File | Where-Object { $_.Extension -in @(".ps1", ".psm1") }
  foreach ($file in $files) {
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw "PowerShell syntax validation failed for $($file.FullName): $($errors[0].Message)" }
  }
  $tests = Join-Path $installerRoot "tests"
  if (Test-Path -LiteralPath $tests) {
    $pester = Get-Command Invoke-Pester -ErrorAction SilentlyContinue
    if (-not $pester) { throw "Pester is required to run the Windows installer test suite." }
    $result = Invoke-Pester -Path $tests -PassThru
    if ($result.FailedCount -gt 0) { throw "$($result.FailedCount) Windows installer tests failed." }
  }
  Write-Output "Windows installer PowerShell validation passed."
  exit 0
}

Import-Module (Join-Path $PSScriptRoot "Pulse.Install.psm1") -Force
$paths = Get-PulsePaths -Root $Root
$state = Read-PulseState -Root $Root
if (-not $state) { throw "Pulse installation state is missing." }

$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
do {
  $status = Invoke-PulseCompose -Root $Root -Arguments @("ps", "--format", "json") -Stage "service health status" -AllowFailure -Quiet
  $running = Invoke-PulseCompose -Root $Root -Arguments @("ps", "--services", "--filter", "status=running") -Stage "running service inventory" -AllowFailure -Quiet
  $runningServices = @($running.Output -split "`r?`n" | Where-Object { $_ })
  $missingRequired = @("postgres", "minio", "clamav", "api", "web", "gateway") | Where-Object { $_ -notin $runningServices } | Measure-Object
  if ($status.ExitCode -eq 0 -and $running.ExitCode -eq 0 -and $missingRequired.Count -eq 0 -and $status.Output -notmatch 'unhealthy|starting') { break }
  Start-Sleep -Seconds 5
} while ([DateTime]::UtcNow -lt $deadline)
if ([DateTime]::UtcNow -ge $deadline) { throw "Pulse service health check timed out after $TimeoutSeconds seconds." }

$url = Get-PulseHealthUrl -Root $Root
$curl = @("--fail", "--silent", "--show-error", "--max-time", "30")
$caPath = Join-Path $paths.Config "caddy-root.crt"
if ($state.mode -in @("internal", "lan")) {
  if (-not (Test-Path -LiteralPath $caPath)) { throw "Pulse internal CA certificate is missing." }
  $curl += @("--cacert", $caPath)
}
if ($state.mode -eq "lan") {
  # The server may not use the router's client-facing DNS, so verify the local gateway with the real TLS hostname and SNI.
  $lanHostname = ([uri][string]$state.url).Host
  $curl += @("--resolve", "${lanHostname}:443:127.0.0.1")
}
$curl += $url
$readiness = Invoke-PulseCommand -FilePath "curl.exe" -Arguments $curl -Root $Root -Stage "Pulse readiness endpoint" -AllowFailure -Quiet
if ($readiness.ExitCode -ne 0) {
  if ($readiness.ExitCode -eq 6 -and $state.mode -eq "public") {
    throw "Public hostname '$(([uri][string]$state.url).Host)' does not exist in public DNS. Create its public DNS record and wait for propagation before retrying."
  }
  throw "Pulse HTTPS readiness failed with curl exit code $($readiness.ExitCode). Review the sanitized installer and gateway logs."
}
Write-PulseLog -Root $Root -Message "Pulse service and HTTPS readiness checks passed."
[pscustomobject]@{ Status = "ok"; Url = $state.url; Version = $state.version }
