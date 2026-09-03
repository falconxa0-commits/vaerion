#!/bin/sh
# Vaerion universal installer — https://vaerion.dev/install
#
#   curl -fsSL https://vaerion.dev/install | sh
#
# Laws:
#   - The engine is TypeScript executed by Bun (ADR-0018). Without Bun the
#     installer teaches, it never silently installs a runtime unless you
#     pass --install-bun.
#   - Nothing is installed outside the prefix you choose (default
#     $HOME/.vaerion for the source method) except by the npm method, which
#     uses npm's own global prefix.
#   - No telemetry, no background services, no launch agents. Ever.
#   - --uninstall removes everything this script created, including the
#     PATH marker lines it wrote.
#
# Usage:
#   install.sh [--method npm|source] [--version V] [--tarball PATH]
#              [--prefix DIR] [--no-path] [--install-bun] [--update]
#              [--uninstall] [-h|--help]
set -eu

VAERION_DIST_URL="${VAERION_DIST_URL:-https://vaerion.dev/dist}"
MARKER_BEGIN="# >>> vaerion path >>>"
MARKER_END="# <<< vaerion path <<<"

say()  { printf '%s\n' "$*"; }
warn() { printf 'vaerion-install: %s\n' "$*" >&2; }
die()  { warn "$*"; exit 2; }

usage() {
  cat <<'EOF'
Vaerion installer — the AI-native development engine.

Options:
  --method npm|source   npm: `npm install -g vaerion` (default when npm exists)
                        source: extract + bun install into --prefix
  --version V           install a specific version (registry methods)
  --tarball PATH        install offline from a local tarball
                        (release source tarball, or the npm .tgz with --method npm)
  --prefix DIR          source-method prefix (default: $HOME/.vaerion)
  --no-path             do not touch any shell rc file
  --install-bun         install the Bun runtime automatically if missing
  --update              update to the latest version
  --uninstall           remove everything this installer created
  -h, --help            this help

Environment:
  VAERION_DIST_URL      distribution base URL (default: https://vaerion.dev/dist)
EOF
}

# ---- parse args ---------------------------------------------------------
METHOD=""          # empty = auto
VERSION=""         # empty = latest
TARBALL=""
PREFIX="$HOME/.vaerion"
NO_PATH=0
INSTALL_BUN=0
ACTION="install"   # install | update | uninstall

while [ $# -gt 0 ]; do
  case "$1" in
    --method)      METHOD="$2"; shift 2 ;;
    --version)     VERSION="$2"; shift 2 ;;
    --tarball)     TARBALL="$2"; shift 2 ;;
    --prefix)      PREFIX="$2"; shift 2 ;;
    --no-path)     NO_PATH=1; shift ;;
    --install-bun) INSTALL_BUN=1; shift ;;
    --update)      ACTION="update"; shift ;;
    --uninstall)   ACTION="uninstall"; shift ;;
    -h|--help)     usage; exit 0 ;;
    *)             usage >&2; die "unknown argument: $1" ;;
  esac
done

# ---- environment detection ---------------------------------------------
OS=$(uname -s 2>/dev/null || echo unknown)
ARCH=$(uname -m 2>/dev/null || echo unknown)

case "$OS" in
  Linux)  OS_NAME="linux" ;;
  Darwin) OS_NAME="darwin" ;;
  MINGW*|MSYS*|CYGWIN*)
    say "E1600 Vaerion on native Windows is delivered by the winget/installer channels (packaging/windows)."
    say "Fix: use WSL2 for the POSIX channel -> docs/TROUBLESHOOTING.md"
    exit 2
    ;;
  *) die "unsupported operating system: $OS (supported: Linux, macOS; Windows via winget/WSL2)" ;;
esac

case "$ARCH" in
  x86_64|amd64)  ARCH_NAME="x64" ;;
  aarch64|arm64) ARCH_NAME="arm64" ;;
  *)             ARCH_NAME="$ARCH (untested — the engine is pure TypeScript and should run)" ;;
esac

bun_missing() { command -v bun >/dev/null 2>&1 || return 0; return 1; }

ensure_bun() {
  if bun_missing; then
    if [ "$INSTALL_BUN" -eq 1 ]; then
      say "vaerion-install: installing the Bun runtime (https://bun.sh)…"
      curl -fsSL https://bun.sh/install | sh
      BUN_HOME="$HOME/.bun"
      if [ -d "$BUN_HOME/bin" ]; then
        PATH="$BUN_HOME/bin:$PATH"
        export PATH
      fi
    else
      say "E1600 vae requires the Bun runtime (>= 1.2)."
      if [ "$OS_NAME" = "darwin" ]; then
        say "Fix: brew install oven-sh/bun/bun   (or: curl -fsSL https://bun.sh/install | sh)"
      else
        say "Fix: curl -fsSL https://bun.sh/install | sh"
      fi
      say "Re-run with --install-bun to let this installer do it for you."
      say "Docs: docs/INSTALL.md"
      exit 2
    fi
  fi
}

# ---- PATH management (source method + npm user-prefix fallback) ----------
# XX-D5 (D-Y empty-machine law): a genuinely fresh $HOME has NO rc files —
# skipping them silently meant the empty machine never persisted a PATH. The
# marker writer now CREATES the rc file when absent (an installer that teaches
# PATH persistence must actually persist it).
write_path_markers() {
  [ "$NO_PATH" -eq 1 ] && return 0
  BIN_DIR="$1"
  for f in "$HOME/.bashrc" "$HOME/.zshrc"; do
    CREATED=0
    if [ ! -f "$f" ]; then
      CREATED=1
      : > "$f"
    fi
    if ! grep -q "$MARKER_BEGIN" "$f" 2>/dev/null; then
      {
        printf '%s\n' "$MARKER_BEGIN"
        printf 'export PATH="%s:$PATH"\n' "$BIN_DIR"
        printf '%s\n' "$MARKER_END"
      } >> "$f"
      if [ "$CREATED" -eq 1 ]; then
        say "vaerion-install: PATH updated in $f (file created — a fresh home had no rc file)"
      else
        say "vaerion-install: PATH updated in $f (new shells)"
      fi
    fi
  done
}

remove_path_markers() {
  for f in "$HOME/.bashrc" "$HOME/.zshrc"; do
    [ -f "$f" ] || continue
    if grep -q "$MARKER_BEGIN" "$f" 2>/dev/null; then
      TMP="$(mktemp)"
      # Remove the ENTIRE delimited block (the block is the marker — never a
      # line-pattern guess that could miss a differently-prefixed bin dir).
      awk -v b="$MARKER_BEGIN" -v e="$MARKER_END" 'index($0,b){skip=1;next} index($0,e){skip=0;next} !skip' "$f" > "$TMP"
      cat "$TMP" > "$f"
      rm -f "$TMP"
      # An rc file that only ever held our marker block has no reason to exist.
      [ -s "$f" ] || rm -f "$f"
      say "vaerion-install: PATH marker removed from $f"
    fi
  done
}

# ---- uninstall ----------------------------------------------------------
do_uninstall() {
  say "vaerion-install: uninstalling Vaerion…"
  if command -v npm >/dev/null 2>&1; then
    if [ "$METHOD" = "npm" ] || npm ls -g vaerion >/dev/null 2>&1; then
      npm uninstall -g vaerion >/dev/null 2>&1 && say "vaerion-install: npm global package removed" || true
    fi
    # XX-D7: the user-prefix fallback install must be removable too.
    if [ -d "$HOME/.npm-global/lib/node_modules/vaerion" ]; then
      npm_config_prefix="$HOME/.npm-global" npm uninstall -g vaerion >/dev/null 2>&1 && say "vaerion-install: npm user-prefix package removed" || true
    fi
  fi
  if [ -d "$PREFIX" ]; then
    rm -rf "$PREFIX"
    say "vaerion-install: prefix removed ($PREFIX)"
  fi
  remove_path_markers
  say "vaerion-install: done. Vaerion leaves nothing behind — no daemons, no agents, no telemetry."
  exit 0
}

# ---- update -------------------------------------------------------------
if [ "$ACTION" = "uninstall" ]; then do_uninstall; fi
if [ "$ACTION" = "update" ]; then
  say "vaerion-install: updating Vaerion…"
  # update = a fresh install of the latest; explicit --tarball wins if given.
  [ -n "$TARBALL" ] || TARBALL=""
fi

# ---- method resolution ---------------------------------------------------
if [ -z "$METHOD" ]; then
  if command -v npm >/dev/null 2>&1 && [ -z "$TARBALL" ]; then METHOD="npm"; else METHOD="source"; fi
fi
case "$METHOD" in
  npm|source) ;;
  *) die "unknown method: $METHOD (npm|source)" ;;
esac

say "vaerion-install: OS=$OS_NAME ARCH=$ARCH_NAME METHOD=$METHOD"

# ---- npm method ----------------------------------------------------------
do_install_npm() {
  command -v npm >/dev/null 2>&1 || die "npm not found — install Node/npm, or use --method source"
  ensure_bun
  # XX-D7 (D-Y empty-machine law): `npm install -g` targets the system prefix,
  # which a no-sudo machine cannot write — the DEFAULT method died with EACCES
  # and taught nothing. The installer now detects a non-writable prefix and
  # falls back to a user prefix, teaching exactly what it does.
  NPM_GLOBAL_ROOT="$(npm prefix -g 2>/dev/null)/lib/node_modules"
  if [ ! -w "$NPM_GLOBAL_ROOT" ] && [ ! -w "$(dirname "$NPM_GLOBAL_ROOT")" ]; then
    NPM_USER_PREFIX="${npm_config_prefix:-$HOME/.npm-global}"
    mkdir -p "$NPM_USER_PREFIX"
    npm_config_prefix="$NPM_USER_PREFIX"
    export npm_config_prefix
    say "vaerion-install: system npm prefix is not writable ($NPM_GLOBAL_ROOT)"
    say "vaerion-install: installing into the user prefix $NPM_USER_PREFIX instead"
    write_path_markers "$NPM_USER_PREFIX/bin"
  fi
  if [ -n "$TARBALL" ]; then
    npm install -g "$TARBALL"
  else
    if [ -n "$VERSION" ]; then npm install -g "vaerion@$VERSION"; else npm install -g vaerion@latest; fi
  fi
  say "vaerion-install: installed via npm. `vae` is in npm's global bin${npm_config_prefix:+ (user prefix: $npm_config_prefix)}."
  say "vaerion-install: verify with:  vae --version   &&   vae doctor"
}

# ---- source method -------------------------------------------------------
do_install_source() {
  ensure_bun
  [ -n "$TARBALL" ] || die "source method needs --tarball <release tarball> (registry download lands with the release train)"
  [ -f "$TARBALL" ] || die "tarball not found: $TARBALL"

  V="${VERSION:-unknown}"
  case "$(basename "$TARBALL")" in
    vaerion-*-source.tar.gz) V="$(basename "$TARBALL" -source.tar.gz)"; V="${V#vaerion-}" ;;
  esac

  DEST="$PREFIX/lib/vaerion/$V"
  STAGE="$(mktemp -d)"
  trap 'rm -rf "$STAGE"' EXIT INT TERM

  tar -xzf "$TARBALL" -C "$STAGE"
  SRC_ROOT="$(cd "$STAGE"/*/ && pwd)"
  [ -f "$SRC_ROOT/packages/vaerion/src/cli/vae.ts" ] || die "tarball does not contain the engine (unexpected layout)"

  # XX-D8 (measured by re-executing the D-Y journey after a fix): a same-version
  # reinstall must REFRESH the version tree — `cp -R src` into an existing
  # $DEST nested the new source under src/src and the old engine kept running,
  # invisible to a same-version upgrade leg and fatal to a fixed one.
  rm -rf "$DEST"
  mkdir -p "$DEST" "$PREFIX/bin"
  cp -R "$SRC_ROOT/packages/vaerion/src" "$DEST/src"
  cp "$SRC_ROOT/packages/vaerion/package.json" "$DEST/package.json"
  (cd "$DEST" && bun install --production >/dev/null 2>&1) || die "bun install failed inside $DEST"

  ln -sfn "$DEST" "$PREFIX/lib/vaerion/current"

  SHIM="$PREFIX/bin/vae"
  cat > "$SHIM" <<EOF
#!/bin/sh
# Vaerion CLI shim (source install, prefix: $PREFIX)
# 'current' follows updates; the prefix is baked in at install time.
exec bun run "$PREFIX/lib/vaerion/current/src/cli/vae.ts" "\$@"
EOF
  chmod +x "$SHIM"

  write_path_markers "$PREFIX/bin"

  say "vaerion-install: installed $V into $DEST"
  say "vaerion-install: shim at $SHIM"
  say "vaerion-install: verify with:  $SHIM --version   &&   $SHIM doctor"
  case ":$PATH:" in
    *":$PREFIX/bin:"*) ;;
    *) say "vaerion-install: note: open a new shell (or: export PATH=\"$PREFIX/bin:\$PATH\")" ;;
  esac
}

if [ "$METHOD" = "npm" ]; then do_install_npm; else do_install_source; fi
say "vaerion-install: welcome to Vaerion — run \`vae\` to begin. Evidence, not branding."
