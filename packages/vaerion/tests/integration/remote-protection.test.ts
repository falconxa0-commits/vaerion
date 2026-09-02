/**
 * The remote protection law (ASCENSION XIX Phase 12; constitution v1.6 A6, D-Q).
 *
 * Contract matrix:
 *   1. The D-Q descriptor of record — the ONLY protection state the tool
 *      applies (no force-push, no deletion, linear history, enforced for
 *      administrators; required checks STAGED fail-closed).
 *   2. The staged fail-closed law — no check is required until a measured
 *      green run of it exists.
 *   3. Token discipline — environment only, never the tree, never echoed.
 *   4. The report of record — deterministic, D-S labeled, honest about the
 *      probe that is deliberately NOT EXECUTED (a destructive force-push
 *      against the protected ref itself).
 *   5. The workflow runs least-privileged.
 */

import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LAW_DESCRIPTOR,
  REMOTE_PROTECTION_SCHEMA,
  guardElevation,
  loadToken,
  protectionBody,
  renderProtectionReport,
  slugFromRemoteUrl,
  verifyAgainstDescriptor,
  type RemoteProtectionReport,
} from "../../../../tools/remote-protect.ts";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");

/* ───────────────────────────  1. the descriptor of record  ─────────────────────────── */

describe("the D-Q descriptor of record (v1.6 A6)", () => {
  test("no force-push, no deletion, linear history, enforced for administrators", () => {
    expect(LAW_DESCRIPTOR.allow_force_pushes).toBe(false);
    expect(LAW_DESCRIPTOR.allow_deletions).toBe(false);
    expect(LAW_DESCRIPTOR.required_linear_history).toBe(true);
    expect(LAW_DESCRIPTOR.enforce_admins).toBe(true);
  });

  test("STAGED fail-closed: no required checks, no review gate, no restrictions by default", () => {
    // P6: a check that cannot run is not a check — required status checks are
    // only elevated after a measured green run exists (Phase 13).
    expect(LAW_DESCRIPTOR.required_status_checks).toBeNull();
    expect(LAW_DESCRIPTOR.required_pull_request_reviews).toBeNull();
    expect(LAW_DESCRIPTOR.restrictions).toBeNull();
  });

  test("the PUT body mirrors the descriptor exactly (the applied state IS the law)", () => {
    const body = protectionBody(LAW_DESCRIPTOR);
    expect(body.allow_force_pushes).toBe(false);
    expect(body.allow_deletions).toBe(false);
    expect(body.required_linear_history).toBe(true);
    expect(body.enforce_admins).toBe(true);
    expect(body.required_status_checks).toBeNull();
  });

  test("the PUT body can elevate checks ONLY through the descriptor's staged field", () => {
    const body = protectionBody({ ...LAW_DESCRIPTOR, required_status_checks: ["verification (all gates)"] });
    expect(body.required_status_checks).toEqual({ strict: false, contexts: ["verification (all gates)"] });
    // Elevation cannot drift the rest of the descriptor.
    expect(body.allow_force_pushes).toBe(false);
    expect(body.enforce_admins).toBe(true);
  });

  test("verification names every drift from the descriptor", () => {
    const drifted = verifyAgainstDescriptor({
      allow_force_pushes: true, // a violation
      allow_deletions: false,
      required_linear_history: true,
      enforce_admins: true,
      required_status_checks: null,
    });
    const forcePush = drifted.find((f) => f.check === "descriptor.allow_force_pushes")!;
    expect(forcePush.ok).toBe(false);
    expect(forcePush.detail).toContain("law requires false");
    expect(drifted.filter((f) => f.ok).length).toBeGreaterThan(0);
  });

  test("GitHub's `{ enabled }` wrapper form is unwrapped before comparison (measured live)", () => {
    // The real GET /branches/main/protection returns the wrapped shape —
    // comparing raw objects to booleans would flag every compliant setting.
    const wrapped = verifyAgainstDescriptor({
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
      required_linear_history: { enabled: true },
      enforce_admins: { url: "https://api.github.com/repos/x/y/branches/main/protection/enforce_admins", enabled: true },
      required_status_checks: null,
    });
    expect(wrapped.every((f) => f.ok)).toBe(true);
  });
});

/* ─────────────────────────────  2. token discipline  ───────────────────────────── */

describe("the elevation guard — staged fail-closed (P6)", () => {
  test("elevation is REFUSED without a measured green record", () => {
    expect(() => guardElevation("/nonexistent/record.json", ["verification (all gates)"])).toThrow(/a check that cannot run is not a check/);
  });

  test("elevation is REFUSED on a red or unmeasured record", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vae-protect-guard-"));
    try {
      const red = join(dir, "red.json");
      await writeFile(red, JSON.stringify({ ok: false, measured: { testsFailed: 3 } }));
      expect(() => guardElevation(red, ["c"])).toThrow(/not a measured green run/);
      const unmeasured = join(dir, "unmeasured.json");
      await writeFile(unmeasured, JSON.stringify({ ok: true }));
      expect(() => guardElevation(unmeasured, ["c"])).toThrow(/not a measured green run/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("elevation is GRANTED on a measured green record; staging needs no guard", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vae-protect-guard-"));
    try {
      const green = join(dir, "green.json");
      await writeFile(green, JSON.stringify({ ok: true, measured: { testsFailed: 0, testsPassed: 475 } }));
      expect(() => guardElevation(green, ["verification (all gates)"])).not.toThrow();
      expect(() => guardElevation(green, null)).not.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("token discipline (blocker 3 — no secret material in the tree)", () => {
  test("the token is read from the environment only; absence fails closed with guidance", () => {
    expect(() => loadToken({})).toThrow(/VAE_GITHUB_TOKEN/);
    expect(() => loadToken({ VAE_GITHUB_TOKEN: "  " })).toThrow(/VAE_GITHUB_TOKEN/);
  });

  test("the tool source carries no token material (structural hygiene pin)", async () => {
    const source = await readFile(join(ROOT, "tools", "remote-protect.ts"), "utf8");
    expect(source).not.toMatch(/ghp_[A-Za-z0-9]/);
    expect(source).not.toMatch(/github_pat_[A-Za-z0-9]/);
  });
});

/* ────────────────────────  3. the report of record  ──────────────────────── */

describe("the protection report — deterministic, D-S labeled, honest", () => {
  const report: RemoteProtectionReport = {
    schema: REMOTE_PROTECTION_SCHEMA,
    slug: "falconxa0-commits/vaerion",
    branch: "main",
    descriptor: LAW_DESCRIPTOR,
    applied: true,
    probes: [
      { check: "probe.deletion-refusal", ok: true, detail: "DELETE branches/main answered HTTP 403 — refused by protection as the law requires; the ref is untouched", honesty: "VERIFIED" },
      { check: "probe.force-push-refusal", ok: true, detail: "enforced by the measured allow_force_pushes=false setting; a destructive live force-push against main is NOT EXECUTED on purpose", honesty: "NOT EXECUTED" },
    ],
    findings: [
      { check: "descriptor.allow_force_pushes", ok: true, detail: "measured allow_force_pushes=false — law requires false", honesty: "VERIFIED" },
    ],
    ok: true,
  };

  test("deterministic: the same measured state renders byte-identical markdown", () => {
    expect(renderProtectionReport(report)).toBe(renderProtectionReport(report));
  });

  test("carries the schema, the D-S labels, and the honest NOT EXECUTED probe", () => {
    const md = renderProtectionReport(report);
    expect(md).toContain("Remote Protection of Record (D-Q, v1.6 A6 Phase 12)");
    expect(md).toContain("[VERIFIED]");
    expect(md).toContain("[NOT EXECUTED]");
    expect(md).toContain("would risk the protected ref itself");
    expect(md).toContain("STAGED");
  });

  test("a red report says NOT PROTECTED, never narrates protection into being", () => {
    const red: RemoteProtectionReport = { ...report, ok: false, applied: false };
    expect(renderProtectionReport(red)).toContain("NOT PROTECTED");
  });
});

/* ─────────────────────────────  4. wiring pins  ───────────────────────────── */

describe("the remote protection wiring", () => {
  test("the slug is parsed from the measured remote URL, never hardcoded", () => {
    expect(slugFromRemoteUrl("https://auren-via-credential-file@github.com/falconxa0-commits/vaerion.git")).toBe(
      "falconxa0-commits/vaerion",
    );
    expect(slugFromRemoteUrl("git@github.com:falconxa0-commits/vaerion.git")).toBe("falconxa0-commits/vaerion");
    expect(() => slugFromRemoteUrl("https://gitlab.com/a/b.git")).toThrow(/cannot parse/);
  });

  test("the workflow runs least-privileged (v1.6 A6 Phase 12)", async () => {
    const workflow = await readFile(join(ROOT, ".github", "workflows", "verify.yml"), "utf8");
    expect(workflow).toContain("permissions:");
    expect(workflow).toContain("contents: read");
  });

  test("the ONE applier: the tool lives in tools/ and is referenced by the report of record", async () => {
    // The applier exists at the sanctioned path (tools/ — D-R's domain of
    // operators); the report of record names it as its generator.
    await readFile(join(ROOT, "tools", "remote-protect.ts"), "utf8");
    const md = await readFile(join(ROOT, "docs", "security", "REMOTE-PROTECTION.md"), "utf8");
    expect(md).toContain("tools/remote-protect.ts");
  });
});
