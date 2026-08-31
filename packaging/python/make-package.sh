#!/bin/sh
# make-package.sh — build the publishable PyPI wheel (and sdist) for Vaerion.
#
# Steps:
#   1. copy the self-contained engine source (packages/vaerion/src) into
#      packaging/python/vaerion/engine
#   2. build the wheel with pip (no build isolation → offline-friendly;
#      setuptools is provided by the venv/system)
#   3. clean the generated engine copy so the repository tree stays exact
#   4. print artifact paths + sha256
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
OUT="${1:-$ROOT/dist/python}"
mkdir -p "$OUT"

rm -rf "$HERE/vaerion/engine"
mkdir -p "$HERE/vaerion/engine"
cp -R "$ROOT/packages/vaerion/src/." "$HERE/vaerion/engine/"

cd "$HERE"
python3 -m pip wheel . --no-deps --no-build-isolation -w "$OUT" 1>&2
rm -rf "$HERE/vaerion/engine" "$HERE/build" "$HERE/vaerion.egg-info"

echo "make-package: artifacts in $OUT:"
for f in "$OUT"/vaerion-*.whl "$OUT"/vaerion-*.tar.gz; do
  [ -f "$f" ] || continue
  echo "  $f"
  echo "    sha256 $(sha256sum "$f" | cut -d' ' -f1)"
done
