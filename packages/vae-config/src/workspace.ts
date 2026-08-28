/**
 * vae-config — workspace discovery and layout.
 *
 * A Vaerion workspace is a directory containing `vaerion.yaml` plus the
 * engine state directory `.vaerion/`. Discovery walks upward so
 * subdirectories operate inside their project (git-like semantics).
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { usageError } from "vae-foundation";
import { parseVaerYaml, type YamlValue } from "./vaeryaml.ts";

export interface WorkspacePaths {
  readonly root: string;
  readonly configFile: string;
  readonly lockFile: string;
  readonly stateDir: string;
  readonly journalDir: string;
  readonly auditDir: string;
  readonly blobsDir: string;
  readonly runsDir: string;
  readonly tmpDir: string;
  readonly refusalsFile: string;
  readonly tokenFile: string;
}

export function workspacePaths(root: string): WorkspacePaths {
  const stateDir = join(root, ".vaerion");
  return {
    root: resolve(root),
    configFile: join(root, "vaerion.yaml"),
    lockFile: join(root, "vaerion.lock"),
    stateDir,
    journalDir: join(stateDir, "journal"),
    auditDir: join(stateDir, "audit"),
    blobsDir: join(stateDir, "blobs"),
    runsDir: join(stateDir, "runs"),
    tmpDir: join(stateDir, "tmp"),
    refusalsFile: join(stateDir, "refusals.ndjson"),
    tokenFile: join(stateDir, "token"),
  };
}

/** True when `dir` (or an ancestor) is a Vaerion workspace root. */
export function findWorkspaceRoot(from: string): string | undefined {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, "vaerion.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function dirname(p: string): string {
  const out = p.replace(/[\\/]+$/, "");
  const idx = Math.max(out.lastIndexOf("/"), out.lastIndexOf("\\"));
  return idx <= 0 ? "/" : out.slice(0, idx);
}

/** Require a workspace or refuse with E1005 (errors are curriculum). */
export function requireWorkspace(from: string): WorkspacePaths {
  const root = findWorkspaceRoot(from);
  if (root === undefined) {
    throw usageError("E1005", "This directory is not a Vaerion workspace.", "Run `vae init` to scaffold a workspace, or cd into an initialized project.");
  }
  return workspacePaths(root);
}

/** Load and parse the project configuration document (unvalidated). */
export function loadProjectDoc(paths: WorkspacePaths): YamlValue {
  const text = readFileSync(paths.configFile, "utf8");
  return parseVaerYaml(text);
}
