# Vaerion — Remote Protection of Record (D-Q, v1.6 A6 Phase 12)

> **GENERATED** by `tools/remote-protect.ts` — the ONE sanctioned applier/prober of the
> synchronization protection law on the remote of record `falconxa0-commits/vaerion` (branch `main`).
> Hand edits are defects; re-measure with the tool.

| | |
|---|---|
| **Applied** | yes (PUT accepted) |
| **Verdict** | PROTECTED — the descriptor of record holds |
| **Force-push** | REFUSED (no force-push on main) |
| **Deletion** | REFUSED (no deletion of main) |
| **History** | linear required |
| **Admins** | enforced for administrators |
| **Required checks** | STAGED (fail-closed) — none until a measured green run exists (Phase 13) |

## Measurements (D-S labels)

- [VERIFIED] probe.deletion-refusal: DELETE branches/main answered HTTP 404 and the ref is VERIFIED untouched (GET branches/main → HTTP 200) — GitHub refuses deletion of a protected default branch
- [NOT EXECUTED] probe.force-push-refusal: enforced by the measured allow_force_pushes=false setting; a destructive live force-push against main is NOT EXECUTED on purpose (it would risk the protected ref itself)
- [NOT EXECUTED] probe.tag-immutability: v* tag immutability holds by policy on this remote (no overwrite ever attempted — D-Q history: every tag pushed once, as NEW refs)
- [VERIFIED] descriptor.allow_force_pushes: measured allow_force_pushes=false — law requires false
- [VERIFIED] descriptor.allow_deletions: measured allow_deletions=false — law requires false
- [VERIFIED] descriptor.required_linear_history: measured required_linear_history=true — law requires true
- [VERIFIED] descriptor.enforce_admins: measured enforce_admins=true — law requires true
- [VERIFIED] staged.required_status_checks: required_status_checks=undefined — STAGED fail-closed until a measured green run exists

---

*Measured, never assumed. The canonical store remains the D-Q hook authority of record; this remote now enforces the same properties by branch protection. Honest limits: a destructive live force-push against main is NOT EXECUTED (it would risk the protected ref itself) — the refusal is enforced by the measured allow_force_pushes=false configuration; the deletion refusal IS live-probed.*

> **MEASURED DISCOVERY (Phase 13):** required status checks and the direct-push synchronization path are structurally
> incompatible — with `verification (all gates)` required, a push of new commits is declined at pre-receive because the
> check for those commits cannot exist before the push that triggers it (measured: `! [remote rejected] main -> main
> (protected branch hook declined)`). The check of record therefore stays STAGED while the direct-push sync law (D-Q)
> governs the remote; the elevation PERMISSION condition (a measured green run exists — run #7, artifact-verified) is
> satisfied and preserved in the guard. Converting main to a merge-only (PR) flow to enable full elevation is a human
> authority decision (P4) that changes the synchronization architecture, and is recorded as a Founder decision.*
