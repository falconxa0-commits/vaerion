# vae-config (L0)

Owns configuration: the `vaerion.yaml` hierarchy, its schema, resolution, and
pinned runtime snapshots. Reads the filesystem; writes nothing (L0 law).

| Concern | Law | Where |
|---|---|---|
| VaerYaml strict subset (no anchors/aliases/tags/multi-doc) | ratified config discipline | `src/vaeryaml.ts` |
| Fail-closed validation; unknown keys refused | D19.2, D19.10 | `src/schema.ts` |
| Precedence: defaults < engine < profile < project < env < flag | D19.1 | `src/resolve.ts` |
| Provenance of every effective value (inspectable) | D19.1 | `src/resolve.ts` |
| Pinned runtime snapshot; mid-run changes never apply | D19.7 | `src/resolve.ts` |
| Explicit environment mapping; free-form passthrough refused | D19.6 | `src/resolve.ts` |
| Workspace discovery and layout (`vaerion.yaml` → `.vaerion/`) | Stage 6 project layout | `src/workspace.ts` |

Status: IMPLEMENTED (parser, schema, resolution, snapshots, workspace
discovery). Deterministic migrations (D19.8) arrive with the first schema
change; there is exactly one schema version today, so no migration exists yet.
