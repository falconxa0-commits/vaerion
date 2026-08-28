/**
 * vae-tools — engine-internal builtin tools (MS-0 set).
 *
 * These are the declared, contract-carrying tools of the MS-0 engine:
 * self-verification effects with real implementations behind ports.
 * They are registered by the engine service layer and executed only
 * through broker-mediated, journaled invocations (D16.3–D16.6).
 * Filesystem/network/exec tool families arrive with their runtimes in
 * MS-3 (law-visible deferral, D22.4).
 */

import type { Json } from "vae-foundation";
import type { ToolImplementation, ToolSpec, InputSchema } from "../spec.ts";

const noRetry = { maxAttempts: 1, backoffMs: 0, retryable: [] as const };

export interface VerifyJournalPort {
  verifyJournalFile(file: string): { ok: boolean; entries: number; head?: string; brokenAt?: { why: string } };
}

export function journalVerifyTool(port: VerifyJournalPort): ToolImplementation {
  const spec: ToolSpec = {
    name: "journal.verify",
    version: 1,
    effectClass: "idempotent",
    deterministic: true,
    capabilities: [{ domain: "engine", action: "selfcheck", scope: "core" }],
    timeoutMs: 30_000,
    retry: noRetry,
    description: "Verify the blake3 hash chain of a journal file (D12.1).",
    inputSchema: { type: "object", required: ["journal"], properties: { journal: { type: "string" } } },
  };
  return {
    spec,
    execute(input: Json) {
      const { journal } = input as { journal: string };
      const report = port.verifyJournalFile(journal);
      return {
        ok: true,
        output: { ok: report.ok, entries: report.entries, head: report.head ?? null, broken_at: report.brokenAt ?? null },
      };
    },
  };
}

export interface ValidateConfigPort {
  validateWorkspaceConfig(): { ok: boolean; errors: { code: string; message: string }[]; provenance?: Record<string, string> };
}

export function configValidateTool(port: ValidateConfigPort): ToolImplementation {
  const spec: ToolSpec = {
    name: "config.validate",
    version: 1,
    effectClass: "pure",
    deterministic: true,
    capabilities: [{ domain: "engine", action: "selfcheck", scope: "core" }],
    timeoutMs: 10_000,
    retry: noRetry,
    description: "Validate configuration against the versioned schema; unknown keys are refused (D19.2).",
    inputSchema: { type: "object", properties: {} },
  };
  return {
    spec,
    execute(input: Json) {
      void input;
      const result = port.validateWorkspaceConfig();
      return {
        ok: true,
        output: { ok: result.ok, errors: result.errors, provenance: result.provenance ?? null },
      };
    },
  };
}

export interface VerifyBlobsPort {
  verifyBlob(ref: string): boolean;
  listBlobRefsFromJournal(file: string): string[];
}

export function blobsVerifyTool(port: VerifyBlobsPort): ToolImplementation {
  const spec: ToolSpec = {
    name: "blobs.verify",
    version: 1,
    effectClass: "idempotent",
    deterministic: true,
    capabilities: [{ domain: "engine", action: "selfcheck", scope: "core" }],
    timeoutMs: 30_000,
    retry: noRetry,
    description: "Verify that every blob referenced by a journal resolves and hashes to its address (D9.5).",
    inputSchema: { type: "object", required: ["journal"], properties: { journal: { type: "string" } } },
  };
  return {
    spec,
    execute(input: Json) {
      const { journal } = input as { journal: string };
      const refs = port.listBlobRefsFromJournal(journal);
      const missing = refs.filter((ref) => !port.verifyBlob(ref));
      return { ok: true, output: { refs: refs.length, missing } };
    },
  };
}
