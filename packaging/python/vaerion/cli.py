"""`vae` console launcher — resolves Bun, then hands argv to the engine.

Design laws:
  - One entrypoint: the packaged engine's own main() (same exit codes as
    every other distribution channel).
  - Educated errors: a missing Bun runtime is a taught error (exit 2),
    never a traceback.
  - exec, not wrap: os.exec* replaces this process, so streaming, signals,
    and exit codes pass through unchanged.
"""

import os
import shutil
import sys
from pathlib import Path

_BUN_INSTALL = {
    "darwin": "brew install oven-sh/bun/bun   (or: curl -fsSL https://bun.sh/install | sh)",
    "linux": "curl -fsSL https://bun.sh/install | sh",
    "default": "see https://bun.sh  (docs/INSTALL.md lists every method)",
}


def _bun_hint() -> str:
    if sys.platform == "darwin":
        return _BUN_INSTALL["darwin"]
    if sys.platform.startswith("linux"):
        return _BUN_INSTALL["linux"]
    return _BUN_INSTALL["default"]


def main() -> int:
    bun = shutil.which("bun")
    if bun is None:
        print("E1600 vae requires the Bun runtime (>= 1.2) to execute the engine.", file=sys.stderr)
        print(f"Fix: install Bun -> {_bun_hint()}", file=sys.stderr)
        print("Docs: docs/INSTALL.md (all installation methods)", file=sys.stderr)
        return 2

    cli = Path(__file__).resolve().parent / "engine" / "cli" / "vae.ts"
    if not cli.exists():
        print("E1900 packaged engine source is missing — the vaerion install is incomplete.", file=sys.stderr)
        print("Fix: reinstall -> pip install --force-reinstall vaerion", file=sys.stderr)
        return 1

    os.execvp(bun, [bun, "run", str(cli), *sys.argv[1:]])


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
