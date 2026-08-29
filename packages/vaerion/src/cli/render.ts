/**
 * Vaerion CLI — output rendering.
 *
 * Guarantee #2: `--json` emits stable NDJSON (one JSON object per line).
 * Plain mode renders human-readable lines. NO_COLOR/TERM=dumb simply means
 * we never emitted ANSI in the first place — plain text is the baseline.
 */

import type { CliIo, OutputMode } from "./io.ts";
import type { Envelope } from "../spine/envelope.ts";
import type { JournalRecord } from "../journal/records.ts";
import { redactString } from "../kernel/redact.ts";

export class Renderer {
  constructor(
    private readonly io: CliIo,
    private readonly mode: OutputMode,
  ) {}

  get json(): boolean {
    return this.mode === "json";
  }

  /** One structured result object. */
  result(obj: Record<string, unknown>): void {
    if (this.mode === "json") {
      this.io.out(JSON.stringify(obj));
    } else {
      for (const line of plainOf(obj)) this.io.out(line);
    }
  }

  envelope(env: Envelope): void {
    if (this.mode === "json") {
      this.io.out(JSON.stringify(env));
    } else {
      this.io.out(redactString(`${env.seq} ${env.ts} [${env.actor.kind}:${env.actor.id}] ${env.type} ${JSON.stringify(env.payload)}`));
    }
  }

  record(rec: JournalRecord): void {
    if (this.mode === "json") {
      this.io.out(JSON.stringify(rec));
      return;
    }
    const base = redactString(`#${rec.i} ${rec.k}`);
    switch (rec.k) {
      case "meta":
        this.io.out(`${base} note=${rec.note} run=${rec.run_id}`);
        break;
      case "evt":
        this.io.out(`${base} seq=${rec.env.seq} ${rec.env.type}`);
        break;
      case "decision":
        this.io.out(`${base} decision=${rec.decision.decision.kind} domain=${rec.decision.domain} scope=${rec.decision.scope} policy=${rec.decision.decision.policy}`);
        break;
      case "gate":
        this.io.out(`${base} gate=${rec.gate.gate_id} state=${rec.gate.state} q="${rec.gate.question}"`);
        break;
      case "snapshot":
        this.io.out(`${base} seq_at=${rec.seq_at} label=${rec.label}`);
        break;
      case "receipt":
        this.io.out(`${base} events=${rec.receipt.counts.events} head=${rec.receipt.journal.head_hash.slice(0, 12)}…`);
        break;
    }
  }

  /** Errors always render with code + Fix line (machine-parseable). */
  error(err: unknown): void {
    const e = err as { code?: string; message?: string; fix?: string; toLine?: () => string; toJSON?: () => unknown };
    if (typeof e?.toJSON === "function" && typeof e?.code === "string") {
      if (this.mode === "json") {
        this.io.err(JSON.stringify(e.toJSON()));
      } else {
        this.io.err(typeof e.toLine === "function" ? e.toLine() : `${e.code} ${e.message}`);
      }
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (this.mode === "json") {
      this.io.err(JSON.stringify({ error: { code: "E1900", message: msg } }));
    } else {
      this.io.err(`E1900 ${msg}`);
    }
  }
}

function plainOf(obj: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "object") {
      lines.push(`${k}:`);
      lines.push(...plainOf(v as Record<string, unknown>).map((l) => "  " + l));
    } else {
      lines.push(redactString(`${k}: ${String(v)}`));
    }
  }
  return lines.length > 0 ? lines : [redactString(JSON.stringify(obj))];
}
