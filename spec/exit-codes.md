# Exit-Code Alphabet (Part IV, D18.6)

The exit alphabet is constitutional: shells and CI branch on exit codes
alone, in every version. Adding a code is a Class A amendment.

| Code | Class | Meaning | Canonical example |
|---|---|---|---|
| `0` | success | The command did what it declared. | `vae doctor` with all checks green |
| `2` | usage error | The operator asked wrongly: bad flag, bad argument, missing workspace, invalid configuration. | `vae doctor` outside a workspace (E1005) |
| `3` | refusal | The engine declined: broker denial, park, non-interactive prompt, drift. Explained, logged, next step offered. | `vae run` referencing an unregistered tool (E2005) |
| `4` | run failure | The work was attempted and failed honestly: broken chain, failed step, exhausted budget, failed health check. | `vae run` on a tampered audit chain (E3001) |
| `5` | internal error | A violated expectation inside the engine. Always a bug to report. | Envelope schema violation (E5002) |

Determinism (D18.12): identical inputs and state produce identical exit
codes across machines and runs.

Machine detection: `--json` emits an `engine.error` envelope carrying
the `E####` code on every refusal/failure path — CI may branch on exit
codes alone (Guarantee 5) or inspect codes (Guarantee 2).
