/**
 * Vaerion — OpenAPI description generated from the daemon route table
 * (MS-5, ADR-0010 decision 4 / ADR-0020 decision 6).
 *
 * The description is GENERATED, not authored: dispatch and documentation are
 * the same data, so an "API gap" is impossible by construction. Generation is
 * deterministic (fixed key order, no timestamps, no environment data) so the
 * committed contract spec/openapi.json can be verified byte-stable by
 * constitutional check C4.
 *
 * The daemon binds loopback with bearer pairing-token authn (ADR-0010); the
 * servers entry is relative ("/") because the only correct base is the local
 * daemon itself.
 */

import { DAEMON_ROUTES, type DaemonRoute } from "./routes.ts";
import { ENGINE_VERSION } from "../journal/writer.ts";
import { ENVELOPE_VERSION } from "../spine/envelope.ts";
import { EVENT_TYPES } from "../spine/event-types.ts";
import { ERROR_CATALOG } from "../kernel/errors.ts";

function jsonSchemaRefs(): Record<string, unknown> {
  return {
    EventEnvelope: {
      type: "object",
      description: "Journal-read event envelope (spec/schemas/envelope.schema.json, v1).",
      required: ["v", "type", "ts", "trace_id", "span_id", "actor", "cause", "payload", "seq"],
      additionalProperties: false,
      properties: {
        v: { type: "integer", const: ENVELOPE_VERSION },
        type: { type: "string", description: "Registered event type (spec/events/registry.json)." },
        ts: { type: "string", description: "RFC3339 millisecond UTC timestamp." },
        trace_id: { type: "string" },
        span_id: { type: "string" },
        actor: { type: "object" },
        cause: { type: "object" },
        payload: { type: "object" },
        seq: { type: "integer", minimum: 1, description: "Per-run journal sequence (cursor replay key)." },
      },
    },
    RunStatus: {
      type: "object",
      description: "One run's state folded deterministically from its hash-chained journal.",
      properties: {
        run_id: { type: "string" },
        status: { type: "string", enum: ["open", "awaiting_gate", "closed"] },
        journal_ok: { type: "boolean" },
        decisions: { type: "object", properties: { allow: { type: "integer" }, deny: { type: "integer" }, prompt: { type: "integer" } } },
        open_gates: { type: "array", items: { type: "object" } },
        resolved_gates: { type: "integer" },
        last_seq: { type: "integer" },
        receipt: { type: ["object", "null"] },
        agent: { type: ["object", "null"], description: "Agent-specific fold when the run is an agent run." },
        workflow: { type: ["object", "null"], description: "Workflow-specific fold when the run is a workflow run." },
        metrics: { type: ["object", "null"], description: "Agent metrics fold (tokens, micro-USD, steps, tools)." },
        note: { type: "string", description: "Honest state note (e.g. 'run accepted; first journal record pending' or a verification warning)." },
      },
    },
    ErrorResponse: {
      type: "object",
      description: "Stable machine-parseable error (the Fix: contract).",
      properties: {
        error: {
          type: "object",
          required: ["code", "name", "message", "fix"],
          properties: {
            code: { type: "string", pattern: "^E[0-9]{4}$" },
            name: { type: "string" },
            message: { type: "string" },
            fix: { type: "string" },
          },
        },
      },
    },
  };
}

function operationFor(route: DaemonRoute): Record<string, unknown> {
  const op: Record<string, unknown> = {
    operationId: route.operationId,
    summary: route.summary,
    description: route.description,
    tags: [route.tag],
    responses: Object.fromEntries(
      Object.entries(route.responses).map(([status, note]) => [
        status,
        {
          description: note,
          ...(status.startsWith("2") && status !== "204"
            ? {
                content:
                  note === "text/event-stream"
                    ? { "text/event-stream": { schema: { type: "string" } } }
                    : { "application/json": { schema: { $ref: "#/components/schemas/EventEnvelope" } } },
              }
            : {}),
        },
      ]),
    ),
  };
  if (route.auth) {
    op.security = [{ bearerToken: [] }];
  }
  if (route.requestBody !== undefined) {
    op.requestBody = {
      required: true,
      content: { "application/json": { schema: route.requestBody } },
    };
  }
  return op;
}

/** Deterministically generate the daemon's OpenAPI description. */
export function generateOpenApi(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of DAEMON_ROUTES) {
    const item = (paths[route.path] ?? {}) as Record<string, unknown>;
    item[route.method.toLowerCase()] = operationFor(route);
    if (route.path.includes("{run_id}")) {
      item.parameters = [
        {
          name: "run_id",
          in: "path",
          required: true,
          schema: { type: "string", pattern: "^crn_run_[0-9ABCDEFGHJKMNPQRSTVWXYZabcdefghjkmnpqrstvwxyz]{26}$" },
          description: "Run id (the journal name without its extension).",
        },
      ];
    }
    if (route.path.includes("{logical}")) {
      item.parameters = [
        { name: "logical", in: "path", required: true, schema: { type: "string" }, description: "Logical model id (provider/model)." },
      ];
    }
    paths[route.path] = item;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Vaerion local API",
      version: ENGINE_VERSION,
      summary: "The loopback daemon surface: the same contracts the CLI exercises, over HTTP/SSE.",
      description:
        "Generated from the daemon route table (ADR-0010 decision 4, ADR-0020). Every described route is implemented; every implemented route is described. Authentication is the first-run pairing token (Authorization: Bearer); only /health, /version and /openapi.json are open. The daemon binds loopback only and never makes outbound calls.",
      license: { name: "Apache License 2.0", identifier: "Apache-2.0" },
    },
    servers: [{ url: "/", description: "This local daemon (loopback only)." }],
    components: {
      securitySchemes: { bearerToken: { type: "http", scheme: "bearer", description: "Pairing token printed once at daemon start (VAE_TRUST pre-provisions headless starts)." } },
      schemas: jsonSchemaRefs(),
    },
    tags: [
      { name: "meta", description: "Unauthenticated metadata endpoints (ADR-0010)." },
      { name: "runs", description: "Run lifecycle over the wire." },
      { name: "events", description: "SSE streams with journal-cursor replay (R-RT1)." },
      { name: "models", description: "Gateway capability surface (names only, never secret values)." },
      { name: "tools", description: "Declared tool surface." },
      { name: "admin", description: "Daemon hygiene." },
    ],
    paths,
    "x-vaerion-contracts": {
      eventTypes: EVENT_TYPES.length,
      errorCodes: Object.keys(ERROR_CATALOG).length,
      envelopeVersion: ENVELOPE_VERSION,
      engineVersion: ENGINE_VERSION,
    },
  } as Record<string, unknown>;
}
