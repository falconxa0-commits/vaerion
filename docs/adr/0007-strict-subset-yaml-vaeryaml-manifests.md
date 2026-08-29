# ADR-0007: Strict-subset YAML dialect (VaerYaml) for manifests

| | |
|---|---|
| Status | Accepted |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

Manifests (`vaerion.yaml`, agent and workflow definitions, research
capability declarations) are human-authored and machine-validated. YAML is
the best-comprehension prior for both humans and AI assistants and preserves
comments, but full YAML carries decades of footguns: anchors and aliases
create invisible sharing, multi-document streams confuse tooling, and
implicit typing surprises (Norway problem, sexagesimals) corrupt values
silently. A configuration layer that guesses intent would violate the drift
guard and fail-closed posture of the constitution.

## Decision

1. Manifests use VaerYaml: a strict subset of YAML 1.2. Banned constructs:
   anchors and aliases, multi-document streams, tags, and complex mapping
   keys. Plain block mappings and sequences only.
2. Unknown keys are rejected at load time with `E1201` — the engine refuses
   drift instead of guessing intent.
3. The accepted shape is published as a JSON Schema
   (`spec/schemas/vaerion-yaml.schema.json`, currently 0.1) and is the
   validation authority; schema version is declared in the document
   (`schemaVersion: "0.1"`) and validated against the supported range.
4. Variable expansion is restricted to an explicit allowlist of variables;
   template substitutions in workflow inputs are limited and never evaluated
   as code.
5. The resolved configuration is fingerprinted (blake3 over canonical JSON)
   into every run header, so every journal pins the exact configuration that
   produced it.

## Consequences

- Positive: manifests remain diffable, reviewable, comment-bearing, and
  reliably parseable by the same grammar across engines and SDKs.
- Positive: schema-validated config plus fingerprints make runs
  reproducible and make "what config was this?" answerable forever.
- Negative: some legal-YAML documents are rejected; users migrating from
  anchor-heavy files must inline values.
- Negative: strict unknown-key rejection makes forward compatibility manual
  — new keys require a schema version bump and additive publication.
- Neutral: CUE or other config languages are not foreclosed; a
  reconsideration trigger is noted if validation demands outgrow JSON Schema.
