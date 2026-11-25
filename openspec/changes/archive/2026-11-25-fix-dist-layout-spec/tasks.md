# Tasks

## 1. Correct the requirement

- [x] 1.1 Name `dist/<name>-<version>/` in the packaging requirement and its scenario.
- [x] 1.2 Confirm `lib/bundle.js` and `docs/installing-bundles.md` already match.

## 2. Verify

- [x] 2.1 Run `openspec validate fix-dist-layout-spec --strict`.
- [x] 2.2 Run `node --test test/pack.test.mjs test/bundle.test.mjs` and `npm run openspec:check`.
- [x] 2.3 Run `npm run verify` on Node 24: suite 1202/1203 with the one pre-existing `push-landed` fixture failure (git 2.50 refuses to delete the current branch of the bare fixture; fixed by a separate change), coverage 98.59% lines / 93.61% branches / 99.19% functions, and the `verify` check on the branch is green in CI.
