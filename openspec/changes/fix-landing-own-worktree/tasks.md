# Tasks

## 1. Give the landing its own checkout

- [x] 1.1 Record the landing worktree at `worktrees/pr-<n>-land` and use it for fetch, add, rebase and every later phase.
- [x] 1.2 Remove only the landing checkout on `abandon`, `finish` and `state --forget`, and let `finish` forget the watch checkout through its own path.
- [x] 1.3 Rebuild a landing recorded on the shared watch checkout at the new path; move the old checkout off the landing branch and leave the directory in place.
- [x] 1.4 Refuse the rebuild when the previously recorded checkout has local changes.

## 2. Guard the separation

- [x] 2.1 Assert that prepare creates `pr-12-land` and leaves `pr-12` untouched.
- [x] 2.2 Change the abandon test to assert the landing checkout is removed while the watch checkout and entry survive, and that a second prepare rebuilds.
- [x] 2.3 Cover the rebuild of a legacy entry and the refusal on a dirty legacy checkout.
- [x] 2.4 Confirm the new assertions fail with the implementation reverted.

## 3. Document the layout

- [x] 3.1 Document `worktrees/pr-<n>-land` in `docs/pr-review.md`, the legacy rebuild and the manual cleanup of old shared checkouts.
- [x] 3.2 Guard the documented path in `test/pr-review-land.test.mjs`.

## 4. Verify

- [x] 4.1 Run `node --test test/pr-review-land.test.mjs`.
- [x] 4.2 Run `openspec validate fix-landing-own-worktree --strict`, `npm run openspec:check` and `npm run verify`.
