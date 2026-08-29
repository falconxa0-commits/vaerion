/**
 * Vaerion CLI — workspace resolution.
 *
 * A workspace is a directory containing (or about to contain) `vaerion.yaml`
 * and `.vaerion/`. All commands operate on exactly one workspace, resolved
 * from --cwd (default: process cwd). No ambient state anywhere else.
 */

import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadConfig, validateConfig, CONFIG_SCHEMA_VERSION, type VaerionConfig } from "../config/config.ts";
import { canonicalJson } from "../kernel/canonical.ts";
import { blake3HexOf } from "../kernel/hash.ts";
import { VaerionError } from "../kernel/errors.ts";

export interface Workspace {
  root: string;
  vaerionDir: string; // <root>/.vaerion
  journalDir: string;
  blobsDir: string;
  configPath: string;
  auditPath: string;
  refusalsPath: string;
}

export function workspaceAt(root: string): Workspace {
  const vaerionDir = join(root, ".vaerion");
  return {
    root: resolve(root),
    vaerionDir,
    journalDir: join(vaerionDir, "journal"),
    blobsDir: join(vaerionDir, "blobs"),
    configPath: join(root, "vaerion.yaml"),
    auditPath: join(vaerionDir, "audit.log"),
    refusalsPath: join(vaerionDir, "refusals.log"),
  };
}

export async function ensureWorkspaceDirs(ws: Workspace): Promise<void> {
  await mkdir(ws.journalDir, { recursive: true });
  await mkdir(ws.blobsDir, { recursive: true });
}

export async function configExists(ws: Workspace): Promise<boolean> {
  return stat(ws.configPath).then(() => true, () => false);
}

export async function loadOrAdhocConfig(ws: Workspace): Promise<{ config: VaerionConfig; fingerprint: string; adhoc: boolean }> {
  const exists = await configExists(ws);
  if (!exists) {
    const adhoc: VaerionConfig = validateConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      project: { name: "adhoc" },
      telemetry: { enabled: false },
    });
    return { config: adhoc, fingerprint: await blake3HexOf(canonicalJson(adhoc)), adhoc: true };
  }
  const loaded = await loadConfig(ws.configPath);
  return { config: loaded.config, fingerprint: loaded.fingerprint, adhoc: false };
}

export const ADHOC_NOTE = "no vaerion.yaml found — running with an ad-hoc in-memory config (Fix: run `vae init`)";

export function isVaerionError(err: unknown): err is VaerionError {
  return err instanceof VaerionError;
}
