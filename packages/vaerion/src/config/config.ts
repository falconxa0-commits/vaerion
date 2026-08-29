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
  /** Declared broker policy rules (MS-2 policy files) — see policyFromConfig. */
  policy?: {
    rules?: PolicyRule[];
  };
  telemetry: { enabled: false };
}

const TOP_LEVEL_KEYS: ReadonlySet<string> = new Set(["schemaVersion", "project", "permissions", "research", "policy", "telemetry"]);
const PROJECT_KEYS: ReadonlySet<string> = new Set(["name", "description"]);
const PERMISSIONS_KEYS: ReadonlySet<string> = new Set(["net", "exec"]);
const RESEARCH_KEYS: ReadonlySet<string> = new Set(["capabilities"]);
const POLICY_KEYS: ReadonlySet<string> = new Set(["rules"]);
const POLICY_RULE_KEYS: ReadonlySet<string> = new Set(["id", "principalKinds", "domain", "scope", "effect", "gateLabel", "rationale"]);
const PRINCIPAL_KINDS: ReadonlySet<string> = new Set(["human", "agent", "tool", "extension", "research", "system"]);
const POLICY_EFFECTS: ReadonlySet<string> = new Set(["allow", "deny", "prompt"]);

/** Validate one declared policy rule (MS-2 policy files; fail loudly, E1202). */
function validatePolicyRule(rule: unknown, index: number): PolicyRule {
  const fail: (why: string) => never = (why) => {
    throw new VaerionError("E1202", `policy.rules[${index}]: ${why}`);
  };
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) fail("rule must be a mapping");
  const r = rule as Record<string, unknown>;
  for (const key of Object.keys(r)) {
    if (!POLICY_RULE_KEYS.has(key)) fail(`unknown key "${key}"`);
  }
  if (typeof r.id !== "string" || r.id.length === 0) fail("id must be a non-empty string");
  if (typeof r.domain !== "string" || r.domain.length === 0) fail("domain must be a non-empty string");
  if (typeof r.scope !== "string" || r.scope.length === 0) fail("scope must be a non-empty string");
  if (typeof r.effect !== "string" || !POLICY_EFFECTS.has(r.effect)) fail(`effect must be one of allow|deny|prompt, got ${String(r.effect)}`);
  if (typeof r.rationale !== "string" || r.rationale.trim().length === 0) {
    fail("rationale is required — declared authority must state its why");
  }
  if (r.gateLabel !== undefined && (typeof r.gateLabel !== "string" || r.gateLabel.length === 0)) {
    fail("gateLabel must be a non-empty string when present");
  }
  if (r.principalKinds !== undefined && r.principalKinds !== "all") {
    if (!Array.isArray(r.principalKinds) || r.principalKinds.length === 0) {
      fail('principalKinds must be "all" or a non-empty array');
    }
    for (const kind of r.principalKinds as unknown[]) {
      if (typeof kind !== "string" || !PRINCIPAL_KINDS.has(kind)) {
        fail(`principalKinds contains unknown kind ${String(kind)}`);
      }
    }
  }
  return {
    id: r.id as string,
    principalKinds: (r.principalKinds as PolicyRule["principalKinds"]) ?? "all",
    domain: r.domain as PolicyRule["domain"],
    scope: r.scope as string,
    effect: r.effect as PolicyRule["effect"],
    gateLabel: r.gateLabel as string | undefined,
    rationale: r.rationale as string,
  };
}

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

  const policy = c.policy as Record<string, unknown> | undefined;
  if (policy !== undefined) {
    for (const key of Object.keys(policy)) {
      if (!POLICY_KEYS.has(key)) throw new VaerionError("E1201", `unknown policy key: ${key}`, { key });
    }
    if (policy.rules !== undefined) {
      if (!Array.isArray(policy.rules)) throw new VaerionError("E1202", "policy.rules must be an array");
      policy.rules = (policy.rules as unknown[]).map((r, i) => validatePolicyRule(r, i));
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

/**
 * Derive the fail-closed broker policy from config: explicitly declared policy
 * rules (MS-2 policy files) come FIRST — human authority stated in the file —
 * then the structural defaults. The universal fail-closed default is implicit
 * (evaluatePolicy denies on no-match).
 */
export function policyFromConfig(config: VaerionConfig): PolicyContract {
  const rules: PolicyRule[] = [];
  // 1. Human-declared policy rules, verbatim (validated above).
  for (const rule of config.policy?.rules ?? []) {
    rules.push(rule);
  }
  // 2. Structural defaults.
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
  return { policy_id: `default-${config.project.name}`, version: 1, rules };
}

/**
 * Derive the default fail-closed broker policy from config ceilings.
 * Retained name for compatibility with MS-1 call sites; identical behavior.
 */
export function defaultPolicyFromConfig(config: VaerionConfig, configFingerprint: string): PolicyContract {
  void configFingerprint;
  return policyFromConfig(config);
}
