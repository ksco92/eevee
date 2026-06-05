#!/bin/sh

# Build one platform wheel per prebuilt binary, each bundling its matching
# fdd binary at fdd/_bin/. Also builds a pure sdist (no binary) as a fallback
# for platforms without a wheel (which then require FDD_BINARY).
#
# Usage: scripts/build_wheels.sh <dir-with-fdd-<platform>-binaries>

set -ex

BIN_DIR="$1"

python3 -m pip install --upgrade build wheel
rm -rf dist build src/fdd/_bin

for entry in \
    "fdd-linux-x64:manylinux2014_x86_64:fdd" \
    "fdd-linux-arm64:manylinux2014_aarch64:fdd" \
    "fdd-darwin-x64:macosx_10_9_x86_64:fdd" \
    "fdd-darwin-arm64:macosx_11_0_arm64:fdd" \
    "fdd-windows-x64.exe:win_amd64:fdd.exe"; do
    binary=$(echo "$entry" | cut -d: -f1)
    tag=$(echo "$entry" | cut -d: -f2)
    name=$(echo "$entry" | cut -d: -f3)

    rm -rf src/fdd/_bin
    mkdir -p src/fdd/_bin
    cp "$BIN_DIR/$binary" "src/fdd/_bin/$name"
    chmod +x "src/fdd/_bin/$name"

    python3 -m build --wheel
    python3 -m wheel tags --platform-tag "$tag" --remove dist/fdd-*-py3-none-any.whl
done

rm -rf src/fdd/_bin
python3 -m build --sdist

ls -la dist
