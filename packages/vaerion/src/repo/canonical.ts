/**
 * Vaerion canonical provisioning law (MASTER DIRECTIVE Phase 17; constitution
 * v1.7 A7 — D-Q executed to the root) — the D-Q pre-receive hook as VERSIONED
 * LAW TEXT, plus the deterministic provisioning plan.
 *
 * History (the defect class this module kills): the canonical store's
 * protection hook was provisioned by ad-hoc shell at every campaign — the
 * hook bytes existed nowhere in the repository, so every session boundary
 * that lost `/home/z/vaerion-canonical.git` also lost the protection law's
 * enforcement until a human re-typed it (it was lost TWICE — measured at the
 * GA campaign and again at this campaign's start). The law now lives in the
 * engine: one string of record, byte-pinned by tests, installed by the ONE
 * sanctioned provisioner (`tools/canonical-provision.ts`) and proven by
 * adversarial probes on every provisioning (D-Q).
 *
 * Determinism (C2): the hook text is a pure constant — identical bytes on
 * every provisioning, hash-pinned by test.
 * Read-only measurement discipline (the git.ts pattern): the PROVISIONER is
 * the only writer, and it writes ONLY the bare store's hook file — never
 * refs, never the working repository.
 */

/** The zero SHA (SHA-1 repositories — 40 bits of nothing). */
const ZERO_SHA = "0000000000000000000000000000000000000000";

/**
 * The D-Q synchronization protection law, as the canonical store's
 * pre-receive hook. Binding properties (constitution v1.7, D-Q):
 *   1. `main` is fast-forward only — a non-fast-forward update is REFUSED;
 *   2. `main` cannot be deleted — REFUSED;
 *   3. `v*` tags are immutable — overwrite and deletion REFUSED;
 * everything else (archive branches, scratch refs) is unrestricted.
 * Exit 0 allows the push; exit 1 refuses it (fail-closed, P6).
 */
export const PRE_RECEIVE_HOOK = `#!/bin/sh
# Vaerion D-Q synchronization protection law — pre-receive hook.
# VERSIONED LAW TEXT: generated from packages/vaerion/src/repo/canonical.ts
# by tools/canonical-provision.ts — never hand-edit this file; the hook is
# re-provisioned from the engine's law of record, byte-identical every time.
#
# Enforced on every push (constitution v1.7, D-Q):
#   1. refs/heads/main is fast-forward only (non-ff REFUSED)
#   2. refs/heads/main cannot be deleted (REFUSED)
#   3. refs/tags/v* are immutable — overwrite and deletion REFUSED
# Exit 0 allows the push; exit 1 refuses it (fail-closed).

set -u
zero="${ZERO_SHA}"
status=0
while read -r old new ref; do
  [ -n "\${ref:-}" ] || continue
  case "$ref" in
    refs/heads/main)
      if [ "$new" = "$zero" ]; then
        echo "D-Q REFUSED: main deletion is forbidden (the synchronization protection law)" >&2
        status=1
      elif [ "$old" != "$zero" ]; then
        if ! git merge-base --is-ancestor "$old" "$new" 2>/dev/null; then
          echo "D-Q REFUSED: main is fast-forward only (non-fast-forward update $old..$new)" >&2
          status=1
        fi
      fi
      ;;
    refs/tags/v*)
      if [ "$new" = "$zero" ]; then
        echo "D-Q REFUSED: release tag deletion is forbidden ($ref — v* tags are immutable)" >&2
        status=1
      elif git rev-parse --verify -q "$ref" >/dev/null 2>&1; then
        echo "D-Q REFUSED: release tag overwrite is forbidden ($ref already exists — v* tags are immutable)" >&2
        status=1
      fi
      ;;
  esac
done
exit $status
`;

/** The canonical store path of record for this environment (D-S: presence is measured, never assumed). */
export const CANONICAL_STORE_PATH = "/home/z/vaerion-canonical.git" as const;

export interface ProvisionStep {
  readonly argv: readonly string[];
  readonly why: string;
}

/**
 * The deterministic provisioning plan for a canonical store: bare init with
 * `main` as the initial branch, then the versioned hook installed at
 * `hooks/pre-receive`. The plan NEVER touches refs — a re-provisioning of an
 * existing store re-asserts the law (the hook bytes) and preserves history.
 */
export function provisionPlan(storePath: string): { hookPath: string; steps: readonly ProvisionStep[] } {
  return {
    hookPath: `${storePath}/hooks/pre-receive`,
    steps: [
      {
        argv: ["git", "init", "--bare", "--initial-branch=main", storePath],
        why: "the bare store of record with `main` as the initial branch (D-Q)",
      },
      {
        argv: ["install-hook", PRE_RECEIVE_HOOK, `${storePath}/hooks/pre-receive`],
        why: "the versioned D-Q law text installed as the pre-receive hook (byte-identical every provisioning)",
      },
      {
        argv: ["chmod", "755", `${storePath}/hooks/pre-receive`],
        why: "the hook must be executable or the protection law is silent (fail-closed provisioning)",
      },
    ],
  };
}
