# Tasks

## 1. Cover the resolution failures

- [x] 1.1 Add a fixture that copies `lib/openspec.js` and `package.json` into a temporary installation tree.
- [x] 1.2 Assert the unresolvable-package message names `@fission-ai/openspec` and asks for a reinstall.
- [x] 1.3 Assert the missing `bin.openspec` entry message names the package root and asks for a reinstall.
- [x] 1.4 Assert the missing bin file message names the bin path and asks for a reinstall.

## 2. Cover the version call

- [x] 2.1 Run `runOpenSpec` against a fixture bin that prints prose and assert the message names the exit code and the output.

## 3. Confirm the assertions bite

- [x] 3.1 Replace `Reinstall` in the three messages and confirm the three tests fail; restore the file.
- [x] 3.2 Replace `no JSON version report` and confirm the fourth test fails; restore the file.

## 4. Verify

- [x] 4.1 Run `node --test test/openspec.test.mjs` (11 tests, 11 pass).
- [x] 4.2 Run `npm run verify` after the test commit and record the test summary and the coverage verdict.
