/**
 * Vaerion — research subsystem barrel.
 *
 * Declared capabilities, fencing, provenance, evidence, citations, scoring,
 * local deterministic index, the one context path, and journal replay.
 * Network access is forbidden by law: no module here imports fetch/http/net.
 */

export * from "./principal.ts";
export * from "./capability.ts";
export * from "./fingerprint.ts";
export * from "./fencing.ts";
export * from "./provenance.ts";
export * from "./evidence.ts";
export * from "./citation.ts";
export * from "./scoring.ts";
export * from "./local-index.ts";
export * from "./context.ts";
export * from "./verification.ts";
export * from "./replay.ts";
