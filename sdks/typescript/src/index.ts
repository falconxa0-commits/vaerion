/**
 * @vaerion/sdk — TypeScript SDK preparation (MS-5 conformance-locked).
 *
 * Speaks only the canonical envelope (D17.7) over the loopback daemon
 * (D17.9). This file is the seed of the MS-5 SDK: typed, honest, and
 * locked to the same contract truth as the CLI and API (D17.2).
 */

export interface Principal {
  readonly kind: "human" | "agent" | "engine" | "extension";
  readonly id: string;
  readonly display?: string;
}

export interface Cause {
  readonly kind: string;
  readonly ref: string;
}

/** The canonical envelope (spec/schemas/envelope.schema.json). */
export interface Envelope {
  readonly v: 1;
  readonly type: string;
  readonly seq: number;
  readonly ts: string;
  readonly run_id?: string;
  readonly actor: Principal;
  readonly cause: Cause;
  readonly payload: Record<string, unknown>;
}

export interface VaeClientOptions {
  readonly baseUrl: string;
  /** Pairing token from .vaerion/token (0600, D17.9). */
  readonly token: string;
}

export class SdkError extends Error {
  constructor(readonly code: string, message: string, readonly fix?: string) {
    super(message);
    this.name = "SdkError";
  }
}

export class VaeClient {
  constructor(private readonly options: VaeClientOptions) {}

  private async get(path: string): Promise<Envelope> {
    const response = await fetch(`${this.options.baseUrl}${path}`, {
      headers: { authorization: `Bearer ${this.options.token}` },
    });
    const body = (await response.json()) as Envelope & { payload: { error?: { code: string; message: string; fix?: string } } };
    if (!response.ok || body.payload?.error !== undefined) {
      const err = body.payload?.error;
      throw new SdkError(err?.code ?? `HTTP ${response.status}`, err?.message ?? response.statusText, err?.fix);
    }
    return body;
  }

  /** Engine and workspace health (open endpoint). */
  async health(): Promise<Envelope> {
    const response = await fetch(`${this.options.baseUrl}/v1/health`);
    return (await response.json()) as Envelope;
  }

  /** List runs with journal status. */
  async runs(): Promise<Envelope> {
    return this.get("/v1/runs");
  }

  /** Stream a run's journal as NDJSON envelopes (D17.8 posture). */
  async *journal(runId: string): AsyncGenerator<Envelope> {
    const response = await fetch(`${this.options.baseUrl}/v1/runs/${encodeURIComponent(runId)}/journal`, {
      headers: { authorization: `Bearer ${this.options.token}` },
    });
    if (!response.ok || response.body === null) {
      throw new SdkError(`HTTP ${response.status}`, `journal stream for run '${runId}' failed`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim().length === 0) continue;
        yield JSON.parse(line) as Envelope;
      }
    }
  }
}
