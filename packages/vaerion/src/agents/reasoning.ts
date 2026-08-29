/**
 * Vaerion — reasoning sessions (MS-4).
 *
 * A reasoning session is the agent's persistent scratchpad, and it lives ON
 * the journal: every note is a `reasoning.note.recorded` event, every fold a
 * `reasoning.folded` event. Law:
 *
 *   - Persistent: notes survive process death because they are journal
 *     records; the state is a pure fold (R-RT2), snapshots accelerate.
 *   - Deterministic folding: memory folding is a PURE function of the
 *     unfolded notes — the same journal always folds to the same summary
 *     (first-sentence extraction, fixed truncation bounds, no clocks).
 *   - Checkpoint recovery: after a fold the caller may snapshot; restore
 *     recomputes the identical session from the journal alone.
 *   - Redaction: note text passes the kernel redactor before journaling —
 *     scratchpads never become a secret side-channel.
 */

import { blake3HexOf } from "../kernel/hash.ts";
import { redactString } from "../kernel/redact.ts";
import { VaerionError } from "../kernel/errors.ts";
import type { Actor, Cause } from "../spine/envelope.ts";
import type { Reducer } from "../journal/replay.ts";

/** The port the session needs from a run (RunHarness satisfies it). */
export interface ReasoningHost {
  emit(type: string, payload: Record<string, unknown>, actor?: Actor, cause?: Cause): Promise<number>;
  journal: { readonly lastSeq: number; readonly runId: string };
  traceId(): string;
}

export interface ReasoningNote {
  /** 1-based within the session (order of recorded notes). */
  index: number;
  text: string;
  /** Journal seq of the note event (attribution). */
  seq: number;
}

export interface ReasoningFold {
  /** How many notes this fold consumed. */
  folded_count: number;
  summary: string;
  summary_hash: string;
  seq: number;
}

export interface ReasoningState {
  notes: ReasoningNote[];
  folds: ReasoningFold[];
}

export function initialReasoningState(): ReasoningState {
  return { notes: [], folds: [] };
}

/**
 * Pure fold: journal records → reasoning state. Deterministic replay core —
 * the same journal always yields the identical session.
 */
export const reasoningStateReducer: Reducer<ReasoningState> = (state, rec) => {
  const next: ReasoningState = { notes: [...state.notes], folds: [...state.folds] };
  if (rec.k !== "evt") return next;
  const p = rec.env.payload as Record<string, unknown>;
  if (rec.env.type === "reasoning.note.recorded") {
    next.notes.push({ index: Number(p.index), text: String(p.text), seq: rec.env.seq });
  } else if (rec.env.type === "reasoning.folded") {
    next.folds.push({ folded_count: Number(p.folded_count), summary: String(p.summary), summary_hash: String(p.summary_hash), seq: rec.env.seq });
  }
  return next;
};

/** Notes not yet consumed by any fold, in recorded order. */
export function unfoldedNotes(state: ReasoningState): ReasoningNote[] {
  const folded = state.folds.reduce((acc, f) => acc + f.folded_count, 0);
  return state.notes.slice(folded);
}

/**
 * The deterministic fold: first sentence of each note (bounded), joined in
 * order. Pure — the same notes always produce the same summary.
 */
export function foldSummary(notes: ReadonlyArray<ReasoningNote>): string {
  const firstSentence = (text: string): string => {
    const cut = text.search(/[.!?](\s|$)/);
    const sentence = cut === -1 ? text : text.slice(0, cut + 1);
    return sentence.length > 120 ? `${sentence.slice(0, 117)}...` : sentence;
  };
  return notes.map((n, i) => `${i + 1}. ${firstSentence(n.text)}`).join(" ");
}

export class ReasoningSession {
  private readonly host: ReasoningHost;
  private readonly actor: Actor;

  constructor(host: ReasoningHost, actor?: Actor) {
    this.host = host;
    this.actor = actor ?? { kind: "agent", id: "agent" };
  }

  /** Append a note to the persistent scratchpad (journaled, redacted). */
  async note(text: string): Promise<ReasoningNote> {
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new VaerionError("E1600", "reasoning note text must be a non-empty string");
    }
    // Index continuity is derived from the host journal by the caller-side
    // counter the runtime folds; the event payload carries the index.
    const index = this.noteCount + 1;
    const seq = await this.host.emit(
      "reasoning.note.recorded",
      { index, text: redactString(text) },
      this.actor,
      { kind: "envelope", ref: String(this.host.journal.lastSeq) },
    );
    this.noteCount = index;
    return { index, text, seq };
  }

  private noteCount = 0;

  /** Seed the in-memory note counter after a restore (fold-based). */
  seedNoteCount(count: number): void {
    this.noteCount = count;
  }

  /**
   * Memory fold: consume all unfolded notes, journal the deterministic
   * summary. Recomputable from the journal alone — snapshots are optional
   * accelerators, never truth.
   */
  async fold(state: ReasoningState): Promise<ReasoningFold> {
    const notes = unfoldedNotes(state);
    if (notes.length === 0) {
      throw new VaerionError("E1600", "nothing to fold: no unfolded notes in this session");
    }
    const summary = foldSummary(notes);
    const summary_hash = await blake3HexOf(summary);
    const seq = await this.host.emit(
      "reasoning.folded",
      { folded_count: notes.length, summary, summary_hash, note_count_total: state.notes.length },
      this.actor,
      { kind: "envelope", ref: String(this.host.journal.lastSeq) },
    );
    return { folded_count: notes.length, summary, summary_hash, seq };
  }
}
