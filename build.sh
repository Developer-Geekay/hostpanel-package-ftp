#!/usr/bin/env bash
# Builds hostpanel-ftp-<version>.zip for upload via the HostPanel Package Manager
#
# Before running, place pre-compiled pure-ftpd binaries in:
#   sbin/pure-ftpd      ← FTP server daemon (compiled for target arch)
#   bin/pure-pw         ← Virtual user management tool
set -euo pipefail

VERSION=$(python3 -c "import re; print(re.search(r'version=[\"\\x27]([^\"\\x27]+)', open('setup.py').read()).group(1))")
OUT="hostpanel-ftp-${VERSION}.zip"

echo "Building ${OUT}..."
rm -f "$OUT"

# Assemble plugin/ subdir (pip-installable root expected by package manager)
mkdir -p plugin
cp -r hostpanel_ftp setup.py plugin/

zip -r "$OUT" \
    plugin/ \
    service/ \
    sbin/ \
    bin/ \
    --exclude "**/__pycache__/*" --exclude "**/*.pyc"

rm -rf plugin/
echo "Done → ${OUT}"
