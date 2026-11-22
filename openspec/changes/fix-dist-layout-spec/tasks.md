# Tasks

## 1. Correct the requirement

- [x] 1.1 Name `dist/<name>-<version>/` in the packaging requirement and its scenario.
- [x] 1.2 Confirm `lib/bundle.js` and `docs/installing-bundles.md` already match.

## 2. Verify

- [x] 2.1 Run `openspec validate fix-dist-layout-spec --strict`.
- [x] 2.2 Run `node --test test/pack.test.mjs test/bundle.test.mjs` and `npm run openspec:check`.
