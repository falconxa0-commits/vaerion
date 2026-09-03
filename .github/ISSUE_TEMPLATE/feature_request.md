---
name: Feature request
about: A proposal within the constitution's scope
labels:
  - enhancement
---

**Problem to solve**

<!-- The measured need, not the solution yet. What did you try, and what did
you measure? -->

**Proposed capability**

<!-- What should exist, stated as a capability or contract change. -->

**Why it fits Vaerion**

<!-- The constitution of record is docs/constitution/VAERION_CONSTITUTION_v1.7.md.
Address the ones that apply: -->

- Local-first over cloud-first — does this work on a single machine?
- Deterministic — same inputs, same outputs; reproducible and journalable?
- Contract-first — additive only within v0.1: nothing removed or renamed, no
  error code reused?
- One pipeline, thin clients — does it flow through the engine's single
  verification entrypoint (`tools/verify.ts`) rather than adding a parallel
  system?

**Alternatives considered**

<!-- Including "do nothing" and existing surfaces (CLI commands, spec/
contracts). -->

**Additional context**

<!-- Journal / receipt output if a run is involved. Any claim you cannot yet
measure, label UNVERIFIED. -->
