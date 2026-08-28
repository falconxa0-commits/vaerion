/**
 * vae-agent — the journaled-decision law (D11.4).
 *
 * decide → journal → act, strictly in that order. The decision that
 * matters is durable truth BEFORE the effect exists. This wrapper is
 * the enforcement mechanism: the act function is not reachable until
 * the journal append has returned. A crash between journal and act
 * leaves a resumable state (checkpoint discipline, D11.6).
 */

import type { JournalWriter } from "vae-store";
import type { Json } from "vae-foundation";
import type { Cause, PrincipalRef } from "vae-foundation";

export interface JournaledDecisionInput<D extends Json, A> {
  readonly journal: JournalWriter;
  readonly actor: PrincipalRef;
  readonly cause: Cause;
  /** The decision: a pure function of declared inputs. */
  readonly decide: () => D;
  /** The effect — executed only after the decision is durable. */
  readonly act: (decision: D) => A;
  readonly atMs?: number;
}

export interface JournaledDecisionResult<D, A> {
  readonly decision: D;
  readonly outcome: A;
  readonly entrySeq: number;
  readonly entryHash: string;
}

export function journaledDecision<D extends Json, A>(
  type: string,
  input: JournaledDecisionInput<D, A>,
): JournaledDecisionResult<D, A> {
  const decision = input.decide(); // 1. decide
  const entry = input.journal.append(
    // 2. journal — durable before any effect
    { type, actor: input.actor, cause: input.cause, payload: { decision } },
    input.atMs,
  );
  const outcome = input.act(decision); // 3. act
  return { decision, outcome, entrySeq: entry.seq, entryHash: entry.hash };
}
