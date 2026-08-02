$windowsRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = (Resolve-Path (Join-Path $windowsRoot "..\..")).Path
Import-Module (Join-Path $windowsRoot "Pulse.Install.psm1") -Force

Describe "Pulse installer security primitives" {
  It "generates independent 384-bit secrets" {
    $first = New-PulseSecret
    $second = New-PulseSecret
    $first | Should BeOfType ([string])
    $first.Length | Should Be 96
    $first | Should Match '^[a-f0-9]{96}$'
    $second | Should Not Be $first
  }

  It "redacts registered values, credential URLs, and named secrets" {
    $secret = New-PulseSecret
    Add-PulseSecretValue -Value $secret
    $redacted = Protect-PulseLogText "token=$secret postgresql://pulse:$secret@postgres/pulse password=hunter2"
    $redacted | Should Not Match ([regex]::Escape($secret))
    $redacted | Should Not Match 'hunter2'
    $redacted | Should Match '\[REDACTED\]'
  }

  It "accepts localhost only when explicitly allowed" {
    (Test-PulseHostname -Hostname "localhost") | Should Be $false
    (Test-PulseHostname -Hostname "localhost" -AllowLocalhost) | Should Be $true
    (Test-PulseHostname -Hostname "pulse.example.com") | Should Be $true
    (Test-PulseHostname -Hostname "bad_host") | Should Be $false
  }

  It "rejects missing and non-digest release images" {
    $images = @{}
    foreach ($name in @('api', 'web', 'maintenance', 'minioInit', 'clamav', 'backupCrypto', 'gatewayInternal', 'gatewayPublic', 'postgres', 'minio', 'minioMc')) {
      $images[$name] = "example/$name@sha256:$('a' * 64)"
    }
    $manifest = [pscustomobject]@{ schemaVersion = 1; product = 'Pulse'; platform = 'linux/amd64'; version = '0.1.0'; commit = ('b' * 40); images = [pscustomobject]$images }
    (Test-PulseReleaseManifest -Manifest $manifest) | Should Be $true
    $manifest.images.api = 'example/api:latest'
    (Test-PulseReleaseManifest -Manifest $manifest) | Should Be $false
  }

  It "hardens generated secret and state files with explicit ACL protection" {
    $module = Get-Content -LiteralPath (Join-Path $windowsRoot "Pulse.Install.psm1") -Raw
    $generator = Get-Content -LiteralPath (Join-Path $windowsRoot "generate-config.ps1") -Raw
    $module | Should Match 'SetAccessRuleProtection\(\$true, \$false\)'
    $module | Should Match 'S-1-5-32-544'
    $module | Should Match 'S-1-5-18'
    $generator | Should Match 'Protect-PulsePath -Path \$paths.Environment'
    $generator | Should Match 'Protect-PulsePath -Path \$paths.SetupCode'
  }
}

Describe "Pulse prerequisite diagnostics" {
  It "distinguishes missing Docker" {
    Get-PulseDockerDiagnostic -DockerAvailable $false | Should Match 'not installed'
  }

  It "distinguishes a stopped Docker daemon" {
    Get-PulseDockerDiagnostic -DockerAvailable $true -DaemonExitCode 1 | Should Match 'daemon is not running'
  }

  It "distinguishes missing Compose v2" {
    Get-PulseDockerDiagnostic -DockerAvailable $true -ComposeExitCode 1 | Should Match 'Compose v2'
    Get-PulseDockerDiagnostic -DockerAvailable $true -ComposeVersion '1.29.2' | Should Match 'Compose v2'
  }

  It "rejects a non-linux or non-amd64 engine" {
    Get-PulseDockerDiagnostic -DockerAvailable $true -Engine 'windows/amd64' | Should Match 'linux/amd64'
    Get-PulseDockerDiagnostic -DockerAvailable $true -Engine 'linux/arm64' | Should Match 'linux/amd64'
  }
}

Describe "Pulse installer failure and preservation contracts" {
  $install = Get-Content -LiteralPath (Join-Path $windowsRoot "install-pulse.ps1") -Raw
  $update = Get-Content -LiteralPath (Join-Path $windowsRoot "update-pulse.ps1") -Raw
  $uninstall = Get-Content -LiteralPath (Join-Path $windowsRoot "uninstall-pulse.ps1") -Raw
  $health = Get-Content -LiteralPath (Join-Path $windowsRoot "test-installation.ps1") -Raw
  $prerequisites = Get-Content -LiteralPath (Join-Path $windowsRoot "validate-prerequisites.ps1") -Raw

  It "reports occupied ports and insufficient disk space separately" {
    $prerequisites | Should Match 'GB free space is required'
    $prerequisites | Should Match 'TCP port .* already occupied'
  }

  It "fails image pulls, initialization, and migrations through strict compose stages" {
    $install | Should Match 'immutable image pull'
    $install | Should Match 'database role apply'
    $install | Should Match 'database migrations'
    $install | Should Match '\$ErrorActionPreference = "Stop"'
  }

  It "has an explicit health timeout" {
    $health | Should Match 'health check timed out'
    $health | Should Match 'TimeoutSeconds'
  }

  It "repairs reruns without regenerating configuration" {
    $install | Should Match 'Existing Pulse .* installation detected'
    $install.IndexOf('if ($existingState)') | Should BeLessThan $install.IndexOf('generate-config.ps1')
  }

  It "backs up before beginning an update migration" {
    $update.IndexOf('backup-pulse.ps1') | Should BeLessThan $update.IndexOf('$migrationStarted = $true')
    $update | Should Match 'automatic downgrade is prohibited'
  }

  It "preserves volumes by default and prohibits silent deletion" {
    $uninstall | Should Match '\[switch\]\$RemoveData'
    $uninstall | Should Match 'Silent uninstall can never delete Pulse data'
    $uninstall | Should Match 'DELETE PULSE DATA'
    $uninstall | Should Not Match 'down".*, "-v"'
  }
}

Describe "Pulse release inventory" {
  It "overrides every released service with an immutable-image variable" {
    $overlay = Get-Content -LiteralPath (Join-Path $repositoryRoot "compose.release.yaml") -Raw
    foreach ($service in @('postgres', 'minio', 'minio-init', 'clamav', 'api', 'web', 'gateway', 'db-roles', 'migrate', 'reference-data', 'db-role-verify', 'minio-backup', 'minio-restore', 'backup-encrypt', 'backup-decrypt')) {
      $overlay | Should Match ("(?m)^  " + [regex]::Escape($service) + ":")
    }
    $overlay | Should Not Match '(?m)^\s+build:'
  }

  It "embeds only deployment inputs and installer support files" {
    $iss = Get-Content -LiteralPath (Join-Path $windowsRoot "pulse-setup.iss") -Raw
    $iss | Should Match 'compose\.production\.yaml'
    $iss | Should Match 'compose\.maintenance\.yaml'
    $iss | Should Match 'compose\.release\.yaml'
    $iss | Should Match 'release-manifest\.json'
    $iss | Should Not Match 'node_modules|\.git|apps\\api\\src|apps\\web\\src'
  }
}
