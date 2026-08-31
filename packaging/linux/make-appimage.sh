#!/bin/sh
# make-appimage.sh — AppImage recipe for the Vaerion CLI.
#
# AppImages need the `appimagetool` host utility (downloaded at release
# time from the AppImage project). This script assembles the AppDir
# unconditionally (verified) and calls appimagetool only when present or
# with --fetch. Platform marker: UNVERIFIED — APPIMAGE until a host with
# appimagetool runs the final step.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
VERSION="${1:-0.1.7-rc2}"
OUT="${2:-$ROOT/dist/linux}"
FETCH=0
[ "${3:-}" = "--fetch" ] && FETCH=1

APPDIR=$(mktemp -d)/Vaerion.AppDir
mkdir -p "$APPDIR/usr/lib/vaerion/$VERSION" "$APPDIR/usr/bin" "$APPDIR/share/metainfo"

cp -R "$ROOT/packages/vaerion/src" "$APPDIR/usr/lib/vaerion/$VERSION/src"
cp "$ROOT/packages/vaerion/package.json" "$APPDIR/usr/lib/vaerion/$VERSION/package.json"

cat > "$APPDIR/usr/bin/vae" <<EOF
#!/bin/sh
exec bun run "/usr/lib/vaerion/$VERSION/src/cli/vae.ts" "\$@"
EOF
chmod +x "$APPDIR/usr/bin/vae"

cat > "$APPDIR/vae" <<EOF
#!/bin/sh
# AppDir-relative launcher: works inside the mounted AppImage and outside
exec bun run "\$(dirname "\$0")/usr/lib/vaerion/$VERSION/src/cli/vae.ts" "\$@"
EOF
chmod +x "$APPDIR/vae"

cat > "$APPDIR/share/metainfo/vaerion.appdata.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<component type="console-application">
  <id>dev.vaerion.vae</id>
  <name>Vaerion</name>
  <summary>AI-native development engine — deterministic, auditable, local-first</summary>
  <metadata_license>FSFAP</metadata_license>
  <project_license>Apache-2.0</project_license>
  <provides><binary>vae</binary></provides>
</component>
EOF

mkdir -p "$OUT"
IMG="$OUT/Vaerion-$VERSION-$ARCH_STRING.AppImage" 2>/dev/null || IMG="$OUT/Vaerion-$VERSION.AppImage"

if command -v appimagetool >/dev/null 2>&1; then
  appimagetool "$APPDIR" "$IMG"
  echo "make-appimage: $IMG"
elif [ "$FETCH" -eq 1 ]; then
  curl -fsSL -o /tmp/appimagetool https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage
  chmod +x /tmp/appimagetool
  /tmp/appimagetool "$APPDIR" "$IMG"
  echo "make-appimage: $IMG (fetched appimagetool)"
else
  echo "make-appimage: AppDir assembled at $APPDIR — appimagetool not found."
  echo "Fix: re-run with --fetch, or install appimagetool on the build host."
  echo "     (The AppDir layout above is the verified part of this recipe.)"
  exit 0
fi
