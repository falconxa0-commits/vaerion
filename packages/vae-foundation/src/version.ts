/**
 * vae-foundation — engine identity (D21.9: one version governs the engine).
 *
 * A single version number governs the engine, API, and SDKs within a
 * major. Every envelope and receipt records the contract version.
 */

export const ENGINE_VERSION = "0.1.0-ms.0" as const;
export const ENVELOPE_CONTRACT_VERSION = 1 as const;
export const RECEIPT_CONTRACT_VERSION = 1 as const;
export const JOURNAL_ENTRY_CONTRACT_VERSION = 1 as const;
export const VAERION_TAGLINE = "Vaerion — The AI-Native Development Engine" as const;
