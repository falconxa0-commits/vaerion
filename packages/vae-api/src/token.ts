/**
 * vae-api — pairing token (D17.9).
 *
 * In v0.1 the daemon binds to loopback and authenticates local clients
 * through a pairing token minted at first use. No network-exposed
 * authentication surface exists; remote access requires a Class A
 * amendment (Appendix I).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { blake3Text } from "vae-foundation";

/** Mint (or reuse) the workspace pairing token with 0600 permissions. */
export function mintToken(tokenFile: string): string {
  if (existsSync(tokenFile)) {
    const existing = readToken(tokenFile);
    if (existing !== undefined && existing.length > 0) return existing;
  }
  mkdirSync(dirname(tokenFile), { recursive: true });
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  writeFileSync(tokenFile, `${token}\n`, "utf8");
  chmodSync(tokenFile, 0o600);
  return token;
}

export function readToken(tokenFile: string): string | undefined {
  if (!existsSync(tokenFile)) return undefined;
  return readFileSync(tokenFile, "utf8").trim();
}

/** Constant-time comparison — token checks do not leak timing. */
export function tokensMatch(presented: string | undefined, expected: string): boolean {
  if (presented === undefined) return false;
  const a = blake3Text(presented);
  const b = blake3Text(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface TokenHealth {
  readonly present: boolean;
  readonly permissionsOk: boolean;
  readonly mode?: string;
}

/** Token hygiene used by doctor (D17.9 mitigation). */
export function tokenHealth(tokenFile: string): TokenHealth {
  if (!existsSync(tokenFile)) return { present: false, permissionsOk: true };
  const mode = (statSync(tokenFile).mode & 0o777).toString(8);
  return { present: true, permissionsOk: mode === "600", mode };
}
