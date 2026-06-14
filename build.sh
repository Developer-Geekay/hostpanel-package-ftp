#!/usr/bin/env bash
# Build hostpanel-ftp-<version>.zip for upload via the HostPanel Package Manager.
set -euo pipefail

VERSION=$(python3 -c "import re; print(re.search(r'version=[\"\\x27]([^\"\\x27]+)', open('plugin/setup.py').read()).group(1))")
OUT="hostpanel-ftp-${VERSION}.zip"

for binary in bin/pure-ftpd bin/pure-pw; do
  if [[ ! -x "$binary" ]]; then
    echo "Missing required executable: $binary" >&2
    exit 1
  fi
done

echo "Building ${OUT}..."
rm -f "$OUT"

python3 - "$OUT" <<'PYEOF'
import os
import sys
import zipfile

out = sys.argv[1]
folders = ["plugin", "bin", "conf", "service", "sudoers", "frontend"]
skip_dirs = {"__pycache__", ".pytest_cache"}

with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for folder in folders:
        if not os.path.isdir(folder):
            continue
        for root, dirs, files in os.walk(folder):
            dirs[:] = [d for d in dirs if d not in skip_dirs and not d.startswith(".")]
            for file in files:
                if file.endswith((".pyc", ".pyo")) or file.startswith("."):
                    continue
                path = os.path.join(root, file)
                zf.write(path, path.replace(os.sep, "/"))
PYEOF

echo "Done -> ${OUT}"
