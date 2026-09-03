/**
 * ASCENSION XX Phase 20 — the ecosystem defect closures, pinned.
 *
 * The D-Y Empty Machine Test (docs/ga/ASCENSION-XX-EMPTY-MACHINE-TEST.md)
 * measured four precise failures in the ecosystem surfaces. Each is closed
 * at root here and pinned so the class stays dead:
 *
 *   XX-D4 — dist-pack never writes tracked files; the signing public key
 *           ships BESIDE the artifacts, manifest-bound; dist-verify resolves
 *           it without any repository or session state.
 *   XX-D5 — the installer persists PATH even on a genuinely fresh $HOME
 *           (rc files are created when absent) and removes the whole marker
 *           block on uninstall.
 *   XX-D7 — the npm method detects a non-writable system prefix and falls
 *           back to a user prefix, teaching what it does.
 *   XX-D6 — the demo default-grant literal stays dead (negative pin).
 *
 * Cross-language surfaces (shell scripts) are pinned structurally, the
 * established pattern for artifacts this host cannot execute portably.
 */

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { INIT_TEMPLATES, TEMPLATE_SCAFFOLD_FILES } from "../../src/config/templates.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const readRepo = async (rel: string): Promise<string> => readFile(join(ROOT, rel), "utf8");

describe("ASCENSION XX — ecosystem defect closures pinned", () => {
  test("XX-D5: the installer creates missing rc files (a fresh $HOME persists PATH)", async () => {
    const sh = await readRepo("packaging/install.sh");
    expect(sh).toContain("CREATED=1");
    expect(sh).toContain(': > "$f"');
    expect(sh).toContain("a fresh home had no rc file");
  });

  test("XX-D5: uninstall removes the WHOLE marker block, never a line-pattern guess", async () => {
    const sh = await readRepo("packaging/install.sh");
    expect(sh).toContain('awk -v b="$MARKER_BEGIN" -v e="$MARKER_END"');
    expect(sh).not.toContain("grep -v 'export PATH=");
  });

  test("XX-D7: the npm method detects a non-writable prefix and falls back to a user prefix", async () => {
    const sh = await readRepo("packaging/install.sh");
    expect(sh).toContain("npm prefix -g");
    expect(sh).toContain('npm_config_prefix="$NPM_USER_PREFIX"');
    expect(sh).toContain("$HOME/.npm-global");
    expect(sh).toContain("system npm prefix is not writable");
  });

  test("XX-D7: uninstall removes the user-prefix install too", async () => {
    const sh = await readRepo("packaging/install.sh");
    expect(sh).toContain('$HOME/.npm-global/lib/node_modules/vaerion');
    expect(sh).toContain('npm_config_prefix="$HOME/.npm-global" npm uninstall -g vaerion');
  });

  test("XX-D8: a same-version reinstall REFRESHES the version tree (never nests src)", async () => {
    const sh = await readRepo("packaging/install.sh");
    // The version dir is replaced before the copy — the fixed engine cannot
    // hide behind a stale nested copy (measured live in the Phase 20 rerun).
    const block = sh.slice(sh.indexOf('rm -rf "$DEST"'), sh.indexOf('bun install --production'));
    expect(block).toContain('rm -rf "$DEST"');
    expect(block).toContain('cp -R "$SRC_ROOT/packages/vaerion/src" "$DEST/src"');
  });

  test("XX-D9: installer output never executes backtick command substitution", async () => {
    const sh = await readRepo("packaging/install.sh");
    // The npm success line measured live as `vae` EXECUTING inside the message.
    expect(sh).toContain('\\`vae\\` is in npm\'s global bin');
  });

  test("XX-D7: uninstall removes npm's empty user-prefix skeleton, never user data", async () => {
    const sh = await readRepo("packaging/install.sh");
    expect(sh).toContain('rmdir "$HOME/.npm-global/lib/node_modules" "$HOME/.npm-global/lib" "$HOME/.npm-global/bin" "$HOME/.npm-global"');
  });

  test("XX-D4: dist-pack NEVER writes the tracked key of record", async () => {
    const pack = await readRepo("tools/dist-pack.ts");
    // The hygiene pin: no write to the tracked public key, anywhere.
    expect(pack).not.toContain('writeFileSync(join(ROOT, "keys", "release-signing.pub")');
    // The public half ships beside the artifacts instead.
    expect(pack).toContain('writeFileSync(join(DIST, "release-signing.pub")');
    expect(pack).toContain("manifestVersion: 3");
    // SHA256SUMS covers the shipped key too (everything except itself).
    expect(pack).toContain('"release-signing.pub", "VERIFY.md"');
  });

  test("XX-D4: dist-verify resolves the key beside the manifest, fail-closed when absent", async () => {
    const verify = await readRepo("tools/dist-verify.ts");
    expect(verify).toContain('join(base, "release-signing.pub")');
    expect(verify).toContain("place release-signing.pub beside MANIFEST.json");
  });

  test("XX-D6: the demo default-grant literal stays dead (negative pin)", async () => {
    const commands = await readRepo("packages/vaerion/src/cli/commands.ts");
    expect(commands).not.toContain('["./docs/constitution", "./docs/adr"]');
    expect(commands).toContain("demoSourcesFromConfig");
  });

  test("D-B: a template's scaffold files and its declared capabilities can never disagree", () => {
    for (const name of initTemplateNamesCoherent()) {
      const scaffold = TEMPLATE_SCAFFOLD_FILES[name] ?? {};
      const declaredPaths = declaredLocalPaths(INIT_TEMPLATES[name]!.body);
      for (const path of Object.keys(scaffold)) {
        // every scaffolded file lives under SOME declared capability path
        const under = declaredPaths.some((base) => path === base.slice(2) || path.startsWith(base.slice(2) + "/"));
        expect(under).toBe(true);
      }
    }
  });
});

/** Template names in registry order (the coherent set). */
function initTemplateNamesCoherent(): string[] {
  return Object.keys(INIT_TEMPLATES);
}

/** The declared `./relative` local source paths in a template body. */
function declaredLocalPaths(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/path: "(\.\/[^"]+)"/g)) out.push(m[1]!);
  return out;
}
