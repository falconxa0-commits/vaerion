/**
 * Vaerion — run harness (runtime).
 *
 * The composition root that wires spine + journal + broker contracts +
 * receipts into one durable run. Every privileged flow obeys:
 *
 *     decide → journal → act
 *
 * The harness is the ONLY component allowed to allocate run-scoped ids and
 * the ONLY writer of a run's journal. Restoration is deterministic: the
 * state of a run is a pure fold of its journal (R-RT2), with snapshots as
 * accelerators — never truth.
 */

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { EventBus } from "../spine/bus.ts";
import type { Clock } from "../kernel/clock.ts";
import { draftEnvelope, type Actor, type Cause } from "../spine/envelope.ts";
import type { EventType } from "../spine/event-types.ts";
import { JournalWriter, ENGINE_VERSION } from "../journal/writer.ts";
import { readJournal, type ReadResult } from "../journal/reader.ts";
import { verifyJournal, type VerifyReport } from "../journal/verify.ts";
import { replayRecords, type Reducer } from "../journal/replay.ts";
import type { BrokerDecisionRecord, DecisionRequest, BrokerDecision, PolicyContract } from "../broker/contracts/decision.ts";
import { evaluatePolicy } from "../broker/contracts/decision.ts";
import { decisionToAuditBody, ChainedAuditWriter, type AuditWriter } from "../broker/contracts/audit.ts";
import { brokerEvents } from "../broker/contracts/events.ts";
import type { GateRecord } from "../broker/contracts/gate.ts";
import { buildReceiptFromRecords } from "../receipts/receipt.ts";
import { VaerionError } from "../kernel/errors.ts";

export interface RunState {
  runId: string;
  traceId: string;
  status: "open" | "awaiting_gate" | "closed";
  lastSeq: number;
  eventsSeen: number;
  decisions: { allow: number; deny: number; prompt: number };
  openGates: GateRecord[];
  resolvedGates: GateRecord[];
  snapshotsTaken: number;
  blobRefs: Array<{ alg: "blake3"; hash: string; size: number }>;
}

export function initialRunState(runId: string, traceId: string): RunState {
  return {
    runId,
    traceId,
    status: "open",
    lastSeq: 0,
    eventsSeen: 0,
    decisions: { allow: 0, deny: 0, prompt: 0 },
    openGates: [],
    resolvedGates: [],
    snapshotsTaken: 0,
    blobRefs: [],
  };
}

/** Pure fold: journal records → run state. Deterministic restoration core. */
export const runStateReducer: Reducer<RunState> = (state, rec) => {
  const next: RunState = {
    ...state,
    openGates: [...state.openGates],
    resolvedGates: [...state.resolvedGates],
    blobRefs: [...state.blobRefs],
  };
  switch (rec.k) {
    case "evt": {
      next.lastSeq = Math.max(next.lastSeq, rec.env.seq);
      next.eventsSeen++;
      const p = rec.env.payload as Record<string, unknown>;
      if (rec.env.type === "store.blob.put" && p && typeof p.blob_ref === "object" && p.blob_ref !== null) {
        const ref = p.blob_ref as { alg: "blake3"; hash: string; size: number };
        if (!next.blobRefs.some((b) => b.hash === ref.hash)) next.blobRefs.push(ref);
      }
      break;
    }
    case "decision": {
      const kind = rec.decision.decision.kind;
      if (kind === "allow") next.decisions.allow++;
      else if (kind === "deny") next.decisions.deny++;
      else next.decisions.prompt++;
      break;
    }
    case "gate": {
      if (rec.gate.state === "open") {
        next.openGates.push(rec.gate);
        next.status = "awaiting_gate";
      } else if (rec.gate.state === "resolved") {
        next.openGates = next.openGates.filter((g) => g.gate_id !== rec.gate.gate_id);
        next.resolvedGates.push(rec.gate);
        if (next.openGates.length === 0) next.status = "open";
      } else {
        next.openGates = next.openGates.filter((g) => g.gate_id !== rec.gate.gate_id);
        if (next.openGates.length === 0) next.status = "open";
      }
      break;
    }
    case "snapshot":
      next.snapshotsTaken++;
      break;
    case "receipt":
      next.status = "closed";
      break;
    case "meta":
      break;
  }
  return next;
};

export interface RunHarnessOptions {
  /** Workspace root (`.vaerion/` lives here). */
  workspaceDir: string;
  runId: string;
  traceId: string;
  configFingerprint: string;
  clock: Clock;
  idGen: IdGenLike;
  /** Principal recorded on run-origin events. */
  actor?: Actor;
}

/** Minimal id port used by the harness (ULID strings). */
export interface IdGenLike {
  next(): string;
}

export class RunHarness {
  readonly journal: JournalWriter;
  readonly bus: EventBus;
  private audit: AuditWriter;
  private readonly clock: Clock;
  private readonly idGen: IdGenLike;
  private readonly actor: Actor;
  private readonly workspaceDir: string;
  private readonly traceIdValue: string;
  private closedHarness = false;
  private resolvedGateIds = new Set<string>();

  private constructor(journal: JournalWriter, bus: EventBus, audit: AuditWriter, opts: RunHarnessOptions) {
    this.journal = journal;
    this.bus = bus;
    this.audit = audit;
    this.clock = opts.clock;
    this.idGen = opts.idGen;
    this.actor = opts.actor ?? { kind: "human", id: "local-user" };
    this.workspaceDir = opts.workspaceDir;
    this.traceIdValue = opts.traceId;
  }

  /** Seed gate idempotency from a restored state (cross-restart law). */
  seedResolvedGates(gateIds: string[]): void {
    for (const id of gateIds) this.resolvedGateIds.add(id);
  }

  static journalPathFor(workspaceDir: string, runId: string): string {
    return join(workspaceDir, ".vaerion", "journal", `${runId}.ndjson`);
  }

  traceId(): string {
    return this.traceIdValue;
  }

  private static async openWriters(opts: RunHarnessOptions): Promise<{ journal: JournalWriter; audit: AuditWriter }> {
    const journalPath = RunHarness.journalPathFor(opts.workspaceDir, opts.runId);
    const journal = await JournalWriter.open({
      journalPath,
      runId: opts.runId,
      configFingerprint: opts.configFingerprint,
      clock: opts.clock,
    });
    const auditPath = join(opts.workspaceDir, ".vaerion", "audit.log");
    const audit = await ChainedAuditWriter.open(auditPath, await readAuditHead(auditPath), opts.clock);
    return { journal, audit };
  }

  /** Create a fresh run. */
  static async create(opts: RunHarnessOptions): Promise<RunHarness> {
    const { journal, audit } = await RunHarness.openWriters(opts);
    const harness = new RunHarness(journal, new EventBus(), audit, opts);
    await harness.emit("run.opened", { run_id: opts.runId, engine_version: ENGINE_VERSION }, harness.actor, { kind: "origin", ref: null });
    return harness;
  }

  /**
   * The single context path: every event of this run goes through here —
   * journaled first (truth), then fanned out on the spine (fast path).
   */
  async emit(type: EventType | (string & {}), payload: Record<string, unknown>, actor?: Actor, cause?: Cause): Promise<number> {
    if (this.closedHarness) throw new VaerionError("E1004", "run harness is closed");
    const env = draftEnvelope({
      type,
      traceId: this.traceIdValue,
      spanId: `s_${this.idGen.next().slice(-8).toLowerCase()}`,
      actor: actor ?? this.actor,
      cause: cause ?? { kind: "envelope", ref: this.journal.lastSeq > 0 ? String(this.journal.lastSeq) : null },
      payload,
      clock: this.clock,
    });
    const seq = await this.journal.appendEvent(env);
    await this.bus.publish({ ...env, seq });
    return seq;
  }

  /**
   * Broker decision flow (contracts enforced; engine lands MS-2):
   * evaluate policy → journal decision → audit → emit event.
   * Prompt decisions additionally open a durable gate.
   */
  async decide(req: DecisionRequest, policy: PolicyContract): Promise<{ decision: BrokerDecision; record: BrokerDecisionRecord; gate?: GateRecord }> {
    const decision = evaluatePolicy(policy, req);
    const record: BrokerDecisionRecord = {
      decision_id: this.idGen.next(),
      request_id: req.request_id,
      run_id: this.journal.runId,
      trace_id: this.traceIdValue,
      principal: req.principal,
      domain: req.domain,
      scope: req.scope,
      intent: req.intent,
      decision,
      decided_at: this.clock.nowIso(),
    };
    // decide → journal → act: the decision record exists BEFORE anything acts.
    await this.journal.appendDecision(record);
    await this.audit.append("decision", record.decision_id, decisionToAuditBody(record));
    await this.emit(
      "broker.decision.recorded",
      brokerEvents.decisionRecorded(record) as unknown as Record<string, unknown>,
      req.principal,
      { kind: "decision", ref: record.decision_id },
    );

    if (decision.kind === "prompt") {
      const gate: GateRecord = {
        gate_id: this.idGen.next(),
        run_id: this.journal.runId,
        trace_id: this.traceIdValue,
        state: "open",
        question: decision.reason,
        options: [
          { id: "approve", label: "Approve" },
          { id: "deny", label: "Deny" },
        ],
        opened_at: this.clock.nowIso(),
      };
      await this.journal.appendGate(gate);
      await this.emit(
        "broker.gate.opened",
        brokerEvents.gateOpened(gate) as unknown as Record<string, unknown>,
        { kind: "system", id: "broker" },
        { kind: "gate", ref: gate.gate_id },
      );
      return { decision, record, gate };
    }
    return { decision, record };
  }

  /** Resolve a durable gate. Idempotency: resolving an already-resolved gate is E1303. */
  async resolveGate(gate: GateRecord, answer: Record<string, unknown>): Promise<GateRecord> {
    if (gate.state !== "open" || this.resolvedGateIds.has(gate.gate_id)) {
      throw new VaerionError("E1303", `gate ${gate.gate_id} is already ${gate.state === "open" ? "resolved" : gate.state}`);
    }
    const resolved: GateRecord = {
      ...gate,
      state: "resolved",
      answer,
      resolved_by: "human",
      resolved_at: this.clock.nowIso(),
    };
    await this.journal.appendGate(resolved);
    this.resolvedGateIds.add(gate.gate_id);
    await this.emit(
      "broker.gate.resolved",
      brokerEvents.gateResolved(resolved, answer.approved === false ? "denied" : "approved") as unknown as Record<string, unknown>,
      { kind: "human", id: "local-user" },
      { kind: "gate", ref: gate.gate_id },
    );
    return resolved;
  }

  /**
   * Take a checkpoint snapshot of the run's AUTHORITATIVE state (the fold of
   * the journal at head). Snapshots are accelerators, never truth — the
   * harness computes the state itself so a snapshot always corresponds to
   * the journal head it was taken at.
   */
  async snapshot(label: string): Promise<void> {
    const journalPath = RunHarness.journalPathFor(this.workspaceDir, this.journal.runId);
    const read = await readJournal(journalPath);
    const state = replayRecords<RunState>({
      records: read.records,
      reducer: runStateReducer,
      initial: initialRunState(this.journal.runId, this.traceIdValue),
    }).state;
    await this.journal.appendSnapshot(this.journal.lastSeq, label, state as unknown as Record<string, unknown>);
    await this.emit(
      "run.snapshot.taken",
      { label, seq_at: this.journal.lastSeq },
      { kind: "system", id: "runtime" },
      { kind: "envelope", ref: String(this.journal.lastSeq) },
    );
  }

  /** Release the single-writer lock WITHOUT appending anything (read/resume-only paths). */
  async release(): Promise<void> {
    if (this.closedHarness) return;
    this.closedHarness = true;
    await this.audit.close();
    await this.journal.close();
  }

  /**
   * Close the run: closing event, then the receipt as the TERMINAL record —
   * the receipt certifies the chain up to and including run.closed.
   */
  async close(summary: string): Promise<{ receipt: ReturnType<typeof buildReceiptFromRecords>; verify: VerifyReport }> {
    const journalPath = RunHarness.journalPathFor(this.workspaceDir, this.journal.runId);
    await this.emit(
      "run.closed",
      { run_id: this.journal.runId, receipt_summary: summary },
      { kind: "system", id: "runtime" },
      { kind: "envelope", ref: String(this.journal.lastSeq) },
    );
    const read = await readJournal(journalPath);
    const receipt = buildReceiptFromRecords(read.records, {
      closedAt: this.clock.nowIso(),
      engineVersion: ENGINE_VERSION,
      summary,
    });
    await this.journal.appendReceipt(receipt);
    const verify = await verifyJournal(journalPath);
    this.closedHarness = true;
    await this.audit.close();
    await this.journal.close();
    return { receipt, verify };
  }

  /** Restore a run deterministically from its journal and continue it. */
  static async restore(opts: RunHarnessOptions): Promise<{ state: RunState; read: ReadResult; verify: VerifyReport; harness: RunHarness }> {
    const journalPath = RunHarness.journalPathFor(opts.workspaceDir, opts.runId);
    const verify = await verifyJournal(journalPath);
    if (!verify.ok) {
      throw new VaerionError("E1500", "cannot restore: journal failed verification", { path: journalPath, issues: verify.issues });
    }
    const read = await readJournal(journalPath);
    const result = replayRecords<RunState>({
      records: read.records,
      reducer: runStateReducer,
      initial: initialRunState(opts.runId, opts.traceId),
    });
    const { journal, audit } = await RunHarness.openWriters(opts);
    const harness = new RunHarness(journal, new EventBus(), audit, opts);
    harness.seedResolvedGates(result.state.resolvedGates.map((g) => g.gate_id));
    await harness.emit(
      "run.restored",
      { run_id: opts.runId, status: result.state.status, last_seq: result.state.lastSeq },
      { kind: "system", id: "runtime" },
      { kind: "origin", ref: null },
    );
    return { state: result.state, read, verify, harness };
  }
}

/** Read the audit ledger head (for chaining across engine sessions). */
export async function readAuditHead(auditPath: string): Promise<{ i: number; head: string } | null> {
  const raw = await readFile(auditPath, "utf8").catch(() => null);
  if (!raw) return null;
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;
  try {
    const last = JSON.parse(lines[lines.length - 1] as string) as { i: number; hash: string };
    return { i: last.i, head: last.hash };
  } catch {
    throw new VaerionError("E1003", "audit ledger tail is corrupt");
  }
}
