# The journal, briefly

Every `vae run` closes with a receipt that folds its journal. The journal
is append-only NDJSON; each envelope carries a version, a kind, and a
payload; the chain is blake3-linked so any later edit is detectable by
`vae journal verify`.

Useful commands:

- `vae journal ls` — list journals in this workspace
- `vae journal show RUN` — print a run's events
- `vae journal verify RUN` — recompute the chain
- `vae journal export RUN --out PATH` — export for sharing
- `vae explain RUN` — reconstruct the human narrative
