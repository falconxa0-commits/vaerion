/**
 * vae-tools — tool contracts (Stage 16).
 *
 * A tool is a contract before it is code. Every tool declares inputs,
 * outputs, effect class, timeout, retry policy, and required
 * capabilities in a single versioned registry (D16.1); unregistered
 * tools are not invocable. Failure is a typed result (D16.8), never an
 * improvised exception path.
 */

import type { Json } from "vae-foundation";
import { VaeError, refusalError } from "vae-foundation";

export type EffectClass = "pure" | "idempotent" | "non-idempotent";

export type ToolFailureKind = "retryable" | "fatal" | "refusal";

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly backoffMs: number;
  /** Failure kinds eligible for retry (D16.10 — the engine never improvises). */
  readonly retryable: readonly ToolFailureKind[];
}

export interface ToolSpec {
  /** Unique registry name, e.g. "journal.verify". */
  readonly name: string;
  readonly version: 1;
  readonly effectClass: EffectClass;
  /** Required capabilities for invocation (broker-mediated, D16.4). */
  readonly capabilities: readonly { readonly domain: string; readonly action: string; readonly scope: string }[];
  readonly timeoutMs: number;
  readonly retry: RetryPolicy;
  readonly description: string;
  /** Strict input contract — invalid input is refused before execution (D16.2). */
  readonly inputSchema: InputSchema;
  /** Declared non-determinism (D16.7): pure/idempotent tools must be deterministic. */
  readonly deterministic: boolean;
}

export interface ToolCallRequest {
  readonly tool: string;
  readonly input: Json;
  readonly runId?: string;
  readonly stepId?: string;
}

export type ToolResult =
  | { readonly ok: true; readonly output: Json }
  | { readonly ok: false; readonly failure: { readonly kind: ToolFailureKind; readonly code: string; readonly message: string; readonly fix?: string } };

export interface ToolImplementation {
  readonly spec: ToolSpec;
  /**
   * Execute the tool. Implementations return typed results; throwing a
   * VaeError is converted to a refusal-kind failure by the executor.
   */
  execute(input: Json): ToolResult;
}

/** Lightweight structural validation of declared tool input schemas. */
export interface InputSchema {
  readonly type: "object";
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, { readonly type: "string" | "number" | "boolean" | "object" | "array" }>>;
}

export function validateToolInput(input: Json, schema: InputSchema): VaeError | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return refusalError("E1006", "Tool input must be an object.", "Provide the declared input fields; validation is fail-closed (D16.2).");
  }
  const record = input as Record<string, unknown>;
  for (const key of schema.required ?? []) {
    if (!(key in record)) {
      return refusalError("E1006", `Tool input is missing required field '${key}'.`, `Supply '${key}' per the tool's declared contract (D16.2).`);
    }
  }
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const value = record[key];
    if (value === undefined) continue;
    const actual = Array.isArray(value) ? "array" : typeof value;
    if (actual !== prop.type) {
      return refusalError("E1006", `Tool input field '${key}' must be ${prop.type}.`, `Correct '${key}' to the declared type (D16.2); invalid input is refused before execution.`);
    }
  }
  return undefined;
}

export function toolNotRegistered(name: string): VaeError {
  return refusalError("E2005", `The requested tool '${name}' is not present in the versioned tool registry.`, "Register the tool with a declared spec (inputs, outputs, effect class, capabilities) before invocation (D16.1).");
}
