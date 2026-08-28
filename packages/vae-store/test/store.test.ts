import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixedClock, iso } from "vae-foundation";
import { chainEntry, computeEntryHash, GENESIS } from "../src/entry.ts";
import { JournalWriter, readEntries, verifyJournal, assertJournalVerified } from "../src/journal.ts";
import { BlobStore } from "../src/blob.ts";
import { EventSpine } from "../src/spine.ts";
import { SingleWriterRegistry } from "../src/single-writer.ts";

const actor = { kind: "engine", id: "vae-core" } as const;
const causeRef = { kind: "command", ref: "test" } as const;
const clock = fixedClock(1_700_000_000_000);

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "vae-store-"));
}

function entryInput(type: string, payload: Record<string, unknown>) {
  return { type, actor, cause: causeRef, payload: payload as never };
}

describe("journal chain (D12.1)", () => {
  it("appends gapless entries chained by blake3", () => {
    const dir = tmpDir();
    try {
      const file = join(dir, "run.ndjson");
      const w = new JournalWriter(file, { clock });
      const a = w.append(entryInput("run.started", { step: 0 }));
      const b = w.append(entryInput("run.step.completed", { step: 1 }));
      expect(a.seq).toBe(1);
      expect(b.seq).toBe(2);
      expect(a.prev).toBe(GENESIS);
      expect(b.prev).toBe(a.hash);
      expect(w.head()).toBe(b.hash);
      const report = verifyJournal(file);
      expect(report.ok).toBeTrue();
      expect(report.entries).toBe(2);
      expect(report.head).toBe(b.hash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is deterministic: same inputs produce the same chain", () => {
    const dir = tmpDir();
    try {
      const f1 = join(dir, "a.ndjson");
      const f2 = join(dir, "b.ndjson");
      const w1 = new JournalWriter(f1, { clock });
      const w2 = new JournalWriter(f2, { clock });
      w1.append(entryInput("run.started", { x: 1 }), 1_000);
      w2.append(entryInput("run.started", { x: 1 }), 1_000);
      expect(readFileSync(f1, "utf8")).toBe(readFileSync(f2, "utf8"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resumes the chain from an existing journal (recovery, D21.7)", () => {
    const dir = tmpDir();
    try {
      const file = join(dir, "run.ndjson");
      const w1 = new JournalWriter(file, { clock });
      const a = w1.append(entryInput("run.started", {}), 1_000);
      const w2 = new JournalWriter(file, { clock });
      const b = w2.append(entryInput("run.completed", {}), 2_000);
      expect(b.seq).toBe(2);
      expect(b.prev).toBe(a.hash);
      expect(verifyJournal(file).ok).toBeTrue();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detects tampering of entry content (E3001)", () => {
    const dir = tmpDir();
    try {
      const file = join(dir, "run.ndjson");
      const w = new JournalWriter(file, { clock });
      w.append(entryInput("run.started", {}), 1_000);
      w.append(entryInput("run.completed", {}), 2_000);
      // Mutate a payload byte in place — the chain must break.
      const text = readFileSync(file, "utf8").replace("run.completed", "run.FALSIFIED");
      writeFileSync(file, text);
      const report = verifyJournal(file);
      expect(report.ok).toBeFalse();
      expect(report.brokenAt?.why).toContain("hash mismatch");
      expect(() => assertJournalVerified(file)).toThrow(/E3001|verification failed|tamper|hash/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detects reordered entries via prev-link mismatch", () => {
    const dir = tmpDir();
    try {
      const file = join(dir, "run.ndjson");
      const w = new JournalWriter(file, { clock });
      w.append(entryInput("run.started", {}), 1_000);
      w.append(entryInput("run.step.started", {}), 2_000);
      w.append(entryInput("run.completed", {}), 3_000);
      const lines = readFileSync(file, "utf8").trim().split("\n");
      // Swap two entries: seq order preserved, chain links broken.
      const tmpLine = lines[1]!;
      lines[1] = lines[2]!;
      lines[2] = tmpLine;
      writeFileSync(file, lines.join("\n") + "\n");
      const report = verifyJournal(file);
      expect(report.ok).toBeFalse();
      const why = report.brokenAt?.why ?? "";expect(["prev-link mismatch (chain rewritten or reordered)", "gapless sequence violated: expected 2"]).toContain(why);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("chains entries purely and reproducibly", () => {
    const e = chainEntry({ ...entryInput("run.started", { n: 1 }), seq: 1, ts: iso(0) }, GENESIS);
    expect(e.hash).toBe(computeEntryHash({ ...e, hash: undefined } as never));
    expect(e.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("blob store (D9.5)", () => {
  it("stores bytes under their blake3 address, idempotently", () => {
    const dir = tmpDir();
    try {
      const store = new BlobStore(dir);
      const ref = store.put(new TextEncoder().encode("vaerion-blob"));
      expect(ref).toMatch(/^blake3:[0-9a-f]{64}$/);
      expect(store.put(new TextEncoder().encode("vaerion-blob"))).toBe(ref);
      expect(new TextDecoder().decode(store.open(ref))).toBe("vaerion-blob");
      expect(store.verify(ref)).toBeTrue();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses missing references with E3002", () => {
    const dir = tmpDir();
    const store = new BlobStore(dir);
    expect(() => store.open("blake3:" + "0".repeat(64))).toThrow(/missing from the blob store/);
    expect(store.exists("blake3:" + "0".repeat(64))).toBeFalse();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("event spine (D9.1, D9.6)", () => {
  it("fans out to subscribers without storing anything", () => {
    const spine = new EventSpine();
    const seen: string[] = [];
    spine.subscribe({ deliver: (e) => seen.push(e.type) });
    spine.subscribe({ filter: { types: ["run.started"] }, deliver: (e) => seen.push(`filtered:${e.type}`) });
    spine.publish({
      v: 1, type: "run.started", seq: 1, ts: iso(0),
      actor, cause: causeRef, payload: {},
    });
    spine.publish({
      v: 1, type: "doctor.check", seq: 2, ts: iso(0),
      actor, cause: causeRef, payload: {},
    });
    expect(seen).toEqual(["run.started", "filtered:run.started", "doctor.check"]);
    expect(spine.subscriberCount()).toBe(2);
  });

  it("contains failing consumers instead of propagating (D9.6)", () => {
    const spine = new EventSpine();
    let delivered = 0;
    spine.subscribe({ deliver: () => { throw new Error("renderer crashed"); } });
    spine.subscribe({ deliver: () => delivered++ });
    spine.publish({ v: 1, type: "run.started", seq: 1, ts: iso(0), actor, cause: causeRef, payload: {} });
    expect(delivered).toBe(1);
  });

  it("redacts payloads at the publication boundary (D9.4)", () => {
    const spine = new EventSpine();
    let received: Record<string, unknown> | undefined;
    spine.subscribe({ deliver: (e) => { received = e.payload as Record<string, unknown>; } });
    spine.publish({
      v: 1, type: "run.started", seq: 1, ts: iso(0), actor, cause: causeRef,
      payload: { api_key: `sk-${"c".repeat(20)}`, note: "fine" },
    });
    expect(received?.["api_key"]).toBe("[REDACTED]");
  });
});

describe("single writer per run (D11.1)", () => {
  it("refuses a second concurrent writer with E2012", () => {
    const reg = new SingleWriterRegistry();
    const h = reg.acquire("run-1", "cli");
    expect(reg.isHeld("run-1")).toBeTrue();
    expect(() => reg.acquire("run-1", "api")).toThrow(/owns run/);
    h.release();
    expect(reg.isHeld("run-1")).toBeFalse();
    const again = reg.acquire("run-1", "api");
    again.release();
  });
});
