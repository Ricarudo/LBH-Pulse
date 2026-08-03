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
    if ($IsWindows) {
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

  It "rejects missing and non-digest release images" {
    $images = @{}
    foreach ($name in @('api', 'web', 'maintenance', 'minioInit', 'clamav', 'backupCrypto', 'gatewayInternal', 'gatewayPublic', 'postgres', 'minio', 'minioMc')) {
      $images[$name] = "example/$name@sha256:$('a' * 64)"
    }
    $manifest = [pscustomobject]@{ schemaVersion = 1; product = 'Pulse'; platform = 'linux/amd64'; version = '0.1.0'; commit = ('b' * 40); images = [pscustomobject]$images }
    (Test-PulseReleaseManifest -Manifest $manifest) | Should -Be $true
    $manifest.images.api = 'example/api:latest'
    (Test-PulseReleaseManifest -Manifest $manifest) | Should -Be $false
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
    $update.IndexOf('backup-pulse.ps1') | Should -BeLessThan $update.IndexOf('$migrationStarted = $true')
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
  It "overrides every released service with an immutable-image variable" {
    $overlay = Get-Content -LiteralPath (Join-Path $repositoryRoot "compose.release.yaml") -Raw
    foreach ($service in @('postgres', 'minio', 'minio-init', 'clamav', 'api', 'web', 'gateway', 'db-roles', 'migrate', 'reference-data', 'db-role-verify', 'minio-backup', 'minio-restore', 'backup-encrypt', 'backup-decrypt')) {
      $overlay | Should -Match ("(?m)^  " + [regex]::Escape($service) + ":")
    }
    $overlay | Should -Not -Match '(?m)^\s+build:'
  }

  It "embeds only deployment inputs and installer support files" {
    $iss = Get-Content -LiteralPath (Join-Path $windowsRoot "pulse-setup.iss") -Raw
    $iss | Should -Match 'compose\.production\.yaml'
    $iss | Should -Match 'compose\.maintenance\.yaml'
    $iss | Should -Match 'compose\.release\.yaml'
    $iss | Should -Match 'release-manifest\.json'
    $iss | Should -Not -Match 'node_modules|\.git|apps\\api\\src|apps\\web\\src'
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
