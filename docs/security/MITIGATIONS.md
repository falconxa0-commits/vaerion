# Mitigation Record — v0.1.7-rc2

Each row maps a threat-model adversary to the implemented control and the
evidence that the control holds. Evidence classes: **T** = automated test
in the verification suite; **C** = constitutional check executed on every
verification run; **L** = layerlint architecture boundary; **I** = code
inspection at the cited module.

| Threat | Control (module) | Evidence |
|---|---|---|
| A1 reaches the daemon from another host | Daemon refuses every non-loopback bind before listen — E2001 (`api/server.ts`, `isLoopbackHost` over 127.0.0.0/8, ::1, localhost) | I + T (non-loopback bind tests) |
| A1 calls the API without the token | Every state-changing route requires the pairing token; 32 random bytes (CSPRNG), base64url, timing-safe comparison — E2000 (`api/server.ts`) | I + T (auth-matrix tests) |
| A1 shuts the daemon down or mutates state via a relayed request | Shutdown requires the pairing token echoed in the request body — E2004 | I + T |
| A1 replays a stolen token | Token is printed once at first start (or pre-provisioned via `VAE_TRUST` for headless starts); the daemon logs only whether it printed, never the value | I |
| A2 ships a swapped or tampered extension artifact | Digest pin law: sha256 of the artifact is verified BEFORE any execution; mismatch ⇒ E2100 and no spawn (`extensions/host.ts`) | I + T (adversarial protocol suite: pin mismatch, protocol violation, hang) |
| A2 misbehaves at runtime (protocol violation / hang) | Host kills the child on protocol violation — E2102; timeouts reap hung children — E2103; the full lifecycle is journaled (`extension.spawned` / `extension.exited`) | I + T |
| A2 over-grants itself capabilities | Extensions run under explicit `extensionGrants` configured in the workspace; the permission broker (ADR-0004) fail-closes ungranted tool calls and journals every decision | L + T (broker suites) |
| A3 asks the victim to build a malicious manifest | Path law fail-closed: bundle inputs are project-relative, no absolute paths, no globs, no wall-clock — E2204 (`package/build.ts`) | I + T (manifest fingerprint, order, path-law matrix) |
| A3 swaps bundle content (digest-swap fraud) | `vae package verify` recomputes every blake3 digest and compares pins BOTH directions against config AND the generated lock seal — E2201/E2202/E2205; verify/import never execute content | I + T (tamper matrix: payload flip, stale lock, forged pin swap, bad magic) |
| A3 ships a non-Vaerion or upgraded-format bundle | Magic `VXN1` carries the format version; unsupported format ⇒ E2203; canonical manifest re-serialization must be exactly equal — E2200 | I + T |
| A4 exfiltrates secrets via network | Zero telemetry (C1/C6): the only egress site is the gateway transport (ADR-0019); C7 fails the run if any other module imports HTTP client primitives; daemon surface has none; SDK wire client is loopback-only (E2006) | C (every run) + L |
| A4 abuses provider access | Gateway is the single gate (D-J): allow-listed adapters, metering with journaled metrics, circuit breaker per process, cassettes for hermetic runs (ADR-0012) | I + T (gateway suites) |
| A4 reads secrets from artifacts | Secrets resolve keychain-first (ADR-0013) with env indirection for children; never serialized into journals, receipts, bundles; C5 scans the tree for secret material | C (every run) + T |
| A5 tampers with release artifacts | Reproducible build (ADR-0016): identical inputs → byte-identical `.vxn` (blake3 identity, pinned zstd-19); release distribution publishes sha256 + blake3 manifests and an Ed25519 signature over the manifest (see `docs/ga/RELEASE-VERIFICATION.md`) | T (P2 proof: two builds byte-identical) + release tooling |
| A5 tampers with the repository | Single verification entrypoint (`tools/verify.ts`) writes `.vaerion-verification.json`; CI (`.github/workflows/verify.yml`) re-runs all six gates on every push and PR and fails on any violation | T/I |
| Supply chain (compromised dependency) | Workspace-internal dependency resolution for engine packages (ADR-0001); lockfile (`bun.lock`) committed; the release distribution installs offline from the packed tarball and smoke-tests the installed shim before publishing a dist report | I + release tooling |

## Residual exposures

Anything not listed as mitigated above is an open item in
`RISK-LEDGER.md` with a severity, an owner, and an exit criterion. No
critical finding is open at this release.
