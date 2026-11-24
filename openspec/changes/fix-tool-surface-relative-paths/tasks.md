# Tasks

## 1. Resolve one root for the worktree surfaces

- [x] 1.1 Add a shared root resolver that reports the resolved `path` and its real `source`, and nothing when no root resolves.
- [x] 1.2 Resolve the inspection root from the main checkout and project `state.path`, `state.worktree`, `locks[].path` and `worktree.path` against it.
- [x] 1.3 Add `root` to the land and remove results and project `manifest`, `worktree` and `path` before the action removes the checkout.
- [x] 1.4 Add `root` to the archive validation-failure result.
- [x] 1.5 Declare `root` in the worktree, land and remove output schemas and describe the projected paths.
- [x] 1.6 Document the inspection, land and remove result shapes in `docs/apply-worktree.md`.

## 2. Guard the new projections

- [x] 2.1 Assert the inspection root above the session directory, relative state, lock and worktree paths, and no root without an OpenSpec project.
- [x] 2.2 Assert the land and remove root with a relative manifest, worktree and path, and an absolute path when the checkout sits outside the root.
- [x] 2.3 Assert the root and relative issue paths of a failed archive.
- [x] 2.4 Confirm the new assertions fail against the previous implementation.

## 3. Verify

- [x] 3.1 Run `node --test test/worktree-inspect.test.mjs test/apply-worktree.test.mjs test/worktree-land.test.mjs test/apply-worktree-doc.test.mjs` and `node --test --test-name-pattern="validation findings" test/integration.test.mjs`.
- [x] 3.2 Run `bash /tmp/b3/gates.sh fix-tool-surface-relative-paths` (strict validate, `openspec:check`, requirement length, generated skills, `check:pr`, `npm run verify`).
