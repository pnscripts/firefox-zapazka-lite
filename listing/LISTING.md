# Zapazka Lite: Firefox Add-ons (addons.mozilla.org) submission

Status 2026-10-15: the repository is **public** (https://github.com/pnscripts/firefox-zapazka-lite), GitHub release https://github.com/pnscripts/firefox-zapazka-lite/releases/tag/v1.0.0 with the same zip attached. Not yet on AMO (needs a browser sign-in).

Steps (browser, Mozilla account on office@pnscripts.com): https://addons.mozilla.org/developers/ → Submit a New Add-on → **On this site** → upload `dist/zapazka-lite-1.0.0.zip` (or the release asset) → "Do you need to submit source code?" **No** → fill in the fields below → Submit Version. Do not accept anything beyond the AMO developer agreement the account already needs.

- File: `dist/zapazka-lite-1.0.0.zip` (`make release`; addons-linter 0 errors / 0 warnings)
- Source code upload: **No** (no minified or generated code; the zip is the extension folder)
- Add-on ID: `zapazka-lite@pnscripts.com`; Firefox 142+ desktop; data collection declared `none`
- Name: Zapazka Lite
- Summary (≤ 250): Keeps what you type in text boxes, so a crash, a closed tab or an expired session cannot take it. Restore with one click. Never passwords, cards or private windows; nothing leaves your browser.
- Categories: Other; tags: forms, text, recovery, backup, crash
- Licence: MIT
- Privacy policy: not needed (nothing is transmitted); texts stay in browser.storage.local
- Support: https://pnscripts.com/marketplace/firefox-zapazka · office@pnscripts.com
- Screenshots: `listing/amo/screenshot-1-restore.png`, `listing/amo/screenshot-2-restored.png` (made by Firefox in the test run)
- Description: README first paragraph and the list under it (plain text).
- Notes for reviewers: "No build step. Host access is needed to see text boxes on the pages the user writes in; the content script only reads textarea values typed by the user and stores them in storage.local. Private windows: incognito not_allowed. Tests: make test, make firefox."
- After listing: on pnscripts.com, Zapazka's page, Get it on, Firefox Add-ons, edition lite.

Checks run here: 8 Node tests, addons-linter 0/0/0, headless Firefox 156 check (8 steps: install, type key by key, only the text area kept, password and card not stored, Restore chip, popup put back).
