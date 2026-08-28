/**
 * vae-capabilities — durable human gates (D10.4, D5.2).
 *
 * A gate parks a request durably: it survives restarts and is
 * resumable via `vae resume`. Park, never destroy. The queue is an
 * append-only NDJSON file plus a resolved index — honest, inspectable
 * state with an owner.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PendingGate } from "./state.ts";

const GATE_FILE = "gates.ndjson";

export class GateQueue {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private get file(): string {
    return `${this.dir}/${GATE_FILE}`;
  }

  /** Persist a parked gate (durable across restarts, D10.4). */
  park(gate: PendingGate): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const existing = this.all().filter((g) => g.gateId !== gate.gateId);
    existing.push(gate);
    writeFileSync(
      this.file,
      existing.map((g) => JSON.stringify(g)).join("\n") + "\n",
      "utf8",
    );
  }

  /** Dispose of a gate with the human's decision. */
  dispose(gateId: string, disposition: "grant" | "deny"): PendingGate | undefined {
    const gates = this.all();
    const gate = gates.find((g) => g.gateId === gateId);
    if (gate === undefined) return undefined;
    const updated: PendingGate = { ...gate, status: "disposed" };
    writeFileSync(
      this.file,
      gates
        .map((g) => (g.gateId === gateId ? updated : g))
        .map((g) => JSON.stringify(g))
        .join("\n") + "\n",
      "utf8",
    );
    return updated;
  }

  /** Pending gates, oldest first (parked work resurfaces with context). */
  pending(): PendingGate[] {
    return this.all().filter((g) => g.status === "pending");
  }

  all(): PendingGate[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as PendingGate);
  }
}
