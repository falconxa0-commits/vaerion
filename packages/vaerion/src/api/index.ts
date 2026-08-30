/**
 * Vaerion — local API daemon (MS-5, L4 surface).
 *
 * The loopback HTTP/SSE surface over the same engine contracts the CLI
 * composes. See ADR-0010 (daemon + pairing token) and ADR-0020 (HTTP stack
 * on the TS substrate; the sanctioned wire-client site lives in the SDK).
 */

export { DAEMON_ROUTES, matchRoute, requireParam, type DaemonRoute, type DaemonMethod } from "./routes.ts";
export { generateOpenApi } from "./openapi.ts";
export { startDaemon, statusForCode, type DaemonOptions, type DaemonHandle } from "./server.ts";
export { RunRegistry, type StartRunInput, type StartAgentInput, type StartWorkflowInput, type RunStarted, type RunStatusView, type RunSummary } from "./run-registry.ts";
