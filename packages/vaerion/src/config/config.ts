/**
 * Vaerion — configuration (L0).
 *
 * vaerion.yaml is the human-authored head of the source-of-truth chain.
 * Law: unknown keys are REJECTED (drift guard, Blueprint §7.1); the result is
 * fingerprinted (blake3 over canonical JSON) into every run header.
 * Zero telemetry is structural: telemetry.enabled may only be false.
 */

import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { blake3HexOf } from "../kernel/hash.ts";
import { VaerionError } from "../kernel/errors.ts";
import { canonicalJson } from "../kernel/canonical.ts";
import type { PolicyContract, PolicyRule } from "../broker/contracts/decision.ts";

export const CONFIG_SCHEMA_VERSION = "0.1";

export interface VaerionConfig {
  schemaVersion: string;
  project: {
    name: string;
    description?: string;
  };
  /** Cumulative permission ceilings — grants never widen beyond these. */
  permissions?: {
    net?: { allowHosts?: string[] };
    exec?: { allowCommands?: string[] };
  };
  /** Declared research capabilities (see research/capability.ts). */
  research?: {
    capabilities?: Array<{
      name: string;
      sources: Array<{ kind: "local"; path: string }>;
      fencing: "untrusted" | "trusted";
      maxItems?: number;
    }>;
  };
  telemetry: { enabled: false };
}

const TOP_LEVEL_KEYS: ReadonlySet<string> = new Set(["schemaVersion", "project", "permissions", "research", "telemetry"]);
const PROJECT_KEYS: ReadonlySet<string> = new Set(["name", "description"]);
const PERMISSIONS_KEYS: ReadonlySet<string> = new Set(["net", "exec"]);
const RESEARCH_KEYS: ReadonlySet<string> = new Set(["capabilities"]);

export function validateConfig(value: unknown): VaerionConfig {
  const c = value as Record<string, unknown> | null;
  if (!c || typeof c !== "object" || Array.isArray(c)) {
    throw new VaerionError("E1202", "config root must be a mapping");
  }
  for (const key of Object.keys(c)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      throw new VaerionError("E1201", `unknown top-level config key: ${key}`, { key });
    }
  }
  if (c.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    throw new VaerionError("E1202", `unsupported schemaVersion: ${String(c.schemaVersion)} (supported: ${CONFIG_SCHEMA_VERSION})`);
  }
  const project = c.project as Record<string, unknown> | undefined;
  if (!project || typeof project !== "object") {
    throw new VaerionError("E1202", "project section required");
  }
  for (const key of Object.keys(project)) {
    if (!PROJECT_KEYS.has(key)) throw new VaerionError("E1201", `unknown project key: ${key}`, { key });
  }
  if (typeof project.name !== "string" || !/^[a-z][a-z0-9-]{1,62}$/.test(project.name)) {
    throw new VaerionError("E1202", `project.name must match ^[a-z][a-z0-9-]{1,62}$, got: ${String(project.name)}`);
  }
  if (project.description !== undefined && typeof project.description !== "string") {
    throw new VaerionError("E1202", "project.description must be a string");
  }

  const permissions = c.permissions as Record<string, unknown> | undefined;
  if (permissions !== undefined) {
    for (const key of Object.keys(permissions)) {
      if (!PERMISSIONS_KEYS.has(key)) throw new VaerionError("E1201", `unknown permissions key: ${key}`, { key });
      const section = permissions[key] as Record<string, unknown>;
      if (!section || typeof section !== "object") throw new VaerionError("E1202", `permissions.${key} must be a mapping`);
      for (const k of Object.keys(section)) {
        const allowed = key === "net" ? "allowHosts" : key === "exec" ? "allowCommands" : "";
        if (k !== allowed) throw new VaerionError("E1201", `unknown permissions.${key}.${k}`, { key: `permissions.${key}.${k}` });
        if (!Array.isArray(section[k])) throw new VaerionError("E1202", `permissions.${key}.${k} must be an array`);
      }
    }
  }

  const research = c.research as Record<string, unknown> | undefined;
  if (research !== undefined) {
    for (const key of Object.keys(research)) {
      if (!RESEARCH_KEYS.has(key)) throw new VaerionError("E1201", `unknown research key: ${key}`, { key });
    }
    const caps = research.capabilities;
    if (caps !== undefined) {
      if (!Array.isArray(caps)) throw new VaerionError("E1202", "research.capabilities must be an array");
      for (const cap of caps) {
        const cc = cap as Record<string, unknown>;
        if (!cc || typeof cc.name !== "string" || cc.name.length === 0) throw new VaerionError("E1202", "research capability.name required");
        if (!Array.isArray(cc.sources)) throw new VaerionError("E1202", `research capability ${String(cc.name)}: sources must be an array`);
        for (const src of cc.sources) {
          const s = src as Record<string, unknown>;
          if (!s || s.kind !== "local" || typeof s.path !== "string") {
            throw new VaerionError("E1402", `research source must be {kind: "local", path: "..."} — undeclared network is forbidden by law`, { capability: String(cc.name) });
          }
        }
        if (cc.fencing !== "untrusted" && cc.fencing !== "trusted") {
          throw new VaerionError("E1202", `research capability ${String(cc.name)}: fencing must be "untrusted" or "trusted"`);
        }
      }
    }
  }

  const telemetry = c.telemetry as Record<string, unknown> | undefined;
  if (!telemetry || typeof telemetry !== "object") {
    throw new VaerionError("E1202", "telemetry section required (zero telemetry is structural)");
  }
  if (telemetry.enabled !== false) {
    throw new VaerionError("E1202", "telemetry.enabled must be false — Vaerion is zero-telemetry by constitution");
  }

  return c as unknown as VaerionConfig;
}

export async function loadConfig(configPath: string): Promise<{ config: VaerionConfig; fingerprint: string }> {
  const raw = await readFile(configPath, "utf8").catch((err: NodeJS.ErrnoException) => {
    if (err?.code === "ENOENT") throw new VaerionError("E1200", `vaerion.yaml not found at ${configPath}`);
    throw err;
  });
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (err) {
    throw new VaerionError("E1202", `vaerion.yaml is not valid YAML: ${(err as Error).message}`);
  }
  const config = validateConfig(parsed);
  const fingerprint = await blake3HexOf(canonicalJson(config));
  return { config, fingerprint };
}

/** Derive the default fail-closed broker policy from config ceilings. */
export function defaultPolicyFromConfig(config: VaerionConfig, configFingerprint: string): PolicyContract {
  const rules: PolicyRule[] = [];
  // Human may read anything locally; everyone else must be granted.
  rules.push({
    id: "human-fs-read-allow",
    principalKinds: ["human"],
    domain: "fs.read",
    scope: "*",
    effect: "allow",
    rationale: "local human read access",
  });
  for (const host of config.permissions?.net?.allowHosts ?? []) {
    rules.push({
      id: `net-allow-${host.replace(/[^a-z0-9.-]/gi, "_")}`,
      principalKinds: "all",
      domain: "net.connect",
      scope: host,
      effect: "prompt",
      gateLabel: `Network access to ${host} requires human approval`,
      rationale: "declared host ceiling in vaerion.yaml",
    });
  }
  // Research local sources are allow-read, always fenced untrusted downstream.
  for (const cap of config.research?.capabilities ?? []) {
    for (const src of cap.sources) {
      rules.push({
        id: `research-local-${cap.name.replace(/[^a-z0-9-]/gi, "_")}`,
        principalKinds: ["research"],
        domain: "research.index",
        scope: src.path,
        effect: "allow",
        rationale: `declared local research source for capability ${cap.name}`,
      });
    }
  }
  // Universal fail-closed default is implicit (evaluatePolicy denies on no-match).
  return { policy_id: `default-${config.project.name}`, version: 1, rules };
}
