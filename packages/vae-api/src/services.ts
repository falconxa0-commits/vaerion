/**
 * vae-api — the service layer (L3).
 *
 * The L3 layer maps onto L2 services (D6.4). This module is the single
 * public service surface: the CLI composes it in the embedded posture
 * (D7.2) and the daemon serves it over the socket — one behavior, two
 * postures, no API gap by construction (Sacred Invariant VII posture).
 */

export {
  openEngineContext,
  WorkspaceService,
  RunService,
  HealthService,
  JournalService,
  ExplainService,
} from "vae-agent";

export type { EngineContext } from "vae-agent";
