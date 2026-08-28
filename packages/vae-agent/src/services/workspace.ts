/**
 * vae-agent — WorkspaceService (D3.2 `vae init`, D18.9 receipts).
 *
 * Scaffolds a lawful workspace: vaerion.yaml, vaerion.lock, the state
 * directory, a declared self-check plan, and the first audit entry.
 * Honors the Five Guarantees: --dry-run previews the receipt without
 * effect; the receipt lists what changed, cost, undo, record.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ENGINE_VERSION,
  blake3Text,
  canonicalJson,
  iso,
  receipt as buildReceipt,
  type Receipt,
} from "vae-foundation";
import { findWorkspaceRoot, parseVaerYaml, validateConfig, workspacePaths, type YamlValue } from "vae-config";
import { JournalWriter } from "vae-store";
import type { Clock } from "vae-foundation";
import { refusalError } from "vae-foundation";

export interface InitOptions {
  readonly dryRun?: boolean;
  readonly clock?: Clock;
}

export interface InitResult {
  readonly receipt: Receipt;
}

const GITIGNORE_ENTRY = ".vaerion/";

function configTemplate(name: string, description: string): string {
  return `# Vaerion workspace configuration — schema spec/schemas/vaerion-yaml.schema.json
schemaVersion: "0.1"
project:
  name: ${name}
  description: "${description}"
engine:
  journal:
    verifyOnStart: true
  runs:
    budget:
      maxSteps: 64
      usd: "0.0000"
permissions:
  fs:
    read: ["$PROJECT/**"]
    write: []
  net:
    allowHosts: []
  exec:
    allowCommands: []
  secrets:
    grant: []
`;
}

function selfcheckPlan(): string {
  return `# The declared self-check run — executed by \`vae run selfcheck\`.
# Steps are engine-internal, idempotent, and journaled (D16.1, D16.6).
name: selfcheck
description: "Engine self-verification: validates configuration, verifies the audit chain, and checks blob references."
steps:
  - id: config
    tool: config.validate
  - id: audit-chain
    tool: journal.verify
    input:
      journal: "audit"
  - id: blobs
    tool: blobs.verify
    input:
      journal: "audit"
`;
}

function projectReadme(name: string): string {
  return `# ${name}

A Vaerion workspace — an AI-native project where agents do real work
under human authority: observable, replayable, explainable.

## The Daily Seven

| Command | Meaning |
|---|---|
| \`vae init\` | Scaffold a project; teach the contract. |
| \`vae run\` | Execute a declared run under the broker, with receipts and journaling. |
| \`vae resume\` | Continue a parked or interrupted run from the journal. |
| \`vae explain\` | Post-hoc causal explanation of any run. |
| \`vae journal\` | Inspect the append-only record. |
| \`vae doctor\` | Diagnose environment, configuration, and health. |
| \`vae dev\` | Inner-loop development mode. |

## Layout

- \`vaerion.yaml\` — declared configuration (validated on every command).
- \`vaerion.lock\` — pinned configuration fingerprint (drift is refused).
- \`runs/\` — declared run plans.
- \`.vaerion/\` — engine state: journals, audit chain, blobs (gitignored).

Engine version: ${ENGINE_VERSION}. The five guarantees hold on every
command: \`--help\` teaches, \`--json\` parses, \`--dry-run\` previews, a
receipt follows every change, exit codes are honest.
`;
}

export class WorkspaceService {
  init(dir: string, options: InitOptions = {}): InitResult {
    const clock = options.clock ?? { nowMs: () => Date.now() };
    const root = dir;
    if (findWorkspaceRoot(root) !== undefined) {
      throw refusalError("E2004", "A Vaerion workspace is already initialized in this directory.", "Operate on the existing workspace, or initialize in an empty directory.");
    }
    const name = (root.split(/[\\/]/).filter(Boolean).at(-1) ?? "workspace").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+/, "").slice(0, 63) || "workspace";
    const paths = workspacePaths(root);
    const description = "A Vaerion workspace.";

    const configText = configTemplate(name, description);
    const validated = validateConfig(parseVaerYaml(configText) as YamlValue);
    const fingerprint = blake3Text(canonicalJson(validated));
    const lock = {
      lockVersion: 1,
      schemaVersion: validated.schemaVersion,
      engineVersion: ENGINE_VERSION,
      configFingerprint: fingerprint,
      createdAt: iso(clock.nowMs()),
    };

    const created: string[] = [
      "vaerion.yaml",
      "vaerion.lock",
      ".vaerion/journal",
      ".vaerion/audit",
      ".vaerion/blobs",
      ".vaerion/runs",
      ".vaerion/tmp",
      join("runs", "selfcheck.yaml"),
      "PROJECT.md",
    ];

    if (options.dryRun === true) {
      return {
        receipt: buildReceipt({
          command: "vae init",
          ok: true,
          what_changed: created.map((subject) => ({ subject, action: "created" as const, detail: "prospective (dry-run)" })),
          cost: { bytes_written: 0 },
          undo: [`rm -rf ${created.join(" ")}`],
          record: { chain_head: fingerprint.slice(0, 16) },
        }),
      };
    }

    mkdirSync(root, { recursive: true });
    for (const dirToCreate of [paths.stateDir, paths.journalDir, paths.auditDir, paths.blobsDir, paths.runsDir, paths.tmpDir]) {
      mkdirSync(dirToCreate, { recursive: true });
    }
    writeFileSync(paths.configFile, configText, "utf8");
    writeFileSync(paths.lockFile, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    mkdirSync(join(root, "runs"), { recursive: true });
    writeFileSync(join(root, "runs", "selfcheck.yaml"), selfcheckPlan(), "utf8");
    writeFileSync(join(root, "PROJECT.md"), projectReadme(name), "utf8");

    // The workspace's audit chain begins with its creation (D9.3: actor+cause).
    const audit = new JournalWriter(join(paths.auditDir, "audit.ndjson"), { clock });
    audit.append({
      type: "workspace.initialized",
      actor: { kind: "human", id: "operator" },
      cause: { kind: "command", ref: "vae init" },
      payload: { project: name, engineVersion: ENGINE_VERSION, configFingerprint: fingerprint },
    });

    // User project hygiene: the state directory is machine state.
    const gitignorePath = join(root, ".gitignore");
    if (!existsSync(gitignorePath)) {
      writeFileSync(gitignorePath, `${GITIGNORE_ENTRY}\n`, "utf8");
      created.push(".gitignore");
    } else if (!readFileSync(gitignorePath, "utf8").includes(GITIGNORE_ENTRY)) {
      appendFileSync(gitignorePath, `${GITIGNORE_ENTRY}\n`, "utf8");
      created.push(".gitignore");
    }

    const r = buildReceipt({
      command: "vae init",
      ok: true,
      what_changed: created.map((subject) => ({ subject, action: "created" as const })),
      cost: { bytes_written: configText.length + JSON.stringify(lock).length },
      undo: [`rm -rf ${created.map((c) => (c.includes("/") ? c : c)).join(" ")}`],
      record: { audit_chain: ".vaerion/audit/audit.ndjson" },
    });
    return { receipt: r };
  }
}
