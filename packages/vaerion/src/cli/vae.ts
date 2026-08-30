/**
 * Vaerion CLI — `vae` entrypoint (L4 porcelain).
 *
 * Guarantee #1: `--help` is parsed BEFORE any command executes and before any
 * config, workspace, or filesystem access. Help always teaches.
 * Guarantee #2: `--json` switches every command to stable NDJSON.
 * Guarantee #3: `--dry-run` is threaded into every mutating command.
 * Guarantee #5: exit codes are honest (0/1/2/3/4/5).
 */

import { ExitCode, type CliIo } from "./io.ts";
import { cmdDev, cmdExplain, cmdInit, cmdJournal, cmdDoctor, cmdResume, cmdRun, cmdServe, type CommandContext } from "./commands.ts";
import { VaerionError } from "../kernel/errors.ts";
import { isVaerionError } from "./workspace.ts";

export const VERSION = "0.1.0-ms1";

const MAIN_HELP = `vae — Vaerion engine command line (v${VERSION})

Usage: vae [global flags] <command> [args] [flags]

Daily Seven (the complete command surface):
  init                       scaffold vaerion.yaml + .vaerion/ workspace
  run research --sources P[,P] --query Q [--max-docs N]
  run demo [--sources P,P] [--query Q]
                             index declared local sources; journal everything;
                             close with a receipt
  run model --model P/M [--prompt TEXT | --op embed --input-json JSON |
             --op rerank --query Q --docs-json JSON] [--seed N] [--max-tokens N]
                             invoke a model through the gateway single gate:
                             broker decision → adapter → sanctioned transport →
                             metered on the spine
  run agent --goal TEXT [--planner inline|model] [--steps N]
            [--plan-json JSON]
                             the supervised agent loop: every step (model,
                             tool, note, context) crosses its constitutional
                             path — the gateway single gate, the broker tool
                             pipeline, the reasoning scratchpad, the One
                             Context Path — journaled, retried bounded,
                             resumable after crashes and human gates
  run workflow --dag FILE [--resume RUN_ID]
                             deterministic DAG execution on the journal:
                             nodes run in topological order (lexicographic
                             tie-break), outputs are content-addressed,
                             interrupted runs resume automatically
  resume RUN_ID [--answer JSON]
                             restore a run; resolve a pending human gate
  explain RUN_ID             reconstruct the run's narrative from its journal
  journal ls | show RUN | verify RUN | recover RUN | export RUN [--out P]
                             append-only journal operations
  doctor                     verify config, journals, blobs, audit chain, gateway
                             matrix (no phone-home)
  dev                        engine status: version, layers, gateway matrix,
                             milestone position
  serve [--port N] [--host ADDR]
                             the local API daemon (MS-5): loopback HTTP/SSE
                             over the same contracts this CLI exercises;
                             first-run pairing token printed once (or
                             pre-provision headlessly via VAE_TRUST)

Global flags:
  --json                     stable NDJSON output (machine mode, guaranteed)
  --plain                    human-readable output (default)
  --dry-run                  zero side effects — plan only, nothing written
  --cwd DIR                  operate on DIR as the workspace (default: .)
  --help                     show this help and exit (never executes)

Exit codes: 0 ok · 1 internal · 2 usage · 3 broker-denied · 4 provider-down · 5 partial-with-repair-hint

Learn more: docs/constitution/VAERION_CONSTITUTION_v1.0.md · spec/ (contracts)
`;

const COMMAND_HELP: Record<string, string> = {
  init: `vae init [--name NAME] [--dry-run]
  Scaffold vaerion.yaml (strict schema 0.1) and the .vaerion/ workspace.
  Refuses to overwrite an existing vaerion.yaml. --dry-run prints the plan.`,
  run: `vae run research --sources P[,P] --query Q [--max-docs N] [--dry-run]
vae run demo [--sources P,P] [--query Q]
vae run model --model P/M [--prompt TEXT] [--system TEXT] [--seed N]
              [--op chat|embed|rerank] [--input-json JSON] [--query Q]
              [--docs-json JSON] [--max-tokens N] [--intent TEXT] [--dry-run]

  research/demo execute a local research run through the full
  constitutional pipeline: declared capability → broker decision PER SOURCE
  (journaled) → fingerprint → fence → blob CAS → evidence → local index →
  query → citations → context pack → snapshot → receipt. Every step is
  attributed and hash-chained. Config policy rules (vaerion.yaml policy:)
  evaluate first: deny stops the run (exit 3), prompt pauses it with a
  durable gate (exit 0, awaiting) for 'vae resume'.

  demo defaults to ./docs/constitution + ./docs/adr with a fixed query.
  Exit 3 if the broker denies; 5 if the journal fails final verification.

  model invokes through the gateway SINGLE GATE: broker decision
  (model.invoke, journaled; ceiling = gateway.providers in vaerion.yaml) →
  secret.read decision when the provider needs a credential (value resolved
  at call time, never journaled) → adapter over the sanctioned transport →
  usage + integer micro-USD cost metered on the spine → receipt.
  mockbrain/* models are the local seeded virtual provider (no network,
  byte-identical outputs for the same seed). A prompt policy pauses the run
  with a durable gate; a deny exits 3; budget overrun exits with E1703.

  agent runs the supervised agent loop (MS-4). Every step is journaled
  (agent.step.recorded | failed, with round/index coordinates). --planner
  inline requires --plan-json (a declared JSON step array — the hermetic
  determinism device); --planner model plans through the gateway single
  gate (agents.plannerModel, default mockbrain/mock-1). Tools must be
  declared in vaerion.yaml AND granted by policy rules; undeclared tool
  calls are refused fail-closed (E1801). Broker refusals are fatal; the
  step ceiling stops loudly (E1804); gates pause for 'vae resume'.

  workflow executes a DAG: {id, nodes:[{id, deps, step, maxAttempts?}]}
  validated fail-closed (E1803); deterministic topological scheduling;
  node outputs content-addressed (blob CAS) + journaled; --resume RUN_ID
  continues an interrupted run from its journal fold (crash-safe).`,
  resume: `vae resume RUN_ID [--answer JSON]

  Restore a run deterministically from its journal. If a durable human gate
  is pending, resume WITHOUT --answer first: it renders the human review
  (question, options, the linked decision, and a review diff when present).
  Then resolve with --answer JSON (default when omitted: {"approved":true}).
  Approval of a broker prompt records an elevation (journaled + audited).
  AGENT runs CONTINUE after approval: the approved gate is durable elevation
  authority and the loop resumes from its journaled steps. A denial ends
  the run (exit 3). Exit 3 when the answer denies the gate.`,
  explain: `vae explain RUN_ID

  Reconstruct the run's narrative (decisions, gates, events, receipt) from
  its hash-chained journal, plus the gateway metering rollup (tokens and
  integer micro-USD per model) folded from the same journal. Exit 5 if the
  journal fails verification.`,
  journal: `vae journal ls
vae journal show RUN_ID
vae journal verify RUN_ID
vae journal recover RUN_ID [--dry-run]
vae journal export RUN_ID [--out PATH] [--dry-run]

  Append-only journal operations. recover truncates ONLY a torn crash tail
  and re-seals the chain with an auditable note. export produces a redacted,
  independently verifiable derivation.`,
  doctor: `vae doctor

  Verifies config validity, every journal's hash chain, every referenced
  blob in the CAS, evidence↔blob↔fingerprint triangulation, audit-ledger
  continuity, the Refusal Log chain, and the gateway picture: provider
  capability matrix, declared providers/secret NAMES/budgets. Performs NO
  network access and resolves NO secret values — zero telemetry is
  constitutional and secret reads are broker-mediated by law. Exit 5 with
  Fix: hints on failures.`,
  dev: `vae dev

  Engine status: version, substrate (ADR-0018), layer map, workspace state,
  milestone position. Read-only.`,
  serve: `vae serve [--port N] [--host ADDR]

  Start the local API daemon (MS-5, ADR-0010/ADR-0020): loopback HTTP/SSE
  over the SAME engine contracts the CLI exercises — run starts, durable
  gate answers, continuations, cancellations, event streams with journal
  cursor replay, the gateway capability matrix (secret NAMES only), and the
  generated OpenAPI description at /openapi.json.

  Authentication: a pairing token is generated at start and printed ONCE
  ('Authorization: Bearer <token>' on every call except /health, /version,
  /openapi.json). Headless starts pre-provision via VAE_TRUST=<token> —
  the token is then never printed. Shutdown: POST /shutdown with the token
  echoed in the body. Non-loopback binds are REFUSED (E2001): remote
  exposure requires a ratified transport-security ADR, never a flag.`,
};

interface ParsedArgs {
  command: string | null;
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { command: null, positional: [], flags: {} };
  const positional: string[] = [];
  let i = 0;
  let commandSet = false;
  while (i < argv.length) {
    const a = argv[i] as string;
    if (a === "--help" || a === "-h") {
      parsed.flags.help = true;
      i++;
      continue;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const name = eq === -1 ? a.slice(2) : a.slice(2, eq);
      const value = eq === -1 ? undefined : a.slice(eq + 1);
      if (value !== undefined) {
        parsed.flags[name] = value;
      } else if (i + 1 < argv.length && !(argv[i + 1] as string).startsWith("--") && ["cwd", "sources", "query", "max-docs", "answer", "out", "name", "profile", "model", "prompt", "system", "op", "seed", "max-tokens", "intent", "input-json", "docs-json", "goal", "planner", "steps", "plan-json", "dag", "resume", "port", "host"].includes(name)) {
        parsed.flags[name] = argv[i + 1] as string;
        i++;
      } else {
        parsed.flags[name] = true;
      }
      i++;
      continue;
    }
    if (!commandSet) {
      parsed.command = a;
      commandSet = true;
    } else {
      positional.push(a);
    }
    i++;
  }
  parsed.positional = positional;
  return parsed;
}

export interface CliResult {
  code: number;
}

/** In-process CLI entry (used by tests and the bin shim alike). */
export async function runCli(argv: string[], io: CliIo, cwd: string): Promise<CliResult> {
  const parsed = parseArgs(argv);

  // Guarantee #1 — help first, always, before any side effect.
  if (parsed.flags.help === true) {
    const topic = parsed.command;
    io.out(topic && COMMAND_HELP[topic] ? COMMAND_HELP[topic] : MAIN_HELP);
    return { code: ExitCode.ok };
  }

  if (!parsed.command) {
    io.err("E1600 no command given. Fix: run `vae --help` (help always teaches).");
    return { code: ExitCode.usage };
  }

  const mode = parsed.flags.json === true ? "json" : "plain";
  const dryRun = parsed.flags["dry-run"] === true;
  const cwdFlag = typeof parsed.flags.cwd === "string" ? (parsed.flags.cwd as string) : cwd;
  const ctx: CommandContext = {
    io,
    mode,
    dryRun,
    cwd: cwdFlag,
    flags: {
      ...parsed.flags,
      _positional1: parsed.positional[0] ?? "",
      _positional2: parsed.positional[1] ?? "",
    },
  };

  try {
    let code: number;
    switch (parsed.command) {
      case "init": code = await cmdInit(ctx); break;
      case "run": code = await cmdRun(ctx); break;
      case "resume": code = await cmdResume(ctx); break;
      case "explain": code = await cmdExplain(ctx); break;
      case "journal": code = await cmdJournal(ctx); break;
      case "doctor": code = await cmdDoctor(ctx); break;
      case "dev": code = await cmdDev(ctx); break;
      case "serve": code = await cmdServe(ctx); break;
      case "version": io.out(`vae ${VERSION}`); code = ExitCode.ok; break;
      default:
        io.err(`E1600 unknown command: ${parsed.command}. Fix: run \`vae --help\` for the Daily Seven.`);
        return { code: ExitCode.usage };
    }
    return { code };
  } catch (err) {
    if (isVaerionError(err)) {
      const renderer = new (await import("./render.ts")).Renderer(io, mode);
      renderer.error(err);
      const code =
        err.code === "E1600" || err.code === "E1700" || err.code === "E1701"
          ? ExitCode.usage
          : err.code === "E1300" || err.code === "E1301" || err.code === "E1302"
            ? ExitCode.brokerDenied
            : err.code === "E1702" || err.code === "E1704" || err.code === "E1705" || err.code === "E1706" || err.code === "E1601"
              ? ExitCode.providerDown
              : err.code === "E1703"
                ? ExitCode.partial
                : ExitCode.internal;
      return { code };
    }
    const msg = err instanceof Error ? err.message : String(err);
    io.err(`E1900 ${msg}`);
    return { code: ExitCode.internal };
  }
}

/* bin shim: `bun run packages/vaerion/src/cli/vae.ts ...` */
if (import.meta.main) {
  const io: CliIo = {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  };
  const result = await runCli(process.argv.slice(2), io, process.cwd());
  process.exit(result.code);
}

// Re-export for programmatic consumers (SDK reuses runCli).
export { runCli as cli, MAIN_HELP };
