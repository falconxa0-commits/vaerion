# ADR-0016: Reproducible .vxn bundles zstd+BLAKE3(+cosign optional)

| | |
|---|---|
| Status | Accepted |
| Date | 2026-08-29 |
| Supersedes | none |
| Supersedes | none |

## Context

Packages (`.vxn`) carry agents, workflows, prompts, extensions, and pinned
artifacts between projects and machines. The engine's determinism doctrine
(P2) extends to packaging: identical inputs must yield byte-identical
bundles, because a bundle that cannot be reproduced cannot be verified, and
a bundle that cannot be verified cannot carry pinned Wasm extensions safely.
Compression and hashing choices must serve verification speed and
cross-platform determinism, not archive fashion.

## Decision

1. The bundle format is `.vxn`: a deterministic archive whose entries are
   ordered canonically and compressed with zstd at a pinned compression
   level and version, so identical inputs produce identical bytes.
2. Content identity is BLAKE3: every file in the bundle carries a blake3
   digest, and the bundle manifest pins component digests (extensions, in
   particular) that must equal the `vaerion.lock` pins at import time — a
   mismatch is a hard verification failure.
3. Import and verify are pure checks: they recompute digests, compare pins,
   and report; they never execute package content. Execution begins only
   after verification and with the package's declared capabilities as
   broker principals.
4. Signing is optional and additive: bundles may carry cosign signatures
   verified out-of-band. v0.1 ships unsigned-capable verification; signature
   policy (required or advisory) is a deployment choice, not a format one.
5. The build is a fold over declared inputs plus lockfile pins — no
   wall-clock, no ambient paths — so rebuilds are reproducible on any
   machine with the same toolchain versions.

## Consequences

- Positive: verification is cheap, local, and complete; the supply chain
  from author to importer is digest-pinned end to end.
- Positive: BLAKE3's speed makes full-bundle verification feasible on every
  import, not just on demand.
- Negative: pinned zstd versions and canonical ordering impose discipline on
  the packager; "just tar it" is not available.
- Negative: optional signing means unsigned bundles circulate; consumers
  choose their trust policy explicitly rather than by default.
