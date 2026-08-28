/**
 * vae-cli — the help system (Guarantee 1: `--help` always teaches).
 *
 * Help is doctrine, never stale, never a lie (D18.10): purpose, an
 * honest example, prerequisites, side effects, and related commands.
 * `vae help E####` renders the error curriculum (D3.8).
 */

import { catalogEntry, VAERION_TAGLINE, ENGINE_VERSION } from "vae-foundation";
import { CATALOG_SIZE } from "vae-foundation";

export interface CommandHelp {
  readonly name: string;
  readonly purpose: string;
  readonly example: string;
  readonly prerequisites: string;
  readonly sideEffects: string;
  readonly related: string;
}

export const COMMAND_HELPS: Record<string, CommandHelp> = {
  init: {
    name: "init",
    purpose: "Scaffold a Vaerion workspace: vaerion.yaml, vaerion.lock, engine state, a declared self-check run, and an orientation file. Teaches the contract and leaves you in a working state.",
    example: "vae init            # scaffold in the current directory\nvae init --dry-run  # preview the receipt without writing anything",
    prerequisites: "An empty directory (an existing workspace is refused, E2004).",
    sideEffects: "Creates vaerion.yaml, vaerion.lock, runs/, PROJECT.md, .vaerion/ state, and appends .vaerion/ to .gitignore. Prints a Receipt.",
    related: "vae doctor, vae run",
  },
  run: {
    name: "run",
    purpose: "Execute a DECLARED run plan under the Capability Broker, with journaled decisions, checkpoints, and a Receipt.",
    example: "vae run selfcheck            # execute the declared self-check\nvae run selfcheck --dry-run  # faithful preview, zero effect",
    prerequisites: "A workspace (vae init) and a plan file under runs/<name>.yaml (E1009 otherwise).",
    sideEffects: "Appends the run journal (.vaerion/journal/<run>.ndjson), the audit chain, checkpoints, and a persisted receipt. Exit 4 on run failure.",
    related: "vae resume, vae explain, vae journal",
  },
  resume: {
    name: "resume",
    purpose: "Continue a parked or interrupted run from journal truth, deterministically. Refuses on plan or configuration drift.",
    example: "vae resume <run-id>",
    prerequisites: "An existing run journal in this workspace (E1006 otherwise) and an intact chain (E3001 otherwise).",
    sideEffects: "Appends to the run journal and writes a new receipt. Prints a Receipt.",
    related: "vae run, vae journal, vae explain",
  },
  explain: {
    name: "explain",
    purpose: "Produce the post-hoc causal explanation of any run — the North Star. Reconstructs the story from journal truth only.",
    example: "vae explain <run-id>\nvae explain <run-id> --json",
    prerequisites: "An existing run journal in this workspace.",
    sideEffects: "None. Read-only.",
    related: "vae journal, vae run",
  },
  journal: {
    name: "journal",
    purpose: "Inspect the append-only record — human and machine renderings, redacted by default (D12.3), with chain verification.",
    example: "vae journal --list\nvae journal <run-id>\nvae journal audit --verify",
    prerequisites: "A workspace.",
    sideEffects: "None. Read-only.",
    related: "vae explain, vae run",
  },
  doctor: {
    name: "doctor",
    purpose: "Diagnose environment, configuration, provenance, credentials hygiene, and health. The standing diagnostic (D3.2).",
    example: "vae doctor\nvae doctor --json",
    prerequisites: "A workspace (E1005 otherwise).",
    sideEffects: "None. Read-only. Exit 4 when any check fails.",
    related: "vae journal, vae init",
  },
  dev: {
    name: "dev",
    purpose: "Inner-loop development mode: watch the workspace's declared configuration and plans; re-validate on every change so the loop stays tight and honest.",
    example: "vae dev",
    prerequisites: "A workspace.",
    sideEffects: "None. Read-only; validates and reports. Ctrl+C exits cleanly.",
    related: "vae doctor, vae run",
  },
};

export const GLOBAL_FLAGS = [
  "  --help, -h      Teach the command (Guarantee 1).",
  "  --json          Machine mode: NDJSON envelopes on stdout (Guarantee 2).",
  "  --dry-run       Preview every state change before it happens (Guarantee 3).",
  "  --plain         Pipe-safe rendering: no color, no tabulation (D3.7).",
  "  --no-color      Disable ANSI color, keep human layout.",
  "  --profile NAME  Select a declared configuration profile (D19.4).",
] as const;

export function topLevelHelp(): string {
  const rows = Object.values(COMMAND_HELPS)
    .map((h) => `  ${h.name.padEnd(10)} ${h.purpose.split(":")[0]}.`)
    .join("\n");
  return `${VAERION_TAGLINE}

vae ${ENGINE_VERSION} — deterministic, local-first runtime where agents do real work under human authority.

Usage: vae <command> [arguments] [flags]

The Daily Seven (D3.2):
${rows}

The Five Guarantees (Part IV) hold on every command, forever:
  1. --help always teaches.        4. Receipt after every change
  2. --json always valid.          5. Honest exit codes: 0 ok · 2 usage · 3 refusal · 4 run failure · 5 internal
  3. --dry-run before every change.

Global flags:
${GLOBAL_FLAGS.join("\n")}

Errors are curriculum: every error carries an E#### code and a Fix line
(${CATALOG_SIZE} seeded codes). Read any of them: vae help E2010
`;
}

export function commandHelp(help: CommandHelp): string {
  return `vae ${help.name} — ${help.purpose}

Example:
${help.example}

Prerequisites: ${help.prerequisites}
Side effects: ${help.sideEffects}
Related: ${help.related}

The Five Guarantees hold here. Use --json for machine envelopes, --dry-run to preview, --help to re-read this.
`;
}

/** `vae help E####` — errors are curriculum (D3.8). */
export function errorCodeHelp(code: string): string {
  const entry = catalogEntry(code);
  return `${entry.code} — ${entry.name}
Class: ${entry.class} (exit ${classExit(entry.class)})

${entry.message}

Fix: ${entry.fix}
`;
}

function classExit(cls: string): number {
  switch (cls) {
    case "usage":
      return 2;
    case "refusal":
      return 3;
    case "run_failure":
      return 4;
    case "internal":
      return 5;
    default:
      return 5;
  }
}
