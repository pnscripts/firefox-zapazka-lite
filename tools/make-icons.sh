#!/bin/sh
# Render extension/icons/zapazka.svg to the PNG sizes the manifest names (headless Chrome, transparent).
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
for s in 16 32 48 96 128; do
  printf '<html><body style="margin:0;background:transparent"><img src="file://%s/extension/icons/zapazka.svg" width="%s" height="%s"></body></html>' "$ROOT" "$s" "$s" > "$TMP/i.html"
  google-chrome --headless=new --disable-gpu --no-first-run --user-data-dir="$TMP/p" --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --window-size="$s,$s" --screenshot="$ROOT/extension/icons/zapazka-$s.png" "file://$TMP/i.html" > /dev/null 2>&1
done
rm -rf "$TMP"
ls "$ROOT/extension/icons"
