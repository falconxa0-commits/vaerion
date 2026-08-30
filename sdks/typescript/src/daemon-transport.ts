/**
 * @vaerion/sdk — the sanctioned wire-client transport (MS-5, ADR-0020).
 *
 * C1 carries ONE sanctioned CLIENT egress site, and this file is it —
 * symmetric to the gateway's single sanctioned egress (ADR-0019). Law:
 *
 *   - Loopback-enforced IN CODE: a base URL whose host is not 127.0.0.1,
 *     localhost, or [::1] is refused (E2006) before a single byte is sent.
 *     Remote attachment waits for a ratified transport-security ADR.
 *   - This is a client to the LOCAL DAEMON only — never a second gateway,
 *     never a telemetry sink, never a generic HTTP helper.
 */

import { VaerionError } from "@vaerion/engine";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function assertLoopbackBase(base: string): URL {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new VaerionError("E2006", `daemon base is not a valid URL: ${base}`, { base: "<given>" });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new VaerionError("E2006", `daemon base must use http/https, got: ${url.protocol}`);
  }
  const host = url.hostname.startsWith("[") ? url.hostname : url.hostname;
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new VaerionError("E2006", `refusing to attach to non-loopback daemon (${host}): remote attachment requires a ratified transport-security ADR`);
  }
  return url;
}

export interface WireResponse<T> {
  status: number;
  body: T;
}

export class DaemonWireTransport {
  readonly base: URL;
  readonly token: string;

  constructor(base: string, token: string) {
    this.base = assertLoopbackBase(base);
    this.token = token;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, ...(extra ?? {}) };
  }

  private urlFor(path: string, query?: Record<string, string>): string {
    const url = new URL(this.base.toString());
    url.pathname = path;
    if (query) {
      for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    }
    return url.toString();
  }

  async request<T>(method: "GET" | "POST", path: string, opts: { body?: unknown; query?: Record<string, string> } = {}): Promise<WireResponse<T>> {
    const response = await fetch(this.urlFor(path, opts.query), {
      method,
      headers: this.headers(opts.body !== undefined ? { "Content-Type": "application/json" } : undefined),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text.slice(0, 200) };
    }
    return { status: response.status, body: parsed as T };
  }

  /** Raw SSE response — the caller parses frames (see VaeDaemonClient). */
  async stream(path: string, query?: Record<string, string>): Promise<Response> {
    return fetch(this.urlFor(path, query), { method: "GET", headers: this.headers() });
  }
}

export default DaemonWireTransport;
