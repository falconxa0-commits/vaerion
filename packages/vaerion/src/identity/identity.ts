/**
 * Vaerion — the identity & attribution law (ASCENSION XVIII Phase 3; P5, D-D, D-P).
 *
 * Law: attribution without exception. Before this module the local human's
 * identity was scattered across call sites as ad-hoc literals ("local-user",
 * "human", "agent:workflow") with no single place that states the law. This
 * module is that ONE place:
 *
 *   - The BROKER principal id for the local human is "human" — the
 *     permission-graph node the config ceilings attach to (graphFromConfig).
 *     Broker principals MUST keep this id or the ceiling cannot cover them.
 *   - The ENVELOPE actor for direct CLI emissions is {kind:"human", id:"local-user"}
 *     — the canonical journal actor (pinned by the engine-core contract tests).
 *   - Agent / workflow / research actors are derived deterministically from the
 *     run they act in, never invented ad hoc.
 *
 * Everything here is a MEASUREMENT or a constant: no wall-clock, no network,
 * no writes. `vae account` renders this report; nothing else re-implements it.
 */

import type { Actor } from "../spine/envelope.ts";
import type { Principal } from "../broker/contracts/principal.ts";
import type { JournalRecord } from "../journal/records.ts";
import { listJournals } from "../journal/ls.ts";
import { readJournal } from "../journal/reader.ts";
import { measureRepository, RATIFIED_IDENTITY, type RepositoryIntel } from "../repo/git.ts";
import { isVaerionError } from "../kernel/errors.ts";

/** The broker permission-graph node id the local human's ceilings attach to. */
export const HUMAN_PRINCIPAL_ID = "human";

/** The canonical envelope actor for direct CLI emissions (D-D). */
export const LOCAL_HUMAN_ACTOR: Actor = { kind: "human", id: "local-user" };

/** The ratified commit identity of this repository (D-P) — re-exported from
 *  the ONE authoritative definition in repo/git.ts. */
export const COMMIT_IDENTITY = RATIFIED_IDENTITY;

/** All principal kinds the broker knows (D-D attribution domain). */
export const PRINCIPAL_KINDS: readonly Actor["kind"][] = [
  "human",
  "agent",
  "tool",
  "extension",
  "research",
  "system",
] as const;

/** The broker principal for the human at the terminal, wired to the graph node. */
export function humanPrincipal(runId?: string): Principal {
  return runId === undefined
    ? { kind: "human", id: HUMAN_PRINCIPAL_ID }
    : { kind: "human", id: HUMAN_PRINCIPAL_ID, runId };
}

/** The supervised agent principal for a run (deterministic derivation). */
export function agentPrincipalForRun(runId: string): Principal {
  return { kind: "agent", id: `agent:${runId.slice(-8).toLowerCase()}` };
}

/** The workflow engine's agent principal. */
export function workflowAgentPrincipal(): Principal {
  return { kind: "agent", id: "agent:workflow" };
}

/** The research actor for a declared research principal id. */
export function researchActorFor(principalId: string): Actor {
  return { kind: "research", id: principalId };
}

/* ─────────────────────────  observed actors (fold)  ───────────────────────── */

export interface ObservedActor {
  kind: string;
  id: string;
  /** Envelope events attributed to this actor (D-D: every envelope has one). */
  events: number;
  /** Broker decision records attributed to this principal id. */
  decisions: number;
  /** Distinct runs in which this actor appeared. */
  runs: number;
}

interface ActorTally {
  events: number;
  decisions: number;
  runs: Set<string>;
}

/**
 * Deterministic fold over journal records: WHO acted in these records.
 * Events contribute their envelope actor (D-D); decision records contribute
 * their principal. Output is sorted by (kind, id) — byte-stable for the same
 * input, always.
 */
export function observedActorsFromRecords(records: readonly JournalRecord[], runId: string, into?: Map<string, ActorTally>): Map<string, ActorTally> {
  const tally = into ?? new Map<string, ActorTally>();
  const touch = (kind: string, id: string): ActorTally => {
    const key = `${kind}\u0000${id}`;
    let t = tally.get(key);
    if (t === undefined) {
      t = { events: 0, decisions: 0, runs: new Set<string>() };
      tally.set(key, t);
    }
    t.runs.add(runId);
    return t;
  };
  for (const rec of records) {
    if (rec.k === "evt") {
      const actor = rec.env.actor;
      if (actor && typeof actor.kind === "string" && typeof actor.id === "string") {
        touch(actor.kind, actor.id).events++;
      }
    } else if (rec.k === "decision") {
      const p = rec.decision.principal;
      if (p && typeof p.kind === "string" && typeof p.id === "string") {
        touch(p.kind, p.id).decisions++;
      }
    }
  }
  return tally;
}

function tallyToSorted(tally: Map<string, ActorTally>): ObservedActor[] {
  const out: ObservedActor[] = [];
  for (const [key, t] of tally) {
    const idx = key.indexOf("\u0000");
    out.push({ kind: key.slice(0, idx), id: key.slice(idx + 1), events: t.events, decisions: t.decisions, runs: t.runs.size });
  }
  out.sort((a, b) => (a.kind === b.kind ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.kind < b.kind ? -1 : 1));
  return out;
}

/* ─────────────────────────────  the report  ───────────────────────────── */

export interface CommitIdentityMeasurement {
  measured: boolean;
  note?: string;
  branch?: string | null;
  head_author?: string | null;
  audited_commits?: number;
  violations?: Array<{ sha: string; author: string }>;
}

export interface SecretProfile {
  name: string;
  /** The principal-id patterns granted read access (from vaerion.yaml). */
  granted: string[];
}

export interface IdentityReport {
  workspace: { root: string; runs: number };
  actor_law: {
    human_principal_id: string;
    local_actor: Actor;
    principal_kinds: string[];
    ratified_commit_identity: string;
    authority: string;
  };
  observed_actors: ObservedActor[];
  commit_identity: CommitIdentityMeasurement;
  secret_profiles: SecretProfile[];
  read_only: string;
}

/** Input is structural (L2 never imports the L4 workspace helper). */
export interface MeasureIdentityInput {
  root: string;
  journalDir: string;
  /** Declared secret profiles from the validated config (names + grants), or null. */
  secrets: Readonly<Record<string, { grant?: string[] }>> | null;
  /** Set false to skip the git measurement entirely (tests, non-repo callers). */
  measureGit?: boolean;
}

/**
 * Measure identity in one workspace: the actor law, the actors observed in
 * this workspace's journals (deterministic fold), the repository commit
 * identity (D-P, via the SAME primitives `vae repo` uses), and the declared
 * secret PROFILES — names only, never values (ADR-0013).
 */
export async function measureIdentity(input: MeasureIdentityInput): Promise<IdentityReport> {
  const runs = await listJournals(input.journalDir);
  const tally = new Map<string, ActorTally>();
  for (const run of runs) {
    const read = await readJournal(`${input.journalDir}/${run.run_id}.ndjson`).catch(() => null);
    if (!read) continue;
    observedActorsFromRecords(read.records, run.run_id, tally);
  }

  let commitIdentity: CommitIdentityMeasurement;
  if (input.measureGit === false) {
    commitIdentity = { measured: false, note: "git measurement skipped by caller" };
  } else {
    try {
      const intel: RepositoryIntel = await measureRepository(input.root);
      commitIdentity = {
        measured: true,
        branch: intel.branch,
        head_author: intel.headAuthor === null ? null : `${intel.headAuthor.name} <${intel.headAuthor.email}>`,
        audited_commits: intel.auditedCommits,
        violations: intel.identityViolations.map((v) => ({ sha: v.sha, author: `${v.name} <${v.email}>` })),
      };
    } catch (err) {
      // Not a git repository (or git unusable): an honest, measured absence —
      // the same law `vae repo` applies (E2300/E2301), reported, never faked.
      commitIdentity = isVaerionError(err)
        ? { measured: false, note: `${err.code}: ${err.message}` }
        : { measured: false, note: "git state could not be measured" };
    }
  }

  const secretProfiles: SecretProfile[] = Object.entries(input.secrets ?? {})
    .map(([name, entry]) => ({ name, granted: [...(entry.grant ?? [])] }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return {
    workspace: { root: input.root, runs: runs.length },
    actor_law: {
      human_principal_id: HUMAN_PRINCIPAL_ID,
      local_actor: { ...LOCAL_HUMAN_ACTOR },
      principal_kinds: [...PRINCIPAL_KINDS],
      ratified_commit_identity: `${COMMIT_IDENTITY.name} <${COMMIT_IDENTITY.email}>`,
      authority: "constitution v1.3 D-D (actor + cause), D-P (git identity); one identity module, no call-site literals",
    },
    observed_actors: tallyToSorted(tally),
    commit_identity: commitIdentity,
    secret_profiles: secretProfiles,
    read_only: "every value was measured from this workspace — nothing was created, modified, or resolved (secret names only, never values)",
  };
}
