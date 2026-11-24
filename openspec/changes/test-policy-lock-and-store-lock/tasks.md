# Tasks

## 1. Lock the policy after a real settings edit

- [x] 1.1 Create the change through `openspec_new_change` with draft and apply review enabled, then apply new settings and assert `policy.json` and its reviewer model are unchanged.
- [x] 1.2 Assert the draft review still runs in the locked self mode and a change created after the edit locks the new settings.
- [x] 1.3 Add the spec-shaped todo test for the archive gate that still reads the current settings, and name issue #45 as the blocker.

## 2. Cover the store lock through the tools

- [x] 2.1 Add a registered git store fixture with the probe change committed.
- [x] 2.2 Assert the apply entry writes the implementation and store locks at the documented paths, the second project is refused and releases only its own lock, its archive is refused, and the owning archive releases both locks.

## 3. Verify

- [x] 3.1 Run `node --test --test-name-pattern "ignores later settings" test/review-apply.test.mjs`.
- [x] 3.2 Run `node --test test/review-apply.test.mjs` and `node --test test/review-serial.test.mjs`.
- [x] 3.3 Mutate `releaseApplyLocks` to skip removal and confirm the store test fails, then revert it.
- [x] 3.4 Run `npm run verify` on Node 24 after the test commit: 1446 tests pass, 0 fail; coverage plugin line 98.65%, branch 93.73%, function 99.21%.
