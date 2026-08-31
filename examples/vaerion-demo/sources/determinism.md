# Determinism, in one page

Vaerion's central promise is deterministic execution: the same inputs,
the same bytes, every time.

- Runs are event-sourced. Every meaningful step lands on an append-only,
  blake3-chained NDJSON journal with a single writer.
- Receipts are folded from those journals; they verify independently of
  the process that produced them.
- Bundles (`.vxn`, ADR-0016) are a deterministic fold over declared
  inputs: identical inputs produce byte-identical bundles, sealed by a
  generated `vaerion.lock`.
- Verification is pure: `vae package verify` recomputes every digest and
  never executes package content.
