# Chocolatey uninstall — mirrors the measured install.ps1 --Uninstall law:
# remove the whole tree and the exact PATH entry it created, nothing else.
$ErrorActionPreference = "Stop"

$installDir = Join-Path $env:LOCALAPPDATA "Vaerion"
$binDir = Join-Path $installDir "bin"

if (Test-Path $installDir) { Remove-Item -Recurse -Force $installDir }

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -and $userPath.Contains($binDir)) {
  $cleaned = ($userPath -split ";" | Where-Object { $_ -and $_ -ne $binDir }) -join ";"
  [Environment]::SetEnvironmentVariable("Path", $cleaned, "User")
}

Write-Host "Vaerion removed. No daemons, no agents, no telemetry remain."
