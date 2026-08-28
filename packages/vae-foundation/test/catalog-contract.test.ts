/**
 * Catalog contract test (D3.8, D17.6): the embedded catalog in
 * vae-foundation MUST equal spec/errors.yaml — the source of truth.
 * Drift between the two is contract drift (C2, Article XII) and this
 * test blocks it. Codegen replaces the hand-sync at MS-5.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { ERROR_CATALOG, CATALOG_SIZE } from "../src/error-catalog.ts";
import { parseVaerYaml } from "../../vae-config/src/vaeryaml.ts";

interface SpecCode {
  name: string;
  class: string;
  message: string;
  fix: string;
}

function loadSpec(): Map<string, SpecCode> {
  const path = new URL("../../../spec/errors.yaml", import.meta.url).pathname;
  const text = readFileSync(path, "utf8");
  const doc = parseVaerYaml(text) as unknown as { codes: Record<string, SpecCode> };
  return new Map(Object.entries(doc.codes));
}

describe("E#### catalog contract", () => {
  const spec = loadSpec();

  it("embedded catalog matches spec/errors.yaml exactly", () => {
    expect(CATALOG_SIZE).toBe(spec.size);
    for (const [code, entry] of spec) {
      const embedded = ERROR_CATALOG[code];
      if (embedded === undefined) throw new Error(`code ${code} missing from embedded catalog`);
      expect(embedded?.name).toBe(entry.name);
      expect(embedded?.class as string).toBe(entry.class);
      expect(embedded?.message).toBe(entry.message);
      expect(embedded?.fix).toBe(entry.fix);
    }
  });

  it("every catalog class maps into the constitutional exit alphabet", () => {
    for (const entry of Object.values(ERROR_CATALOG)) {
      expect(["usage", "refusal", "run_failure", "internal"]).toContain(entry.class);
    }
  });

  it("every entry carries a Fix line (errors are curriculum, D3.8)", () => {
    for (const entry of Object.values(ERROR_CATALOG)) {
      expect(entry.fix.length).toBeGreaterThan(10);
    }
  });
});
