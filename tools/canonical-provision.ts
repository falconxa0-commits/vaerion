/**
 * Vaerion canonical provisioner + prover (MASTER DIRECTIVE Phase 17;
 * constitution v1.7 A7, D-Q) — the ONE sanctioned applier and adversarial
 * prover of the synchronization protection law on the canonical store.
 *
 * The sibling of `remote-protect.ts` (the D-Q GitHub face): TWO faces of ONE
 * law, no duplicated logic — the hook text itself is ENGINE LAW
 * (`packages/vaerion/src/repo/canonical.ts`), this tool only applies and
 * proves it.
 *
 * D-Q: "The protection law is adversarially probed after every provisioning —
 * on the canonical store by push probes … and the protection state is
 * recorded with D-S honesty labels."
 *
 * Faces:
 *   bun tools/canonical-provision.ts <store-path>              provision (+ probe when main exists)
 *   bun tools/canonical-provision.ts <store-path> --probe-only probe an existing store
 *
 * Token/secret discipline: local git only — no network, no credentials, no
 * environment secrets (C1/C7-clean by construction).
 * Fail-closed: any refused-law probe (the hook did NOT refuse) exits 1.
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { PRE_RECEIVE_HOOK, provisionPlan, type ProvisionStep } from "../packages/vaerion/src/repo/canonical.ts";

export interface ProbeResult {
  readonly probe: string;
  readonly expected: "REFUSED";
  readonly refused: boolean;
  readonly detail: string;
}

export interface ProbeReport {
  readonly storePath: string;
  readonly probes: readonly ProbeResult[];
  readonly postStateUnchanged: boolean;
  readonly ok: boolean;
  readonly honesty: "VERIFIED";
}

function git(cwd: string, argv: readonly string[], env: Record<string, string> = {}): { ok: boolean; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(["git", ...argv], { cwd, env: { ...process.env, ...env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  return {
    ok: proc.exitCode === 0,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

/** Apply one provisioning step; the hook install writes the law bytes verbatim. */
export function applyProvisionStep(storePath: string, step: ProvisionStep): void {
  if (step.argv[0] === "install-hook") {
    const hookPath = step.argv[2]!;
    mkdirSync(join(hookPath, ".."), { recursive: true });
    writeFileSync(hookPath, step.argv[1]!, "utf8");
    chmodSync(hookPath, 0o755);
    return;
  }
  const proc = Bun.spawnSync(step.argv as string[], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`provision: step failed (${step.argv.join(" ")}): ${proc.stderr.toString().trim()}`);
  }
}

/**
 * Provision the canonical store of record: bare init (idempotent on an
 * existing store) + the versioned hook installed byte-identically. Refs are
 * NEVER touched — history is sacred (Law 7).
 */
export function provisionStore(storePath: string): { hookPath: string; preExisting: boolean } {
  const preExisting = existsSync(join(storePath, "HEAD"));
  const plan = provisionPlan(storePath);
  mkdirSync(storePath, { recursive: true });
  for (const step of plan.steps) {
    applyProvisionStep(storePath, step);
  }
  const installed = existsSync(plan.hookPath);
  if (!installed) throw new Error("provision: the hook install reported success but the hook is absent — fail-closed");
  return { hookPath: plan.hookPath, preExisting };
}

/**
 * Adversarially probe the protection law on a REAL store (D-Q), through a
 * throwaway clone: non-ff main REFUSED, main deletion REFUSED, tag overwrite
 * REFUSED, tag deletion REFUSED, post-probe state unchanged. The probes are
 * pure with respect to the store's recorded state: every mutating probe is a
 * REFUSAL (the hook blocks it), and the ref state is snapshotted before and
 * compared after.
 */
export function probeStore(storePath: string, scratchRoot: string): ProbeReport {
  const before = git(storePath, ["ls-remote", "."]);
  if (!before.ok) throw new Error(`probe: the store is not readable: ${storePath}`);
  const preState = before.stdout;

  // Fail-closed probe preconditions: the adversarial probes push against a
  // real `main` — probing an EMPTY or depth-1 store would either mutate it
  // (an empty store ACCEPTS a root-commit push: old == zero is a legal
  // fast-forward) or make the refusal probes meaningless. An unprobeable
  // store is an error, never a mutated store.
  if (!preState.split("\n").some((l) => l.endsWith("\trefs/heads/main"))) {
    throw new Error("probe: the store has no main ref — the protection law is probeable only after the synchronization push");
  }
  // The hook must be present and executable BEFORE any adversarial push: a
  // hookless store would accept the forced probes and MUTATE. Its absence is
  // a fail-closed defect surfaced without pushing anything.
  const hookPath = join(storePath, "hooks", "pre-receive");
  if (!existsSync(hookPath)) {
    throw new Error("probe: no pre-receive hook installed — the D-Q law is NOT provisioned (refusing to probe: the forced probes would mutate an unprotected store)");
  }
  chmodSync(hookPath, 0o755); // re-assert executability; a non-executable hook is silently ignored by git

  const scratch = join(scratchRoot, "probe-clone");
  const clone = git(scratchRoot, ["clone", "--quiet", storePath, scratch]);
  if (!clone.ok) throw new Error(`probe: clone failed: ${clone.stderr.trim()}`);
  if (!git(scratch, ["rev-parse", "--quiet", "--verify", "HEAD~1"]).ok) {
    throw new Error("probe: the store's main has fewer than 2 commits — the non-ff probe needs depth; synchronize first");
  }

  const probes: ProbeResult[] = [];
  const expectRefusal = (probe: string, argv: readonly string[]) => {
    const r = git(scratch, argv);
    const refused = !r.ok && r.stderr.includes("D-Q REFUSED");
    probes.push({
      probe,
      expected: "REFUSED",
      refused,
      detail: refused
        ? (r.stderr.trim().split("\n").find((l) => l.includes("D-Q REFUSED")) ?? "").trim()
        : `THE LAW DID NOT REFUSE — stderr: ${r.stderr.trim() || "(empty)"}`,
    });
  };

  // Probe 1 — non-fast-forward main (rewind one, commit, push --force).
  // --force is LOAD-BEARING: without it the git CLIENT refuses the non-ff
  // push and the probe would prove the client, not the law. With --force the
  // update reaches the pre-receive hook, whose refusal is the proof.
  git(scratch, ["config", "user.email", "probe@vaerion.dev"]);
  git(scratch, ["config", "user.name", "D-Q Probe"]);
  git(scratch, ["reset", "--hard", "--quiet", "HEAD~1"]);
  git(scratch, ["commit", "--allow-empty", "--quiet", "-m", "D-Q adversarial probe: non-ff"]);
  expectRefusal("non-fast-forward main", ["push", "--quiet", "--force", "origin", "main"]);

  // Probe 2 — main deletion.
  expectRefusal("main deletion", ["push", "--quiet", "origin", ":refs/heads/main"]);

  // Probe 3 — v* tag overwrite (move the first v* tag to another commit).
  const tags = git(storePath, ["tag", "--list", "v*", "--sort=refname"]);
  const firstTag = tags.stdout.split("\n").map((l) => l.trim()).filter(Boolean)[0];
  if (firstTag) {
    const target = git(scratch, ["rev-parse", "HEAD~1"]);
    git(scratch, ["tag", "-f", firstTag, target.stdout.trim()]);
    // --force again: the client would otherwise refuse the moved tag before
    // the hook ever sees it — the law must be the thing that refuses.
    expectRefusal(`tag overwrite (${firstTag})`, ["push", "--quiet", "--force", "origin", `refs/tags/${firstTag}`]);
    // Probe 4 — v* tag deletion.
    expectRefusal(`tag deletion (${firstTag})`, ["push", "--quiet", "origin", `:refs/tags/${firstTag}`]);
  }

  const after = git(storePath, ["ls-remote", "."]);
  const postStateUnchanged = after.ok && after.stdout === preState;

  const ok = probes.length > 0 && probes.every((p) => p.refused) && postStateUnchanged;
  return { storePath, probes, postStateUnchanged, ok, honesty: "VERIFIED" };
}

export function renderProbeReport(r: ProbeReport): string {
  const lines = [
    `canonical protection probe — ${r.storePath}`,
    `(D-Q: adversarially probed after provisioning; every claim VERIFIED by execution, never assumed)`,
    "",
  ];
  for (const p of r.probes) {
    lines.push(`  [${p.refused ? "REFUSED ✓" : "NOT REFUSED ✗"}] ${p.probe} — ${p.detail}`);
  }
  lines.push(`  [${r.postStateUnchanged ? "UNCHANGED ✓" : "MUTATED ✗"}] post-probe ref state`);
  lines.push("");
  lines.push(r.ok ? "PROTECTION LAW VERIFIED — every adversarial probe refused; state untouched" : "PROTECTION LAW DEFECT — the store did NOT enforce the D-Q law (fail-closed exit 1)");
  return lines.join("\n");
}

// ── the direct-run face ──

async function main(): Promise<number> {
  const argv = process.argv.slice(2).filter((a) => a !== "");
  const probeOnly = argv.includes("--probe-only");
  const positional = argv.filter((a) => !a.startsWith("--"))[0];
  if (!positional) {
    console.error("usage: bun tools/canonical-provision.ts <store-path> [--probe-only]");
    return 2;
  }
  const storePath = positional;
  if (!probeOnly) {
    const { hookPath, preExisting } = provisionStore(storePath);
    console.log(`provisioned: ${storePath}${preExisting ? " (pre-existing store — refs untouched, law re-asserted)" : " (new store)"}`);
    console.log(`hook: ${hookPath} (versioned law text from src/repo/canonical.ts)`);
  }
  const scratchRoot = await import("node:fs/promises").then((fs) => fs.mkdtemp(join("/tmp", "vaerion-dq-probe-")));
  try {
    const report = probeStore(storePath, scratchRoot);
    console.log(renderProbeReport(report));
    return report.ok ? 0 : 1;
  } catch (err) {
    console.error(`probe: ${(err as Error).message}`);
    console.error("(an unprobeable store is a fail-closed result: the protection law could NOT be verified)");
    return 1;
  } finally {
    await import("node:fs/promises").then((fs) => fs.rm(scratchRoot, { recursive: true, force: true }));
  }
}

const isDirectRun = process.argv[1]?.endsWith("canonical-provision.ts");
if (isDirectRun) {
  process.exitCode = await main();
}
