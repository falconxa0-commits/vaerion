import { describe, expect, it } from "bun:test";
import { ToolRegistry } from "../src/registry.ts";
import { blobsVerifyTool, configValidateTool, journalVerifyTool } from "../src/builtin/selfcheck.ts";
import { validateToolInput } from "../src/spec.ts";

function fakeTool(name: string) {
  return {
    spec: {
      name,
      version: 1 as const,
      effectClass: "pure" as const,
      deterministic: true,
      capabilities: [{ domain: "engine", action: "selfcheck", scope: "core" }],
      timeoutMs: 1000,
      retry: { maxAttempts: 1, backoffMs: 0, retryable: [] as never[] },
      description: "test tool",
      inputSchema: { type: "object" as const, required: ["x"], properties: { x: { type: "string" as const } } },
    },
    execute: (input: unknown) => ({ ok: true as const, output: { echo: JSON.parse(JSON.stringify(input ?? null)) } }),
  };
}

describe("tool registry (D16.1)", () => {
  it("registers, resolves, and refuses duplicates", () => {
    const reg = new ToolRegistry();
    reg.register(fakeTool("demo.tool"));
    expect(reg.has("demo.tool")).toBeTrue();
    expect(reg.spec("demo.tool").name).toBe("demo.tool");
    expect(() => reg.register(fakeTool("demo.tool"))).toThrow(/already registered/);
  });

  it("refuses unregistered tools (they are not invocable)", () => {
    const reg = new ToolRegistry();
    expect(() => reg.spec("ghost.tool")).toThrow(/not present in the versioned tool registry/);
  });

  it("validates input against the declared contract before execution (D16.2)", () => {
    const reg = new ToolRegistry();
    reg.register(fakeTool("demo.tool"));
    const refused = reg.invokeValidated({ tool: "demo.tool", input: {} });
    expect(refused.ok).toBeFalse();
    if (!refused.ok) {
      expect(refused.failure.kind).toBe("refusal");
      expect(refused.failure.message).toContain("required field 'x'");
    }
    const ok = reg.invokeValidated({ tool: "demo.tool", input: { x: "hello" } });
    expect(ok.ok).toBeTrue();
  });

  it("refuses wrong-typed input (fail-closed, D16.2)", () => {
    const err = validateToolInput({ x: 42 }, { type: "object", required: ["x"], properties: { x: { type: "string" } } });
    expect(err).toBeDefined();
    expect(err?.message).toContain("must be string");
  });
});

describe("engine-internal selfcheck tools", () => {
  it("journal.verify reports chain status through its port", () => {
    const tool = journalVerifyTool({ verifyJournalFile: () => ({ ok: true, entries: 3, head: "ab".repeat(32) }) });
    const result = tool.execute({ journal: "audit" });
    expect(result).toEqual({ ok: true, output: { ok: true, entries: 3, head: "ab".repeat(32), broken_at: null } });
  });

  it("config.validate surfaces provenance (D19.1)", () => {
    const tool = configValidateTool({ validateWorkspaceConfig: () => ({ ok: true, errors: [], provenance: { "project.name": "project" } }) });
    const result = tool.execute({});
    expect(result).toEqual({ ok: true, output: { ok: true, errors: [], provenance: { "project.name": "project" } } });
  });

  it("blobs.verify reports missing references (D9.5)", () => {
    const tool = blobsVerifyTool({
      verifyBlob: (ref) => ref !== "blake3:missing",
      listBlobRefsFromJournal: () => ["blake3:present", "blake3:missing"],
    });
    const result = tool.execute({ journal: "audit" });
    expect(result).toEqual({ ok: true, output: { refs: 2, missing: ["blake3:missing"] } });
  });
});
