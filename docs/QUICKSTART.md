# Vaerion Quickstart — 15 minutes to a verified run

Vaerion is a local-first, AI-native development engine: one versioned event
spine, append-only blake3-chained journals, a fail-closed permission
broker, deterministic replay, receipts folded from journals, and
reproducible `.vxn` bundles. Zero telemetry — nothing leaves your machine
unless you explicitly invoke a model provider through the gateway.

This guide takes a new developer from zero to a verified run and a
byte-identical bundle pair in about 15 minutes. The companion workspace is
`examples/vaerion-demo/`.

## 0. Install (2 minutes)

Requires [Bun](https://bun.sh) 1.3+.

```sh
git clone <repository-url> vaerion && cd vaerion
bun install
bun run tools/verify.ts        # all gates must be green
alias vae="bun run packages/vaerion/src/cli/vae.ts"
vae --version
```

Full details (including release-tarball installation and signature
verification): `docs/INSTALL.md`.

## 1. Look around, then create a workspace (2 minutes)

```sh
vae                            # the welcome front door: measures this
                               # directory, points at the next step (exit 0)
vae tour                       # a guided, read-only walk of the engine —
                               # nine steps measured against your machine
vae init                       # scaffolds vaerion.yaml + .vaerion/
                               # (--template minimal is the default; try
                               # --template demo or --template agent)
```

The welcome and the tour are read-only: nothing is created, modified, or
executed. The tour teaches by pointing at real commands — `vae dev`,
`vae journal ls`, `vae doctor`, `vae repo` — never by running them.

Or use the demo workspace directly:

```sh
cd examples/vaerion-demo
```

## 2. Run the demo pipeline (3 minutes)

```sh
vae run demo --sources ./sources --query "determinism"
```

What happened: local sources were indexed, the query executed through the
broker-gated tool pipeline, every step landed on the journal, and the run
closed with a **receipt** folded from that journal. The command prints the
run id; note it down.

## 3. Inspect, verify, explain (3 minutes)

```sh
vae journal ls                       # your run is here
vae journal show <RUN_ID>            # the full event narrative
vae journal verify <RUN_ID>          # the blake3 chain holds — measured, now
vae explain <RUN_ID>                 # the same run, as a human story
```

The receipt on disk (`.vaerion/receipts/`) verifies independently of the
process that produced it.

## 4. Prove reproducibility yourself (3 minutes)

```sh
vae package build                          # → .vaerion/package/vaerion-demo.vxn + vaerion.lock
vae provenance .vaerion/package/vaerion-demo.vxn   # the evidence, recomputed from the bytes
vae package build --out second.vxn    # build it again
vae package verify .vaerion/package/vaerion-demo.vxn
```

The two bundles are **byte-identical** — same inputs, same bytes. Compare
the blake3 digests printed by `verify` if you don't take our word for it.
`verify` is a pure check: digests recomputed, pins compared, content never
executed.

## 5. Health check (1 minute)

```sh
vae doctor    # config, journals, blobs, audit chain, gateway matrix — no phone-home
```

## 6. Optional: the daemon and the SDK (2 minutes)

```sh
vae serve            # loopback HTTP/SSE; pairing token printed once
```

In a second shell, the TypeScript SDK speaks the exact same contracts
(machine parity):

```ts
import { createClient } from "@vaerion/sdk";
const vae = createClient({ baseUrl: "http://127.0.0.1:<port>", token: "<pairing-token>" });
console.log(await vae.version());
```

The daemon is loopback-only (it refuses any non-loopback bind), and every
state-changing call requires the pairing token.

## 7. Know your repository (2 minutes)

Vaerion treats Git, CI, and release evidence as part of its constitutional
runtime — measured, never assumed (Constitution v1.1, D-P through D-T):

```sh
vae repo                        # branch, tree state, conflicts, identity audit,
                                # tags, worktrees, canonical sync — read-only
vae ci validate                 # workflows must re-run tools/verify.ts (D-R),
                                # never re-implement the gates
vae ci simulate --event tag --ref v1.0.0   # which jobs WOULD run, and why
vae release readiness           # can this ship? gates, git trust, CI validity,
                                # version lockstep, tag binding, artifacts
```

Every check carries an honesty label — `VERIFIED` (measured here),
`UNVERIFIED` (not measurable in this environment), `NEVER EXECUTED` — and
readiness is fail-closed: unmeasurable ⇒ blocked. Exit 0 means READY;
exit 5 prints the blocker list with a Fix for each.

## Where to go next

- `docs/INSTALL.md` — installation and verification of release artifacts
- `examples/vaerion-demo/DEMO.md` — the annotated walkthrough
- `docs/TROUBLESHOOTING.md` — exit codes and E-codes
- `docs/security/THREAT-MODEL.md` — what the engine guarantees, and how
- `docs/adr/README.md` — every architectural decision and its status
- `CONTRIBUTING.md` — the verification law for changes
