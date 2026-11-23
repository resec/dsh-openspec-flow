# Tasks

## 1. Landing command and state

- [x] 1.1 Add `scripts/pr-review-land.mjs` with `plan`, `prepare`, `reviewed`, `merge`, `archive`, `push`, `finish` and `state` commands, a `.cache/pr-review/landings.json` state file, argument parsing and usage text. Create `test/pr-review-land.test.mjs` with help and command validation cases; verify `node --test test/pr-review-land.test.mjs` passes.
- [x] 1.2 Implement the preflight gates: PR open, non-draft, base branch main, exactly one active change, `mergeable` label present, trusted pass comment for the current head, green CI, `MERGEABLE` and not `DIRTY`/`CONFLICTING`/`BLOCKED`, and a clean main worktree; verify with a gate matrix in the landing test suite via `npm run test:affected -- scripts/pr-review-land.mjs`.

## 2. Prepare and final review handoff

- [x] 2.1 Implement `prepare`: reuse or create the PR checkout, create the local `pr-land/<n>` branch, fetch and rebase onto current `origin/main`, abort on conflict without changing the contributor branch, and record the pre-merge main and landing head; verify with clean rebase, conflict and already-contains-main cases.
- [x] 2.2 Implement `reviewed`: require the prepared phase, a clean landing checkout, the recorded landing head, and an apply review record under the review key `<store>#<change>` (default `local#<change>`) whose `state` is `passed` and `treeSha` equals the landing head tree; store `reviewedTree` and advance. Verify missing record, tree mismatch, dirty checkout and non-passed state are refused.

## 3. Merge, archive and finish

- [x] 3.1 Implement `merge`: require the reviewed phase, re-check head, base, label, CI, mergeability and the reviewed record, require `origin/main` to equal the recorded pre-merge main, run `gh pr merge --rebase`, fetch and fast-forward local main, record `mergedHead`, and require `HEAD^{tree}` to equal `reviewedTree`; verify merge success, main moved, review mismatch, `gh` failure and tree mismatch cases.
- [x] 3.2 Implement `archive`, `push` and `finish`: `archive` records the archive commit and phase, `push` verifies local main equals `origin/main` and records the pushed head, and `finish` requires the pushed phase, verifies the change is archived and the pushed head, writes the manifest, removes the PR worktree first, deletes the landing branch after it, and clears the watch entry through the watch forget helper. Verify archive-not-done, push-not-done, archived-change verification and branch-removal order.
- [x] 3.3 Add idempotent retry behavior: a merged landing never runs `gh pr merge` again, archive and push failures keep their phase, and a second unfinished landing is refused; verify with state-machine cases in the landing test suite via `npm run test:affected -- scripts/pr-review-land.mjs`.

## 4. Documentation and entrypoint

- [x] 4.1 Add `pr-review:land` to `package.json` and document the commands, label, state, archive failure and recovery in `docs/pr-review.md`; verify the commands run as written and the landing test suite covers the `mergeable` label.
- [x] 4.2 Update `CONTRIBUTING.md`, the schedule prompt and non-goals in `docs/pr-review.md`, and the schedulers paragraph in `AGENTS.md` to describe final review on the rebased branch, `gh pr merge --rebase`, merged-tree verification, main archive and push; verify `test/contributor-docs.test.mjs` still passes.

## 5. Integration verification

- [ ] 5.1 Run `openspec_inspect` with `action: "validate"` and `strict: true`; verify no warnings.
- [ ] 5.2 Run `npm run test:affected -- scripts/pr-review-land.mjs scripts/pr-review-watch.mjs` and `npm run verify` with Node 24 from `.cache/toolchain/node/bin`; verify the suite and coverage pass.
- [ ] 5.3 Commit the implementation and complete the apply review before archive.

## Workflow follow-up

- Archive the change after the apply review is ready.
- Push the archive commit after the pre-push gate passes.
