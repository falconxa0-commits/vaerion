# Vaerion Windows installer (PowerShell, portable layout).
#
# Installs the Vaerion engine into %LOCALAPPDATA%\Vaerion, drops a vae.cmd
# shim, and adds it to the USER PATH. --Update re-runs; --Uninstall removes
# everything, including the PATH entry it created.
#
# VERIFICATION STATUS: authored on Linux; pwsh unavailable in this
# environment (syntax reviewed only). Platform marker: UNVERIFIED — WINDOWS.
# The zip it installs is produced at release time by the packaging train
# and verified through the signed MANIFEST before distribution.
[CmdletBinding()]
param(
  [string]$Zip,
  [string]$Version = "0.1.12-rc1",
  [switch]$Update,
  [switch]$Uninstall,
  [switch]$NoPath
)

$ErrorActionPreference = "Stop"
$Root = Join-Path $env:LOCALAPPDATA "Vaerion"
$BinDir = Join-Path $Root "bin"
$LibDir = Join-Path $Root "lib"

function Write-Educated([string]$Code, [string]$Message, [string]$Fix) {
  Write-Error "$Code $Message Fix: $Fix"
}

if ($Uninstall) {
  if (Test-Path $Root) { Remove-Item -Recurse -Force $Root }
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($userPath -and $userPath.Contains($BinDir)) {
    $cleaned = ($userPath -split ";" | Where-Object { $_ -and $_ -ne $BinDir }) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $cleaned, "User")
  }
  Write-Host "Vaerion removed. No daemons, no agents, no telemetry remain."
  exit 0
}

# Bun runtime check — the engine substrate (ADR-0018).
$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun) {
  Write-Educated "E1600" "vae requires the Bun runtime (>= 1.2)." "install Bun: powershell -c 'irm bun.sh/install.ps1 | iex'  (docs/INSTALL.md)"
  exit 2
}

# --Update means: re-run this script with the new release zip; state is
# replaced under $LibDir and the current symlink re-pointed.

if (-not $Zip) {
  Write-Educated "E1600" "this installer expects -Zip <vaerion-windows.zip> until the release train publishes registry URLs." "pass the release zip path (verified against MANIFEST.json first)"
  exit 2
}

if (-not (Test-Path $Zip)) { Write-Educated "E1600" "zip not found: $Zip" "pass a valid release zip path"; exit 2 }

New-Item -ItemType Directory -Force -Path $BinDir, $LibDir | Out-Null
$dest = Join-Path $LibDir $Version
Expand-Archive -Path $Zip -DestinationPath $dest -Force
(New-Item -ItemType SymbolicLink -Path (Join-Path $LibDir "current") -Target $dest -Force) | Out-Null

$shim = Join-Path $BinDir "vae.cmd"
Set-Content -Path $shim -Value "@echo off`r`nbun run `"%LibDir%\current\engine\cli\vae.ts`" %*"

if (-not $NoPath) {
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not $userPath -or -not $userPath.Contains($BinDir)) {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$BinDir".TrimStart(";"), "User")
    Write-Host "PATH updated (user scope). Open a new terminal for `vae`."
  }
}

Write-Host "Vaerion $Version installed. Verify: vae --version && vae doctor"
