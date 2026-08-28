/**
 * vae-config — VaerYaml, a strict subset of YAML (ratified config discipline).
 *
 * Supported: block mappings, block sequences, flow sequences `[a, b]`,
 * flow mappings `{k: v}`, plain/quoted scalars, `#` comments.
 * Refused (with a teaching error): anchors `&`, aliases `*`, tags `!`,
 * multi-document streams, block scalars `|`/`>`, tab indentation,
 * duplicate keys. Determinism over convenience (P6): the same text
 * always parses to the same value.
 */

import { usageError } from "vae-foundation";

export type YamlValue = null | boolean | number | string | YamlValue[] | { [k: string]: YamlValue };

interface Line {
  readonly no: number;
  readonly indent: number;
  readonly text: string;
}

function parseFail(no: number, why: string, fix?: string): never {
  throw usageError(
    "E1004",
    `VaerYaml parse error at line ${no}: ${why}`,
    fix ?? "Repair the reported syntax; VaerYaml is a strict subset of YAML (see spec/).",
  );
}

/** Strip a trailing comment, respecting quotes. */
function stripComment(text: string, no: number): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) {
      if (i === 0 || text[i - 1] === " " || text[i - 1] === "\t") {
        return text.slice(0, i).trimEnd();
      }
    }
  }
  if (inSingle || inDouble) parseFail(no, "unterminated quote");
  return text.trimEnd();
}

function tokenize(source: string): Line[] {
  const lines: Line[] = [];
  const raw = source.split(/\r?\n/);
  for (let i = 0; i < raw.length; i++) {
    const original = raw[i]!;
    if (original.includes("\t")) {
      parseFail(i + 1, "tab character in indentation (use spaces)");
    }
    const text = stripComment(original, i + 1);
    if (text.trim().length === 0) continue;
    if (/^---/.test(text.trim())) {
      parseFail(i + 1, "multi-document streams are not part of VaerYaml");
    }
    if (/^[&*!]/.test(text.trim())) {
      parseFail(i + 1, "anchors, aliases, and tags are not part of VaerYaml");
    }
    if (/^[|>][+-]?\d*$/.test(text.trim())) {
      parseFail(i + 1, "block scalars are not part of VaerYaml; use quoted strings");
    }
    const indent = text.length - text.trimStart().length;
    lines.push({ no: i + 1, indent, text: text.trim() });
  }
  return lines;
}

function parseScalar(token: string, no: number): YamlValue {
  if (token.length === 0) return null;
  if (token.startsWith("&")) parseFail(no, "anchors are not part of VaerYaml");
  if (token.startsWith("*")) parseFail(no, "aliases are not part of VaerYaml");
  if (token.startsWith("!")) parseFail(no, "tags are not part of VaerYaml");
  if (/^[|>][+-]?\d*$/.test(token)) parseFail(no, "block scalars are not part of VaerYaml; use quoted strings");
  if (token === "null" || token === "~") return null;
  if (token === "true") return true;
  if (token === "false") return false;
  if (/^-?\d+$/.test(token)) {
    const v = Number(token);
    if (!Number.isSafeInteger(v)) parseFail(no, `integer out of safe range: ${token}`);
    return v;
  }
  if (/^-?\d+\.\d+$/.test(token)) {
    const v = Number(token);
    if (!Number.isFinite(v)) parseFail(no, `unrepresentable number: ${token}`);
    return v;
  }
  if (token.startsWith('"')) {
    if (!(token.endsWith('"') && token.length >= 2)) parseFail(no, "unterminated double-quoted string");
    return token.slice(1, -1).replace(/\\(.)/g, (_m, c: string) => {
      switch (c) {
        case "n":
          return "\n";
        case "t":
          return "\t";
        case "r":
          return "\r";
        case '"':
          return '"';
        case "\\":
          return "\\";
        default:
          parseFail(no, `unsupported escape \\${c} in double-quoted string`);
      }
    });
  }
  if (token.startsWith("'")) {
    if (!(token.endsWith("'") && token.length >= 2)) parseFail(no, "unterminated single-quoted string");
    return token.slice(1, -1).replace(/''/g, "'");
  }
  return token;
}

/** Split a flow expression at top-level commas, respecting brackets/quotes. */
function splitFlow(body: string, no: number): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === "[" || ch === "{") depth++;
      else if (ch === "]" || ch === "}") depth--;
      else if (ch === "," && depth === 0) {
        parts.push(body.slice(start, i).trim());
        start = i + 1;
      }
    }
  }
  if (inSingle || inDouble) parseFail(no, "unterminated quote in flow collection");
  if (depth !== 0) parseFail(no, "unbalanced brackets in flow collection");
  const last = body.slice(start).trim();
  if (last.length > 0) parts.push(last);
  return parts;
}

function findMatching(body: string, open: string, close: string, no: number): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  parseFail(no, `unmatched '${open}' in flow collection`);
}

function parseFlowValue(token: string, no: number): YamlValue {
  const t = token.trim();
  if (t.startsWith("[")) {
    const close = findMatching(t, "[", "]", no);
    if (close !== t.length - 1) parseFail(no, "trailing content after flow sequence");
    const inner = t.slice(1, -1).trim();
    if (inner.length === 0) return [];
    return splitFlow(inner, no).map((part) => parseFlowItem(part, no));
  }
  if (t.startsWith("{")) {
    const close = findMatching(t, "{", "}", no);
    if (close !== t.length - 1) parseFail(no, "trailing content after flow mapping");
    const inner = t.slice(1, -1).trim();
    const out: { [k: string]: YamlValue } = {};
    if (inner.length === 0) return out;
    for (const part of splitFlow(inner, no)) {
      const kv = splitKey(part, no);
      out[kv.key] = parseFlowItem(kv.rest, no);
    }
    return out;
  }
  return parseScalar(t, no);
}

function parseFlowItem(token: string, no: number): YamlValue {
  const t = token.trim();
  if (t.startsWith("[") || t.startsWith("{")) return parseFlowValue(t, no);
  return parseScalar(t, no);
}

function splitKey(text: string, no: number): { key: string; rest: string } {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ":" && !inSingle && !inDouble) {
      if (i + 1 < text.length && text[i + 1] !== " ") {
        parseFail(no, `missing space after ':' in key '${text.slice(0, i)}'`);
      }
      const rawKey = text.slice(0, i).trim();
      const key = parseScalar(rawKey, no);
      if (typeof key !== "string") parseFail(no, "mapping keys must be strings in VaerYaml");
      return { key, rest: text.slice(i + 1).trim() };
    }
  }
  parseFail(no, `expected 'key: value', found '${text}'`);
}

interface ParseState {
  readonly lines: Line[];
  index: number;
}

function isDashLine(text: string): boolean {
  return text.startsWith("- ") || text === "-";
}

/** Parse a block node whose lines sit at exactly `indent`. */
function parseBlock(state: ParseState, indent: number): YamlValue {
  const first = state.lines[state.index];
  if (first === undefined || first.indent < indent) return null;
  if (first.indent > indent) parseFail(first.no, "unexpected indentation");
  if (isDashLine(first.text)) return parseBlockSequence(state, indent);
  return parseBlockMapping(state, indent);
}

function parseBlockSequence(state: ParseState, indent: number): YamlValue[] {
  const out: YamlValue[] = [];
  while (state.index < state.lines.length) {
    const line = state.lines[state.index]!;
    if (line.indent < indent || !isDashLine(line.text)) break;
    if (line.indent > indent) parseFail(line.no, "unexpected indentation in sequence");
    state.index++;
    const rest = line.text === "-" ? "" : line.text.slice(2).trim();
    if (rest.length === 0) {
      out.push(parseBlock(state, indent + 1));
    } else if (looksLikeMapping(rest)) {
      // `- key: value` opens a mapping indented two columns past the dash;
      // the remainder of the item may continue on following deeper lines.
      const itemIndent = indent + 2;
      out.push(parseBlockMapping(state, itemIndent, { no: line.no, text: rest }));
    } else {
      out.push(parseFlowItem(rest, line.no));
    }
  }
  return out;
}

function looksLikeMapping(text: string): boolean {
  // A `- key: value` item: a top-level colon outside quotes/brackets.
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === "[" || ch === "{") depth++;
      else if (ch === "]" || ch === "}") depth--;
      else if (ch === ":" && depth === 0 && (i + 1 === text.length || text[i + 1] === " ")) return true;
    }
  }
  return false;
}

/**
 * Parse a block mapping. `virtualFirst` carries the text of a first entry
 * that appeared on a `- key: value` sequence line (already consumed).
 */
function parseBlockMapping(
  state: ParseState,
  indent: number,
  virtualFirst?: { no: number; text: string },
): { [k: string]: YamlValue } {
  const out: { [k: string]: YamlValue } = {};
  let first = true;
  for (;;) {
    let no: number;
    let text: string;
    if (first && virtualFirst !== undefined) {
      no = virtualFirst.no;
      text = virtualFirst.text;
      first = false;
    } else {
      const line = state.lines[state.index];
      if (line === undefined) break;
      if (line.indent < indent || isDashLine(line.text)) break;
      if (line.indent > indent) parseFail(line.no, "unexpected indentation");
      state.index++;
      no = line.no;
      text = line.text;
      first = false;
    }
    const { key, rest } = splitKey(text, no);
    if (key in out) parseFail(no, `duplicate key '${key}'`);
    if (rest.length > 0) {
      out[key] = parseFlowValue(rest, no);
    } else {
      const next = state.lines[state.index];
      if (next === undefined) {
        out[key] = null;
      } else if (next.indent > indent) {
        out[key] = parseBlock(state, next.indent);
      } else if (next.indent === indent && isDashLine(next.text)) {
        // Sequence at the same indent as its key (common YAML style).
        out[key] = parseBlockSequence(state, indent);
      } else {
        out[key] = null;
      }
    }
  }
  return out;
}

/** Parse a VaerYaml document into plain JSON-compatible data. */
export function parseVaerYaml(source: string): YamlValue {
  const lines = tokenize(source);
  if (lines.length === 0) return null;
  const state: ParseState = { lines, index: 0 };
  const value = parseBlock(state, lines[0]!.indent);
  if (state.index < lines.length) {
    parseFail(lines[state.index]!.no, "unexpected trailing content");
  }
  return value;
}
