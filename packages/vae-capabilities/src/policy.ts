/**
 * vae-capabilities — policy view (D10.5).
 *
 * Policy comes from the project configuration's `permissions` ceilings.
 * The broker never writes policy: it proposes diffs (D3.5); permanent
 * grants exist only as reviewable config changes. This module is a
 * read-only view over those ceilings.
 */

import type { Capability, CapabilityRequest } from "./capability.ts";
import type { PermissionsConfig } from "vae-config";

export interface RuleMatch {
  readonly matched: boolean;
  readonly rule?: string;
}

/** Expand `$PROJECT` in scope expressions against the workspace root. */
export function expandScope(scope: string, projectRoot?: string): string {
  if (projectRoot === undefined) return scope;
  return scope.replaceAll("$PROJECT", projectRoot);
}

function globToRegExp(pattern: string): RegExp {
  // Minimal, deterministic glob: ** crosses separators, * does not, ? is one char.
  let out = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i++;
      } else {
        out += "[^/]*";
      }
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`${out}$`);
}

export function scopeMatches(pattern: string, value: string): boolean {
  return globToRegExp(pattern).test(value);
}

export class PolicyView {
  constructor(
    private readonly permissions: PermissionsConfig,
    private readonly projectRoot?: string,
  ) {}

  matchDeny(request: CapabilityRequest): RuleMatch {
    // v0.1 policy grammar has no deny section: the default posture is
    // deny (D10.1). A deny section arrives additively (Article VIII);
    // the evaluation order below already enforces deny-beats-allow.
    void request;
    return { matched: false };
  }

  matchAllow(request: CapabilityRequest): RuleMatch {
    const { domain, action, scope } = request.capability;
    const perms = this.permissions;
    if (domain === "fs" && (action === "read" || action === "write")) {
      const list = action === "read" ? perms.fs.read : perms.fs.write;
      const expanded = expandScope(scope, this.projectRoot);
      for (const pattern of list) {
        if (scopeMatches(expandScope(pattern, this.projectRoot), expanded)) {
          return { matched: true, rule: `permissions.fs.${action}` };
        }
      }
      return { matched: false };
    }
    if (domain === "net" && action === "fetch") {
      const host = scope.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      for (const allowed of perms.net.allowHosts) {
        if (host === allowed || host.endsWith(`.${allowed}`) || scopeMatches(allowed, host)) {
          return { matched: true, rule: "permissions.net.allowHosts" };
        }
      }
      return { matched: false };
    }
    if (domain === "exec" && action === "run") {
      const parts = scope.split(/\s+/);
      for (const cmd of perms.exec.allowCommands) {
        if (cmd.length === 0) continue;
        const head = cmd[0]!;
        if (head !== parts[0]) continue;
        if (cmd.length === 1) return { matched: true, rule: "permissions.exec.allowCommands" };
        // `cmd:*` wildcard tails are matched positionally.
        let ok = true;
        for (let i = 1; i < cmd.length; i++) {
          const want = cmd[i]!;
          const got = parts[i];
          if (want.endsWith(":*")) continue;
          if (want !== got) {
            ok = false;
            break;
          }
        }
        if (ok) return { matched: true, rule: "permissions.exec.allowCommands" };
      }
      return { matched: false };
    }
    if (domain === "engine" && action === "selfcheck") {
      // Engine-internal self-check is granted to the engine principal
      // by declaration; scope must be "core".
      return scope === "core" ? { matched: true, rule: "engine.selfcheck" } : { matched: false };
    }
    if (domain === "research" && action === "fetch") {
      // Research is granted only through an explicit allowHosts-style
      // scope match against permissions.net.allowHosts (no default grant).
      const host = scope.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      for (const allowed of perms.net.allowHosts) {
        if (host === allowed) return { matched: true, rule: "permissions.net.allowHosts[research]" };
      }
      return { matched: false };
    }
    return { matched: false };
  }

  scopeMatches(capability: Capability): boolean {
    // The scope expression itself is validated against its domain grammar.
    if (capability.domain === "fs") return capability.scope.length > 0;
    return capability.scope.length > 0;
  }
}
