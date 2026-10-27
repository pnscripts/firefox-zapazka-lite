#!/bin/sh
# AMO screenshot of the popup report: the popup as Firefox built it (build/shots/popup.html from `make firefox`),
# drawn with the extension's own stylesheet in headless Chrome (muted, no speech).
set -e
cd "$(dirname "$0")/.."
T=$(mktemp -d)
python3 - "$T" <<'PY'
import re, shutil, sys
t = sys.argv[1]
page = open('build/shots/popup.html', encoding='utf-8').read()
page = re.sub(r'<script[^>]*>.*?</script>', '', page, flags=re.S)
open(t + '/page.html', 'w', encoding='utf-8').write('<!doctype html>' + page)
shutil.copy('extension/ui.css', t + '/ui.css')
PY
google-chrome --headless=new --disable-gpu --no-first-run --mute-audio --disable-speech-api --hide-scrollbars --user-data-dir="$T/p" \
  --force-device-scale-factor=2 --window-size=380,640 --screenshot=listing/amo/screenshot-3-report.png "file://$T/page.html" >/dev/null 2>&1
rm -rf "$T"
