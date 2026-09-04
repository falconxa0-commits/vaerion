# Release Certification — v0.1.13-rc1

| | |
|---|---|
| **Document** | The certification of record for the first production-signed release: what shipped, how it is trusted, and how it was verified |
| **Release of record** | `v0.1.13-rc1` (annotated tag `3968424` → commit `6ebcc0d`) — published at https://github.com/falconxa0-commits/vaerion/releases/tag/v0.1.13-rc1 |
| **Certified by** | the measured verification recorded in `worklog.md` Tasks 3–4, 10 |

## 1. What was released

The signed artifact set (8 assets, all present on the Release):

| Asset | Role |
|---|---|
| `vaerion-0.1.13-rc1-source.tar.gz` | the deterministic, reproducible source tree |
| `vaerion-demo.vxn` | the reference reproducible bundle (blake3-sealed) |
| `SHA256SUMS` | per-asset integrity |
| `MANIFEST.json` + `MANIFEST.json.sig` | the canonical manifest and its **production** Ed25519 signature |
| `release-signing.pub` | the signing key of record, shipped BESIDE the artifacts (manifest-bound) |
| `VERIFY.md` | the consumer verification instructions (fingerprint pinned inside) |
| `dist-report.json` | the pack audit: all 8 gates GREEN at pack time, reproducibility proven (built twice, byte-compared), **no bootstrap-key disclosure** |

The Release body is `docs/RELEASE-NOTES-v0.1.13-rc1.md` — including its
explicit not-claimed list. The Release carries GitHub's prerelease flag
(rc honesty on the discovery surface).

## 2. The trust chain (who guarantees what)

1. **Gates**: every commit passes the eight verification gates through the
   single authority (`tools/verify.ts`) locally AND on GitHub infrastructure.
2. **Signing**: the production Ed25519 key (`RELEASE_SIGNING_KEY`, write-only
   GitHub secret) signs the canonical manifest; the key of record is
   `keys/release-signing.pub`; fingerprint
   `sha256:f28f089b43c0f7e776803cb83a47fb91…` is pinned inside `VERIFY.md`.
   Ceremony: `docs/security/SIGNING-CEREMONY.md`.
3. **Reproducibility**: the tarball is byte-reproducible (proven at pack
   time); the publish pipeline re-packs ON the tag, so published bytes =
   verified bytes.
4. **Provenance**: annotated tag → CI run → commit-pinned pack report →
   Release assets.
5. **Publication guard**: the publish workflow REFUSES to publish a pack
   whose report discloses a bootstrap key.

## 3. The verification record (measured, not asserted)

| Leg | Command class | Result |
|---|---|---|
| 1. Integrity | `sha256sum --check SHA256SUMS` | 7/7 OK (CI artifact download, Task 3) · 7/7 OK (anonymous download, Task 4) · 7/7 OK (fresh at close, Task 10) |
| 2. Engine verifier (consumer path) | `bun run tools/dist-verify.ts --manifest … --sig … --pub …` from the shipped tarball | ALL CHECKS PASSED, exit 0 — three times as above |
| 3. Independent implementation | `openssl pkeyutl -verify … -rawin` over the canonical manifest with the raw decoded signature | "Signature Verified Successfully", exit 0 — three times as above |
| Consumer loop | discover → download → verify → `vae --version` | measured anonymously, end-to-end (`vae 0.1.13-rc1`) |
| CI | `verify.yml` on the tag; `release-publish.yml` dispatch | both completed SUCCESS (runs 33817894269, 33818575076) |

## 4. Certification statement

Based on the measurements above: **v0.1.13-rc1 is certified as the first
production-trust release of Vaerion** — production-signed, reproducible,
provenance-complete, three-way verified, honestly labeled (prerelease), and
publicly consumable. The certificate covers the artifact set on the Release
of record; every future release re-certifies through the same pipeline and
the same three verification legs.

*Repository reality wins. Constitution wins. Evidence wins.*
