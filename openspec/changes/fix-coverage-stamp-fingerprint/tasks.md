# Tasks

## 1. Extend the fingerprint

- [ ] 1.1 Add `client.js`, `reviewer.js` and `scripts/check-pre-push.mjs` to `STAMP_INPUTS`.
- [ ] 1.2 Restate the input-list comment so it names the executed entry points and the pre-push script.
- [ ] 1.3 Restate the requirement in the spec delta and add the loaded-module scenario.

## 2. Test

- [ ] 2.1 Extend the expected input list and the fixture repository in `test/coverage-stamp.test.mjs`.
- [ ] 2.2 Add one case per newly listed file that must make `checkStamp` report a mismatch.
- [ ] 2.3 Add a case where a commit outside the list keeps the stamp usable.

## 3. Verify

- [ ] 3.1 Run `node --test test/coverage-stamp.test.mjs`.
- [ ] 3.2 Run `openspec validate fix-coverage-stamp-fingerprint --strict`.
- [ ] 3.3 Run `gates.sh fix-coverage-stamp-fingerprint` (strict validation, `openspec:check`, length gate, skills check, `check:pr`, `npm run verify`).
