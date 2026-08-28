/**
 * vae-gateway — provider ports and explicit fallback chains (D13.1, D13.5).
 *
 * The gateway is the only door to models (D13.5); fallback is a
 * declared chain, never an improvisation (D13.1). MS-0 ships the
 * contracts, the chain resolver, recording postures, and the breaker —
 * provider adapters arrive with MS-4. There is deliberately NO network
 * code in this unit: nothing can call a model that has not been
 * declared, granted, and recorded.
 */

import { refusalError } from "vae-foundation";

export interface ProviderDescriptor {
  readonly provider: "anthropic" | "openai" | "ollama" | "mock";
  readonly id: string;
}

export interface ChatRequest {
  readonly model: string;
  readonly messages: readonly { readonly role: "system" | "user" | "assistant"; readonly content: string }[];
  readonly maxTokens?: number;
}

export type StreamDelta =
  | { readonly kind: "text"; readonly utf8: string }
  | { readonly kind: "usage"; readonly inputTokens: number; readonly outputTokens: number }
  | { readonly kind: "done"; readonly finishReason: string };

/** The sole model ingress port (D13.5). Adapters implement this. */
export interface ModelProvider {
  readonly descriptor: ProviderDescriptor;
  health(): Promise<{ ok: boolean; detail?: string }>;
  invokeChat(req: ChatRequest): AsyncIterable<StreamDelta>;
}

export interface FallbackChain {
  /** Declared, visible order of providers (D13.1). */
  readonly name: string;
  readonly providers: readonly ProviderDescriptor[];
}

/**
 * Resolve an explicit chain. A call without a declared chain refuses
 * (E2009) — implicit fallback is forbidden (D13.1).
 */
export function resolveChain(chains: readonly FallbackChain[], name: string): FallbackChain {
  const chain = chains.find((c) => c.name === name);
  if (chain === undefined) {
    throw refusalError("E2009", `No explicit fallback chain named '${name}' is declared.`, "Declare the chain in configuration; implicit or improvised fallback is forbidden (D13.1).");
  }
  return chain;
}

/** Recording postures (D13.2): full is the ratified default. */
export type RecordingPosture = "off" | "metadata" | "full";
export const DEFAULT_RECORDING_POSTURE: RecordingPosture = "full";

export interface GatewayRecording {
  readonly posture: RecordingPosture;
  readonly chain: string;
  readonly provider: ProviderDescriptor;
  readonly requestMeta?: { readonly model: string; readonly messages: number };
  readonly deltas?: readonly StreamDelta[];
}
