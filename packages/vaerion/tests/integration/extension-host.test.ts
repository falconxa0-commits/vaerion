/**
 * Extension host (MS-5, ADR-0009 R-2) — the law under test:
 *
 *   - digest pinning: a mismatched artifact is NEVER executed (E2100);
 *   - declared-before-used: undeclared extensions never get an executor (E2101);
 *   - the broker bridge: the extension's host calls are decide→journal→act
 *     with the EXTENSION as principal (allow / deny / prompt- refusal);
 *   - fail-closed protocol: malformed frames, wrong worlds, premature exits,
 *     unsolicited results, oversized lines — every violation kills the
 *     process (E2102); timeouts kill (E2103); spawn failures are honest
 *     (E2104);
 *   - everything is journaled: extension.spawned/exited + the tool pipeline.
 *
 * Fixture extensions are generated at test time as pinned executable
 * artifacts (bun scripts) speaking the published world
 * (spec/wit/vaerion-extension@0.1.0.wit) over stdio NDJSON.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { RunHarness } from "../../src/runtime/run.ts";
import { ToolInvocationService, echoTool, clockReadTool, type ToolExecutor } from "../../src/agents/tools.ts";
import { ToolRegistry } from "../../src/agents/tools.ts";
import { AgentRuntime } from "../../src/agents/runtime.ts";
import { InlinePlanner, type PlanStep } from "../../src/agents/planner.ts";
import { createExtensionTool } from "../../src/extensions/factory.ts";
import { verifyArtifactPin, type BuiltinBinding } from "../../src/extensions/host.ts";
import { readJournal } from "../../src/journal/reader.ts";
import { readRefusals } from "../../src/broker/refusal-log.ts";
import { validateConfig, policyFromConfig, type VaerionConfig } from "../../src/config/config.ts";
import { graphFromConfig } from "../../src/broker/engine.ts";
import { agentGrants, extensionGrants } from "../../src/agents/grants.ts";
import { SystemClock, SystemRng } from "../../src/kernel/clock.ts";
import { SystemIdGen, crn } from "../../src/kernel/ids.ts";
import { BlobStore } from "../../src/store/blob-cas.ts";
import type { ExtensionConfig } from "../../src/config/config.ts";

const workspaces: string[] = [];
afterAll(async () => {
  for (const ws of workspaces) await rm(ws, { recursive: true, force: true }).catch(() => undefined);
});

/* ── fixture extension sources (speak the published world) ── */

const READY = JSON.stringify({ type: "ready", v: 1, world: "vaerion:extension@0.1.0" });
// The host executes artifacts with an EMPTY environment (ADR-0009: no ambient
// powers) — there is no PATH, so fixture shebangs use the absolute interpreter.
const SHEBANG = `#!${process.execPath}`;

/** Computes {squared} from {n} — no host calls. */
const PURE_SRC = [
  SHEBANG,
  `process.stdout.write(JSON.stringify(${READY}) + "\\n");`,
  'let buf = "";',
  "process.stdin.setEncoding(\"utf8\");",
  "process.stdin.on(\"data\", (chunk: string) => {",
  "  buf += chunk; let i;",
  '  while ((i = buf.indexOf("\\n")) !== -1) {',
  "    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);",
  "    if (!line) continue;",
  "    const f = JSON.parse(line);",
  '    if (f.type === "invoke") {',
  "      const n = typeof f.args.n === \"number\" ? f.args.n : 0;",
  '      process.stdout.write(JSON.stringify({ type: "result", call_id: f.call_id, ok: true, value: { squared: n * n } }) + "\\n");',
  "    }",
  "  }",
  "});",
].join("\n") + "\n";

/** Bridges to a builtin tool (HOST_TOOL) then reports the outcome. */
function hostcallSrc(hostTool: string): string {
  return [
    SHEBANG,
    `process.stdout.write(JSON.stringify(${READY}) + "\\n");`,
    'let buf = "";',
    "let invokeId = \"\";",
    "process.stdin.setEncoding(\"utf8\");",
    "process.stdin.on(\"data\", (chunk: string) => {",
    "  buf += chunk; let i;",
    '  while ((i = buf.indexOf("\\n")) !== -1) {',
    "    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);",
    "    if (!line) continue;",
    "    const f = JSON.parse(line);",
    '    if (f.type === "invoke") {',
    "      invokeId = f.call_id;",
    '      process.stdout.write(JSON.stringify({ type: "host", call_id: f.call_id + ":h1", host_fn: "tool.call", tool: ' + JSON.stringify(hostTool) + ', args: { value: f.args.value } }) + "\\n");',
    "    } else if (f.type === \"result\" && typeof f.call_id === \"string\" && f.call_id.endsWith(\":h1\")) {",
    "      const value = f.ok === true ? { echoed: (f.value && f.value.echoed) ?? null } : { echoed: null, host_error: (f.error && f.error.code) ?? \"unknown\" };",
    '      process.stdout.write(JSON.stringify({ type: "result", call_id: invokeId, ok: true, value }) + "\\n");',
    "    }",
    "  }",
  "});",
  ].join("\n") + "\n";
}

const MALFORMED_SRC = SHEBANG + "\n" + 'process.stdout.write("this is not json at all\n");\n';
const WRONG_WORLD_SRC = SHEBANG + "\n" + 'process.stdout.write(JSON.stringify({ type: "ready", v: 1, world: "other:world@9.9" }) + "\\n");\n';
const EXIT_EARLY_SRC = SHEBANG + "\n" + "process.exit(3);\n";
const HANG_SRC = [
  SHEBANG,
  `process.stdout.write(JSON.stringify(${READY}) + "\\n");`,
  "setInterval(() => {}, 1000);",
].join("\n") + "\n";
const UNSOLICITED_SRC = [
  SHEBANG,
  `process.stdout.write(JSON.stringify(${READY}) + "\\n");`,
  'let buf = "";',
  "process.stdin.setEncoding(\"utf8\");",
  "process.stdin.on(\"data\", (chunk: string) => {",
  "  buf += chunk; let i;",
  '  while ((i = buf.indexOf("\\n")) !== -1) {',
  "    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);",
  "    if (!line) continue;",
  "    const f = JSON.parse(line);",
  '    if (f.type === "invoke") {',
  '      process.stdout.write(JSON.stringify({ type: "result", call_id: "bogus-call-id", ok: true, value: {} }) + "\\n");',
  "    }",
  "  }",
  "});",
].join("\n") + "\n";
const GIANT_SRC = [
  SHEBANG,
  `process.stdout.write(JSON.stringify(${READY}) + "\\n");`,
  'let buf = "";',
  "process.stdin.setEncoding(\"utf8\");",
  "process.stdin.on(\"data\", (chunk: string) => {",
  "  buf += chunk; let i;",
  '  while ((i = buf.indexOf("\\n")) !== -1) {',
  "    buf = buf.slice(i + 1);",
  '    process.stdout.write("x".repeat(1100000) + "\\n");',
  "  }",
  "});",
].join("\n") + "\n";

async function writeArtifact(ws: string, name: string, src: string): Promise<ExtensionConfig> {
  const path = join(ws, name);
  await writeFile(path, src, { mode: 0o755 });
  await chmod(path, 0o755);
  const digest = createHash("sha256").update(src).digest("hex");
  return { name, artifact: path, digest: `sha256:${digest}`, timeoutMs: 3000 };
}

function configFor(exts: ExtensionConfig[], extraRules: Array<Record<string, unknown>> = []): VaerionConfig {
  return validateConfig({
    schemaVersion: "0.1",
    project: { name: "ext-suite" },
    extensions: exts,
    policy: {
      rules: [
        { id: "agent-ext-allow", principalKinds: ["agent"], domain: "tool.call", scope: exts[0]?.name ?? "*", effect: "allow", rationale: "test" },
        { id: "agent-model-allow", principalKinds: ["agent"], domain: "model.invoke", scope: "mockbrain/mock-1", effect: "allow", rationale: "test" },
        ...extraRules,
      ],
    },
    telemetry: { enabled: false },
  });
}

interface Fixture {
  ws: string;
  harness: RunHarness;
  tools: ToolInvocationService;
  runId: string;
  /** The principal whose ceiling grants were derived — use it for invokes. */
  principal: { kind: "agent"; id: string };
  policy: ReturnType<typeof policyFromConfig>;
  cleanup: () => Promise<void>;
}

/** Compose the REAL pipeline (harness + broker + registry + extension executor). */
async function makeFixture(config: VaerionConfig, builtins: Array<[string, ToolExecutor, string]> = [["echo", echoTool, "echo"]]): Promise<Fixture> {
  const ws = await mkdtemp(join(tmpdir(), "vaerion-ext-"));
  workspaces.push(ws);
  await mkdir(join(ws, ".vaerion", "journal"), { recursive: true });
  await mkdir(join(ws, ".vaerion", "blobs"), { recursive: true });
  const clock = new SystemClock();
  const idGen = new SystemIdGen();
  const runId = crn("run", idGen.next());
  const traceId = `t_ext_${idGen.next().slice(-8).toLowerCase()}`;
  const policy = policyFromConfig(config);
  const principal = { kind: "agent" as const, id: `agent:${runId.slice(-8).toLowerCase()}` };
  const graph = graphFromConfig(config, "graph_ext", [...agentGrants(config, policy, principal), ...extensionGrants(config, policy)]);
  const harness = await RunHarness.create({ workspaceDir: ws, runId, traceId, configFingerprint: "ext-fixture", clock, idGen, permissionGraph: graph });
  const registry = new ToolRegistry(
    (config.extensions ?? []).map((e) => ({ name: e.name, scope: e.name, description: e.description ?? null })),
  );
  const executors = new Map<string, ToolExecutor>();
  const bindings = new Map<string, BuiltinBinding>();
  for (const [name, executor, scope] of builtins) bindings.set(name, { executor, scope });
  for (const ext of config.extensions ?? []) {
    executors.set(
      ext.name,
      createExtensionTool(ext, { host: harness, policy, graph, clock, idGen, builtins: bindings }),
    );
  }
  const tools = new ToolInvocationService({ clock, idGen, registry, executors, blobStore: new BlobStore(join(ws, ".vaerion", "blobs")) });
  return {
    ws,
    harness,
    tools,
    runId,
    principal,
    policy,
    cleanup: async () => {
      await harness.release().catch(() => undefined);
    },
  };
}

async function records(ws: string, runId: string): Promise<Array<Record<string, unknown>> & Array<{ k: string }>> {
  const read = await readJournal(join(ws, ".vaerion", "journal", `${runId}.ndjson`));
  return read.records as unknown as Array<Record<string, unknown>> & Array<{ k: string }>;
}

describe("extension host: pinning + declaration law", () => {
  test("a digest-mismatched artifact is NEVER executed (E2100)", async () => {
    const ws = await mkdtemp(join(tmpdir(), "vaerion-ext-pin-"));
    workspaces.push(ws);
    const path = join(ws, "evil-ext");
    await writeFile(path, PURE_SRC, { mode: 0o755 });
    const launch = { name: "evil", artifact: path, digest: `sha256:${"0".repeat(64)}`, timeoutMs: 2000 };
    try {
      await verifyArtifactPin(launch);
      expect.unreachable();
    } catch (err) {
      expect((err as { code?: string }).code).toBe("E2100");
      expect((err as Error).message).toContain("NOT executed");
    }
    const missing = { name: "gone", artifact: join(ws, "does-not-exist"), digest: `sha256:${"0".repeat(64)}` };
    try {
      await verifyArtifactPin(missing);
      expect.unreachable();
    } catch (err) {
      expect((err as { code?: string }).code).toBe("E2104");
    }
  });

  test("config law: extensions validate loudly (digest shape, collisions, args kinds)", () => {
    const base = { schemaVersion: "0.1", project: { name: "cfg" }, telemetry: { enabled: false } };
    expect(() => validateConfig({ ...base, extensions: [{ name: "x", artifact: "/a", digest: "md5:zz" }] })).toThrow(/sha256/);
    expect(() => validateConfig({ ...base, extensions: [{ name: "X", artifact: "/a", digest: `sha256:${"a".repeat(64)}` }] })).toThrow(/\^?\[a-z\]/);
    expect(() =>
      validateConfig({
        ...base,
        tools: [{ name: "dup" }],
        extensions: [{ name: "dup", artifact: "/a", digest: `sha256:${"a".repeat(64)}` }],
      }),
    ).toThrow(/collides/);
    expect(() =>
      validateConfig({
        ...base,
        extensions: [{ name: "x", artifact: "/a", digest: `sha256:${"a".repeat(64)}`, args: { n: "float" } }],
      }),
    ).toThrow(/unknown kind/);
    expect(() => validateConfig({ ...base, extensions: [{ name: "x", artifact: "/a", digest: `sha256:${"a".repeat(64)}`, mystery: 1 }] })).toThrow(/unknown extensions entry key/);
  });
});

describe("extension host: the broker bridge over the real pipeline", () => {
  test("pure extension: agent tool step completes; spawned/exited journaled", async () => {
    const wsDir = await mkdtemp(join(tmpdir(), "vaerion-ext-root-"));
    workspaces.push(wsDir);
    const pure = await writeArtifact(wsDir, "pure-ext", PURE_SRC);
    const fx = await makeFixture(configFor([{ ...pure, args: { n: "number" } }]));
    try {
      const result = await fx.tools.invoke(fx.harness, {
        tool: "pure-ext",
        args: { n: 7 },
        principal: fx.principal,
        policy: fx.policy,
        requestId: "req-1",
        intent: "extension fixture",
      });
      expect(result.ok).toBe(true);
      expect(result.result.squared).toBe(49);
      const recs = await records(fx.ws, fx.runId);
      const types = recs.filter((r) => r.k === "evt").map((r) => (r as { env: { type: string } }).env.type);
      expect(types).toContain("tool.call.requested");
      expect(types).toContain("extension.spawned");
      expect(types).toContain("extension.exited");
      expect(types).toContain("tool.call.completed");
      const spawned = recs.find((r) => r.k === "evt" && (r as { env: { type: string } }).env.type === "extension.spawned");
      expect(((spawned as { env: { payload: { digest: string } } }).env.payload.digest)).toBe(pure.digest);
    } finally {
      await fx.cleanup();
    }
  });

  test("host bridge allow: the EXTENSION is the decision principal; builtin runs", async () => {
    const wsDir = await mkdtemp(join(tmpdir(), "vaerion-ext-bridge-"));
    workspaces.push(wsDir);
    const bridge = await writeArtifact(wsDir, "bridge-ext", hostcallSrc("echo"));
    const config = configFor([{ ...bridge, args: { value: "string" } }], [
      { id: "ext-echo-allow", principalKinds: ["extension"], domain: "tool.call", scope: "echo", effect: "allow", rationale: "test" },
    ]);
    const fx = await makeFixture(config);
    try {
      const result = await fx.tools.invoke(fx.harness, {
        tool: "bridge-ext",
        args: { value: "through-the-bridge" },
        principal: fx.principal,
        policy: fx.policy,
        requestId: "req-2",
        intent: "bridge fixture",
      });
      expect(result.ok).toBe(true);
      expect(result.result.echoed).toBe("through-the-bridge");
      const recs = await records(fx.ws, fx.runId);
      const extDecision = recs.find(
        (r) => r.k === "decision" && ((r as { decision: { principal: { kind: string } } }).decision.principal.kind === "extension"),
      ) as { decision: { decision: { kind: string; policy: string } } } | undefined;
      expect(extDecision).toBeDefined();
      expect(extDecision?.decision.decision.kind).toBe("allow");
    } finally {
      await fx.cleanup();
    }
  });

  test("host bridge deny: refusal logged, extension receives the code, run completes", async () => {
    const wsDir = await mkdtemp(join(tmpdir(), "vaerion-ext-deny-"));
    workspaces.push(wsDir);
    const bridge = await writeArtifact(wsDir, "bridge-deny-ext", hostcallSrc("echo"));
    const config = configFor([{ ...bridge, args: { value: "string" } }]); // NO extension rule → structural fail-closed deny
    const fx = await makeFixture(config);
    try {
      const result = await fx.tools.invoke(fx.harness, {
        tool: "bridge-deny-ext",
        args: { value: "denied-path" },
        principal: fx.principal,
        policy: fx.policy,
        requestId: "req-3",
        intent: "deny fixture",
      });
      // The TOOL call succeeds (the extension handled the refusal); the
      // EXTENSION's power request was denied and journaled.
      expect(result.ok).toBe(true);
      expect(result.result.host_error).toBe("E1300");
      const refusals = await readRefusals(join(fx.ws, ".vaerion", "refusals.log"), {});
      const extRefusal = refusals.find((r) => r.principal?.kind === "extension");
      expect(extRefusal).toBeDefined();
      expect(extRefusal?.domain).toBe("tool.call");
    } finally {
      await fx.cleanup();
    }
  });

  test("unbridgeable host call: E1801 refusal to the child, no kill", async () => {
    const wsDir = await mkdtemp(join(tmpdir(), "vaerion-ext-unb-"));
    workspaces.push(wsDir);
    const bridge = await writeArtifact(wsDir, "bridge-nope-ext", hostcallSrc("definitely-not-a-builtin"));
    const config = configFor([{ ...bridge, args: { value: "string" } }], [
      { id: "ext-all-allow", principalKinds: ["extension"], domain: "tool.call", scope: "*", effect: "allow", rationale: "test" },
    ]);
    const fx = await makeFixture(config);
    try {
      const result = await fx.tools.invoke(fx.harness, {
        tool: "bridge-nope-ext",
        args: { value: "x" },
        principal: fx.principal,
        policy: fx.policy,
        requestId: "req-4",
        intent: "unbridgeable fixture",
      });
      expect(result.ok).toBe(true);
      expect(result.result.host_error).toBe("E1801");
    } finally {
      await fx.cleanup();
    }
  });
});

describe("extension host: fail-closed protocol law (adversarial)", () => {
  const cases: Array<{ name: string; src: string; code: string }> = [
    { name: "malformed-first-line", src: MALFORMED_SRC, code: "E2102" },
    { name: "wrong-world", src: WRONG_WORLD_SRC, code: "E2102" },
    { name: "exit-before-handshake", src: EXIT_EARLY_SRC, code: "E2102" },
    { name: "unsolicited-result", src: UNSOLICITED_SRC, code: "E2102" },
    { name: "oversized-frame", src: GIANT_SRC, code: "E2102" },
  ];

  for (const c of cases) {
    test(`${c.name} → ${c.code} (process killed, failure journaled)`, async () => {
      const wsDir = await mkdtemp(join(tmpdir(), `vaerion-ext-adv-`));
      workspaces.push(wsDir);
      const artifact = await writeArtifact(wsDir, `adv-${c.name}`, c.src);
      const config = configFor([{ ...artifact, timeoutMs: 3000 }]);
      const fx = await makeFixture(config);
      try {
        await fx.tools.invoke(fx.harness, {
          tool: artifact.name,
          args: {},
          principal: fx.principal,
          policy: fx.policy,
          requestId: `req-${c.name}`,
          intent: "adversarial fixture",
          // ToolInvocationService.invoke throws on executor failure — the
          // pipeline converts it to a failed step with the honest code.
        }).then(
          () => expect.unreachable(),
          (err) => expect((err as { code?: string }).code).toBe(c.code),
        );
        const recs = await records(fx.ws, fx.runId);
        const exited = recs.find((r) => r.k === "evt" && (r as { env: { type: string } }).env.type === "extension.exited") as { env: { payload: { failed?: boolean } } } | undefined;
        expect(exited?.env.payload.failed).toBe(true);
      } finally {
        await fx.cleanup();
      }
    });
  }

  test("hang → E2103 at the time budget", async () => {
    const wsDir = await mkdtemp(join(tmpdir(), "vaerion-ext-hang-"));
    workspaces.push(wsDir);
    const artifact = await writeArtifact(wsDir, "hang-ext", HANG_SRC);
    const config = configFor([{ ...artifact, timeoutMs: 500 }]);
    const fx = await makeFixture(config);
    try {
      await fx.tools.invoke(fx.harness, {
        tool: artifact.name,
        args: {},
        principal: fx.principal,
        policy: fx.policy,
        requestId: "req-hang",
        intent: "timeout fixture",
      }).then(
        () => expect.unreachable(),
        (err) => expect((err as { code?: string }).code).toBe("E2103"),
      );
    } finally {
      await fx.cleanup();
    }
  }, 20_000);
});

describe("extension host: the full agent loop", () => {
  test("an agent run uses the extension as a step and closes with a receipt", async () => {
    const wsDir = await mkdtemp(join(tmpdir(), "vaerion-ext-agent-"));
    workspaces.push(wsDir);
    const pure = await writeArtifact(wsDir, "agent-ext", PURE_SRC);
    const config = configFor([{ ...pure, args: { n: "number" } }]);
    const fx = await makeFixture(config);
    try {
      const clock = new SystemClock();
      const idGen = new SystemIdGen();
      const principal = fx.principal;
      const policy = fx.policy;
      const steps: PlanStep[] = [
        { kind: "note", text: "Use the extension. The spine carries everything." },
        { kind: "tool", tool: "agent-ext", args: { n: 9 } },
      ];
      const runtime = new AgentRuntime({ harness: fx.harness, clock, idGen, maxSteps: 8, gateway: null as never, tools: fx.tools, research: null, actor: principal });
      const result = await runtime.run({
        goal: "extension end-to-end",
        principal,
        policy,
        planner: new InlinePlanner({ goal: "extension end-to-end", steps }),
        budget: { tokensUsed: 0, microUsdUsed: 0 },
      });
      expect(result.outcome).toBe("goal");
      const closed = await fx.harness.close(`extension agent run: ${result.outcome}`);
      expect(closed.verify.ok).toBe(true);
      const recs = await records(fx.ws, fx.runId);
      expect(recs.some((r) => r.k === "receipt")).toBe(true);
      expect(recs.some((r) => r.k === "evt" && (r as { env: { type: string } }).env.type === "extension.spawned")).toBe(true);
    } finally {
      await fx.cleanup();
    }
  });
});
