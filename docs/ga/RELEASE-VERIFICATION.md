# Release Verification — the process

This document defines how a Vaerion release is produced and how anyone —
maintainer, tester, or auditor — verifies it. The current release is
`v0.1.7-rc1`.

## Production (maintainer side)

Release artifacts are produced by a single fail-closed tool:

```sh
bun run tools/dist-pack.ts
```

The tool, in order:

1. **Runs the full verification suite** (`tools/verify.ts`) and aborts on
   any red gate — no artifacts can exist from an unverified tree.
2. **Builds the reference `.vxn` bundle** from `examples/vaerion-demo/`
   via `vae package build` (the reproducible-packaging law, ADR-0016).
3. **Builds the source tarball twice** — `git archive` of the release
   commit piped through `gzip -n` (no timestamp, fixed content) — and
   **byte-compares the two builds**. A non-reproducible tarball aborts
   the release.
4. **Writes `SHA256SUMS` and `MANIFEST.json`** — canonical (sorted-key)
   JSON carrying every artifact's size, sha256, and blake3 digest, plus
   the release version, commit, and the verification-gate record.
5. **Signs the manifest** with Ed25519 and **verifies its own signature**
   before reporting success.

Artifacts land in `dist/` (never committed to git):

| Artifact | Meaning |
|---|---|
| `vaerion-<version>-source.tar.gz` | deterministic source distribution |
| `vaerion-demo.vxn` | reference reproducible bundle |
| `SHA256SUMS` | standard `sha256sum --check` manifest |
| `MANIFEST.json` | canonical manifest (sizes + sha256 + blake3) |
| `MANIFEST.json.sig` | Ed25519 signature over the manifest |
| `VERIFY.md` | one-page consumer verification instructions |
| `dist-report.json` | the audit packet (gates, timings, key provenance, reproducibility proof) |

## Consumption (tester side, ~1 minute)

```sh
sha256sum --check SHA256SUMS
bun run tools/dist-verify.ts --manifest MANIFEST.json \
  --sig MANIFEST.json.sig --pub keys/release-signing.pub
```

`dist-verify` fails closed: it verifies the Ed25519 signature over the
canonical manifest bytes, then recomputes size, sha256, **and blake3** for
every listed artifact. Any mismatch exits non-zero with
`this artifact set is not trusted`. Tamper detection is test-proven: a
single flipped byte in any artifact fails the run.

## Reproducibility statement

- **Source tarball**: rebuilding `git archive --format=tar
  --prefix=vaerion-<version>/ <commit> | gzip -n` from the release commit
  reproduces the tarball byte-for-byte; `dist-pack` proves this on every
  run by building it twice.
- **`.vxn` bundles**: `vae package build` from identical workspace inputs
  produces byte-identical bundles (blake3 identity, pinned compression) —
  test-proven in the verification suite and demonstrated in the quickstart.
- **The manifest and signature are metadata** (they carry a generation
  timestamp and the gate record) and are not themselves reproducible
  artifacts; their integrity comes from the signature, not determinism.

## Key provenance and rotation

The release is signed by the **bootstrap Ed25519 release key**
(`keys/release-signing.pub`, fingerprint recorded in
`dist/MANIFEST.json.sig`'s companion report). The private key lives only
in the build environment and never enters version control
(`.gitignore`: `/keys/*.key`).

Rotation to a held-offline key is a **Founder-gated** item
(`docs/security/RISK-LEDGER.md`, R-2): the key ceremony replaces the
bootstrap key, re-signs the release manifest, and publishes the new
fingerprint through the release channel.

## Release train position

| Step | Status |
|---|---|
| 1. Verify (six gates green) | **Done every run** — fail-closed precondition |
| 2. Package (this document) | **Done** — `tools/dist-pack.ts` |
| 3. Publish to the release channel | Founder-gated (remote provisioning) |
| 4. Announce | Founder-gated |
| 5. Rotate bootstrap key at ceremony | Founder-gated (R-2) |
