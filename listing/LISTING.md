# Zapazka Lite: Firefox Add-ons (addons.mozilla.org) listing

Status 2026-10-27: **live on AMO** (https://addons.mozilla.org/en-US/firefox/addon/zapazka-lite/, author PN Scripts, version 1.0.0). Version **1.1.0** is built and waiting for the owner's upload (Mozilla sign-in). Repository: https://github.com/pnscripts/firefox-zapazka-lite (public, MIT).

What 1.1.0 adds (the reworked core, see CHANGELOG.md): the typed text is checked, not only the field (card numbers by Luhn, IBANs, private keys, API tokens, "password: ..." in English and Bulgarian are refused and the first digits kept at a pause are removed); the toolbar popup lists every text area on the page as kept or refused with the reason; earlier refusals of the site are listed (field name and reason, never the text); a toolbar badge shows how many text areas are protected. No permission, no network, no data collection change: `data_collection_permissions` stays `required: ["none"]`.

## Owner steps: upload 1.1.0 (about 5 minutes)

1. Sign in at https://addons.mozilla.org/developers/addons (the Mozilla account for office@pnscripts.com) and open **Zapazka Lite**.
2. **Upload New Version** (left menu: Status & Versions) -> **On this site** -> choose `dist/zapazka-lite-1.1.0.zip` in this repository (also attached to the GitHub release v1.1.0). Wait for the automatic validation: it must show 0 errors and 0 warnings.
3. "Do you need to submit source code?" **No** (no minified or generated code; the zip is the extension folder as it is).
4. Release notes: paste `listing/amo/release-notes-en.txt` (English tab) and `listing/amo/release-notes-bg.txt` (Bulgarian tab, add the language with "Add locale" if it is not there yet). Notes to reviewer: paste `listing/amo/reviewer-notes.txt`. Submit Version.
5. Listing texts (Edit Product Page -> Describe Add-on, English and Bulgarian locales): Summary from `listing/amo/summary-en.txt` / `summary-bg.txt`, Description from `listing/amo/description-en.txt` / `description-bg.txt` (plain text). Name stays "Zapazka Lite".
6. Screenshots (Edit Product Page -> Media): keep the two existing ones and add `listing/amo/screenshot-3-report.png` with the caption "The toolbar popup lists every text box on the page as kept or refused, with the reason." (the page it shows is a made-up local test page).
7. Categories and licence stay as they are (Other; tags forms, text, recovery, backup, crash; MIT). Do not accept anything beyond what the account already needs.
8. After Mozilla approves 1.1.0: tell the coordinator so the pnscripts.com Zapazka page can mention the 1.1.0 feature lines (`~/.cache/pn-factory/originality/fix-1027/firefox-zapazka.site.md`).

## Listing data (unchanged where not listed above)

- File: `dist/zapazka-lite-1.1.0.zip` (`make release`; addons-linter 0 errors / 0 warnings / 0 notices)
- Add-on ID: `zapazka-lite@pnscripts.com`; Firefox 142+ desktop; data collection declared `none`
- Support: https://pnscripts.com/marketplace/firefox-zapazka · office@pnscripts.com
- Privacy policy: not needed (nothing is transmitted); texts and the refusal ledger stay in browser.storage.local, texts and ledger rows expire after 7 days

## Checks run (2026-10-27)

19 Node tests (rules for fields, the text checks, the ledger, expiry, both languages), addons-linter 0/0/0 on the zip, headless Firefox 158 run through WebDriver BiDi in 12 steps (install, type key by key, only the text area kept, password and card field not stored, a card number and an IBAN typed inside a plain message box not stored and not even their first digits, ledger rows without text, Restore chip, popup Put back, page report with 3 refusals, badge). Sound and speech were off. Not tried on Firefox for Android.
