/**
 * Vaerion — agents subsystem barrel (MS-4).
 *
 * Agent runtime (supervisor over journaled decisions), tool invocation
 * pipeline, planners, reasoning sessions, metrics, and the local research
 * port. Everything here is L2: it may import L0/L1/L2, never L4.
 */

export type {
  ToolHost,
  ToolDeclaration,
  ToolArgsSchema,
  ToolExecutor,
  ToolContext,
  ToolInvokeInput,
  ToolInvokeResult,
  SearchHit,
  SearchableIndex,
} from "./tools.ts";
export {
  ToolRegistry,
  ToolInvocationService,
  ToolGatePrompt,
  echoTool,
  clockReadTool,
  researchSearchTool,
} from "./tools.ts";

export type { PlanStep, Plan, Planner, PlannerInput, PlannerHistoryItem } from "./planner.ts";
export {
  InlinePlanner,
  ModelPlanner,
  parsePlanText,
  assertPlan,
  type GatewayHostLike,
  type ModelPlannerOptions,
  type InlinePlannerOptions,
} from "./planner.ts";

export type { ReasoningNote, ReasoningFold, ReasoningState, ReasoningHost } from "./reasoning.ts";
export {
  ReasoningSession,
  initialReasoningState,
  reasoningStateReducer,
  unfoldedNotes,
  foldSummary,
} from "./reasoning.ts";

export type { StepOutcome, ResearchPort } from "./executor.ts";
export { StepExecutor, historyItemOf } from "./executor.ts";

export type { AgentOutcome, AgentRunState, AgentRuntimeOptions, AgentRunInput, AgentRunResult } from "./runtime.ts";
export { AgentRuntime, initialAgentRunState, agentRunStateReducer, agentStateFromRecords } from "./runtime.ts";

export type { AgentMetrics } from "./metrics.ts";
export { agentMetricsFromRecords } from "./metrics.ts";

export type { LocalResearchPortOptions } from "./research-port.ts";
export { LocalResearchPort } from "./research-port.ts";

export { agentGrants } from "./grants.ts";
