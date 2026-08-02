[CmdletBinding()]
param(
  [ValidateSet("Open", "Start", "Stop", "Health", "Logs", "CompleteSetup")][string]$Action,
  [string]$Root = "$env:ProgramData\LBH\Pulse",
  [ValidateRange(0, 3600)][int]$WaitForSetupSeconds = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "Pulse.Install.psm1") -Force
$paths = Get-PulsePaths -Root $Root
$state = Read-PulseState -Root $Root
if (-not $state) { throw "Pulse installation state is missing." }

switch ($Action) {
  "Open" { Start-Process $state.url }
  "Start" {
    [void](Invoke-PulseCompose -Root $Root -Arguments @("up", "-d", "--no-build", "--wait", "--wait-timeout", "360") -Stage "start Pulse")
    & (Join-Path $PSScriptRoot "test-installation.ps1") -Root $Root
  }
  "Stop" {
    [void](Invoke-PulseCompose -Root $Root -Arguments @("stop", "gateway", "web", "api") -Stage "stop Pulse application services")
  }
  "Health" { & (Join-Path $PSScriptRoot "test-installation.ps1") -Root $Root }
  "Logs" {
    $result = Invoke-PulseCompose -Root $Root -Arguments @("logs", "--no-color", "--since", "30m", "api", "web", "gateway") -Stage "collect service logs" -AllowFailure -Quiet
    $path = Join-Path $paths.Logs "service-diagnostics.log"
    [IO.File]::WriteAllText($path, (Protect-PulseLogText $result.Output), (New-Object Text.UTF8Encoding($false)))
    Start-Process notepad.exe -ArgumentList @($path)
  }
  "CompleteSetup" {
    $deadline = [DateTime]::UtcNow.AddSeconds($WaitForSetupSeconds)
    do {
      $temporary = Join-Path $paths.Installer "setup-status.json"
      $arguments = @("--fail", "--silent", "--show-error", "--max-time", "30")
      if ($state.mode -eq "internal") { $arguments += @("--cacert", (Join-Path $paths.Config "caddy-root.crt")) }
      $arguments += @("--output", $temporary, "$($state.url.TrimEnd('/'))/api/auth/session")
      & curl.exe @arguments
      if ($LASTEXITCODE -ne 0) { throw "Pulse first-run status could not be checked." }
      try { $status = Get-Content -LiteralPath $temporary -Raw | ConvertFrom-Json } finally { if (Test-Path $temporary) { Remove-Item -LiteralPath $temporary -Force } }
      if (-not $status.setupRequired) { break }
      if ([DateTime]::UtcNow -ge $deadline) { throw "Complete the Administrator setup in the browser before finalizing Pulse." }
      Start-Sleep -Seconds 5
    } while ($true)
    Set-PulseEnvironmentValue -Path $paths.Environment -Name "PULSE_SETUP_TOKEN" -Value ""
    if (Test-Path -LiteralPath $paths.SetupCode) { Remove-Item -LiteralPath $paths.SetupCode -Force }
    [void](Invoke-PulseCompose -Root $Root -Arguments @("up", "-d", "--no-build", "--force-recreate", "--wait", "--wait-timeout", "360", "api", "web", "gateway") -Stage "remove first-run setup token")
    $state.firstRunComplete = $true
    $state.firstRunCompletedAt = [DateTime]::UtcNow.ToString("o")
    Write-PulseState -State $state -Root $Root
    & (Join-Path $PSScriptRoot "test-installation.ps1") -Root $Root
  }
}
