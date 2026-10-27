# Zapazka Lite

Free Firefox extension by [PN Scripts](https://pnscripts.com): keeps what you type in text boxes, so a
crashed browser, a closed tab or an expired session cannot take a long reply with it. Come back to the
empty box and press **Restore**, or put the text back from the toolbar button.

![Restore chip](listing/amo/screenshot-1-restore.png)

- Keeps `<textarea>` boxes as you type, in this Firefox profile only, for 7 days.
- Never keeps password, card, security-code or one-time-code fields, fields named for tokens, PINs or
  secrets (in English and Bulgarian), hidden, disabled or read-only fields, or anything in private windows.
- **Checks the text too (new in 1.1):** a card number (Luhn check), an IBAN, a private key, an API key
  or token, or "password: ..." / "парола: ..." typed into an ordinary message box is not kept, and the
  first digits kept at a pause before the number was complete are removed.
- **Shows what it refuses, and why (new in 1.1):** the toolbar popup lists every text field on the page
  as kept or refused with the reason, earlier refusals of the site are listed too (field name and
  reason only, never the text), and the toolbar badge shows how many fields are protected on the page.
- Sends nothing anywhere; no server, no analytics. Data collection declared to Mozilla: none.
- English and Bulgarian, following Firefox's language.

## Lite and full edition

Zapazka Lite is complete for text boxes. The paid edition,
[Zapazka](https://pnscripts.com/marketplace/firefox-zapazka), also keeps rich editors (webmail, forums,
wikis) and longer one-line fields, keeps up to 50 versions per field so an accidental delete can be
undone, and has a searchable page of every kept text with settings for days, length, excluded sites,
pause, export and delete all. The refusal checks and the page report are the same in both editions;
the full edition adds a refusal ledger across all sites (with JSON export) and your own never-keep words.

## Development

```
npm ci             # Mozilla's addons-linter
make test          # 19 Node tests
make lint          # addons-linter: 0 errors, 0 warnings
make firefox       # the flow in a real headless Firefox (12 steps)
make release       # dist/zapazka-lite-1.1.0.zip for Firefox Add-ons
```

Firefox 142 or newer. Tested in headless Firefox 158 through WebDriver BiDi; not yet on Firefox for
Android. MIT licence. Made by PN Scripts (office@pnscripts.com); created with AI assistance and
checked with automated tests.
