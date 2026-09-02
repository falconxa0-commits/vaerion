#!/bin/sh
# make-pkg.sh — macOS installer package (.pkg) for the Vaerion CLI.
#
# Installs the engine under /usr/local/lib/vaerion and a vae shim into
# /usr/local/bin via pkgbuild. Requires macOS. Authored on Linux —
# Platform marker: UNVERIFIED — MACOS.
#
# Signing preparation (Developer ID Installer + notarization) is documented
# in SIGNING-PREP.md and gated on the Founder key ceremony (risk-ledger F-3).
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
VERSION=${1:-0.1.11-rc1}
OUT="${2:-$ROOT/dist/macos}"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

PAYLOAD="$STAGE/payload"
SCRIPTS="$STAGE/scripts"
mkdir -p "$PAYLOAD/usr/local/lib/vaerion/$VERSION" "$PAYLOAD/usr/local/bin" "$SCRIPTS"
cp -R "$ROOT/packages/vaerion/src" "$PAYLOAD/usr/local/lib/vaerion/$VERSION/src"
cp "$ROOT/packages/vaerion/package.json" "$PAYLOAD/usr/local/lib/vaerion/$VERSION/package.json"

cat > "$PAYLOAD/usr/local/bin/vae" <<EOF
#!/bin/sh
exec bun run "/usr/local/lib/vaerion/$VERSION/src/cli/vae.ts" "\$@"
EOF
chmod +x "$PAYLOAD/usr/local/bin/vae"

cat > "$SCRIPTS/postinstall" <<'EOF'
#!/bin/sh
# Fail loudly if the substrate runtime is missing; teach, never guess.
if ! command -v bun >/dev/null 2>&1; then
  echo "vae requires the Bun runtime (>= 1.2)." >&2
  echo "Fix: brew install oven-sh/bun/bun   (or: curl -fsSL https://bun.sh/install | sh)" >&2
  exit 2
fi
exit 0
EOF
chmod +x "$SCRIPTS/postinstall"

IDENT="dev.vaerion.pkg"
mkdir -p "$OUT"
pkgbuild --root "$PAYLOAD" --scripts "$SCRIPTS" \
  --identifier "$IDENT" --version "$VERSION" \
  --install-location "/" \
  "$OUT/vaerion-$VERSION.pkg"
echo "make-pkg: $OUT/vaerion-$VERSION.pkg"
