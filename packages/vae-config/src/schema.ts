/**
 * vae-config — versioned schema validation (D19.2, D19.3, D19.10).
 *
 * All configuration validates against versioned schemas; unknown keys
 * are refused, never ignored; validation fails closed before any
 * effect. Defaults are explicit, versioned, and documented — changing
 * one across versions is a contract change (Article VIII).
 */

import { usageError } from "vae-foundation";
import type { YamlValue } from "./vaeryaml.ts";

export const SUPPORTED_SCHEMA_VERSIONS = ["0.1"] as const;
export type SchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];
export const CURRENT_SCHEMA_VERSION: SchemaVersion = "0.1";

const PROJECT_NAME_RE = /^[a-z][a-z0-9-]{1,62}$/;
const MONEY_RE = /^-?\d+(\.\d+)?$/;
const HOST_RE = /^[a-z0-9.-]+(:\d+)?$/i;

export interface EngineConfig {
  journal: { verifyOnStart: boolean };
  runs: { budget: { maxSteps: number; usd: string } };
}

export interface PermissionsConfig {
  fs: { read: string[]; write: string[] };
  net: { allowHosts: string[] };
  exec: { allowCommands: string[][] };
  secrets: { grant: { name: string; to: string[] }[] };
}

export interface VaerionConfig {
  schemaVersion: SchemaVersion;
  project: { name: string; description?: string };
  engine: EngineConfig;
  permissions: PermissionsConfig;
}

export const DEFAULT_CONFIG: Readonly<VaerionConfig> = Object.freeze({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  project: { name: "untitled" },
  engine: {
    journal: { verifyOnStart: true },
    runs: { budget: { maxSteps: 64, usd: "0.0000" } },
  },
  permissions: {
    fs: { read: ["$PROJECT/**"], write: [] },
    net: { allowHosts: [] },
    exec: { allowCommands: [] },
    secrets: { grant: [] },
  },
});

type Dict = Record<string, unknown>;

function asDict(v: unknown, path: string): Dict {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw typeMismatch(path, "mapping");
  }
  return v as Dict;
}

function typeMismatch(path: string, expected: string): Error {
  return usageError("E1003", `Configuration value at '${path}' has the wrong type.`, `Correct '${path}' to the expected ${expected} per the schema (spec/).`);
}

function unknownKey(path: string, key: string): Error {
  return usageError(
    "E1002",
    `Configuration contains unknown key '${path}${path ? "." : ""}${key}'.`,
    "Remove or rename the key; unknown keys are refused, never ignored (D19.2).",
  );
}

function expectString(d: Dict, path: string, required: boolean, out: Dict): void {
  const v = d[path] ?? undefined;
  if (v === undefined) {
    if (required) throw typeMismatch(path, "string (required)");
    return;
  }
  if (typeof v !== "string") throw typeMismatch(path, "string");
  out[path] = v;
}

function expectBool(d: Dict, path: string, fallback: boolean, out: Dict): void {
  const v = d[path] ?? undefined;
  if (v === undefined) {
    out[path] = fallback;
    return;
  }
  if (typeof v !== "boolean") throw typeMismatch(path, "boolean");
  out[path] = v;
}

function expectInt(d: Dict, path: string, fallback: number, min: number, out: Dict): void {
  const v = d[path] ?? undefined;
  if (v === undefined) {
    out[path] = fallback;
    return;
  }
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) throw typeMismatch(path, `integer >= ${min}`);
  out[path] = v;
}

function expectMoney(d: Dict, path: string, fallback: string, out: Dict): void {
  const v = d[path] ?? undefined;
  if (v === undefined) {
    out[path] = fallback;
    return;
  }
  if (typeof v !== "string" || !MONEY_RE.test(v)) {
    throw usageError("E1003", `Configuration value at '${path}' must be a decimal string.`, `Write '${path}' as a quoted decimal string, e.g. "5.00" — money is never a float (D8.3).`);
  }
  out[path] = v;
}

function expectStringArray(d: Dict, path: string, fallback: string[], out: Dict): void {
  const v = d[path] ?? undefined;
  if (v === undefined) {
    out[path] = fallback;
    return;
  }
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw typeMismatch(path, "sequence of strings");
  out[path] = v;
}

function validateEngine(d: Dict, path: string): EngineConfig {
  const out: Dict = {};
  const journalRaw = d["journal"];
  if (journalRaw !== undefined) {
    const j = asDict(journalRaw, `${path}.journal`);
    for (const k of Object.keys(j)) {
      if (!["verifyOnStart"].includes(k)) throw unknownKey(`${path}.journal`, k);
    }
    const jOut: Dict = {};
    expectBool(j, "verifyOnStart", DEFAULT_CONFIG.engine.journal.verifyOnStart, jOut);
    out["journal"] = jOut;
  } else {
    out["journal"] = { verifyOnStart: DEFAULT_CONFIG.engine.journal.verifyOnStart };
  }
  const runsRaw = d["runs"];
  if (runsRaw !== undefined) {
    const r = asDict(runsRaw, `${path}.runs`);
    for (const k of Object.keys(r)) {
      if (!["budget"].includes(k)) throw unknownKey(`${path}.runs`, k);
    }
    const budgetRaw = r["budget"];
    let budget: Dict;
    if (budgetRaw === undefined) {
      budget = { ...DEFAULT_CONFIG.engine.runs.budget };
    } else {
      const b = asDict(budgetRaw, `${path}.runs.budget`);
      for (const k of Object.keys(b)) {
        if (!["maxSteps", "usd"].includes(k)) throw unknownKey(`${path}.runs.budget`, k);
      }
      const bOut: Dict = {};
      expectInt(b, "maxSteps", DEFAULT_CONFIG.engine.runs.budget.maxSteps, 1, bOut);
      expectMoney(b, "usd", DEFAULT_CONFIG.engine.runs.budget.usd, bOut);
      budget = bOut;
    }
    out["runs"] = { budget };
  } else {
    out["runs"] = { budget: { ...DEFAULT_CONFIG.engine.runs.budget } };
  }
  return out as unknown as EngineConfig;
}

function validatePermissions(d: Dict, path: string): PermissionsConfig {
  const out: Dict = {};
  const fsRaw = d["fs"];
  if (fsRaw === undefined) {
    out["fs"] = { ...DEFAULT_CONFIG.permissions.fs };
  } else {
    const f = asDict(fsRaw, `${path}.fs`);
    for (const k of Object.keys(f)) {
      if (!["read", "write"].includes(k)) throw unknownKey(`${path}.fs`, k);
    }
    const fOut: Dict = {};
    expectStringArray(f, "read", DEFAULT_CONFIG.permissions.fs.read, fOut);
    expectStringArray(f, "write", DEFAULT_CONFIG.permissions.fs.write, fOut);
    out["fs"] = fOut;
  }
  const netRaw = d["net"];
  if (netRaw === undefined) {
    out["net"] = { ...DEFAULT_CONFIG.permissions.net };
  } else {
    const n = asDict(netRaw, `${path}.net`);
    for (const k of Object.keys(n)) {
      if (!["allowHosts"].includes(k)) throw unknownKey(`${path}.net`, k);
    }
    const nOut: Dict = {};
    expectStringArray(n, "allowHosts", DEFAULT_CONFIG.permissions.net.allowHosts, nOut);
    for (const host of nOut["allowHosts"] as string[]) {
      if (!HOST_RE.test(host)) {
        throw usageError("E1003", `Invalid host pattern '${host}' in ${path}.net.allowHosts.`, "Use host or host:port forms, e.g. api.example.com.");
      }
    }
    out["net"] = nOut;
  }
  const execRaw = d["exec"];
  if (execRaw === undefined) {
    out["exec"] = { ...DEFAULT_CONFIG.permissions.exec };
  } else {
    const x = asDict(execRaw, `${path}.exec`);
    for (const k of Object.keys(x)) {
      if (!["allowCommands"].includes(k)) throw unknownKey(`${path}.exec`, k);
    }
    const xOut: Dict = {};
    const raw = x["allowCommands"] ?? DEFAULT_CONFIG.permissions.exec.allowCommands;
    if (!Array.isArray(raw) || raw.some((row) => !Array.isArray(row) || (row as unknown[]).some((c) => typeof c !== "string"))) {
      throw typeMismatch(`${path}.exec.allowCommands`, "sequence of command sequences");
    }
    xOut["allowCommands"] = raw;
    out["exec"] = xOut;
  }
  const secretsRaw = d["secrets"];
  if (secretsRaw === undefined) {
    out["secrets"] = { ...DEFAULT_CONFIG.permissions.secrets };
  } else {
    const s = asDict(secretsRaw, `${path}.secrets`);
    for (const k of Object.keys(s)) {
      if (!["grant"].includes(k)) throw unknownKey(`${path}.secrets`, k);
    }
    const grantsRaw = s["grant"] ?? DEFAULT_CONFIG.permissions.secrets.grant;
    if (!Array.isArray(grantsRaw)) throw typeMismatch(`${path}.secrets.grant`, "sequence of grants");
    const grants: { name: string; to: string[] }[] = [];
    for (const g of grantsRaw as unknown[]) {
      if (typeof g !== "object" || g === null) throw typeMismatch(`${path}.secrets.grant`, "grant mapping");
      const gd = g as Dict;
      const name = gd["name"];
      const to = gd["to"];
      if (typeof name !== "string" || !Array.isArray(to) || to.some((t) => typeof t !== "string")) {
        throw typeMismatch(`${path}.secrets.grant`, "grant {name, to}");
      }
      // Secrets are inputs, never configuration (D19.5): grants carry the NAME, never a value.
      grants.push({ name, to: to as string[] });
    }
    out["secrets"] = { grant: grants };
  }
  return out as unknown as PermissionsConfig;
}

/**
 * Validate one configuration document against the schema.
 * Unknown keys are refused (E1002); types fail closed (E1003); the
 * schema version must be supported (E1001). Returns the validated,
 * defaults-filled config.
 *
 * `scope: "project"` (default) requires the project section;
 * `scope: "engine"` accepts engine-level documents where the project
 * section is optional. A null document yields pure ratified defaults.
 */
export function validateConfig(
  doc: YamlValue,
  scope: "project" | "engine" = "project",
): VaerionConfig {
  if (doc === null) {
    return structuredClone(DEFAULT_CONFIG) as VaerionConfig;
  }
  if (typeof doc !== "object" || Array.isArray(doc)) {
    throw usageError("E1004", "Configuration root must be a mapping.", "Provide a top-level mapping in vaerion.yaml.");
  }
  const root = doc as Dict;
  for (const k of Object.keys(root)) {
    if (!["schemaVersion", "project", "engine", "permissions", "profiles"].includes(k)) {
      throw unknownKey("", k);
    }
  }
  const version = root["schemaVersion"];
  if (typeof version !== "string" || !(SUPPORTED_SCHEMA_VERSIONS as readonly string[]).includes(version)) {
    throw usageError(
      "E1001",
      `Configuration schema version ${JSON.stringify(version ?? null)} is outside the supported range.`,
      `Set schemaVersion to one of: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}.`,
    );
  }
  const projectRaw = root["project"];
  const projectOut: Dict = {};
  if (projectRaw === undefined && scope === "engine") {
    projectOut["name"] = DEFAULT_CONFIG.project.name;
  } else {
    if (typeof projectRaw !== "object" || projectRaw === null || Array.isArray(projectRaw)) {
      throw typeMismatch("project", "mapping (required)");
    }
    const project = projectRaw as Dict;
    for (const k of Object.keys(project)) {
      if (!["name", "description"].includes(k)) throw unknownKey("project", k);
    }
    expectString(project, "name", true, projectOut);
    if (!PROJECT_NAME_RE.test(projectOut["name"] as string)) {
      throw usageError("E1003", `Invalid project name '${projectOut["name"]}'.`, "Use lowercase letters, digits, and dashes; start with a letter (2–63 chars).");
    }
    expectString(project, "description", false, projectOut);
  }
  const engineRaw = root["engine"];
  const engine = engineRaw === undefined ? structuredClone(DEFAULT_CONFIG.engine) as unknown as EngineConfig : validateEngine(asDict(engineRaw as YamlValue, "engine"), "engine");
  const permissionsRaw = root["permissions"];
  const permissions =
    permissionsRaw === undefined ? structuredClone(DEFAULT_CONFIG.permissions) as unknown as PermissionsConfig : validatePermissions(asDict(permissionsRaw as YamlValue, "permissions"), "permissions");
  const profilesRaw = root["profiles"];
  if (profilesRaw !== undefined) {
    const profiles = asDict(profilesRaw, "profiles");
    for (const [name, overlay] of Object.entries(profiles)) {
      if (!PROJECT_NAME_RE.test(`x${name}`.slice(1))) {
        throw usageError("E1003", `Invalid profile name '${name}'.`, "Use lowercase letters, digits, and dashes.");
      }
      const od = asDict(overlay, `profiles.${name}`);
      for (const k of Object.keys(od)) {
        if (!["engine", "permissions"].includes(k)) throw unknownKey(`profiles.${name}`, k);
        if (k === "engine") validateEngine(asDict(od[k]!, `profiles.${name}.engine`), `profiles.${name}.engine`);
        if (k === "permissions") validatePermissions(asDict(od[k]!, `profiles.${name}.permissions`), `profiles.${name}.permissions`);
      }
    }
  }
  return { schemaVersion: version as SchemaVersion, project: projectOut as VaerionConfig["project"], engine, permissions };
}

/**
 * Merge a profile overlay onto a base config (D19.4). Profiles select
 * coherent value sets; they can never touch permission policy beyond
 * what the project already declares (policy is not profilable — D19.4
 * forbids widening; overlays here may only narrow, enforced by the
 * broker at decision time).
 */
export function applyProfileOverlay(base: VaerionConfig, overlay: YamlValue): VaerionConfig {
  if (overlay === null) return base;
  const od = asDict(overlay, "profile");
  const merged: VaerionConfig = structuredClone(base) as VaerionConfig;
  if (od["engine"] !== undefined) {
    const engineOverlay = validateEngine(asDict(od["engine"]!, "profile.engine"), "profile.engine");
    merged.engine = deepMergeEngine(base.engine, engineOverlay);
  }
  return merged;
}

function deepMergeEngine(base: EngineConfig, overlay: EngineConfig): EngineConfig {
  return {
    journal: { ...base.journal, ...overlay.journal },
    runs: { budget: { ...base.runs.budget, ...overlay.runs.budget } },
  };
}
