/**
 * Vaerion MS-2 — broker engine, permission-graph ceiling, refusal log,
 * and config policy files. Deterministic by construction: fixed clock,
 * seeded ids, no network. Every assertion pins a constitutional property.
 */

import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FixedClock } from "../../src/kernel/clock.ts";
import { GENESIS_HASH } from "../../src/kernel/hash.ts";
import { VaerionError, type ErrorCode } from "../../src/kernel/errors.ts";
import { validateConfig, policyFromConfig, type VaerionConfig } from "../../src/config/config.ts";
import { BrokerEngine, graphCovers, graphFromConfig } from "../../src/broker/engine.ts";
import { RefusalLogWriter, readRefusalHead, readRefusals, verifyRefusalLog, refusalFromBody } from "../../src/broker/refusal-log.ts";
import { buildGraph } from "../../src/broker/contracts/permission-graph.ts";
import { renderUnified } from "../../src/broker/contracts/review-diff.ts";
import type { DecisionRequest, BrokerDecision, BrokerDecisionRecord, PolicyContract } from "../../src/broker/contracts/decision.ts";
import type { Principal } from "../../src/broker/contracts/principal.ts";

const T0 = 1735689600000;
const clock = new FixedClock(T0);

const HUMAN: Principal = { kind: "human", id: "local-user" };
const AGENT: Principal = { kind: "agent", id: "agent_01" };

function expectCodeSync(fn: () => unknown, code: ErrorCode): void {
  try {
    fn();
    expect.unreachable();
  } catch (err) {
    expect((err as VaerionError).code).toBe(code);
  }
}

function expectDeny(d: { decision: BrokerDecision }, code: "E1300" | "E1301"): Extract<BrokerDecision, { kind: "deny" }> {
  if (d.decision.kind !== "deny") throw new Error(`expected deny, got ${d.decision.kind}`);
  expect(d.decision.reason_code).toBe(code);
  return d.decision;
}

function expectPrompt(d: { decision: BrokerDecision }): Extract<BrokerDecision, { kind: "prompt" }> {
  if (d.decision.kind !== "prompt") throw new Error(`expected prompt, got ${d.decision.kind}`);
  return d.decision;
}

function req(over: Partial<DecisionRequest> = {}): DecisionRequest {
  return {
    request_id: "req_01",
    principal: AGENT,
    domain: "fs.read",
    scope: "/ws/docs/a.md",
    action: { target: "/ws/docs/a.md" },
    intent: "read the document for summarization",
    ...over,
  };
}

const POLICY: PolicyContract = {
  policy_id: "p_unit",
  version: 1,
  rules: [
    { id: "deny-secrets", principalKinds: ["agent"], domain: "secret.read", scope: "*", effect: "deny", rationale: "agents never read secrets" },
    { id: "allow-agent-read", principalKinds: ["agent"], domain: "fs.read", scope: "/ws/**", effect: "allow", rationale: "agent may read workspace docs" },
    { id: "prompt-net", principalKinds: "all", domain: "net.connect", scope: "*", effect: "prompt", gateLabel: "net needs human", rationale: "network is human-gated" },
  ],
};

/* ──────────────────────  BrokerEngine (evaluation law)  ────────────────────── */

describe("BrokerEngine", () => {
  test("first matching rule wins; prompt rules carry gate labels", () => {
    const engine = new BrokerEngine({ policy: POLICY });
    const allow = engine.evaluate(req());
    expect(allow.decision.kind).toBe("allow");
    expect(allow.decision.policy).toBe("allow-agent-read");
    expect(allow.authority).toBe("allow-agent-read");

    const prompt = engine.evaluate(req({ domain: "net.connect", scope: "example.com", intent: "fetch declared host" }));
    expect(expectPrompt(prompt).reason).toBe("net needs human");
  });

  test("fail-closed: no matching rule denies with E1301", () => {
    const engine = new BrokerEngine({ policy: POLICY });
    const d = engine.evaluate(req({ domain: "exec.run", scope: "rm -rf /", intent: "why not" }));
    expectDeny(d, "E1301");
  });

  test("un-evaluable requests deny fail-closed (E1301), never throw", () => {
    const engine = new BrokerEngine({ policy: POLICY });
    for (const bad of [
      req({ intent: "" }),
      req({ intent: "   " }),
      req({ request_id: "" }),
      req({ scope: "" }),
      { ...req(), principal: undefined } as unknown as DecisionRequest,
    ]) {
      expectDeny(engine.evaluate(bad), "E1301");
    }
  });

  test("empty policy = deny everything (fail-closed by construction)", () => {
    const engine = new BrokerEngine({ policy: { policy_id: "empty", version: 1, rules: [] } });
    const d = engine.evaluate(req({ principal: HUMAN }));
    expectDeny(d, "E1301");
  });

  test("permission-graph ceiling: no grant refuses even a policy allow (E1300)", () => {
    const graph = buildGraph({
      graph_id: "g1",
      narrows: null,
      nodes: [{ id: "human", kind: "human" }],
      edges: [],
      capabilities: {},
    });
    const engine = new BrokerEngine({ policy: POLICY, graph });
    const d = engine.evaluate(req()); // policy would allow, ceiling has no agent grants
    expectDeny(d, "E1300");
    expect(d.ceiling.enforced).toBe(true);
    expect(d.ceiling.ok).toBe(false);
  });

  test("permission-graph ceiling: covered grants let policy decide", () => {
    const graph = buildGraph({
      graph_id: "g2",
      narrows: null,
      nodes: [
        { id: "human", kind: "human" },
        { id: "agent_01", kind: "agent" },
      ],
      edges: [{ from: "agent_01", to: "cap_fs" }],
      capabilities: { cap_fs: { domain: "fs.read", scopes: ["/ws/**"] } },
    });
    const engine = new BrokerEngine({ policy: POLICY, graph });
    const d = engine.evaluate(req());
    expect(d.ceiling.enforced).toBe(true);
    expect(d.ceiling.ok).toBe(true);
    expect(d.decision.kind).toBe("allow");
  });

  test("graphCovers: scope patterns match exactly, /**, and /*", () => {
    const graph = buildGraph({
      graph_id: "g3",
      narrows: null,
      nodes: [{ id: "agent_01", kind: "agent" }],
      edges: [
        { from: "agent_01", to: "cap_a" },
        { from: "agent_01", to: "cap_b" },
        { from: "agent_01", to: "cap_c" },
      ],
      capabilities: {
        cap_a: { domain: "fs.read", scopes: ["/ws/**"] },
        cap_b: { domain: "fs.read", scopes: ["/tmp/*"] },
        cap_c: { domain: "fs.read", scopes: ["/etc/vaerion.yaml"] },
      },
    });
    expect(graphCovers(graph, "agent_01", "fs.read", "/ws/deep/nested/file.md").ok).toBe(true);
    expect(graphCovers(graph, "agent_01", "fs.read", "/tmp/one.md").ok).toBe(true);
    expect(graphCovers(graph, "agent_01", "fs.read", "/tmp/sub/one.md").ok).toBe(false);
    expect(graphCovers(graph, "agent_01", "fs.read", "/etc/vaerion.yaml").ok).toBe(true);
    expect(graphCovers(graph, "agent_01", "net.connect", "example.com").ok).toBe(false);
    expect(graphCovers(graph, "nobody", "fs.read", "/ws").ok).toBe(false);
  });
});

/* ───────────────────  graphFromConfig (vaerion.yaml ceilings)  ─────────────────── */

describe("graphFromConfig", () => {
  const baseConfig: VaerionConfig = validateConfig({
    schemaVersion: "0.1",
    project: { name: "unit" },
    permissions: { net: { allowHosts: ["example.com"] }, exec: { allowCommands: ["bun"] } },
    research: { capabilities: [{ name: "docs", sources: [{ kind: "local", path: "./docs" }], fencing: "untrusted" }] },
    telemetry: { enabled: false },
  });

  test("human holds the config ceilings; run principals get explicit grants", () => {
    const graph = graphFromConfig(baseConfig, "g_cfg", [
      { principalId: "research:run1", domain: "research.index", scopes: ["./docs"] },
    ]);
    expect(graphCovers(graph, "human", "fs.read", "/anywhere").ok).toBe(true);
    expect(graphCovers(graph, "human", "net.connect", "example.com").ok).toBe(true);
    expect(graphCovers(graph, "human", "exec.run", "bun").ok).toBe(true); // the human holds every declared ceiling
    expect(graphCovers(graph, "human", "research.index", "./docs").ok).toBe(true);
    expect(graphCovers(graph, "research:run1", "research.index", "./docs").ok).toBe(true);
    expect(graphCovers(graph, "research:run1", "research.index", "../secrets").ok).toBe(false);
    expect(graphCovers(graph, "research:run1", "fs.write", "/ws").ok).toBe(false);
  });

  test("an extra grant exceeding a DECLARED ceiling is refused loudly (E1300); undeclared domains follow the human's declaration", () => {
    expectCodeSync(
      () => graphFromConfig(baseConfig, "g_bad", [{ principalId: "agent_x", domain: "net.connect", scopes: ["evil.example.net"] }]),
      "E1300",
    );
    // research.index is declared (./docs): an uncovered path is refused.
    expectCodeSync(
      () => graphFromConfig(baseConfig, "g_bad2", [{ principalId: "research:r", domain: "research.index", scopes: ["../secrets"] }]),
      "E1300",
    );
    // fs.write is NOT declared anywhere: the human's explicit declaration creates it.
    const graph = graphFromConfig(baseConfig, "g_new", [{ principalId: "agent_w", domain: "fs.write", scopes: ["/ws/out"] }]);
    expect(graphCovers(graph, "agent_w", "fs.write", "/ws/out").ok).toBe(true);
    expect(graphCovers(graph, "human", "fs.write", "/ws/out").ok).toBe(true); // the human declared it
  });
});

/* ───────────────────────  config policy files (MS-2)  ─────────────────────── */

describe("config policy block", () => {
  test("declared rules load and precede structural defaults in policyFromConfig", () => {
    const config = validateConfig({
      schemaVersion: "0.1",
      project: { name: "unit" },
      policy: {
        rules: [
          { id: "deny-agent-net", principalKinds: ["agent"], domain: "net.connect", scope: "*", effect: "deny", rationale: "no network for agents" },
          { id: "prompt-agent-exec", domain: "exec.run", scope: "*", effect: "prompt", gateLabel: "exec needs human", rationale: "human gates execution" },
        ],
      },
      telemetry: { enabled: false },
    });
    const policy = policyFromConfig(config);
    expect(policy.rules[0]!.id).toBe("deny-agent-net");
    expect(policy.rules[1]!.id).toBe("prompt-agent-exec");
    expect(policy.rules[1]!.principalKinds).toBe("all"); // default when omitted
    // structural defaults still present after the declared rules
    expect(policy.rules.some((r) => r.id === "human-fs-read-allow")).toBe(true);

    // Evaluation: the declared deny outranks the CLI-declared allow.
    const engine = new BrokerEngine({ policy: policy });
    const d = engine.evaluate(req({ domain: "net.connect", scope: "example.com", intent: "fetch" }));
    expect(d.decision.kind).toBe("deny");
    const p = engine.evaluate(req({ domain: "exec.run", scope: "bun test", intent: "run tests" }));
    expect(p.decision.kind).toBe("prompt");
  });

  test("invalid policy rules are rejected loudly", () => {
    const mk = (rules: unknown): Record<string, unknown> => ({
      schemaVersion: "0.1",
      project: { name: "unit" },
      policy: { rules },
      telemetry: { enabled: false },
    });
    expectCodeSync(() => validateConfig(mk([{ id: "r", domain: "fs.read", scope: "*", effect: "allow" }])), "E1202"); // no rationale
    expectCodeSync(() => validateConfig(mk([{ id: "r", domain: "fs.read", scope: "*", effect: "maybe", rationale: "x" }])), "E1202");
    expectCodeSync(() => validateConfig(mk([{ id: "r", domain: "fs.read", scope: "*", effect: "allow", rationale: "x", extra: 1 }])), "E1202");
    expectCodeSync(() => validateConfig(mk([{ id: "r", domain: "fs.read", scope: "*", effect: "allow", rationale: "x", principalKinds: ["wizard"] }])), "E1202");
    expectCodeSync(() => validateConfig(mk("not-an-array")), "E1202");
    expectCodeSync(() => validateConfig({ ...mk([]), policy: { bogus: 1 } }), "E1201");
  });
});

/* ───────────────────────────────  Refusal Log  ─────────────────────────────── */

function denyRecord(over: Partial<BrokerDecisionRecord> = {}): BrokerDecisionRecord {
  return {
    decision_id: `dec_${over.request_id ?? "01"}`,
    request_id: over.request_id ?? "req_01",
    run_id: over.run_id ?? "run_unit",
    trace_id: "t_unit",
    principal: AGENT,
    domain: "fs.read",
    scope: "/etc/shadow",
    intent: "read the file",
    decision: { kind: "deny", reason_code: "E1300", reason: "agents never read secrets", policy: "deny-secrets" },
    decided_at: clock.nowIso(),
    ...over,
  };
}

describe("RefusalLogWriter", () => {
  test("append → verify chain → read back (filter by run)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vae-refusal-"));
    try {
      const path = join(dir, ".vaerion", "refusals.log");
      const w = await RefusalLogWriter.open(path, null, clock);
      await w.append({ runId: "run_a", record: denyRecord({ request_id: "r1", decision_id: "d1", run_id: "run_a" }) });
      await w.append({ runId: "run_a", record: denyRecord({ request_id: "r2", decision_id: "d2", run_id: "run_a", decision: { kind: "deny", reason_code: "E1301", reason: "no rule matched", policy: "p:default-deny" } }) });
      await w.append({ runId: "run_b", record: denyRecord({ request_id: "r3", decision_id: "d3", run_id: "run_b" }) });
      await w.close();

      const report = await verifyRefusalLog(path);
      expect(report.ok).toBe(true);
      expect(report.entries).toBe(3);
      expect(report.head).not.toBeNull();

      const all = await readRefusals(path);
      expect(all).toHaveLength(3);
      expect(all[0]!.reason_code).toBe("E1300");
      expect(all[1]!.reason_code).toBe("E1301");
      const onlyA = await readRefusals(path, { runId: "run_a" });
      expect(onlyA).toHaveLength(2);
      const limited = await readRefusals(path, { limit: 1 });
      expect(limited).toHaveLength(1);
      expect(limited[0]!.decision_id).toBe("d3");

      // Cross-session chaining: reopening continues the same chain.
      const head = await readRefusalHead(path);
      expect(head).toEqual({ i: 3, head: report.head! });
      const w2 = await RefusalLogWriter.open(path, head, clock);
      await w2.append({ runId: "run_c", record: denyRecord({ request_id: "r4", decision_id: "d4", run_id: "run_c" }) });
      await w2.close();
      const report2 = await verifyRefusalLog(path);
      expect(report2.ok).toBe(true);
      expect(report2.entries).toBe(4);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("only deny decisions are refusals (allow/prompt refused loudly, E1304)", () => {
    const allowRec = { ...denyRecord(), decision: { kind: "allow" as const, policy: "p" } };
    expectCodeSync(() => refusalFromBody({ runId: "r", record: allowRec as BrokerDecisionRecord }), "E1304");
  });

  test("tamper evidence: a byte flip breaks the chain LOUDLY (P9)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vae-refusal-tamper-"));
    try {
      const path = join(dir, "refusals.log");
      const w = await RefusalLogWriter.open(path, null, clock);
      await w.append({ runId: "run_a", record: denyRecord({ request_id: "r1", decision_id: "d1", run_id: "run_a" }) });
      await w.append({ runId: "run_a", record: denyRecord({ request_id: "r2", decision_id: "d2", run_id: "run_a" }) });
      await w.close();

      const raw = await readFile(path, "utf8");
      const tampered = raw.replace("agents never read secrets", "agents ALWAYS read secrets");
      await writeFile(path, tampered, "utf8");
      const report = await verifyRefusalLog(path);
      expect(report.ok).toBe(false);
      expect(report.firstBrokenIndex).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("unparseable line and missing file are reported honestly", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vae-refusal-junk-"));
    try {
      const path = join(dir, "refusals.log");
      await writeFile(path, "{not json}\n", "utf8");
      const report = await verifyRefusalLog(path);
      expect(report.ok).toBe(false);
      expect(report.message).toContain("unparseable refusal line 1");

      const missing = await verifyRefusalLog(join(dir, "absent.log"));
      expect(missing.ok).toBe(true);
      expect(missing.entries).toBe(0);

      const w = await RefusalLogWriter.open(join(dir, "none.log"), null, clock);
      try {
        await w.append({ runId: "x", record: null as unknown as BrokerDecisionRecord });
        expect.unreachable();
      } catch (err) {
        expect((err as VaerionError).code).toBe("E1304");
      }
      await w.close();
      expect(await readRefusals(join(dir, "none.log"))).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/* ───────────────────────────────  review diffs  ─────────────────────────────── */

describe("review diff rendering (human review surface)", () => {
  test("renderUnified produces a deterministic unified diff", () => {
    const rendered = renderUnified({
      diff_id: "diff_01",
      run_id: "run_unit",
      trace_id: "t_unit",
      op: "modify",
      target: "/ws/config.yaml",
      hunks: [
        {
          oldStart: 1,
          oldLines: 2,
          newStart: 1,
          newLines: 2,
          lines: [
            { tag: "-", text: "telemetry: enabled" },
            { tag: "+", text: "telemetry: enabled: false" },
            { tag: " ", text: "project:" },
          ],
        },
      ],
    });
    const expected = "--- /ws/config.yaml\n+++ /ws/config.yaml\n@@ -1,2 +1,2 @@\n-telemetry: enabled\n+telemetry: enabled: false\n project:\n";
    expect(rendered).toBe(expected);
    expect(renderUnified({
      diff_id: "d2", run_id: "r", trace_id: "t", op: "create", target: "/ws/new",
      hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: [{ tag: "+", text: "hello" }] }],
    })).toContain("--- /dev/null");
  });
});

describe("genesis sanity (chain primitives)", () => {
  test("genesis hash is 64 zeros (shared with refusal/audit chains)", () => {
    expect(GENESIS_HASH).toBe("0".repeat(64));
  });
});
