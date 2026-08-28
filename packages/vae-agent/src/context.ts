/**
 * vae-agent — engine context (composition root).
 *
 * Assembles the engine's ports and gates for one workspace: broker
 * (fail-closed), tool registry (builtins only in MS-0), spine, run +
 * audit journals, refusal log, gate queue, checkpoints. Both the CLI
 * (embedded posture, D7.2) and the daemon (socket-served posture)
 * compose through this context — one core, two postures, no side
 * channels (D7.1, D7.5).
 */

import { mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  ENGINE_PRINCIPAL,
  ENGINE_VERSION,
  envelope,
  iso,
  type Clock,
  type Envelope,
  systemClock,
} from "vae-foundation";
import {
  loadProjectDoc,
  mapEnvironment,
  resolveConfig,
  requireWorkspace,
  workspacePaths,
  type ResolvedConfig,
  type WorkspacePaths,
  type YamlValue,
} from "vae-config";
import {
  BlobStore,
  EventSpine,
  JournalWriter,
  SingleWriterRegistry,
  readEntries,
  verifyJournal,
  type JournalEntry,
} from "vae-store";
import {
  GateQueue,
  JournalAuditSink,
  PermissionBroker,
  RefusalLog,
  SnapshotStateView,
  PolicyView,
  ENGINE_DECLARED_CAPABILITIES,
} from "vae-capabilities";
import {
  ToolRegistry,
  blobsVerifyTool,
  configValidateTool,
  journalVerifyTool,
  type VerifyBlobsPort,
  type ValidateConfigPort,
  type VerifyJournalPort,
} from "vae-tools";
import { FileCheckpointStore } from "vae-workflow";
import type { Json } from "vae-foundation";

export interface EngineContextOptions {
  /** Working directory; the workspace root is discovered upward. */
  readonly cwd: string;
  readonly profile?: string;
  readonly env?: Record<string, string | undefined>;
  readonly clock?: Clock;
  /** Engine-level config document, when present (~/.config/vae/config.yaml). */
  readonly engineDoc?: YamlValue;
}

export interface EngineContext {
  readonly paths: WorkspacePaths;
  readonly resolved: ResolvedConfig;
  readonly clock: Clock;
  readonly spine: EventSpine;
  readonly broker: PermissionBroker;
  readonly tools: ToolRegistry;
  readonly audit: JournalWriter;
  readonly blobs: BlobStore;
  readonly refusals: RefusalLog;
  readonly gates: GateQueue;
  readonly writerLocks: SingleWriterRegistry;
  readonly checkpoints: FileCheckpointStore;
  readonly engineVersion: string;
  /** Verify-on-start report (D12.1): doctor reports it; mutations refuse on break. */
  readonly auditVerifyReport: { ok: boolean; entries: number; head?: string; brokenAt?: { seq: number; line: number; why: string } };
  /** Next spine sequence for engine-published events (monotonic per context). */
  nextEventSeq(): number;
  publishEvent(type: Envelope["type"], payload: Json, runId?: string): void;
}

export function auditJournalFile(paths: WorkspacePaths): string {
  return join(paths.auditDir, "audit.ndjson");
}

export function runJournalFile(paths: WorkspacePaths, runId: string): string {
  return join(paths.journalDir, `${runId}.ndjson`);
}

/**
 * Compose the engine context. Fails closed on invalid configuration
 * (E1002/E1003/E1001) and refuses outside workspaces (E1005).
 */
export function openEngineContext(options: EngineContextOptions): EngineContext {
  const paths = requireWorkspace(options.cwd);
  const clock = options.clock ?? systemClock;
  const projectDoc = loadProjectDoc(paths);
  const resolved = resolveConfig({
    projectDoc,
    engineDoc: options.engineDoc,
    profile: options.profile,
    environment: mapEnvironment(options.env ?? process.env),
  });

  // State directories exist before any journal opens.
  for (const dir of [paths.stateDir, paths.journalDir, paths.auditDir, paths.blobsDir, paths.runsDir, paths.tmpDir]) {
    mkdirSync(dir, { recursive: true });
  }

  const spine = new EventSpine();
  const audit = new JournalWriter(auditJournalFile(paths), { clock });

  const blobs = new BlobStore(paths.blobsDir);
  const refusals = new RefusalLog(paths.refusalsFile);
  const gates = new GateQueue(join(paths.stateDir, "gates"));

  // Verify-on-start (D12.1 posture; configured via D19 defaults). A broken
  // chain never blocks diagnosis (`vae doctor` must be able to run) but
  // mutations refuse to build on tampered truth — see RunService.
  const auditVerifyReport = resolved.config.engine.journal.verifyOnStart
    ? verifyJournal(auditJournalFile(paths))
    : { ok: true, entries: 0 };
  if (!auditVerifyReport.ok) {
    refusals.recordEngineRefusal("E3001", `Audit chain failed verification: ${auditVerifyReport.brokenAt?.why}.`, "Inspect the reported entry; the journal is append-only truth (D12.1).", { kind: "engine-posture", ref: "verify-on-start" });
  }

  const broker = new PermissionBroker(
    new PolicyView(resolved.config.permissions, paths.root),
    new SnapshotStateView(new Map([["engine:vae-core", ENGINE_DECLARED_CAPABILITIES]])),
    new JournalAuditSink(audit, ENGINE_PRINCIPAL, { kind: "engine-posture", ref: "core" }),
    refusals,
    gates,
    clock,
  );

  // Builtin tools are wired to engine ports — a tool never touches the
  // filesystem directly; it executes through granted ports (D16.3).
  const tools = new ToolRegistry();
  tools.register(
    journalVerifyTool({
      verifyJournalFile: (file: string) => verifyJournal(resolveJournalName(paths, file)),
    } satisfies VerifyJournalPort),
  );
  tools.register(
    configValidateTool({
      validateWorkspaceConfig: () => {
        // Validation already happened in resolveConfig (fail-closed);
        // reaching here means the effective config is schema-valid.
        return { ok: true, errors: [], provenance: resolved.provenance };
      },
    } satisfies ValidateConfigPort),
  );
  tools.register(
    blobsVerifyTool({
      verifyBlob: (ref: string) => blobs.verify(ref),
      listBlobRefsFromJournal: (file: string) => listBlobRefs(file),
    } satisfies VerifyBlobsPort),
  );

  let eventSeq = 1;

  const ctx: EngineContext = {
    paths,
    resolved,
    clock,
    spine,
    broker,
    tools,
    audit,
    blobs,
    refusals,
    gates,
    writerLocks: new SingleWriterRegistry(),
    checkpoints: new FileCheckpointStore(join(paths.stateDir, "checkpoints")),
    engineVersion: ENGINE_VERSION,
    auditVerifyReport,
    nextEventSeq: () => eventSeq++,
    publishEvent(type, payload, runId) {
      spine.publish(
        envelope({
          type,
          seq: eventSeq++,
          ts: iso(clock.nowMs()),
          ...(runId !== undefined ? { run_id: runId } : {}),
          actor: ENGINE_PRINCIPAL,
          cause: { kind: "engine", ref: "core" },
          payload,
        }),
      );
    },
  };
  return ctx;
}

/** Resolve journal selectors: "audit" | "latest" | "<run-id>". */
export function resolveJournalName(paths: WorkspacePaths, selector: string): string {
  if (selector === "audit") return auditJournalFile(paths);
  if (selector === "latest") {
    const runs = existsSync(paths.journalDir)
      ? readdirSync(paths.journalDir).filter((f) => f.endsWith(".ndjson")).sort()
      : [];
    const latest = runs.at(-1);
    if (latest === undefined) return join(paths.journalDir, "none.ndjson");
    return join(paths.journalDir, latest);
  }
  if (selector.includes("/") || selector.includes("\\")) return selector;
  return runJournalFile(paths, selector);
}

/** Collect blob references from a journal file (D9.5 references). */
export function listBlobRefs(file: string): string[] {
  if (!existsSync(file)) return [];
  const refs: string[] = [];
  for (const entry of readEntries(file) as JournalEntry[]) {
    const refsInEntry = (entry as { blob_refs?: string[] }).blob_refs;
    if (Array.isArray(refsInEntry)) refs.push(...refsInEntry);
  }
  return refs;
}

export type { WorkspacePaths, ResolvedConfig };
export { workspacePaths };
