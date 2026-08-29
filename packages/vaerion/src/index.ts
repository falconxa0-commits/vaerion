/**
 * @vaerion/engine — public API barrel (the Open Contracts surface).
 *
 * Consumers (CLI, SDK, tests) import from here. Everything not exported here
 * is internal and may change; everything exported is contract.
 */

// kernel (L0)
export { VaerionError, isVaerionError, ERROR_CATALOG, type ErrorCode, type ErrorDescriptor } from "./kernel/errors.ts";
export { canonicalJson, canonicalBytes } from "./kernel/canonical.ts";
export { redactString, redactDeep } from "./kernel/redact.ts";
export { blake3HexOf, GENESIS_HASH, type HashHex } from "./kernel/hash.ts";
export { encodeUlid, decodeUlid, crn, parseCrn, SystemIdGen, SeededIdGen, type IdGen, type Ulid, type Crn } from "./kernel/ids.ts";
export { SystemClock, FixedClock, SystemRng, SeededRng, type Clock, type Rng } from "./kernel/clock.ts";

// spine (L1)
export { EVENT_TYPES, type EventType, isKnownEventType } from "./spine/event-types.ts";
export { draftEnvelope, assertValidEnvelopeShape, assertEmittable, ENVELOPE_VERSION, type Envelope, type Actor, type Cause } from "./spine/envelope.ts";
export { encodeEnvelope, decodeEnvelope } from "./spine/serialization.ts";
export { EventBus, matches, type Subscription, type EventFilter } from "./spine/bus.ts";
export { SpinePersistence, type ReplaySource } from "./spine/persistence.ts";

// journal (L1)
export { JournalWriter, ENGINE_VERSION, type OpenJournalOptions } from "./journal/writer.ts";
export { readJournal, envelopesFrom, type ReadResult } from "./journal/reader.ts";
export { verifyJournal, type VerifyReport, type VerifyIssue } from "./journal/verify.ts";
export { recoverJournal, type RecoveryReport } from "./journal/recovery.ts";
export { replayRecords, replayJournal, type Reducer, type ReplayResult } from "./journal/replay.ts";
export { exportRedacted, readExportVerified, type ExportReport, type ExportOptions } from "./journal/export.ts";
export { listJournals, type JournalListItem } from "./journal/ls.ts";
export { RECORD_KINDS, type JournalRecord, type MetaRecord, type EvtRecord, type DecisionRecord, type GateRecordWrap, type SnapshotRecord, type ReceiptRecord, stripHash } from "./journal/records.ts";
export { hashRecord, sealRecord, firstChainError, firstIndexError } from "./journal/hashchain.ts";
export { acquireJournalLock, lockOwnerDead } from "./journal/lock.ts";

// store (L1)
export { BlobStore, assertBlobRefShape, type BlobRef } from "./store/blob-cas.ts";

// receipts (L1)
export { buildReceiptFromRecords, collectBlobRefs, assertReceiptShape, type RunReceipt } from "./receipts/receipt.ts";

// broker contracts (L1 — frozen for MS-2)
export { HUMAN_PRINCIPAL, SYSTEM_PRINCIPAL, assertPrincipalShape, type Principal, type PrincipalKind } from "./broker/contracts/principal.ts";
export { scopeMatches, capabilityCovers, assertCapabilityDeclarationShape, type CapabilityDeclaration, type CapabilityDefinition, type CapabilityScope, type CapabilityDomain, type CapabilitySet } from "./broker/contracts/capability.ts";
export { evaluatePolicy, assertDecisionRecordShape, type DecisionRequest, type BrokerDecision, type BrokerDecisionRecord, type PolicyContract, type PolicyRule } from "./broker/contracts/decision.ts";
export { assertGateRecordShape, gateResolutionConflict, type GateRecord } from "./broker/contracts/gate.ts";
export { buildGraph, narrowingViolations, grantsFor, type PermissionGraph, type GrantEdge, type GraphNode } from "./broker/contracts/permission-graph.ts";
export { assertReviewDiffShape, renderUnified, type ReviewDiff, type DiffHunk, type DiffOp } from "./broker/contracts/review-diff.ts";
export { brokerEvents, type BrokerDecisionRecordedPayload, type BrokerGateOpenedPayload, type BrokerGateResolvedPayload, type BrokerElevationRecordedPayload, type BrokerAuditAppendedPayload } from "./broker/contracts/events.ts";
export { ChainedAuditWriter, decisionToAuditBody, verifyAuditLedger, type AuditWriter, type AuditEntry, type AuditEntryKind, type AuditVerifyReport } from "./broker/contracts/audit.ts";

// broker engine (L1 — MS-2)
export { BrokerEngine, graphCovers, graphFromConfig, type BrokerEvaluation, type BrokerEngineInput, type ConfigGrantInput } from "./broker/engine.ts";
export { RefusalLogWriter, readRefusals, readRefusalHead, verifyRefusalLog, refusalFromBody, type RefusalEntry, type RefusalAppendInput, type RefusalVerifyReport, type RefusalFilter } from "./broker/refusal-log.ts";

// runtime (L2)
export { RunHarness, initialRunState, runStateReducer, readAuditHead, type RunState, type RunHarnessOptions } from "./runtime/run.ts";

// config (L0)
export { loadConfig, validateConfig, defaultPolicyFromConfig, policyFromConfig, CONFIG_SCHEMA_VERSION, type VaerionConfig } from "./config/config.ts";

// research (L2)
export * from "./research/index.ts";

// CLI (L4)
export { runCli, parseArgs, MAIN_HELP, VERSION } from "./cli/vae.ts";
export { ExitCode, type CliIo, type OutputMode } from "./cli/io.ts";
