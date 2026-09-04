# Chocolatey install/uninstall script — the Vaerion CLI (ASCENSION XXV Phase XXXI).
#
# VERIFICATION STATUS: authored on Linux; pwsh/chocolatey unavailable here
# (syntax-reviewed only, mirroring install.ps1's honest marker). Platform
# marker: UNVERIFIED — CHOCOLATEY.
#
# The zip it installs is the SAME artifact the winget manifest references
# (vaerion-<version>-windows-x64.zip, produced by the release train and
# verified through the signed MANIFEST). The checksum is pinned from the
# artifact's SHA256SUMS at the release train — never guessed here.

$ErrorActionPreference = "Stop"

$version = "0.1.13-rc1"
$zipUrl = "https://github.com/falconxa0-commits/vaerion/releases/download/v$version/vaerion-$version-windows-x64.zip"
# CHECKSUM_PINNED_AT_RELEASE_TRAIN: replace with the artifact's SHA256 from
# the signed release manifest before any submission.
$checksum = "CHECKSUM_PINNED_AT_RELEASE_TRAIN"

$installDir = Join-Path $env:LOCALAPPDATA "Vaerion"

Write-Host "Installing Vaerion $version into $installDir (no daemons, no telemetry)."

Install-ChocolateyZipPackage -PackageName "vaerion" `
  -Url $zipUrl `
  -UnzipLocation $installDir `
  -ChecksumType "sha256" `
  -Checksum $checksum

# The vae.cmd shim ships inside the zip (the winget channel installs the
# same layout); add the bin directory to the USER PATH if it is not there.
$binDir = Join-Path $installDir "bin"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -and -not $userPath.Contains($binDir)) {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$binDir", "User")
}

Write-Host "Vaerion installed. Run 'vae --version' in a NEW shell."
