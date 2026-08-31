#!/bin/sh
# make-package.sh — assemble the publishable npm tarball for Vaerion.
#
# Deterministic steps:
#   1. copy the self-contained engine source (packages/vaerion/src) into
#      packaging/npm/engine  (imports never cross outside src — verified)
#   2. `npm pack` the package into dist/npm/
#   3. clean the generated engine/ copy so the repository tree stays exact
#   4. print the tarball path and its sha256
#
# The tarball is an INPUT to publication (Founder-gated, risk-ledger F-5),
# not a release artifact of record — the signed release set is produced by
# tools/dist-pack.ts.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
OUT="${1:-$ROOT/dist/npm}"
mkdir -p "$OUT"

VERSION=$(bun -e 'const p = require(process.argv[1]); console.log(p.version)' "$HERE/package.json")

rm -rf "$HERE/engine"
mkdir -p "$HERE/engine"
cp -R "$ROOT/packages/vaerion/src/." "$HERE/engine/"

cd "$HERE"
npm pack --pack-destination "$OUT" >/dev/null 2>&1

rm -rf "$HERE/engine"

TGZ="$OUT/vaerion-$VERSION.tgz"
if [ ! -f "$TGZ" ]; then
  echo "make-package: FAILED — expected tarball not found at $TGZ" >&2
  exit 1
fi
SHA=$(sha256sum "$TGZ" | cut -d' ' -f1)
echo "make-package: $TGZ"
echo "make-package: sha256 $SHA"
