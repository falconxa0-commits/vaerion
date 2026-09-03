# Examples

Runnable workspaces for the Vaerion engine (`0.1.12-rc1`). Each example is a
real directory in this repository — measured, not narrated.

## vaerion-demo/ — the 15-minute demo workspace

The canonical external-tester workspace referenced by `docs/QUICKSTART.md` and
exercised by the Empty Machine Test of record
(`docs/ga/ASCENSION-XX-EMPTY-MACHINE-TEST.md`). It contains a minimal, valid
`vaerion.yaml`, two local sources (`sources/journal.md`,
`sources/determinism.md`), and `DEMO.md` — the walkthrough:

1. Build the engine (`bun install` + gates) or unpack a release.
2. `vae init` in a copy of this directory (or use it in place).
3. `vae run demo` — index the declared local sources, journal everything, close
   with a receipt.
4. Inspect and verify the journal; read the receipt.
5. `vae doctor` — prove the workspace is healthy.
6. `vae package build` + `vae package verify` — prove reproducibility with your
   own hands: build the bundle twice, compare the blake3 digests.

The demo journey also feeds the dashboard's demo-workspace cockpit.

## websocket/ — standalone WebSocket sample

`server.ts` (a socket.io server: users, messages, system events) and
`frontend.tsx` (a Next.js client using `socket.io-client`). This is an
independent transport sample in the dashboard's web stack; it does not exercise
the engine core (`packages/vaerion/`). The engine's own API surface is the
loopback daemon (`vae serve`) over the contracts in `spec/openapi.json`.

## Conventions

- Examples are additive teaching surfaces; the contracts of record live in
  `spec/`, and the CLI grammar of record is `vae --help` (or
  `bun run vae --help` inside `packages/vaerion/`).
- New examples should be minimal, deterministic, and runnable from a fresh
  clone or a release tarball — the Empty Machine Test standard.
