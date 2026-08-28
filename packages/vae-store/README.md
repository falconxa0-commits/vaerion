# vae-store (L1)

Owns durable truth and its transport. Knows nothing about what the data
*means* (L1 law) — it stores, chains, verifies, and fans out.

| Concern | Law | Where |
|---|---|---|
| Per-run NDJSON journal with blake3 hash chain | D12.1 | `src/journal.ts` |
| Audit journal as same-format sister chain | D12.2 | `src/journal.ts` |
| Blobs referenced, never inlined (`blob_ref`) | D9.5 | `src/blob.ts` |
| Spine: stateless fan-out; the journal is the log | D9.1, Sacred Invariant I | `src/spine.ts` |
| Per-run gapless sequence numbers | D9.2 | `src/journal.ts` |
| Mandatory actor + cause on every entry | D9.3 | `src/entry.ts` |
| Tamper detection via chain verification | D12.1 | `src/journal.ts` |
| Single writer per run | D11.1 | `src/single-writer.ts` |

## Journal entry format (v1, stable forever — Article IX)

One NDJSON line per entry:

```
{"v":1,"seq":N,"ts":"ISO-8601","type":"...","actor":{...},"cause":{...},
 "payload":{...},"blob_refs":["blake3:..."],"prev":"<hex>","hash":"<hex>"}
```

`hash = blake3(canonicalJson(entry without "hash"))`; `prev` is the
previous entry's `hash` (`"GENESIS"` for the first entry). See
`spec/journal-format.md`.

## Implementation status (honest inventory)

- IMPLEMENTED: chain writer/verifier/reader (run + audit), blob store,
  spine (in-process, stateless), single-writer (in-process).
- DEFERRED TO MS-1 (law-visible, D22.4): cross-process file locks,
  crash-during-append chaos hardening, redacting exporter, explicit GC.
