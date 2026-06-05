#!/bin/sh

# Build one platform wheel per prebuilt binary, each bundling its matching
# flexdataset binary at flexdataset/_bin/. Also builds a pure sdist (no binary) as a fallback
# for platforms without a wheel (which then require FDD_BINARY).
#
# Usage: scripts/build_wheels.sh <dir-with-flexdataset-<platform>-binaries>

set -ex

BIN_DIR="$1"

python3 -m pip install --upgrade build wheel
rm -rf dist build src/flexdataset/_bin

for entry in \
    "flexdataset-linux-x64:manylinux2014_x86_64:flexdataset" \
    "flexdataset-linux-arm64:manylinux2014_aarch64:flexdataset" \
    "flexdataset-darwin-x64:macosx_13_0_x86_64:flexdataset" \
    "flexdataset-darwin-arm64:macosx_13_0_arm64:flexdataset" \
    "flexdataset-windows-x64.exe:win_amd64:flexdataset.exe"; do
    binary=$(echo "$entry" | cut -d: -f1)
    tag=$(echo "$entry" | cut -d: -f2)
    name=$(echo "$entry" | cut -d: -f3)

    rm -rf src/flexdataset/_bin
    mkdir -p src/flexdataset/_bin
    cp "$BIN_DIR/$binary" "src/flexdataset/_bin/$name"
    chmod +x "src/flexdataset/_bin/$name"

    python3 -m build --wheel
    python3 -m wheel tags --platform-tag "$tag" --remove dist/flexdataset-*-py3-none-any.whl
done

rm -rf src/flexdataset/_bin
python3 -m build --sdist

ls -la dist
