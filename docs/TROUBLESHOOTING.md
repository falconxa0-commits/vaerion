# Troubleshooting Guide

Vaerion communicates through two stable channels: **exit codes** (0–5) and
**E-codes** (a never-reused diagnostics catalog, `spec/errors.yaml`). When
something goes wrong, the output names the E-code and a repair hint. This
guide maps the common ones.

## Exit codes

| Code | Meaning | What to do |
|---|---|---|
| 0 | ok | — |
| 1 | internal error | The output names the site; if reproducible, file a report with the journal snippet |
| 2 | usage error | Re-run with `--help` (help teaches and never executes) |
| 3 | broker-denied | A permission rule denied the capability — see E1300 |
| 4 | provider-down | The gateway could not reach a provider — see E1601/E1705/E1706 |
| 5 | partial success with a repair hint | Follow the printed repair hint, then re-run the failed part |

## Common E-codes

### Workspace and config

- **E1200 `config_missing`** — no `vaerion.yaml` here. Fix: `vae init`, or
  `cd` into a workspace. (Running outside a workspace uses an ad-hoc
  in-memory config; it is announced, and journalling stays local.)
- **E1201 `config_unknown_key`** — a key outside the strict schema. Fix:
  remove it; the engine rejects drift rather than guessing intent.
- **E1202 `config_schema_invalid`** — the YAML violates the v0.1 schema.
  The accepted shape is `spec/schemas/vaerion-yaml.schema.json`;
  `schemaVersion: "0.1"` is required.

### Journals and runs

- **E1000 `journal_lock_held`** — another writer holds the journal. Wait,
  or after confirming no writer is alive:
  `vae journal recover <run>`.
- **E1001 / E1002 `journal_chain_broken` / `journal_torn_tail`** — the
  blake3 chain is broken or the tail is torn (crash mid-write). Fix:
  `vae journal recover <run>` (truncates the torn tail, re-seals the
  chain). Never hand-edit records.
- **E1302 `gate_pending`** — a durable human gate is waiting for you:
  `vae resume <run> --answer '{...}'`.
- **E1502 `run_not_found`** — list runs with `vae journal ls`.

### Broker (exit code 3)

- **E1300 `broker_denied`** — first matching policy rule denied the
  capability. Inspect the recorded decision with
  `vae explain <trace>`, then request the narrowest grant you need in
  `vaerion.yaml` (`policy.rules`, each rule must state its rationale).
- **E1301 `broker_fail_closed`** — the broker could not evaluate the
  request and refused. Un-evaluable requests are never allowed by law;
  resolve the underlying error.

### Gateway (exit code 4)

- **E1601 / E1706** — provider unreachable / transport refused. Check
  connectivity; `vae doctor` reports the capability matrix and breaker
  state.
- **E1703 `gateway_budget_exceeded`** — the run hit its declared token or
  micro-USD ceiling. Raise `gateway.budgets` deliberately.
- **E1704 `gateway_secret_unresolved`** — a declared secret resolved to
  nothing. Store it in the OS keychain (service `vae`, account = secret
  name) or export it as an environment variable. Names live in config;
  values never do.
- **E1705 `gateway_breaker_open`** — repeated failures opened the circuit
  breaker. Wait out the cooldown; investigate the journaled failures.

### Extensions

- **E2100 `extension_artifact_digest_mismatch`** — the artifact's sha256
  did not match its pin; it was **not** executed. Fix the artifact or the
  pin; never disable the pin.
- **E2101 `extension_not_declared`** — declare the extension in
  `vaerion.yaml` (`extensions`).
- **E2102 / E2103** — the extension broke protocol or timed out; the host
  killed it. The lifecycle is journaled.

### Bundles

- **E2200 / E2203** — not a valid `.vxn` (bad magic/canonical form) or an
  unsupported format version. Do not repair bundles by hand; rebuild.
- **E2201 / E2202** — digest or pin mismatch: the bundle does not match
  its config/lock. Rebuild from trusted inputs.
- **E2204 `vxn_input_missing`** — a declared input path is missing or
  illegal (absolute paths and globs are refused by law).
- **E2205 `vxn_lock_mismatch`** — the bundle is older than the current
  seal. Re-run `vae package build` to regenerate `vaerion.lock`.
- **E2206 `vxn_verify_failed`** — verify found failures; the per-check
  findings report says exactly which.

### Repository, CI, and release (E2300–E2312, Phase 8)

- **E2300 / E2301** — you are not inside a git repository, or git itself
  is unusable. Vaerion measures repositories; it never invents them.
- **E2302 `repo_merge_conflict`** — the tree has unresolved conflicts or an
  in-progress merge/rebase/cherry-pick. Resolve or abort before trusting
  or releasing the tree.
- **E2303 `repo_identity_violation`** — a commit is not authored
  `Auren <auren@vaerion.dev>`. History is immutable (no rewrites);
  identity governance changes require a Founder decision.
- **E2304 `ci_workflow_invalid`** — a workflow failed structural
  validation (shape, timeout, unpinned substrate, secret hygiene). The
  findings list says which file and why.
- **E2305 `ci_verify_authority_missing`** — a workflow runs gate logic
  without `tools/verify.ts`. CI must re-run the authority, never
  re-implement the gates (Constitution D-R).
- **E2306 `ci_env_if_drift`** — a step's `if:` reads a variable defined in
  that same step's own `env:` — the condition can never see it and is
  permanently false. Decide in the shell, or hoist the variable.
- **E2307 `ci_unparsable_yaml`** — a workflow file does not parse as YAML.
- **E2308 `release_not_ready`** — release readiness finished with
  blockers; each blocker in the report carries its own Fix.
- **E2309** — version surfaces disagree. Align every surface.
- **E2310** — no green verification record. Run `bun run tools/verify.ts`
  (or `vae release readiness --live-gates`).
- **E2311** — HEAD is not exactly at a `v*` tag. Tag the release commit,
  then pack from the tag.
- **E2312** — the packed, signed artifact set is missing. Run
  `tools/dist-pack.ts --ref <tag>` and verify with `tools/dist-verify.ts`.

## Environment notes

- **Windows**: use WSL2; the daemon binds loopback inside the WSL VM.
- **Keychain**: on Linux without a secret service, the env-indirection
  port is the fallback (E1704 explains resolution order).
- **Bun version**: 1.3+ required; `bun run tools/verify.ts` is the first
  thing to run after any environment change.

## Getting help

Include in every report: the exact command, the full output (it embeds
the E-code and repair hint), and `vae doctor` output. Security findings
go privately to the project owner — see
`docs/security/RISK-LEDGER.md`.
