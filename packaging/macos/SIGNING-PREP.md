# macOS signing & notarization preparation — Vaerion

Status: PREPARATION ONLY. This environment cannot execute macOS code
signing; every step below is recorded so the release train can execute it
the moment a macOS build host and the Founder key ceremony (risk-ledger
F-3) exist. Nothing here is claimed as verified.

## 1. Identity requirements

| Artifact | Requirement |
|---|---|
| `vae` binary / `.app` payloads | Developer ID Application certificate |
| `.pkg` installers | Developer ID Installer certificate |
| Notarization | Apple notarytool (Xcode 13+), keychain-stored credentials |

## 2. Commands (release-train runbook)

```sh
# codesign the payload BEFORE packaging
codesign --force --options runtime --timestamp \
  --sign "Developer ID Application: <name> (<team>)" \
  <staged payload binaries>

# build (see make-pkg.sh) then sign the package
productsign --sign "Developer ID Installer: <name> (<team>)" \
  vaerion-<version>.pkg vaerion-<version>-signed.pkg

# notarize + staple
xcrun notarytool submit vaerion-<version>-signed.pkg \
  --keychain-profile "vaerion-notary" --wait
xcrun stapler staple vaerion-<version>-signed.pkg

# Windows Authenticode (winget/installer channel) follows the same
# ceremony with an EV code-signing certificate — same key custody rules.
```

## 3. Custody laws (unchanged from the constitution)

- The signing identity NEVER enters the repository or CI secrets of this
  sandbox; it exists only after the Founder key ceremony (F-3).
- Until then, all distribution artifacts carry the Ed25519 bootstrap
  manifest signature (tools/dist-pack.ts) — provenance and tamper
  evidence hold; platform-native trust (Gatekeeper) does not, and no
  claim says otherwise.
