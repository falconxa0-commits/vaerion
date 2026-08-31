# Vaerion FAQ

Short answers to the questions new users and beta testers actually ask.
Every answer points at evidence you can run — nothing here is a promise.

## What is Vaerion, in one sentence?

A local-first AI development engine that runs AI-assisted work the way a
database engine runs transactions: every step lands on an append-only,
hash-chained journal, every privileged action passes a fail-closed broker,
and every finished run closes with a verifiable receipt.

## Do I need API keys to try it?

No. `vae run demo`, `vae run research`, and `vae run agent --planner inline`
are fully hermetic — the seeded `mockbrain` virtual provider answers locally
(byte-identical for the same seed). Real providers (anthropic/openai/ollama)
must be declared under `gateway.providers` in `vaerion.yaml` and their
secret NAMES resolved at call time from your OS keychain or environment
(ADR-0013).

## Where does my data go?

Nowhere. Zero telemetry is constitutional and mechanically enforced: the
engine contains exactly one sanctioned network egress site
(`gateway/transport.ts`), reachable only behind a journaled broker
decision. `vae doctor` verifies the picture without touching the network.

## What is a receipt?

The terminal record of a run: counts (events, decisions, gates,
snapshots), the journal's head hash, and a summary — folded FROM the
journal, so it cannot disagree with it. See `vae explain <RUN_ID>`.

## What is `provenance`?

Evidence, not branding: `vae provenance <ARTIFACT>` recomputes every
digest that can be recomputed from the bytes themselves — `.vxn` bundle
payloads and entries, `vaerion.lock` seals against the on-disk bundle,
redacted export derivations, and release manifests. Exit 0 means the
evidence holds; exit 5 prints the findings.

## Why did my command exit with code 3 (or 5)?

Exit codes are honest: `0` ok · `1` internal · `2` usage · `3`
broker-denied (the permission broker refused; the refusal is journaled) ·
`4` provider-down · `5` partial-with-repair-hint (verification failed; the
output carries the finding and the fix). Every error names its E-code;
look it up in `spec/errors.yaml` or `docs/TROUBLESHOOTING.md`.

## Can the CLI output break my scripts?

The pipe contract is stable: without a TTY (or with `VAE_UI=plain`) every
command prints plain text, and with `--json` it emits NDJSON — one JSON
object per line. Rich panels, color, and badges appear ONLY on interactive
terminals. `NO_COLOR` is always honored.

## How reproducible are builds?

Byte-identical: `vae package build` folds the declared inputs with no
wall-clock and no ambient paths — identical inputs produce identical
`.vxn` bytes (proven by the test suite and by building twice and
comparing). `vaerion.lock` seals the digest; `vae package verify` and
`vae provenance` recompute it.

## Is the TypeScript-on-Bun substrate permanent?

It is explicitly **provisional** (ADR-0018): the constitutional law binds
behavior, not the language. A recorded migration path exists; final
ratification is a Founder decision.

## How do I report a bug?

`BETA-ONBOARDING.md` defines the severity ladder. Always attach: the
command, the E-code, `vae doctor --json` output, and — for run bugs —
`vae journal export <RUN_ID>` (redacted, independently verifiable).

## Where do I read more?

Quickstart (`docs/QUICKSTART.md`) · installation (`docs/INSTALL.md`) ·
troubleshooting (`docs/TROUBLESHOOTING.md`) · architecture
(`docs/vaerion-master-blueprint.md`) · decisions (`docs/adr/README.md`) ·
security (`docs/security/`) · brand (`brand/BRAND-BOOK.md`).
