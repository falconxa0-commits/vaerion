/**
 * Vaerion — journal writer.
 *
 * Guarantees (all ratified law, all enforced here):
 *   1. Append-only: records are added at the tail; nothing in place is
 *      rewritten. Recovery of a torn tail is the ONLY tail mutation and is a
 *      separate, explicitly invoked operation (recovery.ts).
 *   2. Single writer: an O_EXCL sidecar lock is held for the writer's
 *      lifetime (E1000 if held elsewhere).
 *   3. Per-run seq: envelope seq values are allocated HERE — gapless,
 *      monotonically increasing, 1-based. Call sites never choose seq.
 *   4. Hash chain: every record is sealed with blake3 over its canonical
 *      unsealed form and linked to its predecessor (genesis = 64 zeros).
 *   5. Durability: every append is fsync'd before it is acknowledged.
 *   6. Attribution: every envelope must carry actor + cause (validated
 *      upstream; re-checked at seal time).
 */

import { open, mkdir, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";
import { VaerionError } from "../kernel/errors.ts";
import type { Clock } from "../kernel/clock.ts";
import type { Envelope } from "../spine/envelope.ts";
import { assertEmittable } from "../spine/envelope.ts";
import { assertValidEnvelopeShape } from "../spine/envelope.ts";
import type { BrokerDecisionRecord } from "../broker/contracts/decision.ts";
import { assertDecisionRecordShape } from "../broker/contracts/decision.ts";
import type { GateRecord } from "../broker/contracts/gate.ts";
import { assertGateRecordShape } from "../broker/contracts/gate.ts";
import type { RunReceipt } from "../receipts/receipt.ts";
import { GENESIS_HASH, type HashHex } from "../kernel/hash.ts";
import { sealRecord } from "./hashchain.ts";
import { type JournalRecord, type UnsealedRecord, type RecordInput, type MetaRecord } from "./records.ts";
import { acquireJournalLock, type JournalLockHandle } from "./lock.ts";
import { readJournal } from "./reader.ts";
import { firstChainError, firstIndexError } from "./hashchain.ts";

export const ENGINE_VERSION = "0.1.7-rc1";

export interface OpenJournalOptions {
  journalPath: string;
  runId: string;
  configFingerprint: string;
  clock: Clock;
  /** Re-verify the existing chain on open (default true). */
  verifyOnOpen?: boolean;
}

export class JournalWriter {
  private lock: JournalLockHandle | null = null;
  private chainIndex = 0;
  private prevHash: HashHex = GENESIS_HASH;
  private seqCounter = 0;
  private closed = false;
  private readonly journalPath: string;
  readonly runId: string;

  private constructor(private readonly opts: OpenJournalOptions) {
    this.journalPath = opts.journalPath;
    this.runId = opts.runId;
  }

  /** Open (creating a header record when new) or resume an existing journal. */
  static async open(opts: OpenJournalOptions): Promise<JournalWriter> {
    await mkdir(dirname(opts.journalPath), { recursive: true });
    const writer = new JournalWriter(opts);
    writer.lock = await acquireJournalLock(opts.journalPath);
    try {
      const existing = await readJournal(opts.journalPath).catch((err: NodeJS.ErrnoException) => {
        if (err?.code === "E1502") return null; // new journal
        throw err;
      });

      if (existing && existing.records.length > 0) {
        if (existing.torn) {
          throw new VaerionError("E1002", "journal has a torn tail; run recovery before writing", {
            journal_path: opts.journalPath,
          });
        }
        if (opts.verifyOnOpen !== false) {
          const idxErr = firstIndexError(existing.records);
          if (idxErr) throw new VaerionError("E1001", idxErr.reason, { i: idxErr.i });
          const chainErr = await firstChainError(existing.records);
          if (chainErr) throw new VaerionError("E1001", chainErr.reason, { i: chainErr.i });
        }
        const head = existing.records[existing.records.length - 1] as JournalRecord;
        writer.chainIndex = head.i;
        writer.prevHash = head.hash;
        writer.seqCounter = Math.max(0, ...existing.records.map((r) => (r.k === "evt" ? r.env.seq : 0)));
      } else if (existing && existing.records.length === 0 && !existing.torn) {
        throw new VaerionError("E1006", "journal exists but is empty (no header)", { journal_path: opts.journalPath });
      } else {
        const header: Omit<MetaRecord, "hash"> = {
          k: "meta",
          note: "header",
          i: 1,
          prev: GENESIS_HASH,
          run_id: opts.runId,
          opened_at: opts.clock.nowIso(),
          engine_version: ENGINE_VERSION,
          config_fingerprint: opts.configFingerprint,
        };
        const sealed = await sealRecord(header);
        await writer.writeLine(sealed);
        writer.chainIndex = 1;
        writer.prevHash = sealed.hash;
      }
      return writer;
    } catch (err) {
      await writer.lock.release().catch(() => undefined);
      throw err;
    }
  }

  /**
   * Append an envelope. Assigns per-run seq, seals, links, fsyncs.
   * Returns the assigned seq.
   */
  async appendEvent(env: Envelope): Promise<number> {
    this.assertOpen();
    assertEmittable(env);
    assertValidEnvelopeShape(env, { seqMustBeAssigned: false });
    if (env.seq !== 0) {
      throw new VaerionError("E1102", "call sites must not pre-assign seq; the writer allocates it", { given: env.seq });
    }
    const seq = ++this.seqCounter;
    const sealedEnv: Envelope = { ...env, seq };
    await this.sealAndWrite({ k: "evt", env: sealedEnv });
    return seq;
  }

  async appendDecision(decision: BrokerDecisionRecord): Promise<void> {
    this.assertOpen();
    assertDecisionRecordShape(decision);
    await this.sealAndWrite({ k: "decision", decision });
  }

  async appendGate(gate: GateRecord): Promise<void> {
    this.assertOpen();
    assertGateRecordShape(gate);
    await this.sealAndWrite({ k: "gate", gate });
  }

  async appendSnapshot(seqAt: number, label: string, state: Record<string, unknown>): Promise<void> {
    this.assertOpen();
    if (!Number.isInteger(seqAt) || seqAt < 0) throw new VaerionError("E1900", "snapshot seq_at must be a non-negative integer");
    await this.sealAndWrite({ k: "snapshot", seq_at: seqAt, label, state });
  }

  async appendReceipt(receipt: RunReceipt): Promise<void> {
    this.assertOpen();
    await this.sealAndWrite({ k: "receipt", receipt });
  }

  /** Append a meta note (recovery/export markers). Not for call sites. */
  async appendMeta(meta: Omit<MetaRecord, "hash" | "i" | "prev">): Promise<void> {
    this.assertOpen();
    const body: RecordInput = { ...meta, k: "meta" };
    await this.sealAndWrite(body);
  }

  get headHash(): HashHex {
    return this.prevHash;
  }
  get chainLength(): number {
    return this.chainIndex;
  }
  get lastSeq(): number {
    return this.seqCounter;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.lock) {
      await this.lock.release();
      this.lock = null;
    }
  }

  private assertOpen(): void {
    if (this.closed || !this.lock) {
      throw new VaerionError("E1004", "journal writer is closed");
    }
  }

  private async sealAndWrite(partial: RecordInput): Promise<JournalRecord> {
    const i = this.chainIndex + 1;
    const unsealed = { ...partial, i, prev: this.prevHash } as UnsealedRecord;
    const sealed = await sealRecord(unsealed);
    await this.writeLine(sealed);
    this.chainIndex = i;
    this.prevHash = sealed.hash;
    return sealed;
  }

  private async writeLine(rec: JournalRecord): Promise<void> {
    const line = JSON.stringify(rec) + "\n";
    // O_APPEND single write, then fsync — the durability contract.
    const fh: FileHandle = await open(this.journalPath, "a");
    try {
      await fh.write(line, 0, "utf8");
      await fh.sync();
    } finally {
      await fh.close();
    }
  }
}
