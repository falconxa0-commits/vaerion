/**
 * vae-tools — the versioned tool registry (D16.1).
 *
 * One registry; unregistered tools are not invocable; registry
 * conformance is verified in CI (D20.1). Tool security boundaries
 * exist only at the broker (D16.11) — the registry holds contracts,
 * never privileges.
 */

import type { ToolImplementation, ToolSpec, ToolCallRequest, ToolResult } from "./spec.ts";
import { toolNotRegistered, validateToolInput } from "./spec.ts";
import { refusalError } from "vae-foundation";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolImplementation>();

  register(impl: ToolImplementation): this {
    const existing = this.tools.get(impl.spec.name);
    if (existing !== undefined) {
      throw refusalError("E2005", `Tool '${impl.spec.name}' is already registered.`, "Tool names are unique in the registry; version the contract instead (Article VIII).");
    }
    this.tools.set(impl.spec.name, impl);
    return this;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  spec(name: string): ToolSpec {
    const impl = this.tools.get(name);
    if (impl === undefined) throw toolNotRegistered(name);
    return impl.spec;
  }

  specs(): ToolSpec[] {
    return [...this.tools.values()].map((t) => t.spec);
  }

  /**
   * Validate the call against the declared contract and execute.
   * Invocation itself must be broker-mediated and journaled by the
   * execution engine (D16.3, D16.4, D16.6) — the registry performs
   * contract validation only.
   */
  invokeValidated(request: ToolCallRequest): ToolResult {
    const impl = this.tools.get(request.tool);
    if (impl === undefined) throw toolNotRegistered(request.tool);
    const invalid = validateToolInput(request.input, impl.spec.inputSchema);
    if (invalid !== undefined) {
      return { ok: false, failure: { kind: "refusal", code: invalid.code, message: invalid.message, fix: invalid.fix } };
    }
    return impl.execute(request.input) as ToolResult;
  }
}
