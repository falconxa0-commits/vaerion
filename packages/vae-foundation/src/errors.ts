/**
 * vae-foundation — Error object (D3.8, D17.6, Article XI).
 *
 * Errors are curriculum, not blame. Every error carries:
 *  - a stable `E####` code from the catalog (spec/errors.yaml),
 *  - a one-line plain-language explanation,
 *  - a machine-parseable `Fix:` line naming the next legitimate step,
 *  - an exit class from the constitutional alphabet.
 * The same taxonomy governs CLI, API, and SDK (D17.6).
 */

import type { ExitCode } from "./exit-codes.ts";
import { EXIT_CODES } from "./exit-codes.ts";

export type ErrorClass = "usage" | "refusal" | "run_failure" | "internal";

export interface VaeErrorShape {
  readonly code: string;
  readonly message: string;
  readonly fix: string;
  readonly detail?: string;
  readonly class: ErrorClass;
}

export class VaeError extends Error implements VaeErrorShape {
  readonly code: string;
  readonly fix: string;
  readonly detail?: string;
  readonly class: ErrorClass;

  constructor(shape: VaeErrorShape, options?: { cause?: unknown }) {
    super(shape.message, options);
    this.name = "VaeError";
    this.code = shape.code;
    this.fix = shape.fix;
    this.class = shape.class;
    if (shape.detail !== undefined) this.detail = shape.detail;
  }

  get exitCode(): ExitCode {
    switch (this.class) {
      case "usage":
        return EXIT_CODES.USAGE;
      case "refusal":
        return EXIT_CODES.REFUSAL;
      case "run_failure":
        return EXIT_CODES.RUN_FAILURE;
      case "internal":
        return EXIT_CODES.INTERNAL;
    }
  }

  /** `Fix:` line as rendered in human output (D18.2). */
  fixLine(): string {
    return `Fix: ${this.fix}`;
  }
}

export function usageError(code: string, message: string, fix: string, detail?: string): VaeError {
  return new VaeError({ code, message, fix, class: "usage", detail });
}

export function refusalError(code: string, message: string, fix: string, detail?: string): VaeError {
  return new VaeError({ code, message, fix, class: "refusal", detail });
}

export function runFailureError(code: string, message: string, fix: string, detail?: string): VaeError {
  return new VaeError({ code, message, fix, class: "run_failure", detail });
}

export function internalError(code: string, message: string, fix: string, detail?: string): VaeError {
  return new VaeError({ code, message, fix, class: "internal", detail });
}

/** True when the thrown value is a catalogued engine error. */
export function isVaeError(value: unknown): value is VaeError {
  return value instanceof VaeError;
}
