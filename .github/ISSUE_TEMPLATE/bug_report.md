---
name: Bug report
about: A measured behavior that contradicts the expected contract
labels:
  - bug
---

<!-- Security findings do NOT go here. Report them privately per SECURITY.md
and docs/security/RISK-LEDGER.md (disclosure posture). -->

**Engine version**

<!-- From `vae dev` (or the `vae` welcome payload), e.g. 0.1.12-rc1 -->

**What you ran**

<!-- The exact command or API call, verbatim. -->

**Expected behavior**

<!-- The contract: cite spec/ or docs/ where it is defined, if you can. -->

**Actual behavior (measured, not narrated)**

<!-- What actually happened. Distinguish measured output from interpretation. -->

**Measured evidence (required)**

- Exit code (0 ok · 1 internal · 2 usage · 3 broker-denied · 4 provider-down ·
  5 partial-with-repair-hint):
- Journal / receipt output for the affected run (`vae journal show RUN_ID`,
  `vae journal verify RUN_ID`):
- `vae doctor` output:
- Verification record if present (`.vaerion-verification.json`): ok true/false,
  gate summary:

**Environment**

<!-- OS, architecture, and install channel (universal installer / npm / Python
wheel / source). -->

**Minimal reproduction**

<!-- Steps from a clean state. If `vae doctor` is red, say so up front. -->
