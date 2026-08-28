# Journal Format v1 (D12.1, D12.2, Article IX)

The journal is the append-only truth of what happened (Sacred
Invariant IV). One NDJSON line per entry; the run journal and the
audit journal share this exact format (D12.2) so one tooling verifies
both.

## Entry shape

```json
{
  "v": 1,
  "seq": 1,
  "ts": "2026-01-01T00:00:00.000Z",
  "type": "run.started",
  "actor": {"kind": "human", "id": "operator"},
  "cause": {"kind": "command", "ref": "vae run selfcheck"},
  "payload": {"plan": "selfcheck"},
  "blob_refs": [],
  "prev": "GENESIS",
  "hash": "<64 lowercase hex>"
}
```

## Chain law

- `hash = blake3(canonicalJson(entry without "hash"))` — canonical JSON:
  sorted keys, compact (D11.4).
- `prev` is the previous entry's `hash`; the first entry chains to
  `"GENESIS"`.
- `seq` is gapless per journal, starting at 1 (per-run sequencing, D9.2).
- `actor` and `cause` are mandatory on every entry (D9.3).
- Blobs are referenced, never inlined: `blob_refs` carries
  `blake3:<hex>` addresses into the blob store (D9.5).

## Locations

| Journal | Path | Written by |
|---|---|---|
| Audit (sister chain) | `.vaerion/audit/audit.ndjson` | Broker decisions, workspace events, incidents (D12.2, D21.6) |
| Run | `.vaerion/journal/<run-id>.ndjson` | The run's single writer (D11.1) |

## Guarantees

- **Append-only**: no rewrite path exists; any mutation breaks the
  chain and verification reports the exact line (tamper detection).
- **Verifiable anywhere**: `vae journal <id> --verify`,
  `vae journal audit --verify`, or the `journal.verify` tool.
- **Redacted by default on export** (D12.3): the store keeps full
  truth; rendering and API surfaces redact payloads at the publication
  boundary (D9.4).
- **Permanent retention** with explicit, reference-aware GC (D12.5) —
  GC arrives with MS-1 and refuses to delete referenced blobs.

## Entry v1 evolution

Field additions are additive-only within v1 (Article VIII). Unknown
fields are preserved by readers. A format break is a major version and
requires the compatibility window (D20.7).
