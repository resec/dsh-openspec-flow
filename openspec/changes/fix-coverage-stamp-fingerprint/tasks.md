# Tasks

## 1. Extend the fingerprint

- [x] 1.1 Add `client.js`, `reviewer.js` and `scripts/check-pre-push.mjs` to `STAMP_INPUTS`.
- [x] 1.2 Restate the input-list comment so it names the executed entry points and the pre-push script.
- [x] 1.3 Restate the requirement in the spec delta and add the loaded-module scenario.

## 2. Test

- [x] 2.1 Extend the expected input list and the fixture repository in `test/coverage-stamp.test.mjs`.
- [x] 2.2 Add one case per newly listed file that must make `checkStamp` report a mismatch.
- [x] 2.3 Add a case where a commit outside the list keeps the stamp usable.
- [x] 2.4 Carry the three files in the gate fixture of `test/coverage-gate.test.mjs`, which commits every input a stamp needs.

## 3. Verify

- [x] 3.1 Run `node --test test/coverage-stamp.test.mjs` and `node --test test/coverage-gate.test.mjs`: 26/26 and 47/47 pass.
- [x] 3.2 Run `openspec validate fix-coverage-stamp-fingerprint --strict`: Change 'fix-coverage-stamp-fingerprint' is valid.
- [x] 3.3 Revert `scripts/coverage-stamp.mjs` with `git stash push -- scripts/coverage-stamp.mjs` and rerun the stamp test: the list case and the three new invalidation cases fail, the outside-list case still passes.
- [x] 3.4 Run `/tmp/b3/gates.sh fix-coverage-stamp-fingerprint`: strict validation, `openspec:check` (119 passed), the length gate, the generated-skill check, `check:pr` and `npm run verify` (1435 pass, 0 fail; line 98.63%, branch 93.70%, function 99.21%; no new-code violation) all pass.
