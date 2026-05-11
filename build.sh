#!/usr/bin/env bash
# Builds hostpanel-ftp-<version>.zip for upload via the HostPanel Package Manager
set -euo pipefail

VERSION=$(python3 -c "import re; print(re.search(r\"version='(.+?)'\", open('setup.py').read()).group(1))")
OUT="hostpanel-ftp-${VERSION}.zip"

echo "Building ${OUT}..."
rm -f "$OUT"
zip -r "$OUT" \
    hostpanel_ftp/ \
    setup.py \
    service/ \
    --exclude "**/__pycache__/*" --exclude "**/*.pyc"

echo "Done → ${OUT}"
