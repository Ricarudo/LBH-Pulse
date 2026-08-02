[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Installer)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$certificate = $null
if (-not $env:PULSE_SIGNING_CERTIFICATE_BASE64) { throw "Signing certificate secret is missing." }
$temporary = Join-Path $env:RUNNER_TEMP "pulse-signing.pfx"
try {
  [IO.File]::WriteAllBytes($temporary, [Convert]::FromBase64String($env:PULSE_SIGNING_CERTIFICATE_BASE64))
  $securePassword = New-Object Security.SecureString
  foreach ($character in $env:PULSE_SIGNING_CERTIFICATE_PASSWORD.ToCharArray()) { $securePassword.AppendChar($character) }
  $securePassword.MakeReadOnly()
  $certificate = Import-PfxCertificate -FilePath $temporary -CertStoreLocation Cert:\CurrentUser\My -Password $securePassword -Exportable:$false
  $signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter signtool.exe | Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $signtool) { throw "Windows signtool.exe is unavailable." }
  $timestamp = if ($env:PULSE_SIGNING_TIMESTAMP_URL) { $env:PULSE_SIGNING_TIMESTAMP_URL } else { "http://timestamp.digicert.com" }
  & $signtool.FullName sign /sha1 $certificate.Thumbprint /fd SHA256 /tr $timestamp /td SHA256 $Installer
  if ($LASTEXITCODE -ne 0) { throw "Authenticode signing failed." }
  & $signtool.FullName verify /pa /all $Installer
  if ($LASTEXITCODE -ne 0) { throw "Authenticode signature verification failed." }
} finally {
  if ($certificate) { Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
}
