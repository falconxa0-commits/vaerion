---
name: Config report
about: An issue with vaerion.yaml — the workspace config of record
labels:
  - config
---

**Engine version**

<!-- From `vae dev`, e.g. 0.1.12-rc1 -->

**The vaerion.yaml you used**

<!-- Paste the file. Redact anything sensitive — secrets never belong in
vaerion.yaml; they resolve keychain-first with env indirection (ADR-0013). -->

**What you expected / what happened (measured, not narrated)**

**Measured evidence**

- `vae doctor` output (it verifies config first):
- Exact error code and message — e.g. E1200 (vaerion.yaml not found),
  E1202 (not valid YAML). The catalog of record is `spec/errors.yaml`.
- Exit code (0 ok · 1 internal · 2 usage · 3 broker-denied · 4 provider-down ·
  5 partial-with-repair-hint):

**Config contract notes**

- `schemaVersion: "0.1"` is the config contract; unknown keys are rejected
  strictly, and `telemetry.enabled` is const `false` — the schema of record is
  `spec/schemas/vaerion-yaml.schema.json`.
- If your config contains a key the schema refuses, include the exact
  rejection message verbatim.
