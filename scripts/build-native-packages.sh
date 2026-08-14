#!/bin/bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
VERSION=${VERSION:-0.1.2}
OUTPUT_DIR="$ROOT_DIR/dist/native"
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/findrepeatedsong-native.XXXXXX")
STATIC_DIR="$ROOT_DIR/backend/static"
NATIVE_TEMPLATE="$ROOT_DIR/packaging/native"
FNOS_TEMPLATE="$ROOT_DIR/packaging/fnos-native"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

mkdir -p "$OUTPUT_DIR"

(cd "$ROOT_DIR/frontend" && npm ci && npm run build)

build_binary() {
  local goos=$1
  local goarch=$2
  local destination=$3
  (
    cd "$ROOT_DIR/backend"
    CGO_ENABLED=0 GOOS="$goos" GOARCH="$goarch" \
      go build -trimpath -ldflags='-s -w' -o "$destination" .
  )
}

copy_static() {
  local destination=$1
  mkdir -p "$destination"
  cp -R "$STATIC_DIR/." "$destination/"
}

build_desktop_package() {
  local goos=$1
  local goarch=$2
  local extension=$3
  local package_name="findrepeatedsong-${goos}-${goarch}"
  local package_dir="$WORK_DIR/$package_name"

  mkdir -p "$package_dir"
  build_binary "$goos" "$goarch" "$package_dir/findrepeatedsong$extension"
  copy_static "$package_dir/static"
  cp "$NATIVE_TEMPLATE/README.md" "$package_dir/README.md"

  if [ "$goos" = "windows" ]; then
    cp "$NATIVE_TEMPLATE/start.ps1" "$package_dir/start.ps1"
    (
      cd "$WORK_DIR"
      zip -qr "$OUTPUT_DIR/${package_name}.zip" "$package_name"
    )
    return
  fi

  cp "$NATIVE_TEMPLATE/start.sh" "$package_dir/start.sh"
  chmod +x "$package_dir/start.sh"
  if [ "$goos" = "darwin" ]; then
    cp "$NATIVE_TEMPLATE/start.command" "$package_dir/start.command"
    chmod +x "$package_dir/start.command"
  fi
  tar -C "$WORK_DIR" -czf "$OUTPUT_DIR/${package_name}.tar.gz" "$package_name"
}

build_fnos_package() {
  local platform=$1
  local goarch=$2
  local artifact_name=$3
  local package_dir="$WORK_DIR/fnos-$platform"

  cp -R "$FNOS_TEMPLATE/." "$package_dir"
  sed "s/{{PLATFORM}}/$platform/" "$package_dir/manifest.in" > "$package_dir/manifest"
  rm "$package_dir/manifest.in"
  chmod +x "$package_dir/cmd/"*
  build_binary linux "$goarch" "$package_dir/app/server/findrepeatedsong"
  copy_static "$package_dir/app/server/static"

  (
    cd "$OUTPUT_DIR"
    fnpack build --directory "$package_dir"
    mv findrepeatedsong.fpk "$artifact_name"
  )
}

build_desktop_package linux amd64 ""
build_desktop_package linux arm64 ""
build_desktop_package darwin amd64 ""
build_desktop_package darwin arm64 ""
build_desktop_package windows amd64 ".exe"
build_desktop_package windows arm64 ".exe"

build_fnos_package x86 amd64 "findrepeatedsong-fnos-x86_64-${VERSION}.fpk"
build_fnos_package arm arm64 "findrepeatedsong-fnos-arm64-${VERSION}.fpk"

echo "Created native packages in $OUTPUT_DIR"
