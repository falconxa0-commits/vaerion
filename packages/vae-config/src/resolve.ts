/**
 * vae-config — layered resolution with provenance (D19.1, D19.4, D19.6, D19.7).
 *
 * Values resolve in the fixed, documented order:
 *   defaults < engine configuration < profile overlay < project
 *   configuration (vaerion.yaml) < explicit environment < explicit flag
 * A layer overrides only the values it explicitly provides — an omitted
 * key falls through to the layer beneath; shadowing is never silent:
 * every leaf records the layer that supplied it, and the provenance is
 * inspectable via `vae doctor`. A run pins a snapshot at start; mid-run
 * changes never apply (D19.7).
 */

import { blake3Text, canonicalJson } from "vae-foundation";
import { parseVaerYaml, type YamlValue } from "./vaeryaml.ts";
import { applyProfileOverlay, validateConfig, DEFAULT_CONFIG, type VaerionConfig } from "./schema.ts";

export type ConfigLayer =
  | "defaults"
  | "engine"
  | "profile"
  | "project"
  | "environment"
  | "flag";

export const LAYER_PRECEDENCE: readonly ConfigLayer[] = [
  "defaults",
  "engine",
  "profile",
  "project",
  "environment",
  "flag",
];

export interface ResolvedConfig {
  readonly config: VaerionConfig;
  /** Which layer supplied each leaf value (dot paths, e.g. "engine.journal.verifyOnStart"). */
  readonly provenance: Record<string, ConfigLayer>;
  /** blake3 fingerprint over the canonical resolved config (D19.7). */
  readonly fingerprint: string;
}

export interface ResolveInput {
  /** Engine-level configuration document (e.g. ~/.config/vae/config.yaml). */
  readonly engineDoc?: YamlValue;
  /** Project configuration document (vaerion.yaml). */
  readonly projectDoc?: YamlValue;
  /** Selected profile name (D19.4). */
  readonly profile?: string;
  /** Explicit environment values (already mapped — see mapEnvironment). */
  readonly environment?: Record<string, string>;
}

const ENV_KEYS = ["VAE_PROFILE"] as const;

/**
 * Map raw environment variables to explicit config inputs (D19.6).
 * Free-form passthrough is refused: only mapped keys are read.
 */
export function mapEnvironment(env: Record<string, string | undefined>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const key of ENV_KEYS) {
    const value = env[key];
    if (value !== undefined && value.length > 0) mapped[key] = value;
  }
  return mapped;
}

/** Dot-paths explicitly present in a raw document (leaves and sequences). */
export function explicitPaths(doc: YamlValue): string[] {
  const out: string[] = [];
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return out;
  walk(doc as Record<string, YamlValue>, "", out);
  return out.sort();
}

function walk(node: Record<string, YamlValue>, prefix: string, out: string[]): void {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix.length === 0 ? key : `${prefix}.${key}`;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      walk(value as Record<string, YamlValue>, path, out);
    } else {
      out.push(path);
    }
  }
}

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setPath(obj: unknown, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = obj as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]!];
    if (next === undefined) {
      cur[parts[i]!] = {};
    }
    cur = cur[parts[i]!] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

/**
 * Resolve the effective configuration across layers, in precedence
 * order. Each layer supplies only its explicit values.
 */
export function resolveConfig(input: ResolveInput): ResolvedConfig {
  const provenance: Record<string, ConfigLayer> = {};

  // Layer 1: ratified defaults.
  let config = structuredClone(DEFAULT_CONFIG) as VaerionConfig;
  for (const path of explicitPaths(structuredClone(DEFAULT_CONFIG) as unknown as import("./vaeryaml.ts").YamlValue)) provenance[path] = "defaults";

  // Layer 2: engine configuration — only engine/permissions values.
  if (input.engineDoc !== undefined && input.engineDoc !== null) {
    const engine = validateConfig(input.engineDoc, "engine");
    for (const path of explicitPaths(input.engineDoc)) {
      if (!path.startsWith("engine.") && !path.startsWith("permissions.")) continue;
      setPath(config, path, getPath(engine, path));
      provenance[path] = "engine";
    }
  }

  // Layer 3: profile overlay (D19.4) — engine values only; policy is
  // never widened by a profile (D19.4; the broker enforces ceilings).
  const env = input.environment ?? {};
  if (env["VAE_PROFILE"] !== undefined && input.profile !== undefined && env["VAE_PROFILE"] !== input.profile) {
    throw usageProfileConflict(input.profile, env["VAE_PROFILE"]);
  }
  const profileName = input.profile ?? env["VAE_PROFILE"];
  if (profileName !== undefined) {
    const overlayDoc = findProfileOverlay(input.projectDoc ?? null, profileName);
    if (overlayDoc === undefined) throw undeclaredProfile(profileName);
    const profiled = applyProfileOverlay(config, overlayDoc);
    for (const path of explicitPaths(overlayDoc)) {
      const fullPath = path.startsWith("engine.") || path.startsWith("permissions.") ? path : `engine.${path}`;
      setPath(config, fullPath, getPath(profiled, fullPath));
      provenance[fullPath] = "profile";
    }
    provenance["profiles.selected"] = "profile";
  }

  // Layer 4: project configuration (authoritative for identity).
  if (input.projectDoc !== undefined && input.projectDoc !== null) {
    const project = validateConfig(input.projectDoc);
    config.schemaVersion = project.schemaVersion;
    for (const path of explicitPaths(input.projectDoc)) {
      if (path.startsWith("profiles.")) continue;
      const section = path.split(".")[0]!;
      if (section === "schemaVersion") {
        provenance["schemaVersion"] = "project";
        continue;
      }
      setPath(config, path, getPath(project, path));
      provenance[path] = "project";
    }
  }

  // Layers 5–6 (environment, flags) select behavior — e.g. the profile
  // above — and never widen permission policy (Article II, D19.4).

  return { config, provenance, fingerprint: blake3Text(canonicalJson(config)) };
}

function usageProfileConflict(flagProfile: string, envProfile: string): Error {
  const err = new Error(`profile conflict: flag '${flagProfile}' vs environment 'VAE_PROFILE=${envProfile}'`);
  return Object.assign(err, { code: "E1006" });
}

function undeclaredProfile(name: string): Error {
  const err = new Error(`profile '${name}' is not declared in project configuration`);
  return Object.assign(err, { code: "E1006" });
}

function findProfileOverlay(projectDoc: YamlValue, profile: string): YamlValue | undefined {
  if (projectDoc === null || typeof projectDoc !== "object") return undefined;
  const profiles = (projectDoc as Record<string, YamlValue>)["profiles"];
  if (profiles === null || typeof profiles !== "object" || Array.isArray(profiles)) return undefined;
  return (profiles as Record<string, YamlValue>)[profile];
}

/**
 * Pin a runtime snapshot (D19.7). The returned snapshot is frozen and
 * carries the fingerprint that `vae resume` verifies before continuing.
 */
export function pinSnapshot(resolved: ResolvedConfig): ConfigSnapshot {
  return Object.freeze({
    fingerprint: resolved.fingerprint,
    config: Object.freeze(structuredClone(resolved.config)),
    provenance: Object.freeze({ ...resolved.provenance }),
    pinnedAt: "run-start",
  });
}

export interface ConfigSnapshot {
  readonly fingerprint: string;
  readonly config: VaerionConfig;
  readonly provenance: Readonly<Record<string, ConfigLayer>>;
}

/** Parse a config document from VaerYaml text with fail-closed errors. */
export function parseConfigText(text: string): YamlValue {
  return parseVaerYaml(text);
}
