/**
 * THE VERSION REGISTER — one mechanical authority for engine-version lockstep.
 *
 * History (Phase XXIII, GAP-1): the ASCENSION XX close committed "version
 * lockstep 0.1.12-rc1 across every measured surface (17 surfaces)" — and the
 * claim was honest but INCOMPLETE: three version-bearing release surfaces
 * existed outside the register and stayed at 0.1.9-rc1
 * (packaging/python/vaerion/__init__.py, packaging/linux/vaerion.spec —
 * internally inconsistent in three places — and packaging/windows/install.ps1).
 * This test is the root fix: the register is now COMPLETE (positive pins for
 * every known surface) and CLOSED (a negative sweep proves no other stale
 * engine-version literal hides in packaging/ or sdks/). A surface added to
 * the register or left behind will fail here, not in a Founder audit.
 *
 * Sources of truth, by construction:
 *   - The version of record is the VERSION literal in src/cli/vae.ts
 *     (parsed here, never imported — the literal IS the surface).
 *   - journal/writer.ts ENGINE_VERSION must equal it.
 *   - Derived forms: RPM replaces the pre-release hyphen with a dot
 *     (0.1.12-rc1 -> 0.1.12.rc1); Debian replaces it with a tilde
 *     (0.1.12-rc1 -> 0.1.12~rc1).
 *
 * Register scope (a recorded decision, not an accident): the ROOT
 * package.json is the private Next.js dashboard host and ships to no
 * registry — it is deliberately OUT of this register. The engine,
 * npm-consumer, SDK, and tools packages, every packaging manifest, and the
 * generated OpenAPI document ARE the register.
 *
 * Sweep constraint (honest): the negative sweep pins the -rcN epoch form
 * (0.MINOR.PATCH-rcN), the only form this lineage has ever released. A
 * future non-rc GA epoch amends this file's sweep — never silently.
 */

import { describe, expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const readRepo = async (rel: string): Promise<string> => readFile(join(ROOT, rel), "utf8");

const cliSource = await readRepo("packages/vaerion/src/cli/vae.ts");
const VERSION = cliSource.match(/export const VERSION = "([^"]+)"/)?.[1] ?? "";
const RPM_VERSION = VERSION.replace("-", ".");
const DEB_VERSION = VERSION.replace("-", "~");
// Chocolatey forbids pre-release segments: the rc tag maps onto the 4th
// revision digit (0.1.13-rc1 -> 0.1.13.1) — the channel's derived form.
const CHOCO_VERSION = VERSION.replace("-rc", ".");

/** The register: [repo-relative path, anchors that must each appear in the file]. */
const REGISTER: Array<[string, string[]]> = [
  // package surfaces
  ["packages/vaerion/package.json", [`"version": "${VERSION}"`]],
  ["packaging/npm/package.json", [`"version": "${VERSION}"`]],
  ["sdks/typescript/package.json", [`"version": "${VERSION}"`]],
  ["tools/package.json", [`"version": "${VERSION}"`]],
  // python channel
  ["packaging/python/pyproject.toml", [`version = "${VERSION}"`]],
  ["packaging/python/vaerion/__init__.py", [`__version__ = "${VERSION}"`]],
  // linux channels
  ["packaging/linux/vaerion.spec", [`%global version_string ${VERSION}`, `%global rpm_version    ${RPM_VERSION}`]],
  ["packaging/linux/make-deb.sh", [`VERSION="\${1:-${VERSION}}"`, `${VERSION} -> ${DEB_VERSION}`]],
  ["packaging/linux/make-appimage.sh", [`VERSION="\${1:-${VERSION}}"`]],
  // macos channels
  ["packaging/macos/make-dmg.sh", [`VERSION=\${1:-${VERSION}}`]],
  ["packaging/macos/make-pkg.sh", [`VERSION=\${1:-${VERSION}}`]],
  // windows channels
  ["packaging/windows/install.ps1", [`[string]$Version = "${VERSION}"`]],
  ["packaging/windows/winget/Vaerion.Vaerion.yaml", [`PackageVersion: ${VERSION}`]],
  ["packaging/windows/winget/Vaerion.Vaerion.installer.yaml", [`PackageVersion: ${VERSION}`, `vaerion-${VERSION}-windows-x64.zip`]],
  ["packaging/windows/winget/Vaerion.Vaerion.locale.yaml", [`PackageVersion: ${VERSION}`]],
  // homebrew + generated API + docs of record
  ["packaging/homebrew/vaerion.rb", [`vaerion-${VERSION}-source.tar.gz`]],
  ["spec/openapi.json", [`"version": "${VERSION}"`]],
  ["packaging/README.md", [VERSION]],
  // ASCENSION XXV Phase XXXI channels — the four authored-manifest gaps closed
  ["packaging/linux/flatpak/dev.vaerion.Vaerion.yml", [`lib/vaerion/${VERSION}/`, `vaerion-${VERSION}-source.tar.gz`]],
  ["packaging/linux/snap/snapcraft.yaml", [`version: "${VERSION}"`, `lib/vaerion/${VERSION}/`]],
  ["packaging/windows/chocolatey/vaerion.nuspec", [`<version>${CHOCO_VERSION}</version>`]],
  ["packaging/windows/scoop/vaerion.json", [`"version": "${VERSION}"`, `vaerion-${VERSION}-windows-x64.zip`]],
];

const TEXT_EXTS = new Set([".sh", ".ps1", ".py", ".toml", ".yaml", ".yml", ".json", ".md", ".rb", ".spec", ".cmd", ".txt"]);

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(join(ROOT, dir), { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const rel = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(rel)));
    else if (TEXT_EXTS.has(extname(e.name))) files.push(rel);
  }
  return files;
}

describe("version register — engine-version lockstep is complete and closed", () => {
  test("the version of record is parseable and in the rc epoch form", () => {
    expect(VERSION).toMatch(/^0\.\d+\.\d+-rc\d+$/);
  });

  test("ENGINE_VERSION === CLI VERSION (the engine never lies to its CLI)", async () => {
    const writer = await readRepo("packages/vaerion/src/journal/writer.ts");
    expect(writer).toContain(`export const ENGINE_VERSION = "${VERSION}"`);
  });

  test("every register surface carries the version of record (positive register)", async () => {
    expect(REGISTER.length).toBeGreaterThanOrEqual(18);
    for (const [rel, anchors] of REGISTER) {
      const content = await readRepo(rel);
      for (const anchor of anchors) {
        expect(content).toContain(anchor);
      }
    }
  });

  test("no stale engine-version literal hides in packaging/ or sdks/ (negative sweep)", async () => {
    const files = [...(await walk("packaging")), ...(await walk("sdks"))];
    const rcLiteral = /0\.\d+\.\d+-rc\d+/g;
    const derivedForms = new Set([VERSION, RPM_VERSION, DEB_VERSION]);
    const violations: string[] = [];
    for (const rel of files) {
      const content = await readRepo(rel);
      // The RPM %changelog preserves release history by design — sweep only the
      // part before it, and pin its top entry to the current epoch separately.
      const sweepable = rel.endsWith("vaerion.spec") ? (content.split("%changelog")[0] ?? "") : content;
      for (const m of sweepable.matchAll(rcLiteral)) {
        if (!derivedForms.has(m[0])) violations.push(`${rel}: ${m[0]}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("the RPM changelog's top entry is the current epoch (history appends, never rewinds)", async () => {
    const spec = await readRepo("packaging/linux/vaerion.spec");
    const changelog = spec.split("%changelog")[1] ?? "";
    expect(changelog.trim().startsWith("*")).toBe(true);
    expect(changelog).toContain(`- ${RPM_VERSION}-1`);
    expect(changelog.indexOf(`${RPM_VERSION}-1`)).toBeLessThan(changelog.indexOf("0.1.7.rc2-1"));
  });

  test("the CHANGELOG of record documents the version of record (no silent release trains)", async () => {
    // Changelog automation, ASCENSION XXV Phase XXIX: a release train that
    // bumps the register without documenting the version fails here — the
    // CHANGELOG cannot drift behind the engine (and the release-publish
    // pipeline reads the matching RELEASE-NOTES file, so the two surfaces
    // agree by construction).
    const changelog = await readRepo("CHANGELOG.md");
    expect(changelog).toContain(`## [${VERSION}]`);
    // The notes-of-record file for the version of record must exist too —
    // release-publish.yml prefers it as the GitHub Release body. (The notes
    // files carry the tag's `v` prefix; the VERSION literal does not.)
    const notes = await readRepo(`docs/RELEASE-NOTES-v${VERSION}.md`);
    expect(notes).toContain(`# Release Notes — v${VERSION}`);
  });
});
