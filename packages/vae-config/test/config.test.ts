import { describe, expect, it } from "bun:test";
import { parseVaerYaml } from "../src/vaeryaml.ts";
import { validateConfig, DEFAULT_CONFIG, CURRENT_SCHEMA_VERSION, applyProfileOverlay } from "../src/schema.ts";
import { resolveConfig, mapEnvironment, pinSnapshot, LAYER_PRECEDENCE } from "../src/resolve.ts";
import { findWorkspaceRoot, workspacePaths } from "../src/workspace.ts";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("VaerYaml strict subset", () => {
  it("parses block mappings with comments", () => {
    const doc = parseVaerYaml(`
# a comment
schemaVersion: "0.1"
project:
  name: my-service   # trailing comment
  description: "does things"
`);
    expect(doc).toEqual({ schemaVersion: "0.1", project: { name: "my-service", description: "does things" } });
  });

  it("parses flow collections and inline lists", () => {
    const doc = parseVaerYaml(`a: [one, 2, "three"]
b: { x: 1, y: true }
`);
    expect(doc).toEqual({ a: ["one", 2, "three"], b: { x: 1, y: true } });
  });

  it("parses sequences of mappings (run-plan shape)", () => {
    const doc = parseVaerYaml(`steps:
  - id: scan
    tool: journal.verify
  - id: report
    needs: [scan]
`);
    expect(doc).toEqual({
      steps: [
        { id: "scan", tool: "journal.verify" },
        { id: "report", needs: ["scan"] },
      ],
    });
  });

  it("accepts sequences at the same indent as their key", () => {
    const doc = parseVaerYaml(`items:
- a
- b
`);
    expect(doc).toEqual({ items: ["a", "b"] });
  });

  it("refuses anchors, aliases, tags, multi-doc, tabs, block scalars", () => {
    expect(() => parseVaerYaml("a: &anchor 1")).toThrow(/anchors/);
    expect(() => parseVaerYaml("a: *anchor")).toThrow(/aliases/);
    expect(() => parseVaerYaml("a: !!str 1")).toThrow(/tags/);
    expect(() => parseVaerYaml("---\na: 1\n---\nb: 2")).toThrow(/multi-document/);
    expect(() => parseVaerYaml("a:\n\t- x")).toThrow(/tab/);
    expect(() => parseVaerYaml("a: |\n  text")).toThrow(/block scalars/);
  });

  it("refuses duplicate keys and unterminated quotes", () => {
    expect(() => parseVaerYaml("a: 1\na: 2")).toThrow(/duplicate key/);
    expect(() => parseVaerYaml('a: "oops')).toThrow(/unterminated/);
  });

  it("parses scalars deterministically", () => {
    expect(parseVaerYaml("n: 42")).toEqual({ n: 42 });
    expect(parseVaerYaml("f: 1.5")).toEqual({ f: 1.5 });
    expect(parseVaerYaml("t: true\nnil: null\ns: plain")).toEqual({ t: true, nil: null, s: "plain" });
    expect(parseVaerYaml("esc: \"line\\nbreak\"")).toEqual({ esc: "line\nbreak" });
  });
});

describe("schema validation (D19.2, D19.3)", () => {
  it("fills ratified defaults for an absent engine section", () => {
    const cfg = validateConfig(parseVaerYaml(`schemaVersion: "0.1"\nproject:\n  name: demo\n`));
    expect(cfg.engine).toEqual(DEFAULT_CONFIG.engine);
    expect(cfg.permissions.net.allowHosts).toEqual([]);
  });

  it("refuses unknown keys (never ignored)", () => {
    expect(() =>
      validateConfig(parseVaerYaml(`schemaVersion: "0.1"\nproject:\n  name: demo\ntelemetry:\n  enabled: true\n`)),
    ).toThrow(/unknown key 'telemetry'/);
  });

  it("refuses unsupported schema versions", () => {
    expect(() => validateConfig(parseVaerYaml(`schemaVersion: "9.9"\nproject:\n  name: demo\n`))).toThrow(/supported range/);
  });

  it("refuses malformed project names and non-decimal money", () => {
    expect(() => validateConfig(parseVaerYaml(`schemaVersion: "0.1"\nproject:\n  name: Bad_Name\n`))).toThrow(/Invalid project name/);
    expect(() =>
      validateConfig(parseVaerYaml(`schemaVersion: "0.1"\nproject:\n  name: demo\nengine:\n  runs:\n    budget:\n      usd: 5.0\n`)),
    ).toThrow(/decimal string/);
  });

  it("validates profiles against the same schema (D19.4)", () => {
    const cfg = validateConfig(parseVaerYaml(`
schemaVersion: "0.1"
project:
  name: demo
profiles:
  strict:
    engine:
      runs:
        budget:
          maxSteps: 8
`));
    const overlay = applyProfileOverlay(cfg, parseVaerYaml(`engine:\n  runs:\n    budget:\n      maxSteps: 8\n`));
    expect(overlay.engine.runs.budget.maxSteps).toBe(8);
    expect(overlay.engine.journal.verifyOnStart).toBe(true);
  });
});

describe("layered resolution with provenance (D19.1)", () => {
  const projectDoc = parseVaerYaml(`schemaVersion: "0.1"\nproject:\n  name: demo\n`);
  const engineDoc = parseVaerYaml(`schemaVersion: "0.1"\nproject:\n  name: engine-default\nengine:\n  journal:\n    verifyOnStart: false\n`);

  it("resolves precedence: project beats engine beats defaults", () => {
    const r = resolveConfig({ projectDoc, engineDoc });
    expect(r.config.project.name).toBe("demo");
    expect(r.provenance["project.name"]).toBe("project");
    expect(r.config.engine.journal.verifyOnStart).toBeFalse();
    expect(r.provenance["engine.journal.verifyOnStart"]).toBe("engine");
  });

  it("fingerprints identical configs identically", () => {
    const a = resolveConfig({ projectDoc });
    const b = resolveConfig({ projectDoc: parseVaerYaml(`project:\n  name: demo\nschemaVersion: "0.1"\n`) });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("applies profile overlays and records the layer", () => {
    const withProfile = parseVaerYaml(`schemaVersion: "0.1"\nproject:\n  name: demo\nprofiles:\n  tight:\n    engine:\n      runs:\n        budget:\n          maxSteps: 4\n`);
    const r = resolveConfig({ projectDoc: withProfile, profile: "tight" });
    expect(r.config.engine.runs.budget.maxSteps).toBe(4);
    expect(r.provenance["engine.runs.budget.maxSteps"]).toBe("profile");
  });

  it("refuses undeclared profiles instead of guessing", () => {
    expect(() => resolveConfig({ projectDoc, profile: "ghost" })).toThrow(/not declared/);
  });

  it("refuses profile conflicts between env and flag (Article XI)", () => {
    expect(() => resolveConfig({ projectDoc, profile: "a", environment: { VAE_PROFILE: "b" } })).toThrow(/profile conflict/);
  });

  it("maps only enumerated environment keys (D19.6)", () => {
    const mapped = mapEnvironment({ VAE_PROFILE: "work", VAE_SECRET_SOMETHING: "x", PATH: "/bin" });
    expect(mapped).toEqual({ VAE_PROFILE: "work" });
  });

  it("pins immutable run-start snapshots (D19.7)", () => {
    const r = resolveConfig({ projectDoc });
    const snap = pinSnapshot(r);
    expect(snap.fingerprint).toBe(r.fingerprint);
    expect(Object.isFrozen(snap.config)).toBeTrue();
    expect(LAYER_PRECEDENCE).toEqual(["defaults", "engine", "profile", "project", "environment", "flag"]);
  });
});

describe("workspace discovery", () => {
  const base = join(tmpdir(), `vae-wstest-${process.pid}-${Date.now()}`);

  it("finds the nearest ancestor workspace", () => {
    const root = join(base, "proj");
    const nested = join(root, "src", "deep");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, "vaerion.yaml"), 'schemaVersion: "0.1"\nproject:\n  name: demo\n');
    try {
      expect(findWorkspaceRoot(nested)).toBe(root);
      const p = workspacePaths(root);
      expect(p.journalDir).toBe(join(root, ".vaerion", "journal"));
      expect(p.configFile).toBe(join(root, "vaerion.yaml"));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("returns undefined outside a workspace", () => {
    expect(findWorkspaceRoot("/")).toBeUndefined();
  });

  it("uses the current ratified schema version", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe("0.1");
  });
});
