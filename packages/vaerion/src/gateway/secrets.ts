/**
 * Vaerion — secrets protocol (R-MG4, ADR-0013).
 *
 * Law:
 *   1. Secrets live in the OS keychain first (keyring port, service `vae`,
 *      profile as account), with environment-variable indirection as the
 *      documented fallback for containers/CI. A vault backend can arrive
 *      later behind the same port; v0.1 builds none.
 *   2. Names only in configuration — `vaerion.yaml` carries secret NAMES and
 *      scoped grants; VALUES are resolved exclusively at call time and are
 *      never written to disk, config, journal, receipt, or log by the engine.
 *   3. A secret read is a broker-mediated capability (domain `secret.read`)
 *      and a journaled decision like any other — the GatewayService enforces
 *      that ordering; this module only supplies resolution mechanics.
 *   4. Resolution results are returned once to the consumer (the adapter's
 *      header builder); no engine component caches or persists them.
 */

import { execFile } from "node:child_process";
import { VaerionError } from "../kernel/errors.ts";

/** The secret-resolution port (ADR-0013 point 1). */
export interface SecretPort {
  readonly name: string;
  /** Resolve a secret NAME to its value, or null when unresolved. Never throws for absence. */
  resolve(secretName: string): Promise<string | null>;
}

/**
 * Environment indirection (the documented fallback): the configuration names
 * a secret; the process environment supplies its value at use time. The
 * value is never written to disk by the engine.
 */
export const envSecretPort: SecretPort = {
  name: "env-indirection",
  resolve(secretName: string): Promise<string | null> {
    const value = process.env[secretName];
    return Promise.resolve(typeof value === "string" && value.length > 0 ? value : null);
  },
};

/**
 * macOS keychain via the `security` CLI (the OS keyring for the primary
 * development platform). Linux containers without a keyring fall through to
 * the env port — composed by `resolveSecret`. The child process never
 * echoes the value anywhere; it is captured and passed to the caller only.
 */
export const macKeychainSecretPort: SecretPort = {
  name: "os-keychain",
  resolve(secretName: string): Promise<string | null> {
    return new Promise((resolvePromise) => {
      execFile(
        "/usr/bin/security",
        ["find-generic-password", "-s", "vae", "-a", secretName, "-w"],
        { timeout: 2_000 },
        (err, stdout) => {
          if (err) {
            resolvePromise(null);
            return;
          }
          const value = stdout.toString().replace(/\r?\n$/, "");
          resolvePromise(value.length > 0 ? value : null);
        },
      );
    });
  },
};

/**
 * Keychain-first composition (ADR-0013 decision 1→2): try the OS keychain;
 * on platforms/situations without one, fall back to env indirection. Both
 * attempts are silent on absence; the caller decides how loudly to fail
 * (E1704 after the broker allowed the read).
 */
export function defaultSecretPort(platform: NodeJS.Platform = process.platform): SecretPort {
  if (platform === "darwin") {
    return {
      name: "keychain-first",
      async resolve(secretName: string): Promise<string | null> {
        const fromKeychain = await macKeychainSecretPort.resolve(secretName);
        if (fromKeychain !== null) return fromKeychain;
        return envSecretPort.resolve(secretName);
      },
    };
  }
  return envSecretPort;
}

/**
 * Fail loudly when a broker-allowed secret read resolves to nothing
 * (E1704). The error message carries the NAME only — never any value.
 */
export function requireResolvedSecret(name: string, value: string | null): string {
  if (value === null || value.length === 0) {
    throw new VaerionError(
      "E1704",
      `secret "${name}" is declared and granted but resolved to nothing (keychain and environment both empty)`,
      { name },
    );
  }
  return value;
}
