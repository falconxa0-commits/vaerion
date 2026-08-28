/**
 * vae-cli — the `vae` binary (L4 porcelain; D3.1: binary `vae`, alias `vaerion`).
 *
 * Law encoded here: the Five Guarantees on every command (D18.1);
 * one envelope, three renderings (D18.3); receipts before exit (D18.9);
 * non-interactive refusal, never a guess (D18.5); the exit alphabet
 * (D18.6); errors as E#### + Fix (D18.2); the top-level surface is the
 * Daily Seven (D18.11); identical inputs → identical outputs (D18.12).
 */

import { watch } from "node:fs";
import { isVaeError, EXIT_CODES, type Envelope, type Receipt, isUlid, type ExitCode } from "vae-foundation";
import { openEngineContext, WorkspaceService, RunService, HealthService, JournalService, ExplainService } from "vae-api";
import { renderEnvelope, renderReceipt, renderError, type RenderMode } from "./render.ts";
import { topLevelHelp, commandHelp, errorCodeHelp, COMMAND_HELPS } from "./help.ts";

export interface ParsedArgs {
  readonly command: string | undefined;
  readonly args: string[];
  readonly flags: {
    readonly help: boolean;
    readonly json: boolean;
    readonly dryRun: boolean;
    readonly plain: boolean;
    readonly noColor: boolean;
    readonly profile?: string;
    readonly list: boolean;
    readonly verify: boolean;
  };
}

const KNOWN_FLAGS = new Set(["--help", "-h", "--json", "--dry-run", "--plain", "--no-color", "--profile", "--list", "--verify"]);

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let command: string | undefined;
  const args: string[] = [];
  let help = false;
  let json = false;
  let dryRun = false;
  let plain = false;
  let noColor = false;
  let profile: string | undefined;
  let list = false;
  let verify = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--") && !arg.startsWith("-")) {
      if (command === undefined) command = arg;
      else args.push(arg);
      continue;
    }
    if (arg === "--profile") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) {
        throw usage("--profile requires a value", "Pass the profile name declared in vaerion.yaml (D19.4).");
      }
      profile = value;
      i++;
      continue;
    }
    switch (arg) {
      case "--help":
      case "-h":
        help = true;
        break;
      case "--json":
        json = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--plain":
        plain = true;
        break;
      case "--no-color":
        noColor = true;
        break;
      case "--list":
        list = true;
        break;
      case "--verify":
        verify = true;
        break;
      default:
        throw usage(`An unknown flag was supplied: ${arg}`, `Run \`vae --help\` to see the guaranteed flag set; machine flags are limited to: ${[...KNOWN_FLAGS].join(" ")}.`);
    }
  }
  return { command, args, flags: { help, json, dryRun, plain, noColor, ...(profile !== undefined ? { profile } : {}), list, verify } };
}

function usage(message: string, fix: string): Error & { code: string; fix: string; class: "usage" } {
  const err = new Error(message) as Error & { code: string; fix: string; class: "usage" };
  err.code = "E1007";
  err.fix = fix;
  err.class = "usage";
  return err;
}

interface CommandOutput {
  readonly envelopes: Envelope[];
  readonly receipt?: Receipt;
  readonly lines?: string[];
  readonly exitCode: ExitCode;
}

const ENGINE_ID = { kind: "engine" as const, id: "vae-core" };

function makeEnv(ctx: ReturnType<typeof openEngineContext>): (type: Envelope["type"], payload: import("vae-foundation").Json, runId?: string) => Envelope {
  return (type, payload, runId) => ({
    v: 1,
    type,
    seq: ctx.nextEventSeq(),
    ts: new Date(ctx.clock.nowMs()).toISOString(),
    ...(runId !== undefined ? { run_id: runId } : {}),
    actor: ENGINE_ID,
    cause: { kind: "command", ref: "cli" },
    payload,
  });
}

function openContextOrThrow(profile: string | undefined, cwd: string): ReturnType<typeof openEngineContext> {
  return openEngineContext({ cwd, profile, env: process.env });
}

function runCommand(out: ParsedArgs): CommandOutput {
  // `init` scaffolds a workspace, so it must not require one (E1005 would be circular).
  if (out.command === "init") {
    const result = new WorkspaceService().init(process.cwd(), { dryRun: out.flags.dryRun });
    return {
      envelopes: [],
      receipt: result.receipt,
      lines: [out.flags.dryRun ? "Previewed workspace scaffold (no effect)." : "Workspace initialized."],
      exitCode: EXIT_CODES.OK,
    };
  }
  const ctx = openContextOrThrow(out.flags.profile, process.cwd());
  const env = makeEnv(ctx);
  switch (out.command) {
    case "run": {
      const planName = out.args[0];
      if (planName === undefined) {
        throw usage("A run plan name is required.", "Declare a plan under runs/ and run `vae run <plan>`; see `vae run --help`.");
      }
      const outcome = new RunService(ctx).run(planName, { dryRun: out.flags.dryRun });
      return {
        envelopes: [
          env("run.started", { plan: planName, dry_run: out.flags.dryRun === true }),
          env("run.completed", { run_id: outcome.runId, steps_completed: outcome.completedSteps.length, dry_run: out.flags.dryRun === true }),
        ],
        receipt: outcome.receipt,
        exitCode: outcome.ok ? EXIT_CODES.OK : EXIT_CODES.RUN_FAILURE,
      };
    }
    case "resume": {
      const runId = out.args[0];
      if (runId === undefined || !isUlid(runId)) {
        throw usage("A run id (ULID) is required.", "List runs with `vae journal --list` and resume an existing run.");
      }
      const outcome = new RunService(ctx).resume(runId);
      return {
        envelopes: [env("run.resumed", { run_id: runId }), env(outcome.ok ? "run.completed" : "run.failed", { run_id: runId })],
        receipt: outcome.receipt,
        exitCode: outcome.ok ? EXIT_CODES.OK : EXIT_CODES.RUN_FAILURE,
      };
    }
    case "explain": {
      const runId = out.args[0];
      if (runId === undefined || !isUlid(runId)) {
        throw usage("A run id (ULID) is required.", "List runs with `vae journal --list`, then explain one.");
      }
      const explanation = new ExplainService(ctx).explain(runId);
      const lines = [
        `Explaining run ${explanation.runId}${explanation.plan !== undefined ? ` (plan ${explanation.plan})` : ""}:`,
        `  verdict: ${explanation.verdict}`,
        "  timeline:",
        ...explanation.timeline.map((t) => `    ${String(t.seq).padStart(3)} ${t.type} — ${t.summary}`),
        `  steps: ${explanation.steps.map((s) => `${s.step}=${s.outcome}`).join(" · ") || "(none)"}`,
      ];
      return { envelopes: [env("engine.version", { explanation } as never)], lines, exitCode: EXIT_CODES.OK };
    }
    case "journal": {
      const service = new JournalService(ctx);
      if (out.flags.list) {
        const runs = service.listRuns();
        const lines =
          runs.length === 0
            ? ["No runs yet — execute one with `vae run <plan>`."]
            : runs.map((r) => `${r.runId}  ${r.status.padEnd(10)} ${r.plan ?? "?"}  entries=${r.entries}${r.startedAt !== undefined ? `  started=${r.startedAt}` : ""}`);
        return { envelopes: [env("engine.version", { runs } as never)], lines, exitCode: EXIT_CODES.OK };
      }
      if (out.flags.verify) {
        const selector = out.args[0] ?? "audit";
        const report = service.verify(selector);
        return {
          envelopes: [env("journal.verified", { selector, ...report })],
          lines: [report.ok ? `chain OK (${report.entries} entries, head ${report.head?.slice(0, 16) ?? "empty"})` : `chain BROKEN at line ${report.brokenAt?.line}: ${report.brokenAt?.why}`],
          exitCode: report.ok ? EXIT_CODES.OK : EXIT_CODES.RUN_FAILURE,
        };
      }
      const selector = out.args[0] ?? "audit";
      const entries = service.entries(selector, 50);
      const lines = entries.map((e) => `${String(e.seq).padStart(3)} ${e.ts}  ${e.type}  ${e.actor.kind}:${e.actor.id}`);
      return { envelopes: [], lines, exitCode: EXIT_CODES.OK };
    }
    case "doctor": {
      const { ok, checks } = new HealthService(ctx).doctor();
      const lines = checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.id.padEnd(20)} ${c.detail}${c.fix !== undefined && !c.ok ? `\n  Fix: ${c.fix}` : ""}`);
      return {
        envelopes: checks.map((c) => env("doctor.check", { id: c.id, ok: c.ok, detail: c.detail })),
        lines,
        exitCode: ok ? EXIT_CODES.OK : EXIT_CODES.RUN_FAILURE,
      };
    }
    case "dev": {
      return devCommand(ctx, env);
    }
    default:
      throw usage(`Unknown command '${String(out.command)}'.`, "Run `vae --help`; the top-level surface is the Daily Seven (D18.11).");
  }
}

function devCommand(ctx: ReturnType<typeof openEngineContext>, env: (type: Envelope["type"], payload: import("vae-foundation").Json) => Envelope): CommandOutput {
  const isTTY = process.stdout.isTTY === true;
  const { ok, checks } = new HealthService(ctx).doctor();
  if (!isTTY) {
    // Non-interactive contexts get one honest validation pass (D18.5).
    return {
      envelopes: checks.map((c) => env("doctor.check", { id: c.id, ok: c.ok, detail: c.detail })),
      lines: [
        "dev: no TTY attached — running a single validation pass instead of watching (D18.5).",
        ...checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.id} ${c.detail}`),
      ],
      exitCode: ok ? EXIT_CODES.OK : EXIT_CODES.RUN_FAILURE,
    };
  }
  const watchers: ReturnType<typeof watch>[] = [watch(ctx.paths.configFile, () => undefined), watch(`${ctx.paths.root}/runs`, () => undefined)];
  const revalidate = (): void => {
    const result = new HealthService(ctx).doctor();
    process.stdout.write(`${new Date().toISOString()} dev: ${result.ok ? "workspace valid" : "workspace INVALID"}\n`);
    for (const c of result.checks) {
      if (!c.ok) process.stdout.write(`  ✗ ${c.id} ${c.detail}\n  Fix: ${c.fix ?? ""}\n`);
    }
  };
  watchers.forEach((w) => w.on("change", debounce(revalidate, 250)));
  process.on("SIGINT" as never, () => {
    watchers.forEach((w) => w.close());
    process.exit(EXIT_CODES.OK);
  });
  return {
    envelopes: checks.map((c) => env("doctor.check", { id: c.id, ok: c.ok })),
    lines: [
      "dev: watching vaerion.yaml and runs/ — Ctrl+C to exit.",
      `initial state: ${ok ? "valid" : "INVALID"} (${checks.filter((c) => c.ok).length}/${checks.length} checks green)`,
    ],
    exitCode: EXIT_CODES.OK,
  };
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

export function main(argv: readonly string[]): number {
  // `vae help [command|E####]` is part of the teaching surface.
  if (argv[0] === "help") {
    const target = argv[1];
    if (target === undefined) {
      process.stdout.write(topLevelHelp());
      return EXIT_CODES.OK;
    }
    if (/^E\d{4}$/.test(target)) {
      process.stdout.write(errorCodeHelp(target));
      return EXIT_CODES.OK;
    }
    const help = COMMAND_HELPS[target];
    if (help === undefined) {
      process.stderr.write(`No help topic '${target}'.\nFix: run \`vae help\` to list commands and \`vae help E####\` for error codes.\n`);
      return EXIT_CODES.USAGE;
    }
    process.stdout.write(commandHelp(help));
    return EXIT_CODES.OK;
  }

  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    const lines = renderError({ mode: "plain", color: false }, error);
    process.stderr.write(`${lines.join("\n")}\n`);
    return EXIT_CODES.USAGE;
  }

  if (parsed.command === undefined) {
    process.stdout.write(topLevelHelp());
    return EXIT_CODES.OK;
  }
  const cmdHelp = COMMAND_HELPS[parsed.command];
  if (cmdHelp === undefined) {
    process.stderr.write(`Unknown command '${parsed.command}'. The top-level surface is the Daily Seven (D18.11).\nFix: run \`vae --help\`.\n`);
    return EXIT_CODES.USAGE;
  }
  if (parsed.flags.help) {
    process.stdout.write(commandHelp(cmdHelp));
    return EXIT_CODES.OK;
  }

  const mode: RenderMode = parsed.flags.json ? "json" : parsed.flags.plain ? "plain" : "human";
  const color = mode !== "plain" && !parsed.flags.noColor && process.stdout.isTTY === true;
  const render = { mode, color };

  let output: CommandOutput;
  try {
    output = runCommand(parsed);
  } catch (error) {
    const lines = renderError(render, error);
    if (mode === "json") {
      // Machine mode stays parseable in failure states (Guarantee 2, D18.7).
      const payload = isVaeError(error)
        ? { error: { code: error.code, message: error.message, fix: error.fix } }
        : { error: { code: "E5004", message: error instanceof Error ? error.message : String(error), fix: "Report this engine bug with the journal reference." } };
      process.stdout.write(`${JSON.stringify({ v: 1, type: "engine.error", ...payload })}\n`);
    } else {
      process.stderr.write(`${lines.join("\n")}\n`);
    }
    return isVaeError(error) ? error.exitCode : EXIT_CODES.INTERNAL;
  }

  if (mode === "json") {
    for (const envelope of output.envelopes) {
      process.stdout.write(`${JSON.stringify(envelope)}\n`);
    }
    if (output.receipt !== undefined) {
      process.stdout.write(
        `${JSON.stringify({
          v: 1,
          type: "receipt.issued",
          seq: output.envelopes.length + 1,
          ts: new Date().toISOString(),
          actor: ENGINE_ID,
          cause: { kind: "command", ref: `vae ${parsed.command}` },
          payload: { receipt: output.receipt },
        })}\n`,
      );
    }
  } else {
    // Human/plain: envelopes render only when the command has no
    // narrative lines — one story, never the same story twice (D18.8).
    for (const envelope of output.lines === undefined ? output.envelopes : []) {
      process.stdout.write(`${renderEnvelope(render, envelope)}\n`);
    }
    for (const line of output.lines ?? []) process.stdout.write(`${line}\n`);
    if (output.receipt !== undefined) {
      process.stdout.write(`${renderReceipt(render, output.receipt, parsed.flags.dryRun).join("\n")}\n`);
    }
  }
  return output.exitCode;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
