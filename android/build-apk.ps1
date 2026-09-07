$ErrorActionPreference = 'Stop'

$versionFile = Join-Path $PSScriptRoot 'version.properties'
$properties = @{}
Get-Content $versionFile | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') { $properties[$matches[1]] = $matches[2] }
}

$versionParts = $properties.versionName.Split('.') | ForEach-Object { [int]$_ }
if ($versionParts.Count -lt 2) { throw 'versionName must contain at least major and minor components.' }
if ($versionParts.Count -eq 2) { $versionParts += 0 }
$versionParts[$versionParts.Count - 1]++
$nextVersion = $versionParts -join '.'
$nextCode = ([int]$properties.versionCode) + 1

Set-Content $versionFile "versionCode=$nextCode`nversionName=$nextVersion`n"

$gradle = Join-Path $env:TEMP 'gradle-8.10.2\bin\gradle.bat'
if (-not (Test-Path $gradle)) { throw "Gradle not found at $gradle" }

& $gradle -p $PSScriptRoot --no-daemon --console=plain assembleRelease
if ($LASTEXITCODE -ne 0) { throw "Android build failed for version $nextVersion." }

$apk = Join-Path $PSScriptRoot 'app\build\outputs\apk\release\app-release.apk'
$desktop = [Environment]::GetFolderPath('Desktop')
$destination = Join-Path $desktop "cfam v$nextVersion.apk"
Copy-Item $apk $destination -Force
Write-Output "Built $destination (versionCode $nextCode)."
