# Changelog

## 1.1.0 - 2026-10-27

- New: the typed text is checked, not only the field. A card number (Luhn check), an IBAN (country
  length and ISO 7064 check), a private key, an API key or token of a known shape, or "password: ..."
  / "парола: ..." in the text is not kept; digits kept at a pause before such a number was complete are
  removed.
- New: page report in the toolbar popup: every text area on the page as kept or refused with the reason;
  earlier refusals of the site are listed too (field name and reason, never the text; they expire after
  7 days like the texts).
- New: toolbar badge with the number of text areas protected on the page (`off` on an excluded site).
- Bulgarian field names (парола, ПИН, номер на карта, код за потвърждение, токен ...) are never kept.
- Tests: 19 (was 8); the Firefox check has 12 steps (was 8).

## 1.0.0 - 2026-10-15

- First release: keeps what you type in text areas as you type, in this Firefox profile, for 7 days;
  never password, card, code or secret fields, or private windows. A Restore chip when you come back to
  an empty text area, and a toolbar popup per site with Put back, Copy and Delete. English and Bulgarian.
