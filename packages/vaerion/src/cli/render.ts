/**
 * Vaerion CLI — output rendering.
 *
 * Guarantee #2: `--json` emits stable NDJSON (one JSON object per line).
 * Plain mode is the pipe/CI contract: stable text, no ANSI, byte-compatible
 * with the historical output. Rich mode (interactive TTYs only; VAE_UI=rich
 * forces it for evidence) renders the PHASE Ω design language from ui.ts —
 * panels, tables, badges, receipts — over the same payloads.
 * NO_COLOR/TERM=dumb always degrade to plain text.
 */

import type { CliIo, OutputMode } from "./io.ts";
import type { Envelope } from "../spine/envelope.ts";
import type { JournalRecord } from "../journal/records.ts";
import { redactString } from "../kernel/redact.ts";
import {
  Ansi,
  renderRichResult,
  resolveProfile,
  errorBlock,
  banner,
  footer,
  Spinner,
  type RenderEnv,
  type RenderProfile,
} from "./ui.ts";

export class Renderer {
  private readonly profile: RenderProfile;
  private readonly a: Ansi;
  readonly width: number;

  constructor(
    private readonly io: CliIo,
    private readonly mode: OutputMode,
    env?: RenderEnv,
  ) {
    const resolved = resolveProfile(mode, env ?? { tty: false });
    this.profile = resolved.profile;
    this.a = new Ansi(resolved.ansi);
    this.width = resolved.width;
  }

  get json(): boolean {
    return this.mode === "json";
  }

  get rich(): boolean {
    return this.profile === "rich";
  }

  /** A progress spinner (no-op outside rich+TTY+raw). */
  spinner(): Spinner {
    return new Spinner(this.io, this.a, this.profile === "rich" && this.io.tty === true && typeof this.io.raw === "function");
  }

  /** One structured result object. */
  result(obj: Record<string, unknown>): void {
    if (this.profile === "json") {
      this.io.out(JSON.stringify(obj));
      return;
    }
    const lines =
      this.profile === "rich"
        ? renderRichResult(this.a, obj, this.width)
        : plainOf(obj);
    for (const line of lines) this.io.out(line);
  }

  envelope(env: Envelope): void {
    if (this.mode === "json") {
      this.io.out(JSON.stringify(env));
      return;
    }
    if (this.profile === "rich") {
      const seq = this.a.dim(String(env.seq).padStart(4));
      const type = env.type.startsWith("research.")
        ? this.a.info(env.type)
        : env.type.startsWith("gateway.")
          ? this.a.gold(env.type)
          : env.type.startsWith("package.")
            ? this.a.success(env.type)
            : env.type;
      this.io.out(redactString(`${seq} ${type} ${a_dim_actor(this.a, env)} ${JSON.stringify(env.payload)}`));
      return;
    }
    this.io.out(redactString(`${env.seq} ${env.ts} [${env.actor.kind}:${env.actor.id}] ${env.type} ${JSON.stringify(env.payload)}`));
  }

  record(rec: JournalRecord): void {
    if (this.mode === "json") {
      this.io.out(JSON.stringify(rec));
      return;
    }
    if (this.profile === "rich") {
      const base = this.a.dim(`#${String(rec.i).padStart(3)}`);
      const kindTag = (k: string): string =>
        k === "receipt" ? this.a.gold("receipt ")
        : k === "decision" ? this.a.info("decision")
        : k === "gate" ? this.a.info("gate    ")
        : k === "snapshot" ? this.a.info("snapshot")
        : this.a.dim(k.padEnd(8));
      switch (rec.k) {
        case "meta":
          this.io.out(`${base} ${kindTag("meta")} ${rec.note} run=${rec.run_id}`);
          break;
        case "evt":
          this.io.out(`${base} ${kindTag("evt")} seq=${rec.env.seq} ${rec.env.type}`);
          break;
        case "decision":
          this.io.out(`${base} ${kindTag("decision")} ${rec.decision.decision.kind} ${rec.decision.domain} ${redactString(rec.decision.scope)} policy=${rec.decision.decision.policy}`);
          break;
        case "gate":
          this.io.out(`${base} ${kindTag("gate")} ${rec.gate.gate_id} ${rec.gate.state} "${redactString(rec.gate.question)}"`);
          break;
        case "snapshot":
          this.io.out(`${base} ${kindTag("snapshot")} seq_at=${rec.seq_at} ${rec.label}`);
          break;
        case "receipt":
          this.io.out(`${base} ${kindTag("receipt")} events=${rec.receipt.counts.events} head=${rec.receipt.journal.head_hash.slice(0, 12)}…`);
          break;
      }
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
      } else if (this.profile === "rich") {
        for (const line of errorBlock(this.a, { code: e.code, message: e.message ?? "", fix: e.fix }, this.width)) this.io.err(line);
      } else {
        this.io.err(typeof e.toLine === "function" ? e.toLine() : `${e.code} ${e.message}`);
      }
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (this.mode === "json") {
      this.io.err(JSON.stringify({ error: { code: "E1900", message: msg } }));
    } else if (this.profile === "rich") {
      for (const line of errorBlock(this.a, { code: "E1900", message: msg }, this.width)) this.io.err(line);
    } else {
      this.io.err(`E1900 ${msg}`);
    }
  }

  /** Rich-mode brand frame for the main help; plain mode is untouched. */
  helpFrame(text: string): void {
    if (this.profile !== "rich") {
      this.io.out(text);
      return;
    }
    for (const line of banner(this.a, VERSION_FOR_BANNER, this.width)) this.io.out(line);
    this.io.out("");
    this.io.out(text);
    this.io.out("");
    for (const line of footer(this.a)) this.io.out(line);
  }
}

/** The engine version, injected by vae.ts to avoid a circular import. */
let VERSION_FOR_BANNER = "";
export function setBannerVersion(version: string): void {
  VERSION_FOR_BANNER = version;
}

function a_dim_actor(a: Ansi, env: Envelope): string {
  return a.dim(`[${env.actor.kind}:${env.actor.id}]`);
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
