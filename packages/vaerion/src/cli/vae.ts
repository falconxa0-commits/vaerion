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
import { buildWelcomePayload, cmdAccount, cmdAi, cmdCenter, cmdDev, cmdExplain, cmdInit, cmdJournal, cmdDoctor, cmdPackage, cmdProvenance, cmdRepo, cmdRelease, cmdResume, cmdRun, cmdServe, cmdCi, cmdTour, type CommandContext } from "./commands.ts";
import { VaerionError } from "../kernel/errors.ts";
import { isVaerionError } from "./workspace.ts";
import { Renderer, setBannerVersion } from "./render.ts";
import { Ansi, banner, errorBlock, footer, type RenderEnv } from "./ui.ts";

export const VERSION = "0.1.9-rc1";
setBannerVersion(VERSION);

const MAIN_HELP = `vae — Vaerion engine command line (v${VERSION})

Usage: vae [global flags] <command> [args] [flags]
(Bare \`vae\` opens the welcome front door: it measures this directory and
 points at the next step — read-only, exit 0.)

Command surface (the Daily Seven + additive commands):
  init [--template minimal|demo|agent] [--name NAME]
                             scaffold vaerion.yaml + .vaerion/ from the
                             deterministic template registry (bare init is
                             exactly --template minimal)
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
  package build [--out PATH] [--dry-run]
                             build a reproducible .vxn bundle (MS-6,
                             ADR-0016): a deterministic fold over the
                             declared inputs + pin-verified extension
                             artifacts — identical inputs, identical bytes;
                             regenerates vaerion.lock
  package verify BUNDLE [--dry-run]
                             the pure check: digests recomputed, pins
                             compared, content NEVER executed; honest
                             per-check findings report
  provenance ARTIFACT        permanent provenance for anything Vaerion
                             created — .vxn bundle (digests recomputed),
                             vaerion.lock (seal vs on-disk bundle), a
                             redacted journal export, or a release
                             MANIFEST. Evidence, not branding.
  repo | repo verify         repository intelligence, measured never
                             assumed (XVIII-8): branch, detached HEAD,
                             staged/unstaged/untracked, conflicts,
                             rebase/cherry-pick/bisect, worktrees,
                             submodules, tags, identity audit, canonical
                             state. verify reports trust findings only
                             (identity law, canonical protection law).
  ci validate                validate .github/workflows structurally: shape,
                             single verification authority (D-R), env-if
                             drift, supply-chain pins, secret hygiene
  ci simulate --event EV [--ref NAME]
                             deterministic pipeline projection (push,
                             pull_request, workflow_dispatch, tag): which
                             jobs would run, and why. A projection is not
                             an execution — never claimed as one.
  release readiness [--live-gates]
                             the constitutional release evaluator (XVIII-8):
                             can this repository ship? Which check blocks?
                             Gates (from the measured record, or live),
                             git trust, CI validity, version lockstep,
                             tag binding, artifact set, ledger — fail-closed,
                             honestly labeled.
  tour                       a guided, read-only walk of the engine (XVIII-2):
                             nine steps measured against this machine and
                             this directory; it teaches by pointing at real
                             commands, never by executing them
  account                    who acts in this workspace (XVIII-3): the actor
                             law, the actors observed in the journals, the
                             commit identity (D-P), and declared secret
                             PROFILES — names only. Read-only. Local identity,
                             never a cloud account.
  ai ask --question Q [--sources P,P | --capability NAME] [--model P/M]
          [--seed N] [--max-docs N]
                             the grounded question (XVIII-4): the ONE research
                             pipeline assembles a journaled, provenance-
                             carrying context pack from declared local
                             sources, then the answer crosses the gateway
                             single gate — attributed, metered, receipted
  ai models                  the gateway capability matrix (read-only)
  center                     the operator cockpit (XVIII-6): runs, receipts,
                             gateway metering, audit + refusal-log integrity,
                             referenced blobs, and the release readiness
                             digest — one measured core, read-only

Global flags:
  --json                     stable NDJSON output (machine mode, guaranteed)
  --plain                    human-readable output (default)
  --dry-run                  zero side effects — plan only, nothing written
  --cwd DIR                  operate on DIR as the workspace (default: .)
  --help                     show this help and exit (never executes)

Exit codes: 0 ok · 1 internal · 2 usage · 3 broker-denied · 4 provider-down · 5 partial-with-repair-hint

Learn more: docs/constitution/VAERION_CONSTITUTION_v1.5.md · spec/ (contracts)
`;

const COMMAND_HELP: Record<string, string> = {
  init: `vae init [--template minimal|demo|agent] [--name NAME] [--dry-run]
  Scaffold vaerion.yaml (strict schema 0.1) and the .vaerion/ workspace from
  the deterministic template registry (constitution v1.5 A3, Phase 5):

    minimal   the default scaffold: declared project docs, policy examples
              in comments — bare 'vae init' is exactly this template
    demo      a demo workspace: ./docs + ./sources capabilities, ready for
              'vae run demo --sources ./sources --query "..."'
    agent     an agent workspace: mockbrain planner, declared tools, and an
              explicit policy rule for the agent's model.invoke grant

  Every template is byte-stable (the only parameter is --name) and validates
  against the strict config law; telemetry is structurally false. Refuses to
  overwrite an existing vaerion.yaml. Unknown templates are a usage error
  (E1203). --dry-run prints the plan and writes nothing.`,
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
  calls are refused fail-closed (E1801). Declared extensions (MS-5) are
  reachable as tools after their pinned artifact digest verifies; their
  own power requests cross the broker with the extension as principal.
  Broker refusals are fatal; the step ceiling stops loudly (E1804); gates
  pause for 'vae resume'.

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
  package: `vae package build [--out PATH] [--dry-run]
vae package verify BUNDLE [--dry-run]

  build (MS-6, ADR-0016) folds the DECLARED inputs into a .vxn bundle:
  package.include paths from vaerion.yaml (files carry themselves;
  directories carry every file under them recursively) plus every declared
  extension artifact — each pin-verified BEFORE it is bundled (a mismatched
  artifact is never distributed, exactly as it is never executed). Entries
  are canonically ordered; compression is zstd at the pinned level; content
  identity is blake3. Identical inputs produce BYTE-IDENTICAL bundles — no
  wall-clock, no ambient paths. The build also regenerates vaerion.lock
  (generated, committed, never hand-edited). The build run is journaled and
  closes with a receipt.

  verify is the PURE check: it recomputes every digest, compares the
  manifest pins against vaerion.yaml AND vaerion.lock (a mismatch is a hard
  failure — the digest-swap defense), and reports an honest per-check
  findings list. It NEVER executes package content. Exit 0 verified;
  exit 5 with E2206 + findings when the bundle must be refused.`,
  provenance: `vae provenance ARTIFACT

  Permanent provenance for anything Vaerion created — evidence, not
  branding. Every digest that CAN be recomputed from the bytes IS
  recomputed here, and the verification status is honest per kind:

    .vxn bundle         the full pure format check — payload + entry
                        digests recomputed and compared to the manifest
    vaerion.lock        the seal, cross-checked against the on-disk bundle
                        (E2205 findings when evidence does not hold)
    *.ndjson export     the derivation header: source run + head hash,
                        engine, config fingerprint, redaction version
    MANIFEST.json       a release manifest, displayed as recorded

  Exit 0 when the evidence holds; exit 5 with findings when it does not.`,
  repo: `vae repo
vae repo verify

  Repository intelligence, measured never assumed (ASCENSION XVIII Phase 8;
  Constitution v1.1 D-P/D-Q/D-S). Read-only: every git invocation runs with
  --no-optional-locks and fixed argv, so a measurement can never mutate the
  repository it measures.

  The summary reports the branch, detached HEAD, staged/unstaged/untracked
  paths, merge conflicts, merge/rebase/cherry-pick/bisect state, worktrees,
  submodules, tags at HEAD, the commit-identity audit of the last 50 commits
  against the ratified identity (D-P), and the canonical remote state —
  reachability, main sync, tag push, and the pre-receive protection hook
  (D-Q), each VERIFIED when measured here and UNVERIFIED when it cannot be.

  verify reports the trust findings only (identity law, conflict state,
  canonical protection). Exit 0 when no blocker-severity finding exists;
  exit 5 otherwise. History is immutable: violations are recorded, never
  rewritten.`,
  ci: `vae ci validate
vae ci simulate --event push|pull_request|workflow_dispatch|tag [--ref NAME]

  CI understanding (D-R): the workflows under .github/workflows are the
  remote projection of the single verification authority — tools/verify.ts.
  No surface may re-implement the gates.

  validate parses every workflow (the same YAML parser the config uses) and
  reports structural findings with stable codes: unparsable YAML (E2307),
  shape defects (E2304), gate logic without the authority (E2305), the
  step-own-env-in-if drift class where an \`if:\` reads a variable defined in
  the same step's env and is therefore permanently false (E2306), unpinned
  substrate versions, and secret material echoed toward logs.

  simulate projects which workflows trigger and which jobs would run for a
  measured event/ref — deterministically, from the workflow text alone. A
  projection is NOT an execution: remote outcomes are NEVER EXECUTED (D-S),
  and the output says so.`,
  release: `vae release readiness [--live-gates]

  The constitutional release evaluator (D-S/D-T): can this repository ship,
  measured only. Each check carries an honesty label and a Fix:

    verification-gates     the measured verify.ts record (--live-gates re-runs
                           the gates live through the single authority)
    git-tree-clean         a release is cut from a clean, fully committed tree
    git-identity-head      HEAD authored by the ratified identity (D-P)
    git-identity-history   identity audit of recent commits (recorded, immutable)
    release-tag-binding    HEAD exactly at a v* tag (reproducible artifact binding)
    version-lockstep       every version surface agrees
    ci-validity            workflows structurally valid (via vae ci validate)
    canonical-sync         canonical store reachable, in sync, protection enforced
    release-artifacts      the packed, signed artifact set of record
    worklog-ledger         the phase ledger of record exists (D-T)
    reports-present        truthful reports on disk

  Fail-closed (P6): unmeasurable ⇒ blocked. Exit 0 READY; exit 5 BLOCKED with
  the blocker list. The evaluation is journaled with a receipt when the
  repository is a Vaerion workspace, and says so when it is not.`,
  tour: `vae tour

  A guided, read-only walk of the engine (ASCENSION XVIII Phase 2;
  constitution v1.2 D-M′/A2). Nine steps — what Vaerion is, this directory,
  the config law, the journal, doctor, the gateway single gate, your first
  run, the trust surface, where to go next — each MEASURED against this
  machine and this directory (no network, no writes, no wall-clock in the
  payload). It teaches by pointing at real commands; it never executes
  them. The same directory yields byte-identical --json output.`,
  account: `vae account

  The identity & attribution surface (constitution v1.5 A3, Phase 3;
  P5/D-D/D-P). Read-only. It MEASURES who acts here:

    actor law          the canonical local actor and the broker principal
                       ids — one identity module, no call-site literals
    observed actors    who appears in this workspace's journals (a
                       deterministic fold over every envelope's actor)
    commit identity    the repository's HEAD author and the D-P audit of
                       recent commits (the same primitives as vae repo)
    secret profiles    the secret NAMES declared in vaerion.yaml and the
                       principal patterns granted them — never their values
                       (ADR-0013: values resolve only behind broker decisions)

  Vaerion has no cloud accounts (P1): your identity is local, attributed,
  and yours. Exit 0; the same workspace yields byte-identical --json output.`,
  ai: `vae ai ask --question TEXT [--sources P,P | --capability NAME]
                [--model P/M] [--seed N] [--max-tokens N] [--max-docs N]
                [--intent TEXT] [--dry-run]
vae ai models

  ask (constitution v1.5 A3, Phase 4; P8/D-J/D-O) — the grounded question:

    1. capability: a vaerion.yaml research.capabilities entry (--capability)
       or an explicit --sources declaration — never ambient, never network
    2. ONE broker decision PER SOURCE (journaled; deny exits 3, a prompt
       policy pauses with a durable gate for 'vae resume')
    3. the ONE research pipeline (the same fold 'vae run research' executes):
       fingerprint → fence → blob CAS → evidence → index → citations →
       context pack, journaled and provenance-carrying
    4. the answer crosses the gateway SINGLE GATE (decide model.invoke →
       journal → act) with the fenced pack as the system prompt
    5. metering (tokens + integer micro-USD) folded from the journal;
       the run closes with a receipt

  Default model: mockbrain/mock-1 — the local seeded virtual provider. No
  network, byte-identical answers for the same question, sources, and seed.
  Untrusted source content travels ONLY inside its fence; the answer face is
  redacted like every other.

  models reports the gateway capability matrix (secret NAMES only). Read-only.`,
  center: `vae center

  The operator cockpit (constitution v1.5 A3, Phase 6; P7/D-S). Read-only.
  ONE measured core folds this workspace's artifacts into an honest
  operations snapshot:

    operations          runs (records, events, verification, receipt), the
                        gateway metering rollup (tokens + integer micro-USD,
                        folded from the journals), and every referenced blob
    integrity           the audit-ledger and refusal-log hash chains
    release digest      the release readiness verdict when this workspace is
                        a repository checkout (measured, fail-closed, D-S)

  Exit 0 when journals, both chains, and every blob verify; exit 5 with the
  failing section otherwise. The web face command-center section consumes
  the same fold through tools/status.ts — never a second implementation.`,
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
      } else if (i + 1 < argv.length && !(argv[i + 1] as string).startsWith("--") && ["cwd", "sources", "query", "max-docs", "answer", "out", "name", "profile", "model", "prompt", "system", "op", "seed", "max-tokens", "intent", "input-json", "docs-json", "goal", "planner", "steps", "plan-json", "dag", "resume", "port", "host", "event", "ref", "limit", "question", "capability", "template"].includes(name)) {
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
  const envOf = (): RenderEnv => ({ tty: io.tty === true, columns: io.columns, vars: process.env });

  // Guarantee #1 — help first, always, before any side effect.
  if (parsed.flags.help === true) {
    const topic = parsed.command;
    new Renderer(io, "plain", envOf()).helpFrame(
      topic && COMMAND_HELP[topic] ? COMMAND_HELP[topic] : MAIN_HELP,
    );
    return { code: ExitCode.ok };
  }

  const mode = parsed.flags.json === true ? "json" : "plain";
  const renderer = new Renderer(io, mode, envOf());
  const dryRun = parsed.flags["dry-run"] === true;
  const cwdFlag = typeof parsed.flags.cwd === "string" ? (parsed.flags.cwd as string) : cwd;
  const ctx: CommandContext = {
    io,
    mode,
    dryRun,
    cwd: cwdFlag,
    env: envOf(),
    flags: {
      ...parsed.flags,
      _positional1: parsed.positional[0] ?? "",
      _positional2: parsed.positional[1] ?? "",
    },
  };

  if (!parsed.command) {
    // Welcome front door (constitution v1.2 D-M′, amendment A2): the bare
    // invocation teaches — it measures this directory read-only and points
    // at the next step. Exit 0 in every output mode; never a usage error.
    if (renderer.rich) {
      for (const line of banner(new Ansi(true), VERSION, renderer.width)) io.out(line);
      io.out("");
    }
    renderer.result(await buildWelcomePayload(ctx));
    if (renderer.rich) {
      io.out("");
      for (const line of footer(new Ansi(true))) io.out(line);
    }
    return { code: ExitCode.ok };
  }

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
      case "package": code = await cmdPackage(ctx); break;
      case "provenance": code = await cmdProvenance(ctx); break;
      case "repo": code = await cmdRepo(ctx); break;
      case "ci": code = await cmdCi(ctx); break;
      case "release": code = await cmdRelease(ctx); break;
      case "tour": code = await cmdTour(ctx); break;
      case "account": code = await cmdAccount(ctx); break;
      case "ai": code = await cmdAi(ctx); break;
      case "center": code = await cmdCenter(ctx); break;
      case "version":
        // D-N: every command honors the Five Guarantees — `version --json`
        // emits stable NDJSON (the rehearsal of Phase 9 caught this gap).
        if (mode === "json") {
          io.out(JSON.stringify({ version: VERSION }));
        } else if (renderer.rich) {
          for (const line of banner(new Ansi(true), VERSION, renderer.width)) io.out(line);
        } else {
          io.out(`vae ${VERSION}`);
        }
        code = ExitCode.ok;
        break;
      default:
        if (renderer.rich) {
          for (const line of errorBlock(new Ansi(true), { code: "E1600", message: `unknown command: ${parsed.command}`, fix: "run `vae --help` for the Daily Seven." }, renderer.width)) io.err(line);
        } else {
          io.err(`E1600 unknown command: ${parsed.command}. Fix: run \`vae --help\` for the Daily Seven.`);
        }
        return { code: ExitCode.usage };
    }
    return { code };
  } catch (err) {
    if (isVaerionError(err)) {
      renderer.error(err);
      const code =
        err.code === "E1600" || err.code === "E1203" || err.code === "E1700" || err.code === "E1701" || err.code === "E2204" || err.code === "E2300"
          ? ExitCode.usage
          : err.code === "E1300" || err.code === "E1301" || err.code === "E1302"
            ? ExitCode.brokerDenied
            : err.code === "E1702" || err.code === "E1704" || err.code === "E1705" || err.code === "E1706" || err.code === "E1601"
              ? ExitCode.providerDown
              : err.code === "E1703" || err.code === "E2200" || err.code === "E2201" || err.code === "E2202" || err.code === "E2203" || err.code === "E2205" || err.code === "E2206"
                ? ExitCode.partial
                : err.code.startsWith("E23")
                  ? ExitCode.partial
                  : ExitCode.internal;
      return { code };
    }
    const msg = err instanceof Error ? err.message : String(err);
    io.err(`E1900 ${msg}`);
    return { code: ExitCode.internal };
  }
}

/* Distribution entrypoint — shared by the import.meta.main shim (repo) and
 * the packaging launchers (npm bin/vae.js, PyPI console script, deb/brew
 * shims). One io construction, one exit-code contract, every path. */
export async function main(argv: string[]): Promise<number> {
  const io: CliIo = {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    raw: (s) => process.stdout.write(s),
    tty: process.stdout.isTTY === true,
    columns: process.stdout.columns,
  };
  const result = await runCli(argv, io, process.cwd());
  return result.code;
}

/* bin shim: `bun run packages/vaerion/src/cli/vae.ts ...` */
if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}

// Re-export for programmatic consumers (SDK reuses runCli).
export { runCli as cli, MAIN_HELP };
