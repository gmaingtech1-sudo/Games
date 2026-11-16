#!/usr/bin/env bash
# Builds dist/rollmancer-web.zip: the game ready to upload to itch.io (or any
# HTML5 game host). index.html sits at the root of the zip, as itch.io wants.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f dist/rollmancer-web.zip
mkdir -p dist
zip -qr -X dist/rollmancer-web.zip index.html privacy.html manifest.webmanifest sw.js css js fonts icons
echo "Built dist/rollmancer-web.zip ($(du -k dist/rollmancer-web.zip | cut -f1) KB)"
