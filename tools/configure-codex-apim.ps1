[CmdletBinding()]
param(
    [string]$DashboardBaseUrl = "https://dashboard.beyondmarks.ai/api/proxy",
    [string]$ApimKey,
    [ValidateSet("gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-6-astra", "gpt-4.1")]
    [string]$Model = "gpt-5.6-luna",
    [string]$CodexConfigHome,
    [string]$CredentialHome,
    [switch]$SkipValidation,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

function Convert-SecureStringToPlainText {
    param([Parameter(Mandatory = $true)][Security.SecureString]$Value)
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Write-Utf8File {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value
    )
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($Path, $Value, $encoding)
}

function Remove-BeyondMarksProvider {
    param([AllowEmptyString()][string]$Config)

    $result = $Config
    $providerPattern = '(?ms)^\[model_providers\.(?:beyondmarks|azure_apim)(?:\.auth)?\][ \t]*\r?\n.*?(?=^\[|\z)'
    do {
        $previous = $result
        $result = [regex]::Replace($result, $providerPattern, '')
    } while ($result -ne $previous)

    return $result
}

function Set-TopLevelSetting {
    param(
        [AllowEmptyString()][string]$Config,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $firstTable = [regex]::Match($Config, '(?m)^\s*\[')
    $prefix = if ($firstTable.Success) { $Config.Substring(0, $firstTable.Index) } else { $Config }
    $suffix = if ($firstTable.Success) { $Config.Substring($firstTable.Index) } else { '' }
    $pattern = "(?m)^$([regex]::Escape($Name))\s*=\s*.*$"
    if ($prefix -match $pattern) {
        $prefix = [regex]::Replace($prefix, $pattern, "$Name = `"$Value`"", 1)
    } else {
        $prefix = "$Name = `"$Value`"`r`n" + $prefix
    }
    return $prefix + $suffix
}

$userProfilePath = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
$localAppDataPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$codexHomePath = if ($CodexConfigHome) {
    $CodexConfigHome
} elseif ($env:CODEX_HOME) {
    $env:CODEX_HOME
} else {
    Join-Path $userProfilePath '.codex'
}
$configPath = Join-Path $codexHomePath 'config.toml'
$installRoot = if ($CredentialHome) { $CredentialHome } else { Join-Path $localAppDataPath 'BeyondMarks\Codex' }
$credentialPath = Join-Path $installRoot 'student-key.dpapi'
$helperPath = Join-Path $installRoot 'get-token.ps1'
$dashboardBase = $DashboardBaseUrl.TrimEnd('/')

New-Item -ItemType Directory -Path $codexHomePath -Force | Out-Null
$config = if (Test-Path -LiteralPath $configPath) {
    Get-Content -Raw -LiteralPath $configPath
} else {
    ''
}

if ($Uninstall) {
    if (Test-Path -LiteralPath $configPath) {
        $backupPath = "$configPath.before-beyondmarks-uninstall-$(Get-Date -Format yyyyMMdd-HHmmss).bak"
        Copy-Item -LiteralPath $configPath -Destination $backupPath
        $config = Remove-BeyondMarksProvider -Config $config
        $config = [regex]::Replace($config, '(?m)^model_provider\s*=\s*["'']beyondmarks["'']\s*\r?\n?', '')
        Write-Utf8File -Path $configPath -Value ($config.Trim() + "`r`n")
    }
    if (Test-Path -LiteralPath $credentialPath) { Remove-Item -LiteralPath $credentialPath -Force }
    if (Test-Path -LiteralPath $helperPath) { Remove-Item -LiteralPath $helperPath -Force }
    [Environment]::SetEnvironmentVariable('CODEX_APIM_KEY', $null, 'User')
    Write-Host 'BeyondMarks Codex authentication was removed for this Windows user.' -ForegroundColor Green
    exit 0
}

if ([string]::IsNullOrWhiteSpace($ApimKey)) {
    $secureKey = Read-Host 'Paste your BeyondMarks student API key' -AsSecureString
    $ApimKey = Convert-SecureStringToPlainText -Value $secureKey
}
$ApimKey = $ApimKey.Trim()
if ($ApimKey -notmatch '^bma_[A-Za-z0-9_-]{40,}$') {
    throw 'The key format is invalid. Copy the complete bma_ key from the BeyondMarks dashboard.'
}

if (-not $SkipValidation) {
    try {
        $validation = Invoke-RestMethod -Method Get -Uri "$dashboardBase/validate" -Headers @{ Authorization = "Bearer $ApimKey" } -TimeoutSec 20
        if (-not $validation.valid) { throw 'The server did not confirm the key.' }
        Write-Host "Key verified for $($validation.student.name)." -ForegroundColor Green
        if ($validation.models) {
            Write-Host "Available Codex models: $($validation.models -join ', ')"
        }
    } catch {
        $detail = $_.ErrorDetails.Message
        if ($detail) {
            try { $detail = (ConvertFrom-Json $detail).error } catch {}
        }
        if (-not $detail) { $detail = $_.Exception.Message }
        throw "BeyondMarks could not validate this key: $detail"
    }
}

New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
$encryptedKey = ConvertFrom-SecureString (ConvertTo-SecureString $ApimKey -AsPlainText -Force)
Write-Utf8File -Path $credentialPath -Value $encryptedKey

$helper = @'
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$CredentialPath)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $CredentialPath)) {
    [Console]::Error.WriteLine("BeyondMarks credential is missing. Run the BeyondMarks Codex installer again.")
    exit 1
}

try {
    $encryptedKey = (Get-Content -Raw -LiteralPath $CredentialPath).Trim()
    $secureKey = ConvertTo-SecureString $encryptedKey
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    try {
        $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        if ($plainKey -notmatch "^bma_[A-Za-z0-9_-]{40,}$") { throw "Stored key is invalid." }
        [Console]::Out.Write($plainKey)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
} catch {
    [Console]::Error.WriteLine("BeyondMarks credential could not be read. Run the installer again for this Windows user.")
    exit 1
}
'@
Write-Utf8File -Path $helperPath -Value $helper

if (Test-Path -LiteralPath $configPath) {
    $backupPath = "$configPath.before-beyondmarks-$(Get-Date -Format yyyyMMdd-HHmmss).bak"
    Copy-Item -LiteralPath $configPath -Destination $backupPath
} else {
    $backupPath = $null
}

$config = Remove-BeyondMarksProvider -Config $config
$config = [regex]::Replace($config, '(?m)^\s*token_budget\s*=.*\r?\n?', '')
$config = [regex]::Replace($config, '(?ms)^\[session-flags\]\s*\r?\n(?=\s*(?:\[|\z))', '')
$config = Set-TopLevelSetting -Config $config -Name 'model' -Value $Model
$config = Set-TopLevelSetting -Config $config -Name 'model_provider' -Value 'beyondmarks'

$tomlHelperPath = $helperPath.Replace('\', '\\').Replace('"', '\"')
$tomlCredentialPath = $credentialPath.Replace('\', '\\').Replace('"', '\"')
$provider = @"

[model_providers.beyondmarks]
name = "BeyondMarks"
base_url = "$dashboardBase"
wire_api = "responses"

[model_providers.beyondmarks.auth]
command = "powershell.exe"
args = ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", "$tomlHelperPath", "-CredentialPath", "$tomlCredentialPath"]
timeout_ms = 5000
refresh_interval_ms = 0
"@

Write-Utf8File -Path $configPath -Value ($config.Trim() + "`r`n" + $provider.Trim() + "`r`n")

$helperOutput = & powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helperPath -CredentialPath $credentialPath
if ($LASTEXITCODE -ne 0 -or $helperOutput -ne $ApimKey) {
    throw 'The encrypted credential helper verification failed.'
}

Write-Host ''
Write-Host 'BeyondMarks Codex setup completed successfully.' -ForegroundColor Green
Write-Host "Config: $configPath"
Write-Host "Credential: $credentialPath (Windows DPAPI encrypted)"
if ($backupPath) { Write-Host "Backup: $backupPath" }
Write-Host 'Fully close and reopen Codex. You will not need to enter the key again.'
