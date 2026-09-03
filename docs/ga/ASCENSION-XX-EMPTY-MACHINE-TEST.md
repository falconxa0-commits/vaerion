# ASCENSION XX — The Empty Machine Test, Executed (Phase 19 Report of Record)

> D-Y law: a developer with an empty machine — no Vaerion installed, no knowledge of the
> system — can discover, install, verify the installation, initialize, understand the commands,
> create value quickly, recover from mistakes, upgrade safely, and remove cleanly. Every leg
> carries D-S evidence or an honest UNVERIFIED label. **A package is a product only when it
> installs, executes, upgrades, and removes — its existence is never its proof.**
>
> Executed 2026-09-03 against engine `0.1.11-rc1` @ `077d8f0` (local main), offline tarball
> `dist/vaerion-0.1.11-rc1-source.tar.gz` (deterministic pack of this session), fresh
> `$HOME = /tmp/vaerion-empty-Gr3lxo` (no rc files, no Vaerion state, cold bun cache).

## Per-leg evidence

| # | Leg | Result | Evidence |
|---|---|---|---|
| 1 | DISCOVER | **VERIFIED** | `docs/INSTALL.md` teaches the universal one-liner, verification steps, and the honest note that the `vaerion.dev` URL goes live with the release train (F-5) |
| 2 | INSTALL (source method, offline tarball) | **VERIFIED** | exit 0; versioned layout `$PREFIX/lib/vaerion/0.1.11-rc1` + `current` symlink + bin shim; `bun install --production` cold-cache success |
| 2b | INSTALL without Bun (teaching leg) | **VERIFIED** | exit 2, `E1600` fail-closed with fix + docs pointer — the installer teaches, never silently installs a runtime |
| 3 | VERIFY INSTALLATION | **VERIFIED** | shim runs (exit 0); `vae doctor` — all checks green, exit 0 |
| 4 | INITIALIZE | **VERIFIED** | `vae init --template demo` exit 0; deterministic scaffold (`vaerion.yaml`, `.vaerion/journal`, `.vaerion/blobs`) + config fingerprint |
| 5 | USE (create value) **as taught** | **REFUSED — DEFECT XX-D6** | `vae run demo --query Q` → `E1300` exit 3 (the hardcoded default grant `./docs/constitution` exceeds the workspace ceiling — a literal that only makes sense inside the Vaerion checkout); the template's own hint `--sources ./sources` → `E1600` exit 2 (`./sources` is never scaffolded). **With sources present, the engine run is clean**: exit 0, 13 journal records, blake3 blob refs, `journal_verified: true` — engine ✓, template ✗ |
| 6 | RECOVER | **VERIFIED** | true torn write (partial final line, no newline) → `vae journal recover` exit 0: `tornTailRemoved: true`, 13 records recovered; corrupted chain (flipped byte) → verify exit **5**, recovery **REFUSED** `E1001` (never launders history); invalid record → `E1900` refusal |
| 7 | UPGRADE | **VERIFIED** (same-version) / **UNVERIFIED** (cross-version: only one release exists — no fabrication) | `--update --tarball` exit 0; `current` re-linked; post-update `vae` works |
| 8 | REMOVE | **VERIFIED** | `--uninstall` exit 0; prefix gone, shim gone; only the user's own workspace remains (uninstall removes Vaerion, never user data) |
| 9 | INSTALL (npm method) | **FAILED AS SHIPPED — DEFECT XX-D7** | default method on an npm machine → `npm install -g` → system prefix → EACCES exit 243, no fallback, no teaching. **Package integrity VERIFIED separately**: with a writable user prefix, install exit 0 and the installed `vae` runs (bin entry, engine copy, deps correct) |
| 10 | PYTHON WHEEL (consumer side) | **VERIFIED** + twine **UNVERIFIED** | `pip install --no-index <wheel>` exit 0 (offline-friendly); `import vaerion` ok; `python -m vaerion.cli --help` teaches the real CLI. `twine` absent on host — honestly labeled |
| 11 | CONSUMER DIST-VERIFY | **VERIFIED** + teaching **DEFECT XX-D4 consequence measured** | `dist-verify` ALL CHECKS PASSED, exit 0 (with the session public key derived outside the tree). BUT `dist/VERIFY.md` teaches `--pub ../keys/release-signing.pub` (the repo-tracked key of record) — which cannot match artifacts packed by a later session's bootstrap key; the taught path fails at every session boundary |

## Defect ledger updates (D-V root-cause form)

| ID | Defect | Root cause | Fix phase |
|---|---|---|---|
| XX-D4 | The taught consumer verification path breaks across sessions; packing mutates the tracked `keys/release-signing.pub` | `dist-pack` generates a session bootstrap key and writes its public half into a TRACKED file; `VERIFY.md`/`dist-verify` teach the tracked key instead of shipping the key beside the artifacts | 20 |
| XX-D5 | A genuinely empty machine gets **no persisted PATH**: `rc_files()` only writes markers to rc files that already exist, and a fresh `$HOME` has none — the install-time note is the only teaching, and it evaporates with the shell | The marker writer treats "rc file absent" as "skip" instead of "create" | 20 |
| XX-D6 | The demo template's first-run journey cannot succeed as taught: (a) the scaffold creates no `sources/` while the config and the hint reference it; (b) `run demo` without `--sources` uses a HARDCODED default grant (`./docs/constitution`, `./docs/adr` — commands.ts:621) that exceeds any user workspace's ceiling → `E1300` | The template and the default grant were never executed as a connected first-run journey (the exact gap D-Y exists to close); the default-grant literal is the stale-literal class reborn | 20 |
| XX-D7 | The npm method — the installer's DEFAULT when npm exists — fails on any machine without a writable global prefix (EACCES, exit 243) with no user-prefix fallback and no teaching | `do_install_npm()` assumes `npm install -g` is writable; no writable-prefix detection | 20 |

## Honest ledger (not defects)

- Cross-version upgrade: UNVERIFIED (single release exists); twine check: UNVERIFIED (host lacks twine);
  brew/winget/dmg/rpm native channels: authored-UNVERIFIED (host-gated, carried from ASCENSION XIX).
- GitHub live-state: UNVERIFIED this session (credentials absent at the session boundary; XX-D1).
- `vae --version` opens the welcome front door (version visible inside, exit 0) — observation,
  consistent with the front-door law; no change.

## Verdict

The engine's core journeys survive the empty machine: install, verify, doctor, init, real
value creation, crash-torn recovery, upgrade, clean removal. The ECOSYSTEM SURFACES fail the
test in four precise places (XX-D4…XX-D7) — all fixable at root, each to be pinned by a test
in Phase 20. The D-Y law did exactly what it was ratified to do: it converted "packaging
exists" into "the journey was measured".
