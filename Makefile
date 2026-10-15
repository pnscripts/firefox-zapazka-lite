# Zapazka Lite: the zip Firefox Add-ons takes (no build step: the extension folder as it is)
VERSION := $(shell node -p "require('./extension/manifest.json').version")

.PHONY: test lint firefox release
test:
	node --test test/*.test.mjs
lint:
	npx addons-linter extension
firefox:
	node tools/firefox-check.mjs
release: test lint
	rm -rf dist && mkdir -p dist
	cd extension && zip -qr -X ../dist/zapazka-lite-$(VERSION).zip . -x 'icons/zapazka.svg'
	npx addons-linter dist/zapazka-lite-$(VERSION).zip | grep -E '^(errors|warnings)'
	@ls -la dist
