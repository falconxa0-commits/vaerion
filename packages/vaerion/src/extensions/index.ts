/**
 * Vaerion — extensions subsystem (MS-5, ADR-0009): the digest-pinned,
 * broker-bridged extension host. The R-2 subprocess host shares the broker
 * semantics of the ratified WASI-P2 target; the world contract is published
 * at spec/wit/vaerion-extension@0.1.0.wit.
 */

export {
  EXTENSION_WORLD,
  sha256File,
  verifyArtifactPin,
  runExtension,
  type ExtensionLaunch,
  type ExtensionHostContext,
  type BuiltinBinding,
  type ExtensionRunResult,
} from "./host.ts";
export { createExtensionTool, requireDeclaredExtension } from "./factory.ts";
