/**
 * Vaerion — extension tool factory (MS-5): exposes a declared, digest-pinned
 * extension as a ToolExecutor so it crosses the SAME broker tool pipeline as
 * every other tool (declare → requested → decide → act → completed|denied).
 *
 * The extension's OWN power requests cross the broker bridge inside the host
 * (extensions/host.ts) with the EXTENSION as principal — extensions are just
 * principals (ADR-0004/ADR-0009).
 */

import { VaerionError } from "../kernel/errors.ts";
import type { ToolExecutor } from "../agents/tools.ts";
import { runExtension, type ExtensionHostContext, type ExtensionLaunch } from "./host.ts";
import type { ExtensionConfig } from "../config/config.ts";

/** Build the executor for one declared extension. */
export function createExtensionTool(config: ExtensionConfig, ctx: ExtensionHostContext): ToolExecutor {
  const launch: ExtensionLaunch = {
    name: config.name,
    artifact: config.artifact,
    digest: config.digest,
    timeoutMs: config.timeoutMs,
    maxHostCalls: config.maxHostCalls,
  };
  return {
    args: config.args ?? {},
    async execute(args) {
      const result = await runExtension({ launch, args, ctx, callId: ctx.idGen.next() });
      return result.value;
    },
  };
}

/** Fail-closed helper: an extension executor may only be built for a DECLARED extension. */
export function requireDeclaredExtension(extensions: ReadonlyArray<ExtensionConfig> | undefined, name: string): ExtensionConfig {
  const found = (extensions ?? []).find((e) => e.name === name);
  if (!found) {
    throw new VaerionError("E2101", `extension "${name}" is not declared in this workspace`);
  }
  return found;
}
