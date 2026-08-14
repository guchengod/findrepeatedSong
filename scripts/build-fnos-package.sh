#!/bin/bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PACKAGE_DIR="$ROOT_DIR/packaging/fnos"
OUTPUT_DIR="$ROOT_DIR/dist"

command -v fnpack >/dev/null 2>&1 || {
  echo "fnpack is required. See packaging/fnos/README.md." >&2
  exit 1
}

mkdir -p "$OUTPUT_DIR"
(
  cd "$OUTPUT_DIR"
  fnpack build --directory "$PACKAGE_DIR"
)

echo "Created $OUTPUT_DIR/findrepeatedsong.fpk"
