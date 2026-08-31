#!/usr/bin/env bun
/**
 * `vae` launcher for the vaerion npm package.
 *
 * Resolves the packaged engine (engine/cli/vae.ts) and hands argv to the
 * same main() the repo shim uses — one entrypoint, one exit-code contract.
 * Under node (wrong runtime) it refuses with an educated error instead of
 * a cryptic parser failure.
 */

if (typeof Bun === "undefined") {
  console.error("E1600 vae requires the Bun runtime (>= 1.2) — node cannot execute the engine.");
  console.error("Fix: install Bun -> curl -fsSL https://bun.sh/install | sh");
  console.error("Docs: docs/INSTALL.md (all installation methods)");
  process.exit(2);
}

const { main } = await import(new URL("../engine/cli/vae.ts", import.meta.url).href);
process.exit(await main(process.argv.slice(2)));
