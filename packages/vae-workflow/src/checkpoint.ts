/**
 * vae-workflow — checkpoints and park semantics (D11.6, D5.2, D10.4).
 *
 * A checkpoint precedes every non-idempotent effect so failure leaves
 * a resumable state. Parked nodes are durable: blocked nodes park,
 * independent nodes continue (overnight-gate law, D5.2).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Json } from "vae-foundation";

export interface Checkpoint {
  readonly runId: string;
  readonly stepId: string;
  readonly phase: "before-effect" | "after-effect";
  readonly payload: Json;
  readonly tsMs: number;
}

export interface CheckpointStore {
  write(checkpoint: Checkpoint): void;
  latest(runId: string): Checkpoint | undefined;
  all(runId: string): Checkpoint[];
}

/** File-backed checkpoint store — durable across restarts (D11.6). */
export class FileCheckpointStore implements CheckpointStore {
  constructor(private readonly dir: string) {}

  private get file(): string {
    return `${this.dir}/checkpoints.ndjson`;
  }

  write(checkpoint: Checkpoint): void {
    mkdirSync(this.dir, { recursive: true });
    const lines = this.raw();
    lines.push(JSON.stringify(checkpoint));
    writeFileSync(this.file, lines.join("\n") + "\n", "utf8");
  }

  latest(runId: string): Checkpoint | undefined {
    const all = this.all(runId);
    return all.at(-1);
  }

  all(runId: string): Checkpoint[] {
    return this.raw()
      .map((line) => JSON.parse(line) as Checkpoint)
      .filter((c) => c.runId === runId);
  }

  private raw(): string[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, "utf8").split("\n").filter((l) => l.trim().length > 0);
  }
}

export interface ParkedNode {
  readonly runId: string;
  readonly stepId: string;
  readonly reason: string;
  readonly gateId?: string;
  readonly parkedAtMs: number;
}
