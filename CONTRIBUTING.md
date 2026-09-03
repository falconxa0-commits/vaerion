# Contributing to Vaerion

Thank you for your interest in improving Vaerion. This project is built
under an explicit engineering constitution: deterministic behavior,
contract-first evolution, and evidence-based verification. Contributions
are accepted when they keep those properties intact.

## Project layout

| Path | Role |
|---|---|
| `packages/vaerion/` | The engine: event spine, journal, broker, gateway, runtime, CLI (`vae`) |
| `sdks/typescript/` | The TypeScript SDK (wire parity with the CLI) |
| `spec/` | Contracts: error catalog, event registry, schemas, OpenAPI, WIT world |
| `docs/adr/` | Architecture decision records (additive, numbered) |
| `docs/constitution/` | The project constitution |
| `tools/` | Verification and release tooling |

## Setting up a development environment

Requirements: [Bun](https://bun.sh) 1.3+ and TypeScript 5.

```sh
bun install
bun run tools/verify.ts   # the full verification suite — must be green
```

## The verification law

Every change must leave all six verification gates green **before** it is
committed. The single entrypoint is `tools/verify.ts`, which writes its
measured result to `.vaerion-verification.json`:

1. **typecheck-engine** — strict TypeScript over the engine.
2. **typecheck-sdk** — strict TypeScript over the SDK.
3. **tests** — the full suite with enforced coverage floors (floors only
   ratchet up; a breach fails the run).
4. **layerlint** — architecture boundaries (L0 kernel → L1 primitives →
   L2 services → L4 CLI/API; the daemon never imports the CLI).
5. **constitutional-check** — the project invariants: zero telemetry,
   determinism, no placeholder debt, contract sync, no secret material,
   config guards, egress confinement.
6. **repo-lint** — ESLint over the application and tooling.

If a gate fails, fix the root cause. Do not weaken a check to make a run
pass; coverage floors and constitutional checks are ratcheted or amended
only through an ADR that states the reason.

## Contracts evolve additively

Files under `spec/` are contracts. Evolution within a major version is
additive-only: nothing is removed or renamed, error codes are never reused,
and every contract change is mirrored in the implementation the same
commit. `spec/openapi.json` is generated — never hand-edit it; run
`bun run tools/gen-openapi.ts` after changing the API surface.

## Decisions are recorded

Behavioral or structural decisions that shape the system get an ADR in
`docs/adr/` (copy an existing record as the template, use the next number,
state context, decision, and consequences). Decisions marked *Proposed*
await the project owner's ratification; *Provisional* decisions carry an
explicit migration path.

## Commit discipline

Commit messages are professional engineering records: a concise subject
line, and a body that states what changed and the evidence that it was
verified. Commits are authored under the project identity
(`Auren <auren@vaerion.dev>`).

## Reporting issues

When reporting a defect, include: the command or API call, the observed
behavior, the expected behavior, and the journal or receipt output that
demonstrates it. Security issues are reported privately to the project
owner — see `docs/security/RISK-LEDGER.md` for the disclosure posture.

Feature proposals start in the
[Ideas](https://github.com/falconxa0-commits/vaerion/discussions/categories/ideas)
discussion category — an issue is opened once a proposal has a concrete,
testable shape. Usage questions belong in
[Q&A](https://github.com/falconxa0-commits/vaerion/discussions/categories/q-a);
release news lands in
[Announcements](https://github.com/falconxa0-commits/vaerion/discussions/categories/announcements)
(`docs/operations/ANNOUNCEMENTS.md` is the flow of record).

## License

By contributing, you agree that your contributions are licensed under the
Apache License 2.0 (`LICENSE` at the repository root).
