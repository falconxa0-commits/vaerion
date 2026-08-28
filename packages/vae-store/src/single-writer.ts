/**
 * vae-store — single-writer discipline (D11.1).
 *
 * One writer per run. Ordering is a scheduled fact, not a race. This
 * in-process lock enforces the discipline within a process; the
 * cross-process file lock is an MS-1 deliverable (law-visible
 * deferral, D22.4 — see packages/vae-store/README.md).
 */

import { refusalError } from "vae-foundation";

export interface WriterHandle {
  readonly runId: string;
  release(): void;
}

export class SingleWriterRegistry {
  private readonly held = new Map<string, symbol>();

  /** Acquire exclusive write ownership of a run, or refuse (E2012). */
  acquire(runId: string, owner: string): WriterHandle {
    const current = this.held.get(runId);
    if (current !== undefined) {
      throw refusalError("E2012", `Another writer currently owns run ${runId}.`, "Wait for the active writer to finish; runs are single-writer (D11.1).");
    }
    const token = Symbol(owner);
    this.held.set(runId, token);
    return {
      runId,
      release: () => {
        if (this.held.get(runId) === token) this.held.delete(runId);
      },
    };
  }

  isHeld(runId: string): boolean {
    return this.held.has(runId);
  }
}
