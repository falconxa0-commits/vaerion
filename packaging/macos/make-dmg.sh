#!/bin/sh
# make-dmg.sh — macOS disk image for the Vaerion CLI (drag-install layout).
#
# Produces Vaerion-<version>.dmg containing a Vaerion folder with the
# engine, a vae launcher, and an Install.command that performs the
# user-local install. Requires macOS (hdiutil). Authored on Linux —
# Platform marker: UNVERIFIED — MACOS.
#
# Signing/notarization preparation: see SIGNING-PREP.md (Founder key
# ceremony, risk-ledger F-3).
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
VERSION=${1:-0.1.13-rc1}
OUT="${2:-$ROOT/dist/macos}"
NAME="Vaerion-$VERSION"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$OUT" "$STAGE/$NAME/engineside"
cp -R "$ROOT/packages/vaerion/src" "$STAGE/$NAME/engineside/engine"
cp "$ROOT/packages/vaerion/package.json" "$STAGE/$NAME/engineside/engine/package.json"

cat > "$STAGE/$NAME/vae" <<'EOF'
#!/bin/sh
# Vaerion launcher (drag-install layout)
HERE=$(cd "$(dirname "$0")" && pwd)
exec bun run "$HERE/engineside/engine/cli/vae.ts" "$@"
EOF
chmod +x "$STAGE/$NAME/vae"

cat > "$STAGE/$NAME/Install.command" <<'EOF'
#!/bin/sh
# Double-click install: copies Vaerion into ~/Library/Vaerion and links vae
# into /usr/local/bin (asks for sudo) or ~/.local/bin (PATH edit).
set -eu
SRC=$(cd "$(dirname "$0")" && pwd)
DEST="$HOME/Library/Vaerion"
mkdir -p "$DEST"
cp -R "$SRC/engineside" "$SRC/vae" "$DEST/"
if [ -w /usr/local/bin ] || sudo -n true 2>/dev/null; then
  sudo ln -sf "$DEST/vae" /usr/local/bin/vae
else
  mkdir -p "$HOME/.local/bin"
  ln -sf "$DEST/vae" "$HOME/.local/bin/vae"
  case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *)
    echo 'export PATH="$HOME/.local/bin:$PATH" # vaerion' >> "$HOME/.zshrc" 2>/dev/null || true
  ;;
  esac
fi
command -v bun >/dev/null 2>&1 || { echo "vae requires Bun: brew install oven-sh/bun/bun"; exit 2; }
echo "Vaerion installed. Run: vae --version"
EOF
chmod +x "$STAGE/$NAME/Install.command"

hdiutil create -volname "Vaerion $VERSION" -srcfolder "$STAGE/$NAME" -format UDZO -fs HFS+ "$OUT/$NAME.dmg"
echo "make-dmg: $OUT/$NAME.dmg"
