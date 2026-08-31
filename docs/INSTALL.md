# Installing Vaerion

## Option A — from source (recommended for beta)

Requirements: [Bun](https://bun.sh) 1.3+, a POSIX-flavored shell. Windows
works under WSL2 (see `docs/TROUBLESHOOTING.md`).

```sh
git clone <repository-url> vaerion && cd vaerion
bun install                      # workspace-internal resolution, no global state
bun run tools/verify.ts          # the six verification gates
```

`tools/verify.ts` must print `ALL GATES GREEN`. It writes its measured
result to `.vaerion-verification.json`. If any gate fails, the engine is
not verified on your machine — see `docs/TROUBLESHOOTING.md`.

Run the CLI without installing anything globally:

```sh
bun run packages/vaerion/src/cli/vae.ts --version
alias vae="bun run packages/vaerion/src/cli/vae.ts"
```

## Option B — from a release tarball

Each release publishes a `.tar.gz` distribution with:

- a `SHA256SUMS` manifest and blake3 digests for every artifact,
- an Ed25519 signature over the manifest,
- a `VERIFY.md` with the exact verification commands.

```sh
sha256sum --check SHA256SUMS                       # integrity
# signature verification (one command, exact form in the release VERIFY.md)
tar -xzf vaerion-<version>.tar.gz && cd vaerion-<version>
bun install && bun run tools/verify.ts
```

Release verification is documented step by step in
`docs/ga/RELEASE-VERIFICATION.md`.

## What installation does NOT do

- No global daemons, no background services, no launch agents.
- No telemetry. The config guard accepts exactly one value
  (`telemetry.enabled: false`); the constitutional check C1/C6 enforces no
  undeclared network primitives in the engine.
- No writes outside your workspace directory (`.vaerion/` and
  `vaerion.lock` live in the workspace root).

## Requirements summary

| Component | Requirement |
|---|---|
| Runtime | Bun 1.3+ (engine and CLI) |
| OS | Linux / macOS / Windows (WSL2) |
| Network | None required for local operation; the model gateway is the single sanctioned egress and only runs when you invoke it |
| Disk | Workspace-local `.vaerion/` store |
