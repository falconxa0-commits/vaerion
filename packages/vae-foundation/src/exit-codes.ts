/**
 * vae-foundation — Exit-code alphabet (Part IV, D18.6).
 *
 * The alphabet is constitutional: shells and CI branch on exit codes
 * alone, in every version. Adding a code is a Class A amendment.
 */

export const EXIT_CODES = {
  /** Success. */
  OK: 0,
  /** Usage error — the operator asked wrongly (bad flag, bad argument, invalid config). */
  USAGE: 2,
  /** Refusal — the engine declined; explained, logged, with a next step (Article XI). */
  REFUSAL: 3,
  /** Run failure — the work was attempted and failed honestly. */
  RUN_FAILURE: 4,
  /** Internal error — a violated expectation inside the engine; always a bug to report. */
  INTERNAL: 5,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export const EXIT_CODE_NAMES: Record<ExitCode, string> = {
  [EXIT_CODES.OK]: "success",
  [EXIT_CODES.USAGE]: "usage error",
  [EXIT_CODES.REFUSAL]: "refusal",
  [EXIT_CODES.RUN_FAILURE]: "run failure",
  [EXIT_CODES.INTERNAL]: "internal error",
};
