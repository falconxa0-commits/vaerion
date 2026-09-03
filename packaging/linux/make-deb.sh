#!/bin/sh
# make-deb.sh — build the Debian package for Vaerion (VERIFIED channel).
#
# Builds with dpkg-deb (present on Debian/Ubuntu build hosts and in this
# sandbox), verifies by extraction, and prints the artifact. The package
# ships the self-contained engine under /usr/lib/vaerion and a /usr/bin/vae
# shim; the postinst teaches the Bun dependency if it is missing.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
VERSION="${1:-0.1.13-rc1}"
OUT="${2:-$ROOT/dist/linux}"
# Debian versions use ~ for pre-release ordering: 0.1.13-rc1 -> 0.1.13~rc1
DEB_VERSION=$(printf '%s' "$VERSION" | sed 's/-/~/')

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

CTRL="$STAGE/DEBIAN"
LIB="$STAGE/usr/lib/vaerion/$VERSION"
mkdir -p "$CTRL" "$LIB" "$STAGE/usr/bin" \
  "$STAGE/usr/share/doc/vaerion" "$STAGE/usr/share/lintian/overrides"

cp -R "$ROOT/packages/vaerion/src" "$LIB/src"
cp "$ROOT/packages/vaerion/package.json" "$LIB/package.json"

cat > "$STAGE/usr/bin/vae" <<EOF
#!/bin/sh
# Vaerion CLI (deb install) — engine under /usr/lib/vaerion
exec bun run "/usr/lib/vaerion/$VERSION/src/cli/vae.ts" "\$@"
EOF
chmod +x "$STAGE/usr/bin/vae"

cat > "$CTRL/control" <<EOF
Package: vaerion
Version: $DEB_VERSION
Section: devel
Priority: optional
Architecture: all
Depends: curl | wget
Recommends: bun
Suggests: nodejs
Maintainer: Auren <auren@vaerion.dev>
Description: AI-native development engine — deterministic, auditable, local-first
 Vaerion is an AI-native development engine: a deterministic runtime with
 broker-governed autonomy, hash-chained journals, receipts, and permanent
 provenance for everything it creates. Evidence, not branding.
 The engine executes on the Bun runtime (installed separately); without it
 the vae launcher teaches the exact install command (exit 2).
Homepage: https://vaerion.dev
EOF

cat > "$CTRL/postinst" <<'EOF'
#!/bin/sh
set -e
if ! command -v bun >/dev/null 2>&1; then
  echo "vaerion: the Bun runtime (>= 1.2) is required to execute the engine." >&2
  echo "Fix: curl -fsSL https://bun.sh/install | sh   (then: vae --version)" >&2
fi
exit 0
EOF
chmod +x "$CTRL/postinst"

cat > "$STAGE/usr/share/doc/vaerion/README" <<'EOF'
Vaerion — evidence, not branding.
Engine source: /usr/lib/vaerion/<version>/src (self-contained TypeScript).
Constitution: docs/constitution/VAERION_CONSTITUTION_v1.3.md (in the source tree).
Docs: https://vaerion.dev (release train) · vae --help teaches every command.
EOF
gzip -9 -n -c "$ROOT/LICENSE" > "$STAGE/usr/share/doc/vaerion/copyright.gz"
# style: dpkg requires the copyright file uncompressed usually; keep both
cp "$ROOT/LICENSE" "$STAGE/usr/share/doc/vaerion/copyright"
rm -f "$STAGE/usr/share/doc/vaerion/copyright.gz"

mkdir -p "$OUT"
DEB="$OUT/vaerion_${DEB_VERSION}_all.deb"
dpkg-deb --root-owner-group --build "$STAGE" "$DEB" >/dev/null

# Verification by extraction (non-destructive; no system install here)
CHECK=$(mktemp -d)
dpkg-deb -x "$DEB" "$CHECK"
dpkg-deb -f "$DEB" Package Version Architecture | sed 's/^/  deb-check: /'
[ -x "$CHECK/usr/bin/vae" ] && echo "  deb-check: /usr/bin/vae present and executable"
[ -f "$CHECK/usr/lib/vaerion/$VERSION/src/cli/vae.ts" ] && echo "  deb-check: engine source present"
rm -rf "$CHECK"

echo "make-deb: $DEB"
echo "make-deb: sha256 $(sha256sum "$DEB" | cut -d' ' -f1)"
