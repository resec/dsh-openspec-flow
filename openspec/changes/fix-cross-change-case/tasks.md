# Tasks

## 1. Fold the change name

- [x] 1.1 Match the `openspec/changes/` segment without regard to case in `lib/review/scope.js`.
- [x] 1.2 Compare the change-name segment and the `archive` segment without regard to case, keeping the spelling from the location for the attributed name.

## 2. Guard the attribution

- [x] 2.1 Add the mixed-case own-location inputs (`openspec/changes/Demo/…`, `OPENSPEC/CHANGES/DEMO/…`, `../Demo/…`) to the location matrix in `test/review-unit.test.mjs`.
- [x] 2.2 Add the upper-case `OPENSPEC/CHANGES/other/x.md` and `Archive/` refusals to the matrix, and the report-level mixed-case cases.
- [x] 2.3 Confirm the new assertions fail against the previous `scope.js` (`git stash push -- lib/review/scope.js`): 2 tests fail.

## 3. Verify

- [x] 3.1 Run `node --test test/review-unit.test.mjs`: 57 pass, 0 fail.
- [x] 3.2 Run `/tmp/b3/gates.sh fix-cross-change-case`: strict validation, `openspec:check`, requirement length, generated skills, `check:pr` and `npm run verify` pass.
