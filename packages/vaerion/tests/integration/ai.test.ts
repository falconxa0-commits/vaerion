/**
 * `vae ai` — the grounded-question surface (ASCENSION XVIII Phase 4;
 * constitution v1.3 A3; P8/D-J/D-O).
 *
 * Hermetic: temp workspaces, local docs, mockbrain (no network). The ONE
 * research pipeline is exercised through the real `runCli` entry; answer
 * determinism is pinned across two identical workspaces; the broker laws
 * (deny → exit 3, prompt → durable gate) are proven on the ai surface too.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli/vae.ts";
import { ExitCode } from "../../src/cli/io.ts";
import { readJournal } from "../../src/journal/reader.ts";
import { RunHarness } from "../../src/runtime/run.ts";
import { blake3HexOf } from "../../src/kernel/hash.ts";

const rootsToClean: string[] = [];
afterAll(async () => {
  for (const r of rootsToClean) await rm(r, { recursive: true, force: true }).catch(() => undefined);
});

interface Captured { out: string[]; err: string[]; lines: string[] }

function captureIo(tty = false, columns?: number) {
  const captured: Captured = { out: [], err: [], lines: [] };
  return {
    captured,
    io: {
      out: (l: string) => { captured.out.push(l); captured.lines.push(l); },
      err: (l: string) => { captured.err.push(l); captured.lines.push(l); },
      raw: () => undefined,
      tty,
      columns,
    },
  };
}

async function runCode(argv: string[], io: ReturnType<typeof captureIo>["io"], dir: string): Promise<number> {
  return (await runCli(argv, io, dir)).code;
}

async function snapshotDir(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { readdir, readFile } = await import("node:fs/promises");
  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const rel = prefix === "" ? e.name : `${prefix}/${e.name}`;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        out.set(`${rel}/`, "dir");
        await walk(abs, rel);
      } else if (e.isFile()) {
        const bytes = await readFile(abs);
        out.set(rel, await blake3HexOf(new Uint8Array(bytes)));
      }
    }
  }
  await walk(root, "");
  return out;
}

async function freshDir(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `vaerion-ai-`));
  rootsToClean.push(dir);
  return dir;
}

const DOC_A = `# Determinism\n\nDeterministic runs replay to identical state given the same journal and seeds.\nThe journal is append-only and hash-chained with blake3.\n`;
const DOC_B = `# The Broker\n\nEvery privileged operation crosses the permission broker. Fail-closed:\nabsence of permission is permission's absence.\n`;

/** A workspace with gateway enabled + two local docs under ./sources. */
async function makeWorkspace(name: string, extraYaml = ""): Promise<string> {
  const dir = await freshDir(name);
  await mkdir(join(dir, "sources"), { recursive: true });
  await writeFile(join(dir, "sources", "determinism.md"), DOC_A, "utf8");
  await writeFile(join(dir, "sources", "broker.md"), DOC_B, "utf8");
  await writeFile(
    join(dir, "vaerion.yaml"),
    `schemaVersion: "0.1"
project:
  name: ai-demo
  description: "grounded questions"
gateway:
  providers:
    mockbrain:
      enabled: true
      models:
        - mock-1
${extraYaml}telemetry:
  enabled: false
`,
    "utf8",
  );
  return dir;
}

const CAPABILITY_YAML = `research:
  capabilities:
    - name: sources
      sources:
        - { kind: local, path: "./sources" }
      fencing: untrusted
      maxItems: 8
`;

const DENY_YAML = `policy:
  rules:
    - id: no-research-indexing
      principalKinds: [research]
      domain: research.index
      scope: "*"
      effect: deny
      rationale: "this workspace never indexes"
`;

const PROMPT_YAML = `policy:
  rules:
    - id: approve-indexing
      principalKinds: [research]
      domain: research.index
      scope: "*"
      effect: prompt
      gateLabel: "Approve indexing for this question?"
      rationale: "human authority checkpoint"
`;

describe("`vae ai models` — the capability matrix (read-only)", () => {
  test("--json is a single pure line; nothing is invoked; directory untouched", async () => {
    const dir = await freshDir("models");
    const before = await snapshotDir(dir);
    const { captured, io } = captureIo();
    const code = await runCode(["ai", "models", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    expect(captured.out).toHaveLength(1);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    expect(payload["command"]).toBe("ai");
    expect(payload["kind"]).toBe("models");
    const matrix = payload["matrix"] as Array<Record<string, unknown>>;
    expect(matrix.length).toBeGreaterThan(0);
    expect(matrix.some((m) => m["provider"] === "mockbrain")).toBe(true);
    expect(typeof payload["read_only"]).toBe("string");
    const after = await snapshotDir(dir);
    expect(after.size).toBe(before.size);
    for (const [k, v] of before) expect(after.get(k)).toBe(v);
  });

  test("arguments are refused (E1600, exit 2)", async () => {
    const dir = await freshDir("models-usage");
    const { captured, io } = captureIo();
    const code = await runCode(["ai", "models", "extra"], io, dir);
    expect(code).toBe(ExitCode.usage);
    expect(captured.lines.join("\n")).toContain("E1600");
  });
});

describe("`vae ai ask` — the grounded question (Phase 4)", () => {
  test("happy path: journaled pipeline → single-gate answer → receipt", async () => {
    const dir = await makeWorkspace("ask");
    const { captured, io } = captureIo();
    const code = await runCode(["ai", "ask", "--question", "deterministic replay journal", "--sources", "./sources", "--seed", "7", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    expect(captured.out).toHaveLength(1);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    expect(payload["command"]).toBe("ai");
    expect(payload["kind"]).toBe("ask");
    expect(typeof payload["answer"]).toBe("string");
    expect(String(payload["answer"]).length).toBeGreaterThan(0);
    expect(payload["model"]).toBe("mockbrain/mock-1");
    expect(payload["provider"]).toBe("mockbrain");
    const grounded = payload["grounded"] as Record<string, unknown>;
    expect(grounded["documents"]).toBe(2);
    expect(grounded["capability"]).toBe("ai-declared");
    expect(typeof grounded["pack_fingerprint"]).toBe("string");
    const citations = payload["citations"] as Array<Record<string, unknown>>;
    expect(citations.length).toBeGreaterThan(0);
    expect(citations[0]?.["source_path"]).toBeTruthy();
    const metering = payload["metering"] as Record<string, unknown>;
    expect(metering["invocations"]).toBe(1);
    expect(payload["journal_verified"]).toBe(true);
    expect(payload["receipt"]).toBeTruthy();

    // The journal carries the full constitutional path.
    const journal = await readJournal(RunHarness.journalPathFor(dir, String(payload["run_id"])));
    const types = journal.records.filter((r) => r.k === "evt").map((r) => (r.k === "evt" ? r.env.type : ""));
    expect(types).toContain("research.capability.declared");
    expect(types).toContain("research.source.fetched");
    expect(types).toContain("research.evidence.recorded");
    expect(types).toContain("research.context.prepared");
    expect(types).toContain("gateway.invoke.recorded");
    // Attribution: research principal on context steps, human on the invocation.
    const ctxEvent = journal.records.find((r) => r.k === "evt" && r.env.type === "research.context.prepared");
    if (ctxEvent?.k === "evt") expect(ctxEvent.env.actor.kind).toBe("research");
    const gwEvent = journal.records.find((r) => r.k === "evt" && r.env.type === "gateway.invoke.recorded");
    if (gwEvent?.k === "evt") {
      expect(gwEvent.env.actor.kind).toBe("human");
      expect(gwEvent.env.actor.id).toBe("human");
    }
  });

  test("answer determinism: identical workspaces + seed yield identical answers", async () => {
    const dirA = await makeWorkspace("det-a");
    const dirB = await makeWorkspace("det-b");
    const a = captureIo();
    expect(await runCode(["ai", "ask", "--question", "deterministic replay journal", "--sources", "./sources", "--seed", "11", "--json"], a.io, dirA)).toBe(ExitCode.ok);
    const b = captureIo();
    expect(await runCode(["ai", "ask", "--question", "deterministic replay journal", "--sources", "./sources", "--seed", "11", "--json"], b.io, dirB)).toBe(ExitCode.ok);
    const pa = JSON.parse(a.captured.out[0] as string) as Record<string, unknown>;
    const pb = JSON.parse(b.captured.out[0] as string) as Record<string, unknown>;
    // The answer is a pure function of content + seed: byte-identical across
    // workspaces. The pack FINGERPRINT is not — it carries retrieval-time
    // provenance by law (P8), which is metadata, never prompt material.
    expect(pb["answer"]).toBe(pa["answer"]);
    expect((pb["grounded"] as Record<string, unknown>)["blocks"]).toBe((pa["grounded"] as Record<string, unknown>)["blocks"]);
    expect((pb["grounded"] as Record<string, unknown>)["documents"]).toBe((pa["grounded"] as Record<string, unknown>)["documents"]);
  });

  test("a declared capability (--capability) drives the same pipeline", async () => {
    const dir = await makeWorkspace("capability", CAPABILITY_YAML);
    const { captured, io } = captureIo();
    const code = await runCode(["ai", "ask", "--question", "permission broker fail-closed", "--capability", "sources", "--seed", "3", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    expect((payload["grounded"] as Record<string, unknown>)["capability"]).toBe("sources");
  });

  test("unknown capability is a usage error (E1600, exit 2) that names the declared set", async () => {
    const dir = await makeWorkspace("capability-unknown", CAPABILITY_YAML);
    const { captured, io } = captureIo();
    const code = await runCode(["ai", "ask", "--question", "q", "--capability", "nope", "--json"], io, dir);
    expect(code).toBe(ExitCode.usage);
    const text = captured.lines.join("\n");
    expect(text).toContain("E1600");
    expect(text).toContain("sources"); // the declared capability is named in the fix path
  });

  test("missing --question and missing sources are usage errors (E1600, exit 2)", async () => {
    const dir = await freshDir("usage");
    const a = captureIo();
    expect(await runCode(["ai", "ask", "--sources", "./sources", "--json"], a.io, dir)).toBe(ExitCode.usage);
    const b = captureIo();
    expect(await runCode(["ai", "ask", "--question", "q", "--json"], b.io, dir)).toBe(ExitCode.usage);
    expect(b.captured.lines.join("\n")).toContain("--sources");
  });

  test("--dry-run is pure: side_effects 0 and the directory is byte-identical", async () => {
    const dir = await makeWorkspace("dryrun");
    const before = await snapshotDir(dir);
    const { captured, io } = captureIo();
    const code = await runCode(["ai", "ask", "--question", "q", "--sources", "./sources", "--dry-run", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    expect(payload["dry_run"]).toBe(true);
    expect(payload["side_effects"]).toBe(0);
    expect((payload["plan"] as Record<string, unknown>)["documents_found"]).toBe(2);
    const after = await snapshotDir(dir);
    expect(after.size).toBe(before.size);
    for (const [k, v] of before) expect(after.get(k)).toBe(v);
  });

  test("deny law: a config deny rule stops the ask (exit 3, journaled denial)", async () => {
    const dir = await makeWorkspace("deny", DENY_YAML);
    const { io } = captureIo();
    const code = await runCode(["ai", "ask", "--question", "q", "--sources", "./sources", "--json"], io, dir);
    expect(code).toBe(ExitCode.brokerDenied);
    // The denial is a first-class journaled fact (D-L): the decision record
    // exists with its deny kind, and the run closed with a receipt.
    const { readdir } = await import("node:fs/promises");
    const journals = (await readdir(join(dir, ".vaerion", "journal"))).filter((f) => f.endsWith(".ndjson"));
    expect(journals.length).toBe(1);
    const journal = await readJournal(join(dir, ".vaerion", "journal", journals[0] as string));
    const denyDecision = journal.records.find((r) => r.k === "decision" && r.decision.decision.kind === "deny");
    expect(denyDecision).toBeDefined();
    if (denyDecision?.k === "decision") {
      expect(denyDecision.decision.domain).toBe("research.index");
    }
    const receipt = journal.records.find((r) => r.k === "receipt");
    expect(receipt).toBeDefined();
  });

  test("human authority: a prompt policy pauses with a durable gate (exit 0, awaiting)", async () => {
    const dir = await makeWorkspace("prompt", PROMPT_YAML);
    const { captured, io } = captureIo();
    const code = await runCode(["ai", "ask", "--question", "q", "--sources", "./sources", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    expect(payload["awaiting"]).toBe(true);
    expect(payload["run_id"]).toBeTruthy();
    expect(String(payload["hint"])).toContain("vae resume");
  });

  test("surface law: `ai` alone and unknown subcommands are usage errors", async () => {
    const dir = await freshDir("surface");
    const a = captureIo();
    expect(await runCode(["ai"], a.io, dir)).toBe(ExitCode.usage);
    expect(a.captured.lines.join("\n")).toContain("E1600");
    const b = captureIo();
    expect(await runCode(["ai", "vibes"], b.io, dir)).toBe(ExitCode.usage);
  });

  test("help purity: `vae ai --help` teaches and never executes", async () => {
    const dir = await freshDir("help");
    const { captured, io } = captureIo();
    const code = await runCode(["ai", "--help"], io, dir);
    expect(code).toBe(ExitCode.ok);
    const text = captured.lines.join("\n");
    expect(text).toContain("vae ai ask");
    expect(text).toContain("gateway SINGLE GATE");
    expect(text).not.toContain("command: ai");
  });

  test("rich face (TTY): grounded panels render in the design language", async () => {
    const dir = await makeWorkspace("rich");
    const prevUi = process.env.VAE_UI;
    process.env.VAE_UI = "rich";
    try {
      const { captured, io } = captureIo(true, 100);
      const code = await runCode(["ai", "ask", "--question", "deterministic replay", "--sources", "./sources", "--seed", "5"], io, dir);
      expect(code).toBe(ExitCode.ok);
      const text = captured.lines.join("\n");
      expect(text).toContain("Answer");
      expect(text).toContain("Metering");
    } finally {
      if (prevUi === undefined) delete process.env.VAE_UI;
      else process.env.VAE_UI = prevUi;
    }
  });

  test("security canary: secret-shaped material in sources reaches no output face", async () => {
    const CANARY = "sk-canary-NEVER-LEAK-9f3a";
    const dir = await makeWorkspace("canary");
    await writeFile(join(dir, "sources", "secret-doc.md"), `# Secret\n\ntoken: ${CANARY}\n`, "utf8");
    for (const argv of [["ai", "ask", "--question", "token", "--sources", "./sources", "--seed", "1", "--json"], ["ai", "models", "--json"]]) {
      const { captured, io } = captureIo();
      const code = await runCode(argv as string[], io, dir);
      expect(code).toBe(ExitCode.ok);
      expect(captured.lines.join("\n")).not.toContain(CANARY);
    }
  });
});
