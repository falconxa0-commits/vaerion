/**
 * vae-ext-host — extension manifests and lifecycle (Stage 15).
 *
 * Extensions are principals, not guests (Stage 15 principles): they
 * declare themselves in a versioned manifest (D15.1), declare a
 * compatibility range (D15.4), and move through a journaled lifecycle
 * (D15.2). The sandbox isolation boundary is a port here — the real
 * sandboxed runtime is MS-6 (foundations-before-features, D22.2).
 */

import { refusalError } from "vae-foundation";

export interface ExtensionManifest {
  /** Unique extension identity, e.g. "com.example.naming-helper". */
  readonly id: string;
  readonly version: string;
  /** Compatibility range against engine contract versions (D15.4). */
  readonly compatibility: { readonly engine: string };
  /** Requested capabilities — undeclared means denied (D15.1, D10.1). */
  readonly requestedCapabilities: readonly string[];
  /** Exposed surfaces (e.g. which subcommands or hooks it plugs into). */
  readonly surfaces: readonly string[];
}

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/** Validate a manifest; refuses incomplete or malformed declarations. */
export function validateManifest(manifest: ExtensionManifest): void {
  if (typeof manifest.id !== "string" || manifest.id.length < 3) {
    throw refusalError("E1006", "Extension manifest is missing a valid id.", "Declare a unique id of at least 3 characters in the manifest (D15.1).");
  }
  if (typeof manifest.version !== "string" || !SEMVER_RE.test(manifest.version)) {
    throw refusalError("E1006", `Extension version '${String(manifest.version)}' is not semver.`, "Version the manifest with major.minor.patch (D17.3).");
  }
  if (typeof manifest.compatibility?.engine !== "string" || !manifest.compatibility.engine.startsWith(">=")) {
    throw refusalError("E1006", "Extension manifest must declare an engine compatibility range.", "Declare compatibility.engine as a range like '>=0.1 <0.2' (D15.4).");
  }
  if (!Array.isArray(manifest.requestedCapabilities)) {
    throw refusalError("E1006", "Extension manifest must declare requestedCapabilities.", "List every requested capability; undeclared capabilities are denied fail-closed (D15.1).");
  }
}

/** Compatibility check against the running contract set (D15.4, E2006). */
export function compatibilityAllows(range: string, engineVersion: string): boolean {
  const parts = range.split(/\s+/).filter(Boolean);
  const engine = engineVersion.split("-")[0]!;
  for (const part of parts) {
    const m = part.match(/^(>=|<=|<|>)\s*(\d+\.\d+(\.\d+)?)/);
    if (m === null) continue;
    const [, op, version] = m;
    const cmp = compareSemver(engine, version!);
    if (op === ">=" && !(cmp >= 0)) return false;
    if (op === ">" && !(cmp > 0)) return false;
    if (op === "<=" && !(cmp <= 0)) return false;
    if (op === "<" && !(cmp < 0)) return false;
  }
  return true;
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Lifecycle state machine (D15.2): registered → active → disabled → removed.
// Every transition is journaled with actor+cause by the host caller.
// ---------------------------------------------------------------------------

export type ExtensionState = "registered" | "active" | "disabled" | "removed";

const TRANSITIONS: Record<ExtensionState, readonly ExtensionState[]> = {
  registered: ["active", "removed"],
  active: ["disabled", "removed"],
  disabled: ["active", "removed"],
  removed: [],
};

export function canTransition(from: ExtensionState, to: ExtensionState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(current: ExtensionState, to: ExtensionState): ExtensionState {
  if (!canTransition(current, to)) {
    throw refusalError("E1006", `Illegal extension lifecycle transition ${current} → ${to}.`, "Follow the declared lifecycle registered → active → disabled → removed; every transition is journaled (D15.2).");
  }
  return to;
}

/** Isolation boundary port (D15.3) — the real sandbox is MS-6. */
export interface IsolationBoundary {
  /** Execute within the sandbox; no reach beyond granted capabilities. */
  run<T>(work: (io: never) => T): Promise<T>;
}

export const EXT_HOST_STATUS = {
  manifestValidation: true,
  lifecycleStateMachine: true,
  compatibilityRanges: true,
  sandboxRuntime: false,
  targetMilestone: "MS-6",
} as const;
