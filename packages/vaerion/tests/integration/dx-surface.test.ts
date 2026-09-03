/**
 * Phase XXII — the DX surface gaps, closed and pinned.
 *
 * The PHASE-XXII-DX-AUDIT measured six gaps against the CLI surface. Each is
 * closed at root here and pinned so the class stays dead:
 *
 *   DX-1  `vae --version` / `-V` prints the version line (it used to fall
 *         through to the welcome payload); json mode emits stable NDJSON.
 *   DX-2  `vae help [COMMAND]` — the help frames, always teaching (unknown
 *         topics fall back to the main help; never an error).
 *   DX-3  `vae completions <shell>` — codegen from the ONE completion model,
 *         pinned against the command registry (drift fails here, in CI).
 *   DX-4  the unknown-command error goes through the ONE renderer — the
 *         `--json` NDJSON guarantee holds on the usage path too.
 *   DX-5  `--quiet` suppresses decorative framing only (data and errors are
 *         never suppressed).
 *   DX-6  VAE_DEBUG=1 prints the underlying stack for engine errors.
 *
 * Platform honesty: only bash exists on the generating host, so the bash
 * completion script is syntax-checked here (`bash -n`). The zsh/fish/
 * powershell scripts are pinned for structure and stability; their
 * execution remains UNVERIFIED on their hosts (the honest marker is baked
 * into each generated script).
 */

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, MAIN_HELP, COMMAND_HELP, VERSION } from "../../src/cli/vae.ts";
import { COMPLETION_MODEL, completionScript, completionCommands, SUPPORTED_SHELLS } from "../../src/cli/completions.ts";
import { ExitCode } from "../../src/cli/io.ts";

interface Captured {
  out: string[];
  err: string[];
}
function captureIo(tty = false, columns = 100) {
  const captured: Captured = { out: [], err: [] };
  return {
    captured,
    io: {
      out: (l: string) => { captured.out.push(l); },
      err: (l: string) => { captured.err.push(l); },
      raw: () => undefined,
      tty,
      columns,
    },
  };
}
async function run(argv: string[], tty = false, columns = 100) {
  const s = captureIo(tty, columns);
  const code = (await runCli(argv, s.io, mkdtempSync(join(tmpdir(), "vae-dx-")))).code;
  return { code, ...s.captured };
}
const outText = (c: Captured) => c.out.join("\n");
const errText = (c: Captured) => c.err.join("\n");

describe("DX-1 — the version flag", () => {
  test(`vae --version prints the version line (vae ${VERSION}), exit 0`, async () => {
    const r = await run(["--version"]);
    expect(r.code).toBe(ExitCode.ok);
    expect(outText(r)).toBe(`vae ${VERSION}`);
  });

  test("vae -V is the same surface", async () => {
    const r = await run(["-V"]);
    expect(r.code).toBe(ExitCode.ok);
    expect(outText(r)).toBe(`vae ${VERSION}`);
  });

  test("vae --version --json emits exactly one stable NDJSON line", async () => {
    const r = await run(["--version", "--json"]);
    expect(r.code).toBe(ExitCode.ok);
    expect(r.out).toHaveLength(1);
    const parsed = JSON.parse(r.out[0] as string);
    expect(parsed).toEqual({ version: VERSION });
  });

  test("the version subcommand and the flag agree byte-for-byte in both modes", async () => {
    const flagPlain = await run(["--version"]);
    const cmdPlain = await run(["version"]);
    expect(outText(flagPlain)).toBe(outText(cmdPlain));
    const flagJson = await run(["--version", "--json"]);
    const cmdJson = await run(["version", "--json"]);
    expect(outText(flagJson)).toBe(outText(cmdJson));
  });
});

describe("DX-2 — the help alias", () => {
  test("vae help prints the main help (same text as --help)", async () => {
    const viaAlias = await run(["help"]);
    const viaFlag = await run(["--help"]);
    expect(viaAlias.code).toBe(ExitCode.ok);
    expect(outText(viaAlias)).toBe(outText(viaFlag));
  });

  test("vae help run prints the run topic frames", async () => {
    const r = await run(["help", "run"]);
    expect(r.code).toBe(ExitCode.ok);
    expect(outText(r)).toBe(COMMAND_HELP["run"] ?? "");
  });

  test("an unknown topic falls back to the main help — help always teaches, never errors", async () => {
    const r = await run(["help", "frobnicate"]);
    expect(r.code).toBe(ExitCode.ok);
    expect(outText(r)).toBe(MAIN_HELP);
  });

  test("the registry carries a help topic for help, version and completions themselves", () => {
    for (const t of ["help", "version", "completions"]) {
      expect(COMMAND_HELP[t]).toBeTruthy();
    }
  });
});

describe("DX-3 — shell completions", () => {
  test("every supported shell generates a non-empty script with the ratified commands", () => {
    for (const shell of SUPPORTED_SHELLS) {
      const script = completionScript(shell);
      expect(script.length).toBeGreaterThan(200);
      for (const c of completionCommands()) {
        expect(script).toContain(c);
      }
    }
  });

  test("generation is byte-stable (same shell, same bytes — the determinism law)", () => {
    for (const shell of SUPPORTED_SHELLS) {
      expect(completionScript(shell)).toBe(completionScript(shell));
    }
  });

  test("an unknown shell is a usage error carrying the supported list", async () => {
    const r = await run(["completions", "tcsh"]);
    expect(r.code).toBe(ExitCode.usage);
    expect(errText(r)).toContain("E1600");
    expect(errText(r)).toContain("tcsh");
    // the NDJSON guarantee on the usage path (DX-4 shares this renderer):
    // in json mode the same error is one stable NDJSON line
    const j = await run(["completions", "tcsh", "--json"]);
    expect(j.code).toBe(ExitCode.usage);
    expect(j.err).toHaveLength(1);
    const parsed = JSON.parse(j.err[0] as string);
    expect(parsed.error.code).toBe("E1600");
  });

  test("the bash script passes `bash -n` on the generating host (measured)", () => {
    const script = completionScript("bash");
    const dir = mkdtempSync(join(tmpdir(), "vae-dx-bash-"));
    const file = join(dir, "vae-completions.bash");
    writeFileSync(file, script);
    // throws on syntax error; a quiet exit proves the script parses
    execFileSync("bash", ["-n", file], { stdio: "pipe" });
    expect(script).toContain("complete -F _vae_completions vae");
  });

  test("the platform-honest markers are baked into the unhostable scripts", () => {
    expect(completionScript("zsh")).toContain("UNVERIFIED — ZSH");
    expect(completionScript("fish")).toContain("UNVERIFIED — FISH");
    expect(completionScript("powershell")).toContain("UNVERIFIED — POWERSHELL");
    expect(completionScript("bash")).toContain("bash -n");
  });

  test("the completion model and the command registry can never disagree (D-B)", () => {
    // every registry topic is completable
    for (const topic of Object.keys(COMMAND_HELP)) {
      expect(COMPLETION_MODEL.commands).toContain(topic);
    }
    // every completable command is real: either a registry topic, or one of
    // the switch-only commands (version/help/completions), which carry their
    // own registry topics anyway
    for (const c of COMPLETION_MODEL.commands) {
      expect(Object.keys(COMMAND_HELP)).toContain(c);
    }
    // and the main help lists them all too (D-M′ holds for the new commands)
    for (const c of COMPLETION_MODEL.commands) {
      expect(MAIN_HELP).toContain(c);
    }
  });
});

describe("DX-4 — the --json guarantee on the error path", () => {
  test("unknown command in json mode emits ONE stable NDJSON line (exit 2)", async () => {
    const r = await run(["frobnicate", "--json"]);
    expect(r.code).toBe(ExitCode.usage);
    expect(r.err).toHaveLength(1);
    const parsed = JSON.parse(r.err[0] as string);
    expect(parsed.error.code).toBe("E1600");
    expect(parsed.error.message).toContain("frobnicate");
    expect(parsed.error.fix).toBeTruthy();
  });

  test("unknown command in plain mode still teaches with code + Fix", async () => {
    const r = await run(["frobnicate"]);
    expect(r.code).toBe(ExitCode.usage);
    expect(errText(r)).toContain("E1600");
    expect(errText(r)).toContain("Fix:");
  });
});

describe("DX-5 — quiet mode suppresses framing, never data", () => {
  test("rich mode version prints the brand frame; quiet prints exactly the version line", async () => {
    const prev = process.env.VAE_UI;
    process.env.VAE_UI = "rich";
    try {
      const loud = await run(["version"], true);
      expect(outText(loud).split("\n").length).toBeGreaterThan(1);
      expect(outText(loud)).toContain("V A E R I O N");
      const quietRun = await run(["version", "--quiet"], true);
      expect(outText(quietRun)).toBe(`vae ${VERSION}`);
      // and the same for the front door: quiet keeps the payload, drops the frame
      const q = await run(["--quiet"], true);
      expect(q.code).toBe(ExitCode.ok);
      expect(outText(q)).not.toContain("V A E R I O N");
    } finally {
      if (prev === undefined) delete process.env.VAE_UI;
      else process.env.VAE_UI = prev;
    }
  });
});

describe("DX-6 — VAE_DEBUG prints the stack, never by default", () => {
  test("without VAE_DEBUG the usage error carries no stack frames", async () => {
    const r = await run(["frobnicate"]);
    expect(errText(r)).not.toContain("    at ");
  });

  test("with VAE_DEBUG=1 the engine error carries its stack", async () => {
    const prev = process.env.VAE_DEBUG;
    process.env.VAE_DEBUG = "1";
    try {
      const r = await run(["frobnicate"]);
      expect(r.code).toBe(ExitCode.usage);
      expect(errText(r)).toContain("    at ");
    } finally {
      if (prev === undefined) delete process.env.VAE_DEBUG;
      else process.env.VAE_DEBUG = prev;
    }
  });
});
