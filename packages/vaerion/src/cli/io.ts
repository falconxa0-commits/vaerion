/**
 * Vaerion CLI — I/O ports and exit codes.
 *
 * Five Guarantees (constitution D-N): honest exit codes are law.
 * 0 ok · 2 usage · 3 broker-denied · 4 provider-down · 5 partial-with-repair-hint.
 */

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

export const ExitCode = {
  ok: 0,
  internal: 1,
  usage: 2,
  brokerDenied: 3,
  providerDown: 4,
  partial: 5,
} as const;

export type OutputMode = "json" | "plain";
