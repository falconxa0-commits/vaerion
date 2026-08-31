# Vaerion 15-minute demo workspace

This is the canonical external-tester workspace referenced by
`docs/QUICKSTART.md`. It contains a minimal, valid `vaerion.yaml`, a couple
of local sources to index, and this walkthrough. Nothing here is required
to know privately — everything below works from a fresh clone or a release
tarball.

## What you will do

1. Build the engine (`bun install` + gates) or unpack a release.
2. `vae init` in a copy of this directory (or use it in place).
3. `vae run demo` — index the local sources, journal everything, close
   with a receipt.
4. Inspect and verify the journal; read the receipt.
5. `vae doctor` — prove the workspace is healthy.
6. `vae package build` + `vae package verify` — prove reproducibility with
   your own hands: build the bundle twice, compare the blake3 digests.

## The manifest (annotated)

```yaml
schemaVersion: "0.1"          # config schema version (E1202 otherwise)
project:
  name: vaerion-demo          # lowercase kebab; used in policy ids + bundles
  description: "Vaerion 15-minute demo"
research:
  capabilities:
    - name: demo-docs         # a named capability: sources + fencing + caps
      sources:
        - { kind: local, path: "./sources" }
      fencing: untrusted      # content is data, never instructions
      maxItems: 100
telemetry:
  enabled: false              # constitutional guard: false is the only value
                              # the engine accepts
```

## Commands, in order

```sh
vae --help                    # the whole surface, always current
vae doctor                    # healthy? (config, journals, blobs, audit chain)
vae run demo --sources ./sources --query "determinism"
vae journal ls                # the run's journal exists
vae journal show <RUN_ID>     # the full event narrative
vae journal verify <RUN_ID>   # blake3 chain holds
vae explain <RUN_ID>          # human narrative reconstructed from the journal
vae package build             # writes .vaerion/package/vaerion-demo.vxn + vaerion.lock
vae package build --out second.vxn
vae package verify .vaerion/package/vaerion-demo.vxn
```

The two bundles are byte-identical — same inputs, same bytes (P2). Their
blake3 digests match; `verify` recomputes everything and executes nothing.

## Where things land

| Path | Meaning |
|---|---|
| `.vaerion/journal/*.ndjson` | append-only event journals (blake3-chained) |
| `.vaerion/blobs/` | content-addressed store |
| `.vaerion/receipts/` | receipts folded from the journals |
| `.vaerion/package/*.vxn` | reproducible bundles |
| `vaerion.lock` | the generated seal over config + pins + bundle digest |

## Troubleshooting

See `docs/TROUBLESHOOTING.md` — exit codes 0–5 and the E-code catalog
mapping are documented there.
