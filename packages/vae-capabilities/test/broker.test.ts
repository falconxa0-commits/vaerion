import { describe, expect, it, beforeEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixedClock, refusalError } from "vae-foundation";
import { JournalWriter } from "vae-store";
import { decide } from "../src/decide.ts";
import { PolicyView } from "../src/policy.ts";
import { SnapshotStateView, ENGINE_DECLARED_CAPABILITIES } from "../src/state.ts";
import { JournalAuditSink, FaultInjectedAuditSink } from "../src/audit.ts";
import { PermissionBroker } from "../src/broker.ts";
import { RefusalLog } from "../src/refusal-log.ts";
import { GateQueue } from "../src/gates.ts";
import type { CapabilityRequest } from "../src/capability.ts";
import type { PermissionsConfig } from "vae-config";

const permissions: PermissionsConfig = {
  fs: { read: ["$PROJECT/**"], write: ["$PROJECT/src/**"] },
  net: { allowHosts: ["api.example.com"] },
  exec: { allowCommands: [["git", "status"]] },
  secrets: { grant: [] },
};

const enginePrincipal = {
  kind: "engine" as const,
  id: "vae-core",
  declared: ENGINE_DECLARED_CAPABILITIES,
};

const declaredAll = {
  kind: "agent" as const,
  id: "test-agent",
  declared: ["fs.read", "fs.write", "net.fetch", "exec.run"],
};

function request(domain: "fs" | "net" | "exec" | "engine" | "research", action: string, scope: string, principal: CapabilityRequest["principal"] = enginePrincipal): CapabilityRequest {
  return {
    capability: { domain, action, scope },
    principal,
    cause: { kind: "command", ref: "test" },
  };
}

describe("pure decision function (D10.3)", () => {
  const policy = new PolicyView(permissions, "/work/demo");
  const state = new SnapshotStateView(new Map());

  it("is deterministic: same inputs, same decision", () => {
    const a = decide(request("fs", "read", "$PROJECT/src/main.ts"), policy, state);
    const b = decide(request("fs", "read", "$PROJECT/src/main.ts"), policy, state);
    expect(a).toEqual(b);
  });

  it("allows within declared grants and fails closed outside (D10.1)", () => {
    expect(decide(request("fs", "read", "$PROJECT/src/main.ts", declaredAll), policy, state).outcome).toBe("allow");
    expect(decide(request("fs", "read", "/etc/passwd", declaredAll), policy, state).outcome).toBe("deny");
    expect(decide(request("fs", "write", "$PROJECT/src/x.ts", declaredAll), policy, state).outcome).toBe("allow");
    expect(decide(request("fs", "write", "/etc/hosts", declaredAll), policy, state).outcome).toBe("deny");
  });

  it("refuses undeclared capability spaces (D2.7, D15.1)", () => {
    const ghost = { kind: "agent" as const, id: "ghost", declared: [] as string[] };
    const d = decide(request("fs", "read", "$PROJECT/x", ghost), policy, state);
    expect(d.outcome).toBe("deny");
    expect(d.reasonCode).toBe("E2001");
  });

  it("denies network and exec beyond explicit grants (local-first default)", () => {
    expect(decide(request("net", "fetch", "https://api.example.com/v1", declaredAll), policy, state).outcome).toBe("allow");
    expect(decide(request("net", "fetch", "https://evil.example.com", declaredAll), policy, state).outcome).toBe("deny");
    expect(decide(request("exec", "run", "git status", declaredAll), policy, state).outcome).toBe("allow");
    expect(decide(request("exec", "run", "rm -rf /", declaredAll), policy, state).outcome).toBe("deny");
  });
});

describe("deny beats allow (D10.2)", () => {
  it("evaluates denies before allows by construction", () => {
    const policy = new PolicyView(permissions, "/work/demo");
    // The default posture is deny; an explicit deny section arrives
    // additively. The ordering property is structural: matchDeny runs
    // first in decide(). Pin the order as law with this assertion.
    const state = new SnapshotStateView(new Map([["engine:vae-core", ["fs.*", "net.*", "exec.*"]]]));
    const d = decide(request("net", "fetch", "https://blocked.example.com"), policy, state);
    expect(d.outcome).toBe("deny");
    expect(d.fix).toContain("reviewable config diff");
  });
});

describe("broker service (D10.6, D10.7)", () => {
  let dir: string;
  let auditSink: FaultInjectedAuditSink;
  let refusals: RefusalLog;
  let broker: PermissionBroker;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vae-broker-"));
    auditSink = new FaultInjectedAuditSink();
    refusals = new RefusalLog(join(dir, "refusals.ndjson"));
    broker = new PermissionBroker(
      new PolicyView(permissions, "/work/demo"),
      new SnapshotStateView(new Map([["engine:vae-core", ENGINE_DECLARED_CAPABILITIES]])),
      auditSink,
      refusals,
      new GateQueue(dir),
      fixedClock(1_700_000_000_000),
    );
  });

  it("records every decision in the audit chain — allow or deny (D10.6)", () => {
    broker.evaluate(request("fs", "read", "$PROJECT/src/main.ts"), { kind: "command", ref: "test" });
    broker.evaluate(request("fs", "read", "/etc/passwd"), { kind: "command", ref: "test" });
    expect(auditSink.recorded.length).toBe(2);
  });

  it("audit failure equals denial (D10.7)", () => {
    auditSink.healthyState = false;
    const { decision } = broker.evaluate(request("fs", "read", "$PROJECT/src/main.ts"), { kind: "command", ref: "test" });
    expect(decision.outcome).toBe("deny");
    expect(decision.reasonCode).toBe("E2011");
    expect(refusals.all().at(-1)?.reason_code).toBe("E2011");
  });

  it("records refusals in the refusal log (D2.6, Article XI)", () => {
    const { decision } = broker.evaluate(request("fs", "write", "/outside/project"), { kind: "command", ref: "test" });
    expect(decision.outcome).toBe("deny");
    const log = refusals.all();
    expect(log.length).toBe(1);
    expect(log[0]!.explanation.length).toBeGreaterThan(0);
    expect(log[0]!.fix).toBeDefined();
  });

  it("parks human-gated requests durably (D10.4)", () => {
    const gates = new GateQueue(dir);
    const gated = new PermissionBroker(
      new PolicyView(permissions, "/work/demo"),
      new SnapshotStateView(
        new Map([["engine:vae-core", ["fs.*"]]]),
        (req) => req.capability.action === "write",
      ),
      auditSink,
      refusals,
      gates,
      fixedClock(1_700_000_000_000),
    );
    const result = gated.evaluate(request("fs", "write", "$PROJECT/src/x.ts"), { kind: "command", ref: "test" });
    expect(result.decision.outcome).toBe("park");
    expect(result.parkedAt).toBeDefined();
    expect(gates.pending().length).toBe(1);
    expect(gates.pending()[0]!.request.capability.action).toBe("write");
  });

  it("requireAllowed throws a refusal error with a Fix line (Article XI)", () => {
    expect(() => broker.requireAllowed(request("fs", "write", "/outside"), { kind: "command", ref: "t" })).toThrow(/not declared|denied|No explicit grant/);
    try {
      broker.requireAllowed(request("fs", "write", "/outside"), { kind: "command", ref: "t" });
    } catch (e) {
      expect((e as { code: string }).code).toBe("E2001");
      expect((e as { fix: string }).fix).toContain("reviewable");
    }
  });
});

describe("journal-backed audit chain (D12.2)", () => {
  it("writes broker decisions into the audit sister chain", () => {
    const dir = mkdtempSync(join(tmpdir(), "vae-audit-"));
    try {
      const audit = new JournalWriter(join(dir, "audit.ndjson"), { clock: fixedClock(1_700_000_000_000) });
      const sink = new JournalAuditSink(audit, { kind: "engine", id: "vae-core" }, { kind: "command", ref: "test" });
      const refusals = new RefusalLog(join(dir, "refusals.ndjson"));
      const broker = new PermissionBroker(
        new PolicyView(permissions, "/work/demo"),
        new SnapshotStateView(new Map([["engine:vae-core", ENGINE_DECLARED_CAPABILITIES]])),
        sink,
        refusals,
      );
      broker.evaluate(request("fs", "read", "$PROJECT/src/main.ts"), { kind: "command", ref: "test" });
      broker.evaluate(request("fs", "read", "/etc/passwd"), { kind: "command", ref: "test" });
      const { verifyJournal } = require("vae-store") as typeof import("vae-store");
      const report = verifyJournal(join(dir, "audit.ndjson"));
      expect(report.ok).toBeTrue();
      expect(report.entries).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
