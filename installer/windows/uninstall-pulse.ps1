[CmdletBinding()]
param(
  [string]$Root = "$env:ProgramData\LBH\Pulse",
  [bool]$StopContainers = $true,
  [switch]$RemoveData,
  [string]$DataDeletionConfirmation,
  [switch]$RemoveInternalCa,
  [switch]$Silent
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "Pulse.Install.psm1") -Force
$paths = Get-PulsePaths -Root $Root
$state = Read-PulseState -Root $Root
if (-not $state) { return }
if ($Silent -and $RemoveData) { throw "Silent uninstall can never delete Pulse data." }
if ($RemoveData -and -not $DataDeletionConfirmation -and -not $Silent) {
  $DataDeletionConfirmation = Read-Host "Type DELETE PULSE DATA to permanently remove the Pulse Docker volumes"
}
if ($RemoveData -and $DataDeletionConfirmation -cne "DELETE PULSE DATA") { throw "Exact confirmation 'DELETE PULSE DATA' is required to remove persistent volumes." }

if ($StopContainers) {
  [void](Invoke-PulseCompose -Root $Root -Arguments @("down", "--remove-orphans") -Stage "remove Pulse containers" -AllowFailure)
}
if ($RemoveData) {
  foreach ($volume in @($state.volumes)) {
    if ($volume -notmatch '^pulse-production(?:_|-)') { throw "Refusing unexpected volume name '$volume'." }
    [void](Invoke-PulseCommand -FilePath "docker" -Arguments @("volume", "rm", $volume) -Root $Root -Stage "explicitly confirmed volume deletion" -AllowFailure)
  }
}
if ($RemoveInternalCa -and $state.caThumbprint) {
  $certificate = Get-ChildItem "Cert:\LocalMachine\Root\$($state.caThumbprint)" -ErrorAction SilentlyContinue
  if ($certificate) { Remove-Item -LiteralPath $certificate.PSPath -Force }
}

Write-PulseLog -Root $Root -Message "Pulse application files were uninstalled. Configuration, backups, and persistent volumes preserved: $(-not $RemoveData)."
# Preserve deployment metadata with the protected configuration so a later installer can safely repair retained volumes.
if ($RemoveData) {
  if (Test-Path -LiteralPath $paths.Deployment) { Remove-PulseTemporaryDirectory -Path $paths.Deployment -Root $paths.Root }
  if (Test-Path -LiteralPath $paths.State) { Remove-Item -LiteralPath $paths.State -Force }
}
