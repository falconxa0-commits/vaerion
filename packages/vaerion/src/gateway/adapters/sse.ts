/**
 * Vaerion — wire stream parsers (SSE + NDJSON).
 *
 * The gateway's byte→event layer. Providers stream Server-Sent Events
 * (Anthropic, OpenAI) or NDJSON lines (Ollama); this module turns raw chunk
 * text into parsed wire events WITHOUT knowing any provider semantics.
 * Buffering is explicit: chunks may split lines at arbitrary boundaries and
 * the parsers are chunking-invariant (cassette replays pin the boundaries).
 *
 * Sources: the SSE format as specified by the WHATWG HTML standard's
 * `text/event-stream` processing model; NDJSON as line-delimited JSON
 * (one JSON value per newline-terminated line).
 */

export interface SseEvent {
  /** `event:` field value ("" when the stream uses data-only events). */
  event: string;
  /** `data:` payload — multiple data lines joined with "\n" per the SSE spec. */
  data: string;
}

/**
 * Incremental SSE parser. Feed chunks; collect complete events. A partial
 * trailing line is retained across feeds (never emitted, never lost).
 */
export class SseParser {
  private buffer = "";

  /** Feed one wire chunk; returns every event completed by it. */
  feed(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];
    // SSE dispatches on empty lines; split keeping terminators, then scan.
    for (;;) {
      const idx = this.buffer.indexOf("\n\n");
      if (idx === -1) {
        // Also honor a block terminated by \r\n\r\n (CRLF streams).
        const crlf = this.buffer.indexOf("\r\n\r\n");
        if (crlf === -1) break;
        const block = this.buffer.slice(0, crlf);
        this.buffer = this.buffer.slice(crlf + 4);
        const ev = this.parseBlock(block);
        if (ev) events.push(ev);
        continue;
      }
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const ev = this.parseBlock(block);
      if (ev) events.push(ev);
    }
    return events;
  }

  /** Flush any buffered non-empty tail (call at end-of-stream). */
  flush(): SseEvent[] {
    const tail = this.buffer;
    this.buffer = "";
    if (tail.trim().length === 0) return [];
    const ev = this.parseBlock(tail);
    return ev ? [ev] : [];
  }

  private parseBlock(block: string): SseEvent | null {
    let event = "";
    const dataLines: string[] = [];
    for (const rawLine of block.split(/\r\n|\n|\r/)) {
      if (rawLine.startsWith(":")) continue; // comment/keep-alive
      const colon = rawLine.indexOf(":");
      const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
      let value = colon === -1 ? "" : rawLine.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") event = value;
      else if (field === "data") dataLines.push(value);
      // `id:`/`retry:` are irrelevant to one-shot invocation streams; ignored.
    }
    if (dataLines.length === 0) return null;
    return { event, data: dataLines.join("\n") };
  }
}

/**
 * Parse SSE chunk text into wire JSON events. Each completed `data:` payload
 * is JSON.parse'd; `data: [DONE]` (OpenAI terminator) yields `{done: true}`.
 * Returns parsed values; malformed JSON payloads are reported as parse
 * failures (E1702 territory — the caller decides).
 */
export function parseSseChunks(chunks: readonly string[]): Array<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const parser = new SseParser();
  const out: Array<{ ok: true; value: unknown } | { ok: false; error: string }> = [];
  for (const chunk of chunks) {
    for (const ev of parser.feed(chunk)) {
      const trimmed = ev.data.trim();
      if (trimmed === "[DONE]") {
        out.push({ ok: true, value: { done: true } });
        continue;
      }
      try {
        out.push({ ok: true, value: JSON.parse(trimmed) as unknown });
      } catch (e) {
        out.push({ ok: false, error: `SSE data is not JSON: ${(e as Error).message}` });
      }
    }
  }
  for (const ev of parser.flush()) {
    try {
      out.push({ ok: true, value: JSON.parse(ev.data.trim()) as unknown });
    } catch (e) {
      out.push({ ok: false, error: `SSE data is not JSON: ${(e as Error).message}` });
    }
  }
  return out;
}

/**
 * Parse NDJSON chunk text into wire JSON events (Ollama). Chunking-invariant:
 * partial lines buffer until a newline completes them.
 */
export function parseNdjsonChunks(chunks: readonly string[]): Array<{ ok: true; value: unknown } | { ok: false; error: string }> {
  let buffer = "";
  const out: Array<{ ok: true; value: unknown } | { ok: false; error: string }> = [];
  for (const chunk of chunks) {
    buffer += chunk;
    for (;;) {
      const nl = buffer.indexOf("\n");
      if (nl === -1) break;
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.length === 0) continue;
      try {
        out.push({ ok: true, value: JSON.parse(line) as unknown });
      } catch (e) {
        out.push({ ok: false, error: `NDJSON line is not JSON: ${(e as Error).message}` });
      }
    }
  }
  const tail = buffer.trim();
  if (tail.length > 0) {
    try {
      out.push({ ok: true, value: JSON.parse(tail) as unknown });
    } catch (e) {
      out.push({ ok: false, error: `NDJSON tail is not JSON: ${(e as Error).message}` });
    }
  }
  return out;
}
