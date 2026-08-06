BeforeAll {
  $script:windowsRoot = Split-Path -Parent $PSScriptRoot
  $script:repositoryRoot = (Resolve-Path (Join-Path $windowsRoot "..\..")).Path
  Import-Module (Join-Path $windowsRoot "Pulse.Install.psm1") -Force
  $script:install = Get-Content -LiteralPath (Join-Path $windowsRoot "install-pulse.ps1") -Raw
  $script:update = Get-Content -LiteralPath (Join-Path $windowsRoot "update-pulse.ps1") -Raw
  $script:uninstall = Get-Content -LiteralPath (Join-Path $windowsRoot "uninstall-pulse.ps1") -Raw
  $script:health = Get-Content -LiteralPath (Join-Path $windowsRoot "test-installation.ps1") -Raw
  $script:prerequisites = Get-Content -LiteralPath (Join-Path $windowsRoot "validate-prerequisites.ps1") -Raw
  $script:generator = Get-Content -LiteralPath (Join-Path $windowsRoot "generate-config.ps1") -Raw
  $script:backup = Get-Content -LiteralPath (Join-Path $windowsRoot "backup-pulse.ps1") -Raw
  $script:restore = Get-Content -LiteralPath (Join-Path $windowsRoot "restore-pulse.ps1") -Raw
  $script:iss = Get-Content -LiteralPath (Join-Path $windowsRoot "pulse-setup.iss") -Raw
}

Describe "Pulse installer security primitives" {
  It "generates independent 384-bit secrets" {
    $first = New-PulseSecret
    $second = New-PulseSecret
    $first | Should -BeOfType ([string])
    $first.Length | Should -Be 96
    $first | Should -Match '^[a-f0-9]{96}$'
    $second | Should -Not -Be $first
  }

  It "redacts registered values, credential URLs, and named secrets" {
    $secret = New-PulseSecret
    Add-PulseSecretValue -Value $secret
    $redacted = Protect-PulseLogText "token=$secret postgresql://pulse:$secret@postgres/pulse password=hunter2"
    $redacted | Should -Not -Match ([regex]::Escape($secret))
    $redacted | Should -Not -Match 'hunter2'
    $redacted | Should -Match '\[REDACTED\]'
  }

  It "redacts the concise installer failure report" {
    $secret = New-PulseSecret
    Add-PulseSecretValue -Value $secret
    $report = Write-PulseFailureReport -Root $TestDrive -Operation "database migration" -Message "token=$secret"
    $content = Get-Content -LiteralPath $report -Raw
    $content | Should -Match 'Operation: database migration'
    $content | Should -Match '\[REDACTED\]'
    $content | Should -Not -Match ([regex]::Escape($secret))
  }

  It "classifies legacy and explicit incomplete installation state as resumable" {
    (Get-PulseInstallationStatus -State $null) | Should -BeNullOrEmpty
    (Get-PulseInstallationStatus -State ([pscustomobject]@{ version = '0.1.0' })) | Should -Be 'initializing'
    (Get-PulseInstallationStatus -State ([pscustomobject]@{ installationStatus = 'initializing' })) | Should -Be 'initializing'
    (Get-PulseInstallationStatus -State ([pscustomobject]@{ installationStatus = 'installed' })) | Should -Be 'installed'
  }

  It "captures native stderr when a nonzero exit is explicitly allowed" {
    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
      $result = Invoke-PulseCommand -FilePath "cmd.exe" -Arguments @("/d", "/c", "echo expected-probe-error 1>&2 & exit /b 7") -Root $TestDrive -AllowFailure -Quiet -NoLog
    } else {
      $result = Invoke-PulseCommand -FilePath "/bin/sh" -Arguments @("-c", "echo expected-probe-error >&2; exit 7") -Root $TestDrive -AllowFailure -Quiet -NoLog
    }
    $result.ExitCode | Should -Be 7
    $result.Output | Should -Match 'expected-probe-error'
  }

  It "accepts localhost only when explicitly allowed" {
    (Test-PulseHostname -Hostname "localhost") | Should -Be $false
    (Test-PulseHostname -Hostname "localhost" -AllowLocalhost) | Should -Be $true
    (Test-PulseHostname -Hostname "pulse.example.com") | Should -Be $true
    (Test-PulseHostname -Hostname "bad_host") | Should -Be $false
  }

  It "normalizes a hostname or pasted HTTPS URL for novice input" {
    (ConvertTo-PulseHostname -Hostname " Pulse.R2.App. ") | Should -Be "pulse.r2.app"
    (ConvertTo-PulseHostname -Hostname "https://Pulse.R2.App/") | Should -Be "pulse.r2.app"
  }

  It "maps private LAN mode to the internal gateway on standard HTTPS ports" {
    $manifest = [pscustomobject]@{ images = [pscustomobject]@{ gatewayInternal = "example/internal@sha256:$('a' * 64)"; gatewayPublic = "example/public@sha256:$('b' * 64)" } }
    $lan = Get-PulseModeConfiguration -Mode lan -Hostname "pulse.example.lan" -Manifest $manifest
    $lan.Url | Should -Be "https://pulse.example.lan"
    $lan.HttpPort | Should -Be 80
    $lan.HttpsPort | Should -Be 443
    $lan.CaddyTarget | Should -Be "internal"
    $lan.GatewayImage | Should -Be $manifest.images.gatewayInternal
    $lan.UsesInternalCa | Should -Be $true
  }

  It "keeps localhost and public gateway behavior unchanged" {
    $manifest = [pscustomobject]@{ images = [pscustomobject]@{ gatewayInternal = "internal"; gatewayPublic = "public" } }
    $local = Get-PulseModeConfiguration -Mode internal -Hostname "ignored.example.com" -Manifest $manifest
    $public = Get-PulseModeConfiguration -Mode public -Hostname "pulse.example.com" -AcmeEmail "operator@example.com" -Manifest $manifest
    $local.Url | Should -Be "https://localhost:8443"
    $local.CaddyTarget | Should -Be "internal"
    $public.Url | Should -Be "https://pulse.example.com"
    $public.CaddyTarget | Should -Be "public"
  }

  It "changes only endpoint values when converting an incomplete installation to LAN mode" {
    Mock -ModuleName Pulse.Install Protect-PulsePath {}
    $root = Join-Path $TestDrive "lan-conversion"
    $paths = Get-PulsePaths -Root $root
    [void](New-Item -ItemType Directory -Path $paths.Config, $paths.Installer -Force)
    [IO.File]::WriteAllLines($paths.Environment, @(
      "PULSE_SESSION_SECRET=unchanged-secret",
      "PULSE_PUBLIC_URL=https://old.example.com",
      "PULSE_CADDY_TARGET=public",
      "PULSE_GATEWAY_IMAGE=old-public"
    ))
    $state = [pscustomobject]@{ mode = "public"; url = "https://old.example.com"; installationStatus = "initializing"; trustInternalCaRequested = $false }
    [IO.File]::WriteAllText($paths.State, ($state | ConvertTo-Json))
    $manifest = [pscustomobject]@{ images = [pscustomobject]@{ gatewayInternal = "internal-digest"; gatewayPublic = "public-digest" } }

    [void](Set-PulseDeploymentMode -Root $root -Mode lan -Hostname "pulse.example.lan" -Manifest $manifest -TrustInternalCa)

    (Get-PulseEnvironmentValue -Path $paths.Environment -Name "PULSE_SESSION_SECRET") | Should -Be "unchanged-secret"
    (Get-PulseEnvironmentValue -Path $paths.Environment -Name "PULSE_CADDY_TARGET") | Should -Be "internal"
    (Get-PulseEnvironmentValue -Path $paths.Environment -Name "PULSE_GATEWAY_IMAGE") | Should -Be "internal-digest"
    $converted = Read-PulseState -Root $root
    $converted.mode | Should -Be "lan"
    $converted.url | Should -Be "https://pulse.example.lan"
    $converted.installationStatus | Should -Be "initializing"
    $converted.trustInternalCaRequested | Should -Be $true
  }

  It "rejects missing and non-digest release images" {
    $images = @{}
    foreach ($name in @('api', 'web', 'maintenance', 'minioInit', 'clamav', 'backupCrypto', 'gatewayInternal', 'gatewayPublic', 'postgres', 'minio', 'minioMc')) {
      $images[$name] = "example/$name@sha256:$('a' * 64)"
    }
    $upgrade = [pscustomobject]@{
      minimumVersion = '0.1.0'
      sourceMigrations = @('202607210001_pulse_0_1_baseline')
      targetMigrations = @('202608030001_quote_due_date')
      rollbackPolicy = 'restore-required-after-migration'
    }
    $manifest = [pscustomobject]@{ schemaVersion = 2; product = 'Pulse'; platform = 'linux/amd64'; version = '0.1.1'; commit = ('b' * 40); upgrade = $upgrade; images = [pscustomobject]$images }
    (Test-PulseReleaseManifest -Manifest $manifest) | Should -Be $true
    $manifest.images.api = 'example/api:latest'
    (Test-PulseReleaseManifest -Manifest $manifest) | Should -Be $false
  }

  It "accepts only the exact successful release migration ledger" {
    $expected = @(
      '202607210001_pulse_0_1_baseline',
      '202607210002_enterprise_security'
    )
    $valid = @(
      '202607210001_pulse_0_1_baseline|true|true',
      '202607210002_enterprise_security|true|true'
    )
    (Test-PulseMigrationLedger -Rows $valid -ExpectedMigrations $expected) | Should -Be $true
    (Test-PulseMigrationLedger -Rows @($valid[0]) -ExpectedMigrations $expected) | Should -Be $false
    (Test-PulseMigrationLedger -Rows @($valid[1], $valid[0]) -ExpectedMigrations $expected) | Should -Be $false
    (Test-PulseMigrationLedger -Rows @($valid[0], '202607210002_enterprise_security|false|true') -ExpectedMigrations $expected) | Should -Be $false
    (Test-PulseMigrationLedger -Rows @($valid[0], '202607210002_enterprise_security|true|false') -ExpectedMigrations $expected) | Should -Be $false
  }

  It "hardens generated secret and state files with explicit ACL protection" {
    $module = Get-Content -LiteralPath (Join-Path $windowsRoot "Pulse.Install.psm1") -Raw
    $generator = Get-Content -LiteralPath (Join-Path $windowsRoot "generate-config.ps1") -Raw
    $module | Should -Match 'SetAccessRuleProtection\(\$true, \$false\)'
    $module | Should -Match 'S-1-5-32-544'
    $module | Should -Match 'S-1-5-18'
    $generator | Should -Match 'Protect-PulsePath -Path \$paths.Environment'
    $generator | Should -Match 'Protect-PulsePath -Path \$paths.SetupCode'
  }

  It "allows Docker Desktop to access only its protected bind-mount paths" {
    $generator | Should -Match 'Protect-PulsePath -Path \$paths.Recovery -AllowCurrentUser'
    $generator | Should -Not -Match 'Protect-PulsePath -Path \$paths.Environment -AllowCurrentUser'
    $generator | Should -Not -Match 'Protect-PulsePath -Path \$paths.SetupCode -AllowCurrentUser'
    $install | Should -Match 'Protect-PulsePath -Path \$paths.Identity -AllowCurrentUser'
    $backup | Should -Match 'Protect-PulsePath -Path \$workBase -AllowCurrentUser'
    $restore | Should -Match 'Protect-PulsePath -Path \$workBase -AllowCurrentUser'
  }
}

Describe "Pulse prerequisite diagnostics" {
  It "distinguishes missing Docker" {
    Get-PulseDockerDiagnostic -DockerAvailable $false | Should -Match 'not installed'
  }

  It "distinguishes a stopped Docker daemon" {
    Get-PulseDockerDiagnostic -DockerAvailable $true -DaemonExitCode 1 | Should -Match 'daemon is not running'
  }

  It "distinguishes missing Compose v2" {
    Get-PulseDockerDiagnostic -DockerAvailable $true -ComposeExitCode 1 | Should -Match 'Compose v2 or newer'
    Get-PulseDockerDiagnostic -DockerAvailable $true -ComposeVersion '1.29.2' | Should -Match 'Compose v2 or newer'
    Get-PulseDockerDiagnostic -DockerAvailable $true -ComposeVersion 'v5.1.3' | Should -BeNullOrEmpty
  }

  It "rejects a non-linux or non-amd64 engine" {
    Get-PulseDockerDiagnostic -DockerAvailable $true -Engine 'windows/amd64' | Should -Match 'linux/amd64'
    Get-PulseDockerDiagnostic -DockerAvailable $true -Engine 'linux/arm64' | Should -Match 'linux/amd64'
  }
}

Describe "Pulse installer failure and preservation contracts" {
  It "reports occupied ports and insufficient disk space separately" {
    $prerequisites | Should -Match 'GB free space is required'
    $prerequisites | Should -Match 'TCP port .* already occupied'
    $prerequisites | Should -Match 'Get-Item -LiteralPath \$env:ProgramData -Force'
    $prerequisites | Should -Match 'Uri "https://ghcr\.io/v2/" -Method Get'
    $prerequisites | Should -Match 'ConvertTo-PulseHostname'
    $prerequisites | Should -Not -Match 'GetHostAddresses|Resolve-DnsName'
  }

  It "fails image pulls, initialization, and migrations through strict compose stages" {
    $install | Should -Match 'immutable image pull'
    $install | Should -Match 'database role apply'
    $install | Should -Match 'database migrations'
    $install | Should -Match '\$ErrorActionPreference = "Stop"'
  }

  It "has an explicit health timeout" {
    $health | Should -Match 'health check timed out'
    $health | Should -Match 'TimeoutSeconds'
    $health | Should -Match 'mode -in @\("internal", "lan"\)'
    $health | Should -Match '"--ssl-revoke-best-effort"'
    $health | Should -Match '"--resolve", "\$\{lanHostname\}:443:127\.0\.0\.1"'
    $health | Should -Not -Match 'Private LAN hostname.*does not resolve on this computer'
    $script:health | Should -Match 'real TLS hostname and SNI'
    $management = Get-Content -LiteralPath (Join-Path $windowsRoot "manage-pulse.ps1") -Raw
    $management | Should -Match '"--resolve", "\$\{lanHostname\}:443:127\.0\.0\.1"'
    $management | Should -Match '"--ssl-revoke-best-effort"'
  }

  It "resumes incomplete initialization and repairs only completed installs" {
    $generator | Should -Match 'installationStatus = "initializing"'
    $install | Should -Match '\$existingStatus -eq "installed"'
    $install | Should -Match 'Resuming the incomplete Pulse'
    $install | Should -Match 'NotePropertyName "installationStatus".*NotePropertyValue "installed"'
    $install | Should -Match 'Existing Pulse .* installation detected'
    $install | Should -Match 'if \(-not \$existingState\)'
    $update | Should -Match '\$currentStatus -ne "installed"'
    $update | Should -Match 'install-pulse\.ps1'
    $update.IndexOf('$currentStatus -ne "installed"') | Should -BeLessThan $update.IndexOf('if ([version]$target.version')
    $resumeStart = $update.IndexOf('$currentStatus -ne "installed"')
    $imageRefresh = $update.IndexOf('Set-ReleaseImages $target', $resumeStart)
    $stateRefresh = $update.IndexOf('Write-PulseState -State $current', $resumeStart)
    $resumeInstall = $update.IndexOf('install-pulse.ps1', $resumeStart)
    $imageRefresh | Should -BeGreaterThan $resumeStart
    $imageRefresh | Should -BeLessThan $resumeInstall
    $stateRefresh | Should -BeLessThan $resumeInstall
    $install | Should -Match 'AllowIncompleteModeChange'
    $install | Should -Match 'Set-PulseDeploymentMode'
    $update | Should -Match 'PSBoundParameters\.ContainsKey\("Mode"\)'
    $update | Should -Match 'AllowIncompleteModeChange'
  }

  It "shows progress and writes a concise sanitized failure report" {
    $module = Get-Content -LiteralPath (Join-Path $windowsRoot "Pulse.Install.psm1") -Raw
    $iss = Get-Content -LiteralPath (Join-Path $windowsRoot "pulse-setup.iss") -Raw
    $module | Should -Match 'Write-Progress.*-Activity "Pulse Setup"'
    $module | Should -Match 'Protect-PulseLogText \$Message'
    $module | Should -Match 'installer-error\.txt'
    $install | Should -Match 'Percent 100 -Status "Pulse installation completed"'
    $iss | Should -Match 'RaisePulseFailure'
    $iss | Should -Match 'installer-error\.txt'
  }

  It "backs up before beginning an update migration" {
    $update.IndexOf('$sourceLedger = Get-AppliedMigrationLedger') | Should -BeLessThan $update.IndexOf('backup-pulse.ps1')
    $update.IndexOf('backup-pulse.ps1') | Should -BeLessThan $update.IndexOf('$migrationStarted = $true')
    $update.IndexOf('update migrations') | Should -BeLessThan $update.IndexOf('$targetLedger = Get-AppliedMigrationLedger')
    $update | Should -Match 'automatic downgrade is prohibited'
  }

  It "preserves volumes by default and prohibits silent deletion" {
    $uninstall | Should -Match '\[switch\]\$RemoveData'
    $uninstall | Should -Match 'Silent uninstall can never delete Pulse data'
    $uninstall | Should -Match 'DELETE PULSE DATA'
    $uninstall | Should -Not -Match 'down".*, "-v"'
  }
}

Describe "Pulse release inventory" {
  It "uses the prebuilt Prisma client in the read-only reference-data service" {
    $maintenanceCompose = Get-Content -LiteralPath (Join-Path $repositoryRoot "compose.maintenance.yaml") -Raw
    $apiPackage = Get-Content -LiteralPath (Join-Path $repositoryRoot "apps\api\package.json") -Raw | ConvertFrom-Json
    $workflow = Get-Content -LiteralPath (Join-Path $repositoryRoot ".github\workflows\ci.yml") -Raw
    $maintenanceCompose | Should -Match 'command: \["npm", "run", "db:reference-data:apply:prebuilt"'
    $apiPackage.scripts.'db:reference-data:apply:prebuilt' | Should -Be 'tsx prisma/bootstrap.ts --apply'
    $workflow | Should -Match 'Validate read-only reference data maintenance'
    $workflow | Should -Match '--profile maintenance run --no-deps --rm reference-data'
  }

  It "overrides every released service with an immutable-image variable" {
    $overlay = Get-Content -LiteralPath (Join-Path $repositoryRoot "compose.release.yaml") -Raw
    foreach ($service in @('postgres', 'minio', 'minio-init', 'clamav', 'api', 'web', 'gateway', 'db-roles', 'migrate', 'reference-data', 'db-role-verify', 'minio-backup', 'minio-restore', 'backup-encrypt', 'backup-decrypt')) {
      $overlay | Should -Match ("(?m)^  " + [regex]::Escape($service) + ":")
    }
    $overlay | Should -Not -Match '(?m)^\s+build:'
  }

  It "embeds only deployment inputs and installer support files" {
    $iss | Should -Match 'compose\.production\.yaml'
    $iss | Should -Match 'compose\.maintenance\.yaml'
    $iss | Should -Match 'compose\.release\.yaml'
    $iss | Should -Match 'release-manifest\.json'
    $iss | Should -Not -Match 'node_modules|\.git|apps\\api\\src|apps\\web\\src'
  }

  It "offers private LAN HTTPS without using the public ACME gateway" {
    $iss | Should -Match "Private LAN HTTPS using a router or local DNS hostname"
    $iss | Should -Match "Mode := 'lan'"
    $iss | Should -Match "PowerShellParameters\('update-pulse\.ps1'\)"
    $generator | Should -Match 'ValidateSet\("internal", "lan", "public"\)'
    $generator | Should -Match 'PULSE_CADDY_TARGET=\$\(\$settings\.CaddyTarget\)'
    $update | Should -Match '\$current\.mode -eq "public"'
    $iss | Should -Match 'function ShouldOpenPulse: Boolean'
    $iss | Should -Match 'Result := ModePage\.SelectedValueIndex <> 1'
  }

  It "does not expand the app directory before Inno initializes it" {
    $iss = Get-Content -LiteralPath (Join-Path $windowsRoot "pulse-setup.iss") -Raw
    $wizardBody = [regex]::Match($iss, '(?s)procedure InitializeWizard;(?<body>.*?)end;\r?\n\r?\nfunction ShouldSkipPage').Groups['body'].Value
    $wizardBody | Should -Not -Match "ExpandConstant\('\{app\}"
  }

  It "does not query uninstall-only state while Setup registers commands" {
    $iss = Get-Content -LiteralPath (Join-Path $windowsRoot "pulse-setup.iss") -Raw
    $parametersBody = [regex]::Match($iss, '(?s)function GetUninstallParameters\(.*?(?<body>begin.*?end;)\r?\n\r?\n\[Run\]').Groups['body'].Value
    $parametersBody | Should -Match 'if IsUninstaller then\s+if UninstallSilent then'
  }
}
