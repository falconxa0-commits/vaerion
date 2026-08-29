/**
 * Engine core unit tests — kernel laws, spine contracts, broker contracts.
 * Deterministic: fixed clock, seeded ids, no network, no wall clock.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJson } from "../../src/kernel/canonical.ts";
import { encodeUlid, decodeUlid, crn, parseCrn, SeededIdGen, encodeUlid as enc } from "../../src/kernel/ids.ts";
import { SeededRng, FixedClock } from "../../src/kernel/clock.ts";
import { blake3HexOf } from "../../src/kernel/hash.ts";
import { redactString, redactDeep } from "../../src/kernel/redact.ts";
import { VaerionError } from "../../src/kernel/errors.ts";
import { draftEnvelope, assertValidEnvelopeShape } from "../../src/spine/envelope.ts";
import { encodeEnvelope, decodeEnvelope } from "../../src/spine/serialization.ts";
import { EventBus } from "../../src/spine/bus.ts";
import { evaluatePolicy, type PolicyContract } from "../../src/broker/contracts/decision.ts";
import { scopeMatches } from "../../src/broker/contracts/capability.ts";
import { buildGraph, narrowingViolations } from "../../src/broker/contracts/permission-graph.ts";
import { verifyAuditLedger } from "../../src/broker/contracts/audit.ts";

const clock = new FixedClock(1735689600000);

describe("canonical JSON", () => {
  test("sorts keys recursively and strips whitespace", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
  test("rejects floats (byte-stability law)", () => {
    expect(() => canonicalJson({ x: 0.5 })).toThrow(VaerionError);
    expect(() => canonicalJson({ x: NaN })).toThrow(VaerionError);
    const maybe: number | undefined = undefined;
    expect(() => canonicalJson({ x: maybe ?? Number.POSITIVE_INFINITY })).toThrow(VaerionError);
  });
  test("drops undefined fields deterministically", () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
});

describe("ULID identity", () => {
  test("spec vectors: zero and max", () => {
    expect(encodeUlid(0, new Uint8Array(10))).toBe("00000000000000000000000000");
    expect(encodeUlid(0xffffffffffff, new Uint8Array(10).fill(0xff))).toBe("7ZZZZZZZZZZZZZZZZZZZZZZZZZ");
  });
  test("roundtrip preserves time and randomness", () => {
    const rng = new SeededRng(7);
    for (let i = 0; i < 200; i++) {
      const t = 1735689600000 + i * 997;
      const r = rng.nextBytes(10);
      const dec = decodeUlid(encodeUlid(t, r));
      expect(dec.timeMs).toBe(t);
      expect(Array.from(dec.randomness)).toEqual(Array.from(r));
    }
  });
  test("SeededIdGen is monotonic and deterministic", () => {
    const a = new SeededIdGen(() => 1735689600000, new SeededRng(42));
    const b = new SeededIdGen(() => 1735689600000, new SeededRng(42));
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
    expect(seqA[0]! < seqA[1]! && seqA[1]! < seqA[2]!).toBe(true);
  });
  test("CRN format", () => {
    const id = new SeededIdGen(() => 0, new SeededRng(1)).next();
    expect(parseCrn(crn("run", id))).toEqual({ namespace: "run", ulid: id });
  });
});

describe("blake3 (hash law)", () => {
  test("official vectors", async () => {
    expect(await blake3HexOf("")).toBe("af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262");
    expect(await blake3HexOf("abc")).toBe("6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85");
  });
});

describe("redaction", () => {
  test("masks known secret shapes deterministically", () => {
    const once = redactString("key ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890 end");
    expect(once).not.toContain("ghp_ABCDEF");
    expect(once).toBe(redactString("key ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890 end"));
    expect(once).toMatch(/\[REDACTED len=\d+\]/);
  });
  test("masks private key blocks", () => {
    const s = redactString("-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----");
    expect(s).not.toContain("PRIVATE KEY-----\nabc");
  });
  test("redactDeep masks sensitive keys and recurses", () => {
    const out = redactDeep({ nested: { api_key: "supersecret", note: "sk-abcdefghijklmnopqrstuvwx" } }) as { nested: { api_key: string; note: string } };
    expect(out.nested.api_key).toMatch(/^\[REDACTED len=\d+\]$/);
    expect(out.nested.note).toMatch(/^\[REDACTED/);
  });
});

describe("envelope contracts", () => {
  const env = draftEnvelope({
    type: "run.opened",
    traceId: "t_test",
    spanId: "s_test",
    actor: { kind: "human", id: "local-user" },
    cause: { kind: "origin", ref: null },
    payload: { x: 1 },
    clock,
  });
  test("draft has unassigned seq and full attribution", () => {
    expect(env.seq).toBe(0);
    expect(env.actor).toEqual({ kind: "human", id: "local-user" });
    expect(env.cause).toEqual({ kind: "origin", ref: null });
  });
  test("codec roundtrip; unknown types decode (forward-compat duty)", () => {
    const line = encodeEnvelope({ ...env, seq: 3 });
    const back = decodeEnvelope(line);
    expect(back.type).toBe("run.opened");
    const future = decodeEnvelope(line.replace('"run.opened"', '"galaxy.future.event"'));
    expect(future.type).toBe("galaxy.future.event");
  });
  test("unattributed envelopes are invalid (D-D)", () => {
    const bad = JSON.parse(encodeEnvelope({ ...env, seq: 1 })) as Record<string, unknown>;
    delete (bad as { actor?: unknown }).actor;
    expect(() => assertValidEnvelopeShape(bad, { seqMustBeAssigned: true })).toThrow(VaerionError);
  });
});

describe("event bus (spine law)", () => {
  test("delivery is in publish order per subscriber", async () => {
    const bus = new EventBus();
    const seen: number[] = [];
    bus.subscribe({ all: true }, (env) => {
      seen.push(env.seq);
    });
    for (let i = 1; i <= 50; i++) {
      await bus.publish({ ...draftEnvelope({ type: "run.state.changed", traceId: "t", spanId: "s", actor: { kind: "system", id: "x" }, cause: { kind: "origin", ref: null }, payload: {}, clock }), seq: i });
    }
    expect(seen).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });
  test("type filters isolate subscribers", async () => {
    const bus = new EventBus();
    const a: string[] = [];
    const b: string[] = [];
    bus.subscribe({ types: new Set(["run.opened"]) }, (e) => void a.push(e.type));
    bus.subscribe({ types: new Set(["run.closed"]) }, (e) => void b.push(e.type));
    const mk = (t: string) => draftEnvelope({ type: t, traceId: "t", spanId: "s", actor: { kind: "system", id: "x" }, cause: { kind: "origin", ref: null }, payload: {}, clock });
    await bus.publish(mk("run.opened"));
    await bus.publish(mk("run.closed"));
    await bus.publish(mk("run.opened"));
    expect(a.length).toBe(2);
    expect(b.length).toBe(1);
  });
});

describe("broker contracts (fail-closed law)", () => {
  test("no matching rule denies with E1301 (fail-closed)", () => {
    const policy: PolicyContract = { policy_id: "p", version: 1, rules: [] };
    const d = evaluatePolicy(policy, {
      request_id: "r", principal: { kind: "agent", id: "a" }, domain: "fs.write", scope: "/x", action: {}, intent: "test",
    });
    expect(d.kind).toBe("deny");
    if (d.kind === "deny") expect(d.reason_code).toBe("E1301");
  });
  test("first matching rule wins; prompt gates carry an id", () => {
    const policy: PolicyContract = {
      policy_id: "p",
      version: 1,
      rules: [
        { id: "deny-all-writes", principalKinds: ["agent"], domain: "fs.write", scope: "*", effect: "deny", rationale: "no writes for agents" },
        { id: "prompt-writes", principalKinds: ["human"], domain: "fs.write", scope: "*", effect: "prompt", gateLabel: "Allow write?", rationale: "human gate" },
      ],
    };
    const d = evaluatePolicy(policy, { request_id: "r1", principal: { kind: "agent", id: "a" }, domain: "fs.write", scope: "/src/x.ts", action: {}, intent: "test" });
    expect(d.kind).toBe("deny");
    const p = evaluatePolicy(policy, { request_id: "r2", principal: { kind: "human", id: "h" }, domain: "fs.write", scope: "/src/x.ts", action: {}, intent: "test" });
    expect(p.kind).toBe("prompt");
    if (p.kind === "prompt") expect(p.gate_id.length).toBeGreaterThan(0);
  });
  test("scope matching: *, /**, /*", () => {
    expect(scopeMatches("*", "anything")).toBe(true);
    expect(scopeMatches("/repo/**", "/repo/src/a.ts")).toBe(true);
    expect(scopeMatches("/repo/**", "/repository/x")).toBe(false);
    expect(scopeMatches("/repo/*", "/repo/a.ts")).toBe(true);
    expect(scopeMatches("/repo/*", "/repo/deep/a.ts")).toBe(false);
  });
  test("permission graph evolution may only narrow", () => {
    const ancestor = buildGraph({
      graph_id: "g1",
      narrows: null,
      nodes: [],
      edges: [{ from: "agent", to: "cap_fs" }],
      capabilities: { cap_fs: { domain: "fs.write", scopes: ["/repo/**"] } },
    });
    const legalNarrow = buildGraph({
      graph_id: "g2",
      narrows: "g1",
      nodes: [],
      edges: [{ from: "agent", to: "cap_fs" }],
      capabilities: { cap_fs: { domain: "fs.write", scopes: ["/repo/src/**"] } },
    });
    expect(narrowingViolations(ancestor, legalNarrow)).toEqual([]);
    const widening = buildGraph({
      graph_id: "g3",
      narrows: "g1",
      nodes: [],
      edges: [{ from: "agent", to: "cap_fs" }],
      capabilities: { cap_fs: { domain: "fs.write", scopes: ["/**"] } },
    });
    expect(narrowingViolations(ancestor, widening).length).toBeGreaterThan(0);
  });
});

describe("audit ledger verify", () => {
  test("empty ledger is clean; missing file is clean", async () => {
    const rep = await verifyAuditLedger("/nonexistent/vae-audit-does-not-exist.log");
    expect(rep.ok).toBe(true);
    expect(rep.entries).toBe(0);
  });
});
