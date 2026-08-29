# ADR-0013: OS-keychain-first secrets with env fallback

| | |
|---|---|
| Status | Accepted |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

Model gateway and research capabilities need provider credentials. Secrets
must never enter the repository, `vaerion.yaml`, or any journal or receipt
(decision payloads are redacted by law). A custom encrypted vault is
machinery the v0.1 local-first engine does not need; plaintext dotfiles are
worse. The engine also needs a deterministic test story: CI has no keychain
and must not have secrets.

## Decision

1. Secrets live in the OS keychain first, accessed through a keyring port
   with service name `vae` and the profile name as the account. No engine
   code handles secret material beyond passing it to its consumer.
2. Fallback for environments without a usable keychain (containers, CI):
   environment-variable indirection — configuration names a secret, the
   process environment supplies its value at use time. The value is never
   written to disk by the engine.
3. `vaerion.yaml` and `vaerion.lock` carry secret NAMES only, plus scoped
   grants naming which principals may read which secret (e.g., grant
   `ANTHROPIC_API_KEY` to the gateway). Secret reads are broker-mediated
   capabilities and journaled decisions like any other.
4. Journals, decisions, and receipts are redacted before persistence; a
   secret-shaped value never becomes journal content (property-proven in
   verification).
5. A vault backend can be added later behind the same port trait; v0.1
   deliberately does not build one.

## Consequences

- Positive: default-safe storage with the least machinery; OS-managed
  lifecycle (locking, sync policies) comes free.
- Positive: CI and contributor setups work without any keychain via env
  indirection, keeping verification hermetic.
- Negative: keychain behavior varies across platforms (unlock prompts, ACL
  quirks); the doctor must diagnose keychain health explicitly.
- Negative: env fallback is weaker protection; it is a documented, explicit
  fallback, not a silent one.
