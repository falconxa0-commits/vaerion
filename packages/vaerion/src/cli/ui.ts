/* v8 ignore file — PHASE Ω rich-rendering layer.
 * WHY EXCLUDED FROM COVERAGE: this module is the TTY-only terminal design
 * language (panels, ANSI paint, spinner). Its activation gate is a real
 * interactive terminal (resolveProfile), so the non-TTY test harness cannot
 * execute it by design. The machine contract — plain mode and --json — is
 * fully covered by the suite and MUST stay byte-stable. The rich path is
 * verified by PTY evidence captured in the release audit instead of unit
 * assertions. Tokens mirror brand/BRAND-BOOK.md and tools/brand-render.ts.
 */
/**
 * Vaerion CLI — the terminal design language (PHASE Ω).
 *
 * One visual system for every command: tokens, primitives, and composite
 * components. Luxury is refinement, not decoration — every element here
 * marks verification state, organizes evidence, or quiets noise.
 *
 * Profile law:
 *   json   — stable NDJSON, untouched by this module (machine contract).
 *   plain  — the pipe/CI contract: stable text, no ANSI, byte-compatible
 *            with the historical output. Machines and tests depend on it.
 *   rich   — TTY-only by default (VAE_UI=rich forces it for evidence):
 *            Unicode panels, intelligent color, badges, receipts.
 */

import type { CliIo, OutputMode } from "./io.ts";
import { redactString } from "../kernel/redact.ts";
import { ERROR_CATALOG } from "../kernel/errors.ts";
import { SystemClock } from "../kernel/clock.ts";

/* ─────────────────────────────  profile  ─────────────────────────────── */

export type RenderProfile = "json" | "plain" | "rich";

export interface RenderEnv {
  tty: boolean;
  columns?: number;
  vars?: Record<string, string | undefined>;
}

export interface ResolvedProfile {
  profile: RenderProfile;
  ansi: boolean;
  width: number;
}

export function resolveProfile(mode: OutputMode, env: RenderEnv): ResolvedProfile {
  if (mode === "json") return { profile: "json", ansi: false, width: clampWidth(env.columns) };
  const vars = env.vars ?? {};
  const forced = vars.VAE_UI;
  if (forced === "rich") return { profile: "rich", ansi: true, width: clampWidth(env.columns) };
  if (forced === "plain") return { profile: "plain", ansi: false, width: clampWidth(env.columns) };
  const rich =
    env.tty &&
    !vars.NO_COLOR &&
    vars.TERM !== "dumb" &&
    vars.CI === undefined;
  return { profile: rich ? "rich" : "plain", ansi: rich, width: clampWidth(env.columns) };
}

function clampWidth(columns: number | undefined): number {
  const w = typeof columns === "number" && columns > 0 ? columns : 100;
  return Math.max(56, Math.min(120, w));
}

/* ─────────────────────────────  tokens  ──────────────────────────────── */

const RGB = {
  gold: [227, 179, 65] as const, // gold-bright — the accent on dark terminals
  success: [63, 155, 110] as const,
  error: [194, 78, 78] as const,
  warn: [201, 138, 31] as const,
  info: [107, 143, 163] as const,
  dim: [138, 138, 147] as const,
  hairline: [85, 85, 94] as const,
} as const;

/** The color painter. Disabled → identity (plain text, always safe). */
export class Ansi {
  constructor(readonly enabled: boolean) {}

  private paint(rgb: readonly [number, number, number] | readonly number[], s: string): string {
    if (!this.enabled) return s;
    return `\u001b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${s}\u001b[0m`;
  }

  gold(s: string): string { return this.paint(RGB.gold, s); }
  success(s: string): string { return this.paint(RGB.success, s); }
  error(s: string): string { return this.paint(RGB.error, s); }
  warn(s: string): string { return this.paint(RGB.warn, s); }
  info(s: string): string { return this.paint(RGB.info, s); }
  dim(s: string): string { return this.paint(RGB.dim, s); }
  hairline(s: string): string { return this.paint(RGB.hairline, s); }
  bold(s: string): string { return this.enabled ? `\u001b[1m${s}\u001b[0m` : s; }
}

/* ─────────────────────────────  symbols  ─────────────────────────────── */

export const SYM = {
  ok: "✓",
  fail: "✗",
  wait: "⏳",
  warn: "⚠",
  arrow: "→",
  dot: "·",
  ellipsis: "…",
} as const;

export type BadgeKind = "ok" | "fail" | "wait" | "warn" | "info";

export function badge(a: Ansi, kind: BadgeKind, text: string): string {
  const glyph = kind === "ok" ? SYM.ok : kind === "fail" ? SYM.fail : kind === "wait" ? SYM.wait : kind === "warn" ? SYM.warn : SYM.dot;
  const paint = kind === "ok" ? a.success.bind(a) : kind === "fail" ? a.error.bind(a) : kind === "wait" ? a.info.bind(a) : kind === "warn" ? a.warn.bind(a) : a.info.bind(a);
  return paint(` ${glyph} ${text} `);
}

/* ─────────────────────────────  text primitives  ─────────────────────── */

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, Math.max(1, n - 1)) + SYM.ellipsis : s;
}

/** Visible length ignoring ANSI escape sequences. */
export function visibleLength(s: string): number {
  return s.replace(/\u001b\[[0-9;]*m/g, "").length;
}

/** Greedy word wrap at VISIBLE width (ANSI-aware: escape codes carry no
 *  spaces, so word tokens never split an escape). Never returns empty
 *  array for "" — returns [""]. */
export function wrapText(text: string, width: number): string[] {
  const w = Math.max(12, width);
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (visibleLength(rawLine) <= w) {
      out.push(rawLine);
      continue;
    }
    let line = "";
    let lineVisible = 0;
    for (const word of rawLine.split(" ")) {
      const wordVisible = visibleLength(word);
      if (lineVisible === 0 && wordVisible > w) {
        // A single token longer than the line (plain text in practice).
        out.push(word.slice(0, w));
        continue;
      }
      if (lineVisible === 0) {
        line = word;
        lineVisible = wordVisible;
      } else if (lineVisible + 1 + wordVisible <= w) {
        line += " " + word;
        lineVisible += 1 + wordVisible;
      } else {
        out.push(line);
        line = word;
        lineVisible = wordVisible;
      }
    }
    if (line.length > 0) out.push(line);
  }
  return out.length > 0 ? out : [""];
}

function titleCase(s: string): string {
  return s.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─────────────────────────────  components  ──────────────────────────── */

export interface PanelOpts {
  title?: string;
  titleKind?: BadgeKind | "gold";
  subtitle?: string;
  lines: string[];
  width: number;
  accent?: "gold" | "success" | "error" | "warn" | "info" | "none";
  pad?: number;
}

/** Rounded panel with an optional inline title. Lines are soft-wrapped. */
export function panel(a: Ansi, opts: PanelOpts): string[] {
  const pad = opts.pad ?? 1;
  const inner = Math.max(16, opts.width - 2 - 2 * pad);
  const accent = opts.accent ?? "gold";
  const paintBorder =
    accent === "success" ? a.success.bind(a)
    : accent === "error" ? a.error.bind(a)
    : accent === "warn" ? a.warn.bind(a)
    : accent === "info" ? a.info.bind(a)
    : accent === "gold" ? a.hairline.bind(a)
    : (s: string) => a.dim(s);

  const wrapped: string[] = [];
  for (const line of opts.lines) wrapped.push(...wrapText(line, inner));

  const title = opts.title !== undefined ? ` ${opts.title} ` : "";
  const titleRendered =
    title === ""
      ? ""
      : opts.titleKind === undefined || opts.titleKind === "gold"
        ? a.gold(title)
        : a.bold(badge(a, opts.titleKind, title));

  const topRest = Math.max(0, inner + 2 * pad - visibleLength(titleRendered));
  const top = `╭${titleRendered}${paintBorder("─".repeat(topRest))}╮`;
  const bottom = `╰${paintBorder("─".repeat(inner + 2 * pad))}╯`;
  const body = wrapped.map((l) => `${paintBorder("│")}${" ".repeat(pad)}${l}${" ".repeat(Math.max(0, inner - visibleLength(l)))}${" ".repeat(pad)}${paintBorder("│")}`);
  const subtitleLine = opts.subtitle !== undefined
    ? [`${paintBorder("│")}${" ".repeat(pad)}${a.dim(truncate(opts.subtitle, inner))}${" ".repeat(Math.max(0, inner - Math.min(visibleLength(opts.subtitle), inner)))}${" ".repeat(pad)}${paintBorder("│")}`]
    : [];
  return [top, ...subtitleLine, ...body, bottom];
}

/** Aligned key/value block. Keys dim, values porcelain. Width is the FULL
 *  surface width — 4 columns are reserved for panel chrome so alignment
 *  survives nesting inside a panel (which soft-wraps at width-4). */
export function kvBlock(a: Ansi, pairs: Array<[string, string]>, width: number, indent = ""): string[] {
  const keyWidth = Math.min(24, Math.max(...pairs.map(([k]) => k.length), 0));
  const out: string[] = [];
  for (const [k, v] of pairs) {
    const valLines = wrapText(v, Math.max(16, width - 4 - keyWidth - 2 - indent.length));
    out.push(`${indent}${a.dim(k.padEnd(keyWidth))}  ${valLines[0] ?? ""}`);
    for (const extra of valLines.slice(1)) out.push(`${indent}${" ".repeat(keyWidth)}  ${extra}`);
  }
  return out;
}

/** A quiet metrics grid: N columns of label/value pairs.
 *  Removed in the Ω refinement pass: no current screen composes it — the
 *  design language carries exactly what screens use (brand book §7 keeps
 *  the pattern documented for future surfaces). */

export interface TableOpts {
  headers?: string[];
  rows: string[][];
  width: number;
  aligns?: Array<"left" | "right">;
  maxColumnWidth?: number;
  /** Per-cell colorizer, invoked on the PADDED cell (cells stay plain text). */
  cellPaint?: (row: number, col: number, cell: string) => string;
}

/** Fixed-width table: hairline header rule, no vertical rules (calm). */
export function tableBlock(a: Ansi, opts: TableOpts): string[] {
  const maxW = opts.maxColumnWidth ?? 44;
  const cols = opts.headers?.length ?? (opts.rows[0]?.length ?? 0);
  if (cols === 0) return [];
  const widths: number[] = [];
  for (let c = 0; c < cols; c++) {
    let w = opts.headers ? visibleLength(opts.headers[c] ?? "") : 0;
    for (const row of opts.rows) w = Math.max(w, visibleLength(row[c] ?? ""));
    widths.push(Math.min(maxW, Math.max(3, w)));
  }
  const total = widths.reduce((s, x) => s + x, 0) + (cols - 1) * 2;
  // Shave the widest columns if the table exceeds the width.
  let overflow = total - opts.width;
  while (overflow > 0) {
    const idx = widths.indexOf(Math.max(...widths));
    if (widths[idx]! <= 8) break;
    widths[idx] = widths[idx]! - 1;
    overflow--;
  }
  const fmtCell = (cell: string, c: number, row: number): string => {
    // Visible-length measurement; cells carry no ANSI (paint is applied last).
    const text = visibleLength(cell) > widths[c]! ? cell.slice(0, Math.max(1, widths[c]! - 1)) + SYM.ellipsis : cell;
    const align = opts.aligns?.[c] ?? "left";
    const padded = align === "right" ? text.padStart(widths[c]!) : text.padEnd(widths[c]!);
    return opts.cellPaint !== undefined ? opts.cellPaint(row, c, padded) : padded;
  };
  const out: string[] = [];
  if (opts.headers) {
    out.push(opts.headers.map((h, c) => a.dim(fmtCell(h, c, -1))).join("  ").trimEnd());
    out.push(a.hairline(widths.map((w) => "─".repeat(w)).join("  ")));
  }
  for (let r = 0; r < opts.rows.length; r++) {
    out.push(opts.rows[r]!.map((cell, c) => fmtCell(cell, c, r)).join("  ").trimEnd());
  }
  return out;
}

/* ─────────────────────────────  brand surfaces  ──────────────────────── */

/** The terminal mark: witness rule + V (mini seal), with the wordmark. */
export function banner(a: Ansi, version: string, width: number): string[] {
  const seal: string[] = [
    "────────────",
    " ╲        ╱ ",
    "  ╲      ╱  ",
    "   ╲    ╱   ",
    "    ╲  ╱    ",
    "     ╲╱     ",
  ];
  const right: string[][] = [
    [a.gold("V A E R I O N")],
    [a.dim(`v${version}`)],
    [a.dim("the AI-native development engine")],
    [a.dim("local-first · deterministic · auditable by construction")],
  ];
  const textWidth = Math.max(...right.map((lines) => Math.max(...lines.map(visibleLength))));
  const gap = 4;
  const totalWidth = 12 + gap + textWidth;
  const out: string[] = [];
  const pad = Math.max(0, width - totalWidth);
  const offset = Math.floor(pad / 2);
  const rows = Math.max(seal.length, right.length);
  for (let i = 0; i < rows; i++) {
    const left = seal[i] !== undefined ? (seal[i] as string) : " ".repeat(12);
    const rightLines = right[i] !== undefined ? (right[i] as string[]) : [""];
    out.push(" ".repeat(offset) + a.gold(left) + " ".repeat(gap) + rightLines.join(" "));
  }
  return out;
}

export function footer(a: Ansi): string[] {
  return [a.dim("─".repeat(24)), a.dim("vae · evidence over promises")];
}

/* ─────────────────────────────  error block  ─────────────────────────── */

export interface ErrorShape {
  code: string;
  message: string;
  fix?: string;
}

/** The educated error: title (code + catalog name), explanation, fix, docs. */
export function errorBlock(a: Ansi, err: ErrorShape, width: number): string[] {
  const catalog = (ERROR_CATALOG as Record<string, { name: string; summary: string } | undefined>)[err.code];
  const name = catalog?.name ?? "error";
  const lines: string[] = [];
  lines.push(err.message);
  if (catalog !== undefined && catalog.summary !== err.message && !err.message.includes(catalog.summary)) {
    lines.push(a.dim(catalog.summary));
  }
  if (err.fix !== undefined && err.fix.length > 0) {
    lines.push("");
    lines.push(`${a.gold("Fix:")} ${err.fix}`);
  }
  // Related command: the first `vae …` invocation named in the fix, if any.
  const related = /`(vae [a-z][a-z -]*(?:--[a-z-]+(?: [A-Z_]+)?)?)`/.exec(err.fix ?? "");
  const docs = `Docs: spec/errors.yaml#${err.code}`;
  lines.push(a.dim(related !== null ? `${docs} ${SYM.dot} related: ${related[1]}` : docs));
  return panel(a, { title: `${err.code} · ${name}`, titleKind: "fail", lines, width, accent: "error", pad: 1 });
}

/* ─────────────────────────────  receipt panel  ───────────────────────── */

interface ReceiptShape {
  run_id?: string;
  trace_id?: string;
  engine_version?: string;
  config_fingerprint?: string;
  closed_at?: string;
  opened_at?: string | null;
  counts?: Record<string, unknown>;
  journal?: { records?: number; head_hash?: string };
  summary?: string;
}

export function receiptPanel(a: Ansi, receipt: ReceiptShape | null | undefined, width: number): string[] | null {
  if (!receipt || typeof receipt !== "object") return null;
  const lines: string[] = [];
  const c = (receipt.counts ?? {}) as Record<string, number>;
  const counts = [
    ["records", c.records], ["events", c.events],
    ["allow", c.decisions_allow], ["deny", c.decisions_deny], ["prompt", c.decisions_prompt],
    ["gates", c.gates_opened], ["resolved", c.gates_resolved], ["snapshots", c.snapshots],
  ] as Array<[string, number | undefined]>;
  lines.push(
    counts
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${a.dim(k)} ${String(v)}`)
      .join(`  ${a.dim(SYM.dot)}  `),
  );
  if (receipt.journal?.head_hash !== undefined) {
    lines.push(`${a.dim("journal")} ${String(receipt.journal.records ?? "?")} records ${a.dim(SYM.dot)} head ${a.dim(String(receipt.journal.head_hash).slice(0, 16) + SYM.ellipsis)}`);
  }
  if (receipt.summary !== undefined) lines.push(a.dim(truncate(receipt.summary, width - 6)));
  const id = receipt.run_id !== undefined ? ` ${String(receipt.run_id).slice(-10)}` : "";
  return panel(a, { title: `receipt${id}`, lines, width, accent: "info" });
}

/* ─────────────────────────────  rich result dispatch  ────────────────── */

type Obj = Record<string, unknown>;

function str(o: Obj, k: string): string | undefined {
  const v = o[k];
  return typeof v === "string" ? v : undefined;
}
function num(o: Obj, k: string): number | undefined {
  const v = o[k];
  return typeof v === "number" ? v : undefined;
}
function sub(o: Obj, k: string): Obj | undefined {
  const v = o[k];
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined;
}
function hash12(s: string): string {
  return s.length > 14 ? s.slice(0, 12) + SYM.ellipsis : s;
}

/**
 * The rich renderer for every `result()` payload. Dispatches on the stable
 * `command` field; unknown shapes fall through to a structured generic
 * rendering so no command is ever left as raw console output.
 */
export function renderRichResult(a: Ansi, obj: Obj, width: number): string[] {
  const command = str(obj, "command");
  if (obj.note !== undefined && Object.keys(obj).length <= 2) {
    return [a.info(`${SYM.dot} ${redactString(String(obj.note))}`)];
  }
  switch (command) {
    case "doctor": return doctorReport(a, obj, width);
    case "dev": return devReport(a, obj, width);
    case "init": return initReport(a, obj, width);
    case "explain": return explainReport(a, obj, width);
    case "serve": return serveReport(a, obj, width);
    case "resume": return resumeReport(a, obj, width);
    case "run": return runReport(a, obj, width);
    case "journal": return journalReport(a, obj, width);
    case "package": return packageReport(a, obj, width);
    case "provenance": return provenanceReport(a, obj, width);
    case "repo": return repoReport(a, obj, width);
    case "ci": return ciReport(a, obj, width);
    case "release": return releaseReport(a, obj, width);
    case "welcome": return welcomeReport(a, obj, width);
    case "tour": return tourReport(a, obj, width);
    case "account": return accountReport(a, obj, width);
    case "ai": return aiReport(a, obj, width);
    case "center": return centerReport(a, obj, width);
    default: return genericRich(a, obj, width);
  }
}

/** Structured fallback: scalars inline, objects as sub-panels, arrays as bullets/tables. */
export function genericRich(a: Ansi, obj: Obj, width: number, title?: string): string[] {
  const out: string[] = [];
  const scalarPairs: Array<[string, string]> = [];
  const nested: Array<[string, Obj | unknown[]]> = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "object") nested.push([k, v as Obj | unknown[]]);
    else scalarPairs.push([k, redactString(String(v))]);
  }
  for (const [k, v] of nested) {
    if (Array.isArray(v)) {
      out.push(...arrayBlock(a, k, v, width));
    } else {
      out.push(...genericRich(a, v, width, titleCase(k)));
    }
  }
  if (scalarPairs.length > 0) {
    const body = kvBlock(a, scalarPairs, width);
    out.push(...(title !== undefined ? panel(a, { title, lines: body, width }) : body));
  }
  return out;
}

function arrayBlock(a: Ansi, key: string, arr: unknown[], width: number): string[] {
  if (arr.length === 0) return [];
  const first = arr[0];
  if (first !== null && typeof first === "object" && !Array.isArray(first)) {
    const rows = (arr as Obj[]).map((item) => Object.values(item).map((v) => (v === null || v === undefined ? "" : String(v))));
    const headers = Object.keys(first as Obj);
    return panel(a, { title: titleCase(key), lines: tableBlock(a, { headers, rows, width: width - 4 }), width });
  }
  return panel(a, { title: titleCase(key), lines: (arr as unknown[]).map((v) => `${a.dim(SYM.arrow)} ${redactString(String(v))}`), width });
}

/* ── doctor ── */

interface DoctorCheck { check: string; ok: boolean; code?: string; detail?: string; fix?: string }

function doctorReport(a: Ansi, obj: Obj, width: number): string[] {
  const out: string[] = [];
  const checks = Array.isArray(obj.checks) ? (obj.checks as DoctorCheck[]) : [];
  const failed = checks.filter((c) => !c.ok);
  const header = kvBlock(a, [
    ["engine", str(obj, "engine_version") ?? "?"],
    ["scope", "config · journals · blobs · evidence · audit · refusals · gateway"],
    ["privacy", "no network · no secret values — names only"],
  ], width);
  out.push(...panel(a, { title: "Doctor — workspace audit", lines: header, width, accent: failed.length === 0 ? "success" : "warn" }));
  out.push("");
  const rows = checks.map((c) => [
    c.ok ? SYM.ok : SYM.fail,
    c.check,
    redactString(c.detail ?? (c.code ?? "")),
  ]);
  out.push(...tableBlock(a, {
    headers: ["", "check", "detail"],
    rows,
    width,
    maxColumnWidth: 56,
    cellPaint: (r, c, cell) => (c === 0 ? (checks[r]?.ok === true ? a.success(cell) : a.error(cell)) : c === 1 ? cell : a.dim(cell)),
  }));
  if (failed.length === 0) {
    out.push("");
    out.push(`${badge(a, "ok", "all checks green")}  ${a.dim(`${checks.length} checks · exit 0`)}`);
  } else {
    for (const c of failed) {
      const lines = [redactString(c.detail ?? c.code ?? "failed")];
      if (c.fix !== undefined) lines.push(`${a.gold("Fix:")} ${c.fix}`);
      out.push("");
      out.push(...panel(a, { title: `${c.check} · ${c.code ?? "failed"}`, lines, width, accent: "error" }));
    }
    out.push("");
    out.push(`${badge(a, "fail", `${failed.length} of ${checks.length} checks failed`)}  ${a.dim("exit 5")}`);
  }
  return out;
}

/* ── dev ── */

function devReport(a: Ansi, obj: Obj, width: number): string[] {
  const out: string[] = [];
  out.push(...banner(a, str(obj, "engine_version") ?? "?", width));
  out.push("");
  const gw = sub(obj, "gateway");
  const matrix = gw !== undefined && Array.isArray(gw.matrix) ? (gw.matrix as Obj[]) : [];
  const matrixLines = matrix.map((m) =>
    `${String(m.provider)}  ${a.dim((Array.isArray(m.ops) ? (m.ops as string[]).join("/") : "?"))}${m.requiresSecret ? a.dim(`  secret: ${String(m.secretName)}`) : a.dim("  local")}`,
  );
  const layersObj = sub(obj, "layers");
  out.push(...panel(a, {
    title: "Engine",
    lines: kvBlock(a, [
      ["substrate", str(obj, "substrate") ?? "?"],
      ["spec", str(obj, "spec") ?? "spec/"],
      ["constitution", str(obj, "constitution") ?? "?"],
    ], width).concat(
      [""],
      (layersObj !== undefined
        ? Object.entries(layersObj).map(([layer, mods]) => `${a.bold(layer.padEnd(3))} ${a.dim(Array.isArray(mods) ? (mods as string[]).join("  ") : "")}`)
        : []),
    ),
    width,
  }));
  out.push("");
  const daily = Array.isArray(obj.daily_seven) ? (obj.daily_seven as string[]) : [];
  const additive = Array.isArray(obj.additive_commands) ? (obj.additive_commands as string[]) : [];
  out.push(...panel(a, {
    title: "Command surface",
    lines: [
      daily.map((c) => a.gold(c)).join(` ${a.dim(SYM.dot)} `),
      ...additive.map((c) => `${a.info(c)}`),
    ],
    width,
  }));
  out.push("");
  out.push(...panel(a, {
    title: "Gateway — the single gate",
    lines: [
      ...(gw ? kvBlock(a, [["decide", str(gw, "single_gate") ?? ""], ["egress", str(gw, "egress") ?? ""]], width) : []),
      "",
      ...matrixLines,
    ],
    width,
    accent: "info",
  }));
  const wsInfo = sub(obj, "workspace");
  if (wsInfo !== undefined) {
    out.push("");
    out.push(...panel(a, { title: "Workspace", lines: kvBlock(a, [["root", str(wsInfo, "root") ?? ""], ["runs", String(num(wsInfo, "runs") ?? 0)]], width), width }));
  }
  if (str(obj, "next_milestone") !== undefined) {
    out.push("");
    out.push(...panel(a, { title: "Position", lines: [String(obj.next_milestone)], width, accent: "warn" }));
  }
  return out;
}

/* ── init ── */

function initReport(a: Ansi, obj: Obj, width: number): string[] {
  if (obj.dry_run === true) {
    const planned = Array.isArray(obj.planned) ? (obj.planned as Obj[]) : [];
    return panel(a, {
      title: "init — plan (dry-run)",
      lines: planned.map((p) => `${a.dim(String(p.path))}${p.kind === "dir" ? a.dim("/") : ""}`).concat([a.dim("side effects: 0 — nothing written")]),
      width, accent: "info",
    });
  }
  const created = Array.isArray(obj.created) ? (obj.created as string[]) : [];
  const lines = created.map((p) => `${a.success(SYM.ok)} ${p}`);
  const fp = str(obj, "config_fingerprint");
  if (fp !== undefined) lines.push(`${a.dim("config")} ${hash12(fp)}`);
  lines.push("");
  lines.push(`${a.gold("Next:")} vae run demo ${SYM.arrow} your first journaled, receipted run`);
  return panel(a, { title: "Workspace initialized", lines, width, accent: "success" });
}

/* ── gates (run/resume awaiting) ── */

function gatePanel(a: Ansi, obj: Obj, width: number): string[] {
  const gate = sub(obj, "gate");
  const decision = sub(obj, "decision");
  const lines: string[] = [];
  if (gate) {
    lines.push(a.bold(String(gate.question ?? "")));
    lines.push("");
    const options = Array.isArray(gate.options) ? (gate.options as unknown[]) : [];
    for (const o of options) lines.push(`  ${a.dim(SYM.arrow)} ${redactString(String(o))}`);
    lines.push("");
    lines.push(`${a.dim("gate")} ${String(gate.gate_id ?? "")}  ${a.dim("state")} ${String(gate.state ?? "")}`);
  }
  if (decision) {
    lines.push(`${a.dim("decision")} ${String(decision.kind)} ${a.dim("on")} ${String(decision.domain)} ${a.dim(String(decision.scope ?? ""))}`);
  }
  if (typeof obj.hint === "string") {
    lines.push("");
    lines.push(a.gold(redactString(obj.hint)));
  }
  return panel(a, { title: "Human gate — awaiting your authority", lines, width, accent: "warn" });
}

/* ── run ── */

function runReport(a: Ansi, obj: Obj, width: number): string[] {
  if (obj.awaiting === true) return gatePanel(a, obj, width);
  if (obj.dry_run === true) return dryRunPanel(a, obj, width);
  const kind = str(obj, "kind") ?? "";
  const out: string[] = [];
  const verified = obj.journal_verified === true;
  const tail = (receiptObj: Obj | undefined): void => {
    const receipt = receiptPanel(a, receiptObj as ReceiptShape | undefined, width);
    if (receipt !== null) out.push("", ...receipt);
    out.push("");
    out.push(verified ? badge(a, "ok", "journal verified") : badge(a, "fail", "journal verification failed"));
  };

  if (kind === "model") {
    const usage = sub(obj, "usage");
    const cost = sub(obj, "cost");
    const metering = sub(obj, "metering");
    const head: Array<[string, string]> = [
      ["run", str(obj, "run_id") ?? "?"],
      ["model", str(obj, "model") ?? "?"],
      ["provider", str(obj, "provider") ?? "?"],
      ["op", str(obj, "op") ?? "?"],
      ["latency", num(obj, "latency_ms") !== undefined ? `${num(obj, "latency_ms")} ms` : "?"],
      ["attempts", String(num(obj, "attempts") ?? 1)],
    ];
    if (usage) {
      head.push(["tokens", `${num(usage, "inputTokens") ?? 0} in / ${num(usage, "outputTokens") ?? 0} out`]);
    }
    if (cost) {
      head.push(["cost", typeof cost.display === "string" ? cost.display : `${String(cost.totalMicroUsd ?? "?")} µUSD`]);
    }
    if (metering) {
      head.push(["metered", `${num(metering, "invocations") ?? 0} invocation(s) · ${num(metering, "input_tokens") ?? 0}in/${num(metering, "output_tokens") ?? 0}out`]);
    }
    out.push(...panel(a, { title: "Model invocation — through the single gate", lines: kvBlock(a, head, width), width, accent: "info" }));
    const text = str(obj, "text");
    if (text !== undefined) {
      out.push("");
      out.push(...panel(a, { title: "Response", lines: wrapText(text, width - 6), width }));
    }
    tail(sub(obj, "receipt"));
    return out;
  }

  if (kind === "agent") {
    const metrics = sub(obj, "metrics");
    const goal = str(obj, "goal");
    out.push(...panel(a, {
      title: "Agent run",
      lines: kvBlock(a, [
        ["run", str(obj, "run_id") ?? "?"],
        ...(goal !== undefined ? [["goal", goal] as [string, string]] : []),
        ["outcome", str(obj, "outcome") ?? "?"],
        ["planner", str(obj, "planner") ?? "?"],
        ["steps", String(num(obj, "steps") ?? 0)],
        ["failures", String(num(obj, "failures") ?? 0)],
        ["tokens", String(num(obj, "tokens_used") ?? 0)],
        ["spend", `${num(obj, "micro_usd_used") ?? 0} µUSD`],
      ], width),
      width,
      accent: str(obj, "outcome") === "completed" ? "success" : "info",
    }));
    if (metrics !== undefined) {
      const tools = sub(metrics, "tools");
      if (tools !== undefined) {
        out.push("");
        out.push(...panel(a, {
          title: "Tool pipeline",
          lines: kvBlock(a, [
            ["requested", String(num(tools, "requested") ?? 0)],
            ["completed", String(num(tools, "completed") ?? 0)],
            ["denied", String(num(tools, "denied") ?? 0)],
            ["failed", String(num(tools, "failed") ?? 0)],
          ], width),
          width,
          accent: num(tools, "denied") === 0 && num(tools, "failed") === 0 ? "success" : "warn",
        }));
      }
    }
    tail(sub(obj, "receipt"));
    return out;
  }

  if (kind === "research" || kind === "demo") {
    out.push(...panel(a, {
      title: `Research run — ${kind}`,
      lines: kvBlock(a, [
        ["run", str(obj, "run_id") ?? "?"],
        ["query", str(obj, "query") ?? "?"],
        ["documents", String(num(obj, "documents") ?? 0)],
        ["hits", String(num(obj, "hits") ?? 0)],
      ], width),
      width,
      accent: "success",
    }));
    const hits = Array.isArray(obj.hits_detail) ? (obj.hits_detail as Obj[]) : [];
    if (hits.length > 0) {
      out.push("");
      out.push(...panel(a, {
        title: "Top hits",
        lines: tableBlock(a, { headers: ["doc", "score"], rows: hits.map((h) => [String(h.doc_id ?? ""), String(h.score ?? "")]), width: width - 4, aligns: ["left", "right"] }),
        width,
      }));
    }
    tail(sub(obj, "receipt"));
    return out;
  }

  return genericRich(a, obj, width);
}

/* ── dry-run ── */

function dryRunPanel(a: Ansi, obj: Obj, width: number): string[] {
  const lines: string[] = [];
  const plan = sub(obj, "plan");
  if (plan !== undefined) {
    const steps = Array.isArray(plan.steps) ? (plan.steps as unknown[]) : [];
    for (const s of steps) lines.push(`${a.dim(SYM.arrow)} ${redactString(String(s))}`);
    for (const [k, v] of Object.entries(plan)) {
      if (k === "steps" || v === null || v === undefined || typeof v === "object") continue;
      lines.unshift(`${a.dim(k)} ${redactString(String(v))}`);
    }
  }
  lines.push("");
  lines.push(a.info("dry-run — zero side effects, nothing written"));
  return panel(a, { title: `Plan ${SYM.dot} ${str(obj, "command") ?? ""}${str(obj, "kind") !== undefined ? " " + String(obj.kind) : ""}`.trim(), lines, width, accent: "info" });
}

/* ── resume ── */

function resumeReport(a: Ansi, obj: Obj, width: number): string[] {
  if (obj.awaiting === true) {
    const out = gatePanel(a, obj, width);
    const review = sub(obj, "review_diff");
    if (review !== undefined && typeof review.rendered === "string") {
      out.push("");
      out.push(...panel(a, { title: `Review diff ${SYM.dot} ${String(review.op ?? "")} ${String(review.target ?? "")}`, lines: wrapText(String(review.rendered), width - 6), width, accent: "warn" }));
    }
    return out;
  }
  const out: string[] = [];
  if (obj.outcome === "denied") {
    out.push(...panel(a, { title: "Gate denied", lines: [a.dim("the human refused; the journal records why"), `${a.dim("run")} ${String(obj.run_id)}`], width, accent: "error" }));
  } else if (obj.continued === "agent") {
    out.push(...panel(a, {
      title: "Gate approved — agent continued",
      lines: kvBlock(a, [
        ["outcome", str(obj, "outcome") ?? "?"],
        ["steps", String(num(obj, "steps") ?? 0)],
        ["failures", String(num(obj, "failures") ?? 0)],
      ], width),
      width,
      accent: "success",
    }));
  } else {
    const state = sub(obj, "restored_state") ?? sub(obj, "state");
    out.push(...panel(a, {
      title: typeof obj.note === "string" ? "Restored" : "Gate resolved",
      lines: state !== undefined
        ? kvBlock(a, Object.entries(state).filter(([, v]) => typeof v !== "object").map(([k, v]) => [k, String(v)] as [string, string]), width)
        : (typeof obj.note === "string" ? [obj.note] : []),
      width,
      accent: "info",
    }));
    if (typeof obj.note === "string" && state !== undefined) out.push(a.info(obj.note));
  }
  const receipt = receiptPanel(a, sub(obj, "receipt") as ReceiptShape | undefined, width);
  if (receipt !== null) out.push("", ...receipt);
  return out;
}

/* ── explain ── */

function explainReport(a: Ansi, obj: Obj, width: number): string[] {
  const out: string[] = [];
  const state = sub(obj, "state");
  const head = kvBlock(a, [
    ["run", str(obj, "run_id") ?? "?"],
    ...(state !== undefined ? [["status", String(state.status ?? "")], ["last seq", String(state.last_seq ?? "")]] as Array<[string, string]> : []),
  ], width);
  out.push(...panel(a, {
    title: "Run explanation — folded from the journal",
    lines: head,
    width,
    accent: obj.verified === true ? "success" : "error",
    subtitle: obj.verified === true ? "chain verified" : "chain verification FAILED — exit 5",
  }));
  const refusals = Array.isArray(obj.refusals) ? (obj.refusals as Obj[]) : [];
  if (refusals.length > 0) {
    out.push("");
    out.push(...panel(a, {
      title: "Refusals",
      lines: tableBlock(a, {
        headers: ["code", "domain", "scope", "policy"],
        rows: refusals.map((r) => [String(r.reason_code ?? ""), String(r.domain ?? ""), truncate(String(r.scope ?? ""), 24), String(r.policy ?? "")]),
        width: width - 4,
      }),
      width,
      accent: "warn",
    }));
  }
  const gateway = sub(obj, "gateway");
  if (gateway !== undefined && (num(gateway, "invocations") ?? 0) + (num(gateway, "failed") ?? 0) > 0) {
    out.push("");
    out.push(...panel(a, {
      title: "Gateway metering",
      lines: kvBlock(a, [
        ["invocations", `${num(gateway, "invocations") ?? 0} ok · ${num(gateway, "failed") ?? 0} failed`],
        ["tokens", `${num(gateway, "input_tokens") ?? 0} in / ${num(gateway, "output_tokens") ?? 0} out`],
        ["spend", `${num(gateway, "total_micro_usd") ?? 0} µUSD`],
      ], width),
      width,
      accent: "info",
    }));
  }
  const narrative = Array.isArray(obj.narrative) ? (obj.narrative as string[]) : [];
  if (narrative.length > 0) {
    out.push("");
    out.push(...panel(a, { title: `Narrative ${SYM.dot} ${narrative.length} entries`, lines: narrative.map((n) => redactString(n)), width }));
  }
  return out;
}

/* ── journal ── */

function journalReport(a: Ansi, obj: Obj, width: number): string[] {
  const subCommand = str(obj, "sub") ?? "";
  const out: string[] = [];
  if (subCommand === "ls") {
    const runs = Array.isArray(obj.runs) ? (obj.runs as Obj[]) : [];
    if (runs.length === 0) {
      return panel(a, { title: "Journals", lines: [a.dim("no runs in this workspace yet") + ` — ${a.gold("vae run demo")} ${a.dim("creates the first one")}`], width, accent: "info" });
    }
    const headers = Object.keys(runs[0] ?? {});
    out.push(...panel(a, {
      title: `Journals ${SYM.dot} ${runs.length} run(s)`,
      lines: tableBlock(a, { headers, rows: runs.map((r) => headers.map((h) => (r[h] === null || r[h] === undefined ? "" : String(r[h])))), width: width - 4 }),
      width,
    }));
    return out;
  }
  if (obj.dry_run === true) return dryRunPanel(a, obj, width);
  const report = sub(obj, "report");
  if (report !== undefined && report.ok !== undefined) {
    const issues = Array.isArray(report.issues) ? (report.issues as Obj[]) : [];
    const lines = kvBlock(a, [
      ["run", str(obj, "run_id") ?? "?"],
      ["records", String(report.records ?? "?")],
      ...(typeof report.headHash === "string" ? [["head", hash12(report.headHash)] as [string, string]] : []),
      ...(typeof report.truncated === "number" ? [["truncated", String(report.truncated)] as [string, string]] : []),
      ...(typeof report.exportedTo === "string" ? [["exported", report.exportedTo] as [string, string]] : []),
    ], width);
    out.push(...panel(a, {
      title: `Journal ${subCommand}`,
      lines: lines.concat(issues.map((i) => `${a.error(String(i.code ?? "E?"))} ${redactString(String(i.message ?? ""))}`)),
      width,
      accent: report.ok === true ? "success" : "error",
    }));
    return out;
  }
  return genericRich(a, obj, width);
}

/* ── serve ── */

function serveReport(a: Ansi, obj: Obj, width: number): string[] {
  if (obj.stopped === true) {
    return panel(a, { title: "Daemon stopped", lines: [String(obj.note ?? "")], width, accent: "info" });
  }
  const lines = kvBlock(a, [
    ["listening", str(obj, "listening") ?? "?"],
    ["routes", str(obj, "routes") ?? "/openapi.json"],
    ["pid", String(num(obj, "pid") ?? "?")],
  ], width);
  lines.push("");
  lines.push(`${a.dim("pairing token (printed ONCE — store it now)")}`);
  lines.push(a.gold(String(obj.token ?? "")));
  return panel(a, { title: "Daemon — loopback only (ADR-0010)", lines, width, accent: "info" });
}

/* ── package ── */

function packageReport(a: Ansi, obj: Obj, width: number): string[] {
  if (obj.dry_run === true) return dryRunPanel(a, obj, width);
  const out: string[] = [];
  if (str(obj, "kind") === "build") {
    const entries = Array.isArray(obj.entries) ? (obj.entries as Obj[]) : [];
    out.push(...panel(a, {
      title: "Bundle built — reproducible .vxn (ADR-0016)",
      lines: kvBlock(a, [
        ["out", str(obj, "out") ?? "?"],
        ["bytes", String(num(obj, "bytes") ?? "?")],
        ["entries", String(num(obj, "entry_count") ?? entries.length)],
        ["digest", hash12(str(obj, "bundle_blake3") ?? "")],
        ["lock", str(obj, "lock") ?? "vaerion.lock"],
      ], width),
      width,
      accent: "success",
    }));
    if (entries.length > 0) {
      out.push("");
      out.push(...panel(a, {
        title: "Entries",
        lines: tableBlock(a, {
          headers: ["path", "bytes", "blake3"],
          rows: entries.map((e) => [String(e.path ?? ""), String(e.bytes ?? ""), String(e.blake3 ?? "")]),
          width: width - 4,
        }),
        width,
      }));
    }
  } else {
    const ok = obj.ok === true;
    const findings = Array.isArray(obj.findings) ? (obj.findings as Obj[]) : [];
    const lines = kvBlock(a, [
      ["bundle", str(obj, "bundle") ?? "?"],
      ["digest", hash12(str(obj, "bundle_blake3") ?? "")],
      ["entries", `${num(obj, "entries_verified") ?? 0}/${num(obj, "entries") ?? 0} verified`],
      ["pins", String(num(obj, "pins_checked") ?? 0)],
      ["checks passed", String(num(obj, "checks_passed") ?? 0)],
    ], width);
    for (const f of findings) {
      lines.push(`${a.error(String(f.code ?? "E2206"))} ${redactString(String(f.detail ?? f.message ?? ""))}`);
    }
    out.push(...panel(a, {
      title: ok ? "Bundle verified" : "Bundle REFUSED",
      lines,
      width,
      accent: ok ? "success" : "error",
      subtitle: ok ? "content never executed — pure checks only" : "must not be imported, distributed, or executed",
    }));
  }
  const receipt = receiptPanel(a, sub(obj, "receipt") as ReceiptShape | undefined, width);
  if (receipt !== null) out.push("", ...receipt);
  if (typeof obj.journal_verified === "boolean") {
    out.push("");
    out.push(obj.journal_verified ? badge(a, "ok", "journal verified") : badge(a, "fail", "journal verification failed"));
  }
  return out;
}

/* ── provenance ── */

function provenanceReport(a: Ansi, obj: Obj, width: number): string[] {
  const out: string[] = [];
  const artifact = str(obj, "artifact") ?? "?";
  const kind = str(obj, "kind") ?? "?";
  const verified = obj.verified;
  const lines = kvBlock(a, [
    ["artifact", artifact],
    ["kind", kind],
    ...(str(obj, "engine") !== undefined && obj.engine !== null ? [["engine", String(obj.engine)] as [string, string]] : []),
    ...(str(obj, "digest") !== undefined && obj.digest !== null ? [["digest", hash12(String(obj.digest))] as [string, string]] : []),
    ...(str(obj, "computed_digest") !== undefined ? [["recomputed", hash12(String(obj.computed_digest))] as [string, string]] : []),
    ...(str(obj, "config_fingerprint") !== undefined && obj.config_fingerprint !== null ? [["config", hash12(String(obj.config_fingerprint))] as [string, string]] : []),
    ...(str(obj, "built_at") !== undefined ? [["closed at", String(obj.built_at)] as [string, string]] : []),
    ...(str(obj, "signature") !== undefined ? [["signature", String(obj.signature)] as [string, string]] : []),
  ], width);
  for (const [k, v] of Object.entries(obj.fields ?? {})) {
    lines.push(`${a.dim(k)} ${redactString(String(v))}`);
  }
  out.push(...panel(a, {
    title: "Provenance — permanent artifact evidence",
    lines,
    width,
    accent: verified === false ? "error" : verified === true ? "success" : "info",
    subtitle: verified === false
      ? "evidence does not hold — treat the artifact as unverified"
      : verified === true
        ? "verified from the artifact itself"
        : "recorded as-is — nothing recomputed for this kind",
  }));
  if (str(obj, "scope") !== undefined) {
    out.push(a.dim(`Scope: ${redactString(String(obj.scope))}`));
  }
  const findings = Array.isArray(obj.findings) ? (obj.findings as Obj[]) : [];
  if (findings.length > 0) {
    out.push("");
    out.push(...panel(a, {
      title: "Findings",
      lines: findings.map((f) => `${a.error(String(f.code ?? "E?"))} ${redactString(String(f.detail ?? ""))}`),
      width,
      accent: "error",
    }));
  }
  return out;
}

/* ─────────────────────────────  spinner  ─────────────────────────────── */

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Quiet, TTY-only progress. In every other profile this is a perfect no-op. */
export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private startedAt = 0;
  private label = "";
  private readonly clock = new SystemClock(); // the ONE clock law (C2) — even UX durations

  constructor(
    private readonly io: CliIo,
    private readonly a: Ansi,
    private readonly enabled: boolean,
  ) {}

  start(label: string): void {
    if (!this.enabled) return;
    this.label = label;
    this.startedAt = this.clock.nowMs();
    this.timer = setInterval(() => {
      const f = SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length]!;
      this.frame++;
      this.io.out(`\r\u001b[2K${this.a.gold(f)} ${this.a.dim(this.label + SYM.ellipsis)}`);
    }, 90);
    // The spinner must never keep a process alive on an error path.
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  private clear(): void {
    if (!this.enabled) return;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.io.out("\r\u001b[2K");
  }

  /** Stop silently (dry-run paths — nothing was done, so nothing is claimed). */
  stop(): void {
    if (!this.enabled) return;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  succeed(detail?: string): void {
    if (!this.enabled) return;
    const ms = this.clock.nowMs() - this.startedAt;
    this.clear();
    this.io.out(`${this.a.success(SYM.ok)} ${this.label} ${this.a.dim(`(${ms} ms${detail !== undefined ? " · " + detail : ""})`)}`);
  }

  fail(detail?: string): void {
    if (!this.enabled) return;
    const ms = this.clock.nowMs() - this.startedAt;
    this.clear();
    this.io.out(`${this.a.error(SYM.fail)} ${this.label} ${this.a.dim(`(${ms} ms${detail !== undefined ? " · " + detail : ""})`)}`);
  }
}

/* ───────────────────  repo / ci / release (XVIII-8)  ─────────────────── */

interface RepoFindingShape { code?: string; severity: "blocker" | "warn" | "info"; detail: string; fix?: string }

function findingsBlock(a: Ansi, findings: RepoFindingShape[], width: number): string[] {
  if (findings.length === 0) return [];
  const bySeverity = (s: RepoFindingShape["severity"]): string[] =>
    findings.filter((f) => f.severity === s).map((f) => {
      const head = `${a.error(f.code ?? "finding")} ${redactString(f.detail)}`;
      return f.fix !== undefined ? `${head}\n${a.gold("Fix:")} ${redactString(f.fix)}` : head;
    });
  const out: string[] = [];
  const blockers = bySeverity("blocker");
  const warns = bySeverity("warn");
  if (blockers.length > 0) out.push(...panel(a, { title: `Blockers (${blockers.length})`, lines: blockers, width, accent: "error" }));
  if (warns.length > 0) out.push(...panel(a, { title: `Warnings (${warns.length})`, lines: warns, width, accent: "warn" }));
  return out;
}

function repoReport(a: Ansi, obj: Obj, width: number): string[] {
  const out: string[] = [];
  const kind = str(obj, "kind");
  const branch = str(obj, "branch") ?? "?";
  const head = str(obj, "head") ?? "(no commits)";

  if (kind === "verify") {
    const ok = obj.ok === true;
    const identity = sub(obj, "identity");
    const lines = kvBlock(a, [
      ["root", str(obj, "root") ?? "?"],
      ["branch", branch],
      ["head", hash12(head)],
      ["identity", `ratified: ${str(identity ?? {}, "ratified") ?? "Auren <auren@vaerion.dev>"}`],
    ], width);
    out.push(...panel(a, {
      title: ok ? "Repository trust — VERIFIED" : "Repository trust — findings",
      lines,
      width,
      accent: ok ? "success" : "error",
      subtitle: "measured never assumed · history immutable by law (D-P)",
    }));
    const findings = Array.isArray(obj.findings) ? (obj.findings as RepoFindingShape[]) : [];
    out.push("", ...findingsBlock(a, findings, width));
    if (findings.length === 0) {
      out.push("");
      out.push(badge(a, "ok", "no trust findings — identity, conflicts, and canonical protection all measured clean"));
    }
    return out;
  }

  const state = sub(obj, "state") ?? {};
  const num2 = (o: Obj, k: string): string => String(o[k] ?? 0);
  const lines = kvBlock(a, [
    ["root", str(obj, "root") ?? "?"],
    ["branch", `${branch}${obj.detached === true ? " (detached)" : ""}`],
    ["head", head === "(no commits)" ? head : hash12(head)],
    ["author", str(obj, "head_author") ?? "—"],
    ["tags", (Array.isArray(obj.tags_at_head) ? (obj.tags_at_head as string[]) : []).join(", ") || "none at HEAD"],
  ], width);
  out.push(...panel(a, {
    title: "Repository intelligence",
    lines,
    width,
    accent: (Array.isArray(obj.findings) ? (obj.findings as RepoFindingShape[]) : []).some((f) => f.severity === "blocker") ? "warn" : "info",
    subtitle: "read-only measurement — --no-optional-locks, fixed argv",
  }));
  out.push("");
  out.push(...panel(a, {
    title: "Working tree",
    lines: kvBlock(a, [
      ["staged", num2(state, "staged_count")],
      ["unstaged", num2(state, "unstaged_count")],
      ["untracked", num2(state, "untracked_count")],
      ["conflicts", num2(state, "conflict_count")],
      ["in-progress", `${state.merge_in_progress === true ? "MERGE " : ""}${state.rebase_in_progress === true ? "REBASE " : ""}${state.cherry_pick_in_progress === true ? "CHERRY-PICK " : ""}${state.bisect_in_progress === true ? "BISECT" : ""}`.trim() || "none"],
    ], width),
    width,
  }));
  const canonical = sub(obj, "canonical");
  if (canonical !== undefined) {
    out.push("");
    out.push(...panel(a, {
      title: "Canonical remote (D-Q)",
      lines: [redactString(str(canonical, "detail") ?? "")],
      width,
      accent: canonical.reachable === true ? "info" : "warn",
    }));
  }
  const findings = Array.isArray(obj.findings) ? (obj.findings as RepoFindingShape[]) : [];
  out.push("", ...findingsBlock(a, findings, width));
  if (findings.length === 0) {
    out.push("");
    out.push(`${badge(a, "ok", "measured clean")}  ${a.dim(`identity audited over ${String(num(obj, "audited_commits") ?? (sub(obj, "identity") ? String((sub(obj, "identity") as Obj)["audited_commits"] ?? "?") : "?"))} commits · exit 0`)}`);
  }
  return out;
}

interface CiFindingShape { file: string; code: string; severity: "blocker" | "warn"; detail: string; fix?: string }

function ciReport(a: Ansi, obj: Obj, width: number): string[] {
  const out: string[] = [];
  const kind = str(obj, "kind");
  const files = Array.isArray(obj.files) ? (obj.files as string[]) : [];

  if (kind === "validate") {
    const ok = obj.ok === true;
    const findings = Array.isArray(obj.findings) ? (obj.findings as CiFindingShape[]) : [];
    out.push(...panel(a, {
      title: ok ? "CI workflows valid" : "CI workflows — findings",
      lines: kvBlock(a, [
        ["workflows", files.join(", ") || "none discovered"],
        ["findings", String(findings.length)],
        ["authority", "tools/verify.ts (D-R)"],
      ], width),
      width,
      accent: ok ? "success" : "error",
      subtitle: "CI is the remote projection of the single verification authority",
    }));
    if (findings.length > 0) {
      const rows = findings.map((f) => [f.severity === "blocker" ? SYM.fail : SYM.warn, f.file.split("/").slice(-1)[0] ?? "", f.code, redactString(f.detail)]);
      out.push("");
      out.push(...tableBlock(a, { headers: ["", "file", "code", "detail"], rows, width, maxColumnWidth: 52, cellPaint: (r, c, cell) => (c === 0 ? (findings[r]?.severity === "blocker" ? a.error(cell) : a.warn(cell)) : c === 2 ? a.error(cell) : c === 3 ? a.dim(cell) : cell) }));
      for (const f of findings.filter((x) => x.fix !== undefined)) {
        out.push("");
        out.push(...panel(a, { title: `${f.file.split("/").slice(-1)[0]} · ${f.code}`, lines: [redactString(f.detail), `${a.gold("Fix:")} ${redactString(f.fix!)}`], width, accent: "error" }));
      }
    }
    return out;
  }

  // simulate
  const projections = Array.isArray(obj.projections) ? (obj.projections as Obj[]) : [];
  const runnable = Array.isArray(obj.runnable_jobs) ? (obj.runnable_jobs as string[]) : [];
  out.push(...panel(a, {
    title: "Pipeline simulation — structural projection",
    lines: kvBlock(a, [
      ["event", `${str(obj, "event") ?? "?"}${obj.tag_ref ? ` (tag ${str(obj, "tag_ref")})` : obj.branch ? ` (branch ${str(obj, "branch")})` : ""}`],
      ["workflows", files.length === 0 ? (projections.length === 0 ? "none discovered" : String(projections.length)) : files.join(", ")],
      ["would run", runnable.length === 0 ? "no jobs" : runnable.join(", ")],
      ["scope", "projection of trigger + condition logic — NO pipeline executed (D-S)"],
    ], width),
    width,
    accent: runnable.length > 0 ? "success" : "warn",
  }));
  for (const p of projections) {
    const jobs = Array.isArray(p.jobs) ? (p.jobs as Obj[]) : [];
    const lines: string[] = [];
    for (const j of jobs) {
      const mark = j.wouldRun === true ? a.success(SYM.ok) : a.dim("·");
      lines.push(`${mark} ${String(j.job)} — ${a.dim(redactString(String(j.reason)))}`);
    }
    out.push("");
    out.push(...panel(a, {
      title: `${String(p.file).split("/").slice(-1)[0]} — ${p.triggered === true ? "triggered" : "not triggered"}`,
      lines: [a.dim(redactString(String(p.reason))), ...lines],
      width,
      accent: p.triggered === true ? "info" : undefined,
    }));
  }
  const validation = Array.isArray(obj.validation_findings) ? (obj.validation_findings as CiFindingShape[]) : [];
  out.push("", ...findingsBlock(a, validation.map((f) => ({ code: f.code, severity: f.severity, detail: `${f.file.split("/").slice(-1)[0]}: ${f.detail}`, fix: f.fix })), width));
  return out;
}

function releaseReport(a: Ansi, obj: Obj, width: number): string[] {
  if (obj.dry_run === true) return dryRunPanel(a, obj, width);
  const out: string[] = [];
  const checks = Array.isArray(obj.checks) ? (obj.checks as Array<Obj>) : [];
  const ready = obj.ready === true;
  const header = kvBlock(a, [
    ["verdict", ready ? "READY" : "BLOCKED"],
    ["score", str(obj, "score") ?? `${num(obj, "passed") ?? 0}/${num(obj, "total") ?? 0}`],
    ["gates", obj.live_gates === true ? "measured live via tools/verify.ts" : "measured from the on-disk verification record (--live-gates re-measures)"],
  ], width);
  out.push(...panel(a, {
    title: ready ? "Release readiness — READY" : "Release readiness — BLOCKED",
    lines: header,
    width,
    accent: ready ? "success" : "error",
    subtitle: "measured only, never estimated (D-S) · fail-closed (P6)",
  }));
  out.push("");
  const rows = checks.map((c) => [
    c.ok === true ? SYM.ok : String(c.severity) === "warn" ? SYM.warn : SYM.fail,
    String(c.check ?? ""),
    String(c.honesty ?? ""),
    redactString(String(c.detail ?? "")),
  ]);
  out.push(...tableBlock(a, {
    headers: ["", "check", "honesty", "detail"],
    rows,
    width,
    maxColumnWidth: 56,
    cellPaint: (r, c, cell) => (c === 0 ? (checks[r]?.ok === true ? a.success(cell) : a.error(cell)) : c === 2 ? a.dim(cell) : c === 3 ? a.dim(cell) : cell),
  }));
  for (const b of Array.isArray(obj.blockers) ? (obj.blockers as Array<Obj>) : []) {
    out.push("");
    out.push(...panel(a, {
      title: `${String(b.check)} · ${String(b.code ?? "E2308")}`,
      lines: [redactString(String(b.detail ?? ""))],
      width,
      accent: "error",
    }));
  }
  const receipt = receiptPanel(a, sub(obj, "receipt") as ReceiptShape | undefined, width);
  if (receipt !== null) out.push("", ...receipt);
  if (obj.journaled === false) {
    out.push("");
    out.push(a.dim(redactString(String(obj.journal_note ?? "not journaled"))));
  }
  return out;
}

/* ───────────────────  welcome front door + tour (XVIII-2)  ─────────────────── */

function welcomeReport(a: Ansi, obj: Obj, width: number): string[] {
  const out: string[] = [];
  const what = str(obj, "what") ?? "";
  out.push(...panel(a, {
    title: "Welcome to Vaerion",
    lines: [what],
    width,
    accent: "gold",
    subtitle: `engine ${str(obj, "engine_version") ?? "?"} · local-first · deterministic · zero telemetry`,
  }));
  const dir = sub(obj, "directory") ?? {};
  const kind = str(dir, "kind") ?? "unknown";
  const next = sub(obj, "next") ?? {};
  const learn = Array.isArray(obj.learn) ? (obj.learn as string[]) : [];
  out.push("");
  out.push(...panel(a, {
    title: kind === "fresh" ? "This directory is fresh" : "This is a Vaerion workspace",
    lines: kvBlock(a, [
      ["path", str(dir, "path") ?? "?"],
      ["vaerion.yaml", dir.has_config === true ? "present" : "absent"],
      [".vaerion/", dir.has_workspace === true ? "present" : "absent"],
      ["runs", String(dir.runs ?? 0)],
    ], width),
    width,
    accent: kind === "fresh" ? "info" : "success",
  }));
  out.push("");
  out.push(...panel(a, {
    title: "Next step",
    lines: [`${a.gold("▸")} ${str(next, "command") ?? "vae --help"} — ${str(next, "why") ?? ""}`],
    width,
    accent: "gold",
  }));
  if (learn.length > 0) {
    out.push("");
    out.push(...panel(a, {
      title: "Learn",
      lines: learn.map((l) => `${a.dim(SYM.arrow)} ${l}`),
      width,
      accent: "none",
    }));
  }
  return out;
}

interface TourStepShape { step?: number; title?: string; measured?: string[]; try?: string; note?: string }

function tourReport(a: Ansi, obj: Obj, width: number): string[] {
  const out: string[] = [];
  const dir = sub(obj, "directory") ?? {};
  const steps = Array.isArray(obj.steps) ? (obj.steps as TourStepShape[]) : [];
  out.push(...panel(a, {
    title: "The Vaerion tour",
    lines: kvBlock(a, [
      ["directory", str(dir, "path") ?? "?"],
      ["kind", str(dir, "kind") ?? "?"],
      ["steps", `${steps.length} · measured against this machine`],
    ], width),
    width,
    accent: "gold",
    subtitle: "read-only · no network · no writes · measured, never assumed (D-S)",
  }));
  for (const s of steps) {
    out.push("");
    const lines: string[] = [];
    for (const m of s.measured ?? []) lines.push(`${a.dim(SYM.dot)} ${m}`);
    if ((s.measured ?? []).length > 0) lines.push("");
    lines.push(s.note ?? "");
    lines.push("");
    lines.push(`${a.gold("▸ try:")} ${s.try ?? ""}`);
    out.push(...panel(a, {
      title: `${s.step ?? "·"} · ${s.title ?? ""}`,
      lines,
      width,
      accent: "info",
    }));
  }
  const readOnly = str(obj, "read_only");
  if (readOnly !== undefined) {
    out.push("");
    out.push(badge(a, "ok", readOnly));
  }
  return out;
}

interface CitationShape { citation_id?: string; evidence_id?: string; score?: number; source_path?: string | null }
interface MatrixEntry { provider?: string; ops?: string[]; requiresSecret?: boolean; secretName?: string | null }

function aiReport(a: Ansi, obj: Obj, width: number): string[] {
  const out: string[] = [];
  if (str(obj, "kind") === "models") {
    const matrix = Array.isArray(obj.matrix) ? (obj.matrix as MatrixEntry[]) : [];
    out.push(...panel(a, {
      title: "Gateway capability matrix",
      lines: matrix.map((m) => `${a.dim(SYM.dot)} ${m.provider ?? "?"}[${(m.ops ?? []).join("/")}]${m.requiresSecret ? ` (secret: ${m.secretName ?? "?"})` : " (local)"}`),
      width,
      accent: "gold",
      subtitle: "mockbrain is the local seeded provider — no network, byte-identical for the same seed",
    }));
    const note = str(obj, "read_only");
    if (note !== undefined) {
      out.push("");
      out.push(badge(a, "ok", note));
    }
    return out;
  }
  if (obj.dry_run === true) {
    out.push(...dryRunPanel(a, obj, width));
    return out;
  }
  const grounded = sub(obj, "grounded") ?? {};
  out.push(...panel(a, {
    title: str(obj, "question") ?? "Grounded question",
    lines: kvBlock(a, [
      ["model", `${str(obj, "provider") ?? "?"}/${str(obj, "model") ?? "?"}`],
      ["capability", str(grounded, "capability") ?? "?"],
      ["documents", String(grounded.documents ?? 0)],
      ["context pack", `${str(grounded, "pack_fingerprint") ?? "?"} · ${grounded.blocks ?? 0} block(s), ${grounded.dropped ?? 0} dropped`],
    ], width),
    width,
    accent: "gold",
    subtitle: "the ONE research pipeline → the gateway single gate (constitution v1.5 A3)",
  }));
  out.push("");
  out.push(...panel(a, {
    title: "Answer",
    lines: wrapText(str(obj, "answer") ?? "(no text)", Math.max(20, width - 6)),
    width,
    accent: "info",
  }));
  const citations = Array.isArray(obj.citations) ? (obj.citations as CitationShape[]) : [];
  if (citations.length > 0) {
    out.push("");
    out.push(a.dim("citations — every answer is grounded in attributed, fenced evidence:"));
    out.push(...tableBlock(a, {
      headers: ["citation", "evidence", "score", "source"],
      rows: citations.map((c) => [c.citation_id ?? "", c.evidence_id ?? "", String(c.score ?? 0), c.source_path ?? ""]),
      width,
    }));
  }
  const usage = sub(obj, "usage");
  const cost = sub(obj, "cost");
  out.push("");
  out.push(...panel(a, {
    title: "Metering",
    lines: kvBlock(a, [
      ["tokens", `${usage?.inputTokens ?? 0} in / ${usage?.outputTokens ?? 0} out`],
      ["cost", str(cost ?? {}, "display") ?? "unpriced"],
      ["attempts", String(obj.attempts ?? 1)],
    ], width),
    width,
    accent: "none",
  }));
  const receiptLines = receiptPanel(a, sub(obj, "receipt") as Obj | null | undefined, width);
  if (receiptLines) {
    out.push("");
    out.push(...receiptLines);
  }
  return out;
}

interface ObservedActorShape { kind?: string; id?: string; events?: number; decisions?: number; runs?: number }

interface CenterRunShape { run_id?: string; records?: number; events?: number; verified?: boolean; receipt?: boolean }

function centerReport(a: Ansi, obj: Obj, width: number): string[] {
  const out: string[] = [];
  const ops = sub(obj, "operations") ?? {};
  const integrity = sub(obj, "integrity") ?? {};
  const metering = sub(ops, "metering") ?? {};
  out.push(...panel(a, {
    title: "Command Center — operations",
    lines: kvBlock(a, [
      ["workspace", (sub(obj, "workspace") as Obj | undefined)?.root as string ?? "?"],
      ["runs", String(ops.runs ? (ops.runs as unknown[]).length : 0)],
      ["receipts", String(ops.receipts ?? 0)],
      ["journals verified", ops.journals_verified === true ? "yes" : "NO"],
      ["metering", `${metering.invocations ?? 0} invocation(s), ${metering.inputTokens ?? 0} in / ${metering.outputTokens ?? 0} out tokens, ${metering.totalMicroUsd ?? 0} µUSD`],
      ["blobs", `${(sub(ops, "blob_refs") ?? {}).checked ?? 0} referenced, ${(sub(ops, "blob_refs") ?? {}).failed ?? 0} failed`],
    ], width),
    width,
    accent: obj.ok === true ? "success" : "warn",
    subtitle: "constitution v1.5 A3 · one measured core · read-only (D-S)",
  }));
  const runs = Array.isArray(ops.runs) ? (ops.runs as CenterRunShape[]) : [];
  if (runs.length > 0) {
    out.push("");
    out.push(...tableBlock(a, {
      headers: ["run", "records", "events", "verified", "receipt"],
      rows: runs.map((run) => [
        (run.run_id ?? "").length > 24 ? `…${(run.run_id ?? "").slice(-20)}` : (run.run_id ?? ""),
        String(run.records ?? 0),
        String(run.events ?? 0),
        run.verified ? "yes" : "NO",
        run.receipt ? "yes" : "—",
      ]),
      width,
    }));
  }
  const audit = sub(integrity, "audit_ledger") ?? {};
  const refusals = sub(integrity, "refusal_log") ?? {};
  out.push("");
  out.push(...panel(a, {
    title: "Integrity",
    lines: [
      `${audit.ok === true ? a.success(SYM.ok) : a.error(SYM.fail)} audit ledger: ${audit.entries ?? 0} entr(ies) — ${audit.detail ?? "?"}`,
      `${refusals.ok === true ? a.success(SYM.ok) : a.error(SYM.fail)} refusal log: ${refusals.entries ?? 0} entr(ies) — ${refusals.detail ?? "?"}`,
    ],
    width,
    accent: audit.ok === true && refusals.ok === true ? "success" : "warn",
  }));
  const release = sub(obj, "release") ?? {};
  out.push("");
  if (release.measured === true) {
    const blockers = Array.isArray(release.blockers) ? (release.blockers as Obj[]) : [];
    out.push(...panel(a, {
      title: `Release digest — ${release.verdict ?? "?"} (${release.passed ?? 0}/${release.total ?? 0})`,
      lines: blockers.length === 0
        ? ["no blockers measured"]
        : blockers.map((b) => `${a.dim(SYM.dot)} ${str(b, "check") ?? "?"}: ${str(b, "detail") ?? ""}`),
      width,
      accent: release.ready === true ? "success" : "warn",
    }));
  } else {
    out.push(...panel(a, {
      title: "Release digest",
      lines: [str(release, "note") ?? "not measured"],
      width,
      accent: "none",
    }));
  }
  const readOnly = str(obj, "read_only");
  if (readOnly !== undefined) {
    out.push("");
    out.push(badge(a, "ok", readOnly));
  }
  return out;
}

function accountReport(a: Ansi, obj: Obj, width: number): string[] {
  const out: string[] = [];
  const law = sub(obj, "actor_law") ?? {};
  const localActor = sub(law, "local_actor") ?? {};
  out.push(...panel(a, {
    title: "Identity — who acts here",
    lines: kvBlock(a, [
      ["workspace", str(obj, "workspace") ? String((sub(obj, "workspace") ?? {}).root) : "?"],
      ["human principal", str(law, "human_principal_id") ?? "?"],
      ["local actor", `${str(localActor, "kind") ?? "?"}:${str(localActor, "id") ?? "?"}`],
      ["ratified commit identity", str(law, "ratified_commit_identity") ?? "?"],
    ], width),
    width,
    accent: "gold",
    subtitle: "constitution v1.5 A3 · P5 attribution · D-D actor+cause · local identity, never a cloud account",
  }));
  const actors = Array.isArray(obj.observed_actors) ? (obj.observed_actors as ObservedActorShape[]) : [];
  out.push("");
  if (actors.length === 0) {
    out.push(...panel(a, {
      title: "Observed actors",
      lines: ["no journals in this workspace yet — actors appear here after your first run"],
      width,
      accent: "info",
    }));
  } else {
    out.push(a.dim(`observed actors — deterministic fold over every envelope's actor (D-D):`));
    out.push(...tableBlock(a, {
      headers: ["kind", "id", "events", "decisions", "runs"],
      rows: actors.map((x) => [x.kind ?? "", x.id ?? "", String(x.events ?? 0), String(x.decisions ?? 0), String(x.runs ?? 0)]),
      width,
      aligns: ["left", "left", "right", "right", "right"],
    }));
  }
  const ci = sub(obj, "commit_identity") ?? {};
  const ciLines: Array<[string, string]> = [];
  if (ci.measured === true) {
    ciLines.push(["branch", str(ci, "branch") ?? "?"]);
    ciLines.push(["head author", str(ci, "head_author") ?? "?"]);
    ciLines.push(["audited commits", String(ci.audited_commits ?? 0)]);
    const violations = Array.isArray(ci.violations) ? (ci.violations as Obj[]) : [];
    ciLines.push(["D-P violations", violations.length === 0 ? "none" : `${violations.length} (recorded, immutable)`]);
  } else {
    ciLines.push(["commit identity", `not measured — ${str(ci, "note") ?? "unavailable"}`]);
  }
  out.push("");
  out.push(...panel(a, { title: "Commit identity (D-P)", lines: kvBlock(a, ciLines, width), width, accent: ci.measured === true ? "success" : "warn" }));
  const profiles = Array.isArray(obj.secret_profiles) ? (obj.secret_profiles as Array<{ name?: string; granted?: string[] }>) : [];
  const profileLines: string[] = profiles.length === 0
    ? ["no secret names declared in vaerion.yaml"]
    : profiles.map((p) => `${a.dim(SYM.dot)} ${p.name ?? "?"} → granted: ${(p.granted ?? []).length === 0 ? "(no grant patterns)" : (p.granted ?? []).join(", ")}`);
  out.push("");
  out.push(...panel(a, {
    title: "Secret profiles (names only — never values, ADR-0013)",
    lines: profileLines,
    width,
    accent: "none",
  }));
  const readOnly = str(obj, "read_only");
  if (readOnly !== undefined) {
    out.push("");
    out.push(badge(a, "ok", readOnly));
  }
  return out;
}
