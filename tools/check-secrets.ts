/**
 * check-secrets — no secrets in the repository (Founder's verification
 * requirement 10; D19.5 posture). Scans every tracked-candidate file
 * for credential-shaped content. This is a merge-blocking court.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = join(import.meta.dir, "..");

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "GitHub personal access token", re: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { name: "GitHub fine-grained token", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: "OpenAI-style key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "JWT", re: /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/ },
  { name: "PEM private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".vaerion"]);
const TEXT_EXT = new Set([".ts", ".md", ".json", ".yaml", ".yml", ".toml", ".txt", ".editorconfig", ".gitignore", ".mdx", ""],);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function main(): number {
  const findings: string[] = [];
  for (const file of walk(ROOT)) {
    const ext = extname(file);
    if (!TEXT_EXT.has(ext) && !existsSync(file)) continue;
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const { name, re } of PATTERNS) {
      if (re.test(text)) {
        const lines = text.split("\n");
        for (const [i, line] of lines.entries()) {
          if (re.test(line)) {
            findings.push(`${relative(ROOT, file)}:${i + 1} — ${name}`);
          }
        }
      }
    }
  }

  if (findings.length > 0) {
    console.error(`check-secrets: RED — ${findings.length} finding(s):`);
    for (const f of findings) console.error(`  ${f}`);
    console.error("\nSecrets are inputs, never files (D19.5). Remove the secret, rotate it, and redact at the publication boundary (D9.4).");
    return 1;
  }
  console.log("check-secrets: GREEN — 0 credential-shaped findings across the tree.");
  return 0;
}

process.exit(main());
