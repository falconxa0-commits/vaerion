/**
 * Daemon unit surface — openapi generation (determinism + route coverage)
 * and dispatch primitives. Wire behavior lives in the integration suites.
 */

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateOpenApi } from "../../src/api/openapi.ts";
import { DAEMON_ROUTES, matchRoute } from "../../src/api/routes.ts";
import { statusForCode } from "../../src/api/server.ts";

describe("daemon openapi generation (ADR-0010 decision 4, ADR-0020)", () => {
  test("generation is deterministic: two calls are byte-identical", () => {
    const a = JSON.stringify(generateOpenApi());
    const b = JSON.stringify(generateOpenApi());
    expect(a).toBe(b);
    expect(a).not.toContain("generatedAt");
  });

  test("every implemented route is described and every described route exists", () => {
    const doc = generateOpenApi() as { paths: Record<string, Record<string, unknown>> };
    for (const route of DAEMON_ROUTES) {
      const item = doc.paths[route.path];
      expect(item).toBeDefined();
      expect(item?.[route.method.toLowerCase()]).toBeDefined();
    }
    // No invented routes: paths are exactly the route table's paths.
    expect(Object.keys(doc.paths).length).toBe(new Set(DAEMON_ROUTES.map((r) => r.path)).size);
    // Security law is represented: authed routes carry the bearer requirement.
    for (const route of DAEMON_ROUTES) {
      const op = doc.paths[route.path]?.[route.method.toLowerCase()] as { security?: unknown };
      if (route.auth) expect(op.security).toBeDefined();
      else expect(op.security).toBeUndefined();
    }
  });

  test("the committed spec/openapi.json matches the generator (C4 mirror)", async () => {
    // C4 enforces this at the gate level; this test pins it at the unit level
    // with a precise failure message for the regeneration command.
    const committed = JSON.parse(await readFile(join(import.meta.dir, "../../../../spec/openapi.json"), "utf8")) as unknown;
    expect(JSON.stringify(committed)).toBe(JSON.stringify(generateOpenApi()));
  });
});

describe("daemon route matching", () => {
  test("path parameters are extracted and decoded", () => {
    const m = matchRoute("GET", "/runs/crn_run_01ABCDEFGHJKMNPQRSTVWXYZ");
    expect(m?.route.operationId).toBe("getRun");
    expect(m?.params.run_id).toBe("crn_run_01ABCDEFGHJKMNPQRSTVWXYZ");
    const a = matchRoute("POST", "/runs/crn_run_01ABCDEFGHJKMNPQRSTVWXYZ/answer");
    expect(a?.route.operationId).toBe("answerGate");
    const model = matchRoute("GET", "/models/mockbrain%2Fmock-1");
    expect(model?.params.logical).toBe("mockbrain/mock-1");
  });

  test("method and path mismatches do not match", () => {
    expect(matchRoute("DELETE", "/runs")).toBeNull();
    expect(matchRoute("GET", "/nope")).toBeNull();
    expect(matchRoute("GET", "/runs/extra/segments")).toBeNull();
  });
});

describe("daemon error mapping", () => {
  test("codes map to stable HTTP statuses", () => {
    expect(statusForCode("E2000")).toBe(401);
    expect(statusForCode("E2001")).toBe(403);
    expect(statusForCode("E2002")).toBe(404);
    expect(statusForCode("E2003")).toBe(404);
    expect(statusForCode("E2004")).toBe(403);
    expect(statusForCode("E2005")).toBe(409);
    expect(statusForCode("E1300")).toBe(403);
    expect(statusForCode("E1600")).toBe(400);
  });
});
