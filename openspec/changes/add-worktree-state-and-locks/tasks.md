# Tasks

## 1. State module

- [ ] 1.1 Verify `share-review-records` is archived and `reviewRoot`/the common-directory resolver already resolve under the git common directory; add a test that the review root and the new apply state root share that directory.
- [ ] 1.2 Add the apply state path/key helpers with `reviewKey`/`assertSafeSegment`, the full required field set, the status enum, `mainRoot` resolution from `git worktree list --porcelain` and the environment-field rejection; verify round-trip, no-store `null`, apply-base/seal-commit values including a standalone PR `null` seal, missing field, unknown status, exact `.`/`..` refusal, slash/backslash/NUL refusal, `foo..bar` acceptance, linked-worktree `mainRoot` and unknown environment field in `test/worktree-state.test.mjs`.
- [ ] 1.3 Add atomic write and corrupt-state reporting; verify a failed write leaves the previous bytes and a corrupt file is reported without being replaced.
- [ ] 1.4 Run `npm run test:affected -- lib/worktree/state.js`.

## 2. Lock module

- [ ] 2.1 Add lifecycle and change lock creation by writing the owner into a temporary directory and renaming it into place; verify one holder, a different change acquiring concurrently, the same change serializing, and that an interrupted creation leaves no lock path in `test/worktree-lock.test.mjs`.
- [ ] 2.2 Add the fixed lifecycle-before-change order helper and refuse the reverse order; verify the refusal does not create a lock.
- [ ] 2.3 Add owner-checked release, idempotent missing release and the timeout-waiter race; verify a changed owner is left in place and a timed-out waiter deletes nothing.
- [ ] 2.4 Add token-only recover with a recovery mutex and compare-and-delete; verify a dead token owner, a live owner, a changed owner, a missing owner and no `expectedPid` path.
- [ ] 2.5 Run `npm run test:affected -- lib/worktree/lock.js`.

## 3. Inspect and recover

- [ ] 3.1 Add `openspec_inspect` with `action: "worktree"` and the `status/state/locks/worktree/repair` projection; verify read-only behavior, the single-read-tool catalog, the `worktree` output branch, the `test/inspect.test.mjs` tool count and one-branch list, a `worktree` call with an unaccepted parameter, a corrupt state and a missing worktree as `manual`, a dead lock as `recover`, and that no environment path is inspected in `test/worktree-inspect.test.mjs`.
- [ ] 3.2 Register `openspec_apply_worktree` with `recover`, `change`, `store`, `scope` and `expectedOwner`; verify missing or extra owner arguments and an invalid scope are refused before a read, the result carries the recovered scope, the reviewer catalog excludes the tool, an unknown action is rejected, and the catalog tool count is updated.
- [ ] 3.3 Run `npm run test:affected -- lib/tools/query.js lib/tools/worktree.js`.

## 4. Documentation

- [ ] 4.1 Add `docs/apply-worktree.md` with the state fields, lock paths, owner/recovery protocol, inspect result and non-goals; add the tool row and the document to the README file list; qualify the apply skill and `lib/policy.js` sentence about the existing apply lock versus the new lifecycle locks.
- [ ] 4.2 Add a documentation test that reads `docs/apply-worktree.md` and the README tool row; verify it fails when either is removed.
- [ ] 4.3 Verify `openspec_inspect` with `action: "validate"` and `strict: true` passes for the change.

## 5. Integration

- [ ] 5.1 Run `npm test` and `npm run verify` on Node 24; report the test summary and coverage verdict.
- [ ] 5.2 Verify `npm run openspec:check` passes over active changes and main specs.

## Workflow follow-up

- Apply review after committing the implementation.
- Archive after the apply review is ready, then commit the archive and push `origin/main`.
