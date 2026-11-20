# Tasks

## 1. Creation

- [x] 1.1 Add the worktree creation module with the state key, branch-safe `<slug>-<hash8>` branch and path helpers; verify creation from the seal commit, change visibility, non-git skip, `release..1` and leading-dot branch safety, existing-state reuse and a retry after a failed creation that deletes only its own branch in `test/worktree-create.test.mjs`.
- [x] 1.2 Ensure the worktree root is ignored through `<git common dir>/info/exclude` when needed; verify a project without `.cache/` in `.gitignore` creates the worktree and keeps `git status` clean.
- [x] 1.3 Acquire only the per-change lock, inspect but do not acquire a legacy project-wide lock, move the session before writing the state, record `lockToken`/`lockPid`, and verify a failed session move or state write restores main, removes the worktree and branch, deletes any state and releases the lock.
- [x] 1.4 Run `npm run test:affected -- lib/worktree/create.js lib/tools/apply.js`.

## 2. Apply routing and session

- [x] 2.1 Extend `openspec_apply_next` to create/reuse the worktree, return `worktree.path` relative to `root.path`, and move the session with `ctx.workingDirectory.set`; add `set` to `docs/upgrading-dsh-runtime.md` and `test/fake-context.mjs` and verify the session cwd after start and a missing-agent failure.
- [x] 2.2 Route `openspec_mark_task_done` and `openspec_inspect action: "validate"` through the state's worktree; verify a task mark changes the worktree's `tasks.md`, not main, and validate reads the worktree.
- [x] 2.3 Keep `list`, `status`, `show`, `instructions` and `context` on main, and draft review/intent/seal on main; verify apply start refuses an unready draft before creating a worktree.
- [x] 2.4 Add `lockToken`/`lockPid` to the state module and validation, including null for a PR state, and `landing` in the status enum (three statuses: active, landing, archived); verify the state tests.
- [x] 2.5 Fix the apply cache key/eviction so the cached `changeDir`/`projectRoot` follow the state's worktree; verify a state change evicts the old entry.
- [x] 2.6 Run `npm run test:affected -- lib/tools/apply.js lib/tools/query.js lib/state.js`.

## 3. Apply review worktree

- [x] 3.1 Add the optional `worktree` parameter to `openspec_review` apply start/resume and validate same-common-dir, not-main, clean and change-present; verify a dirty or foreign worktree is refused.
- [x] 3.2 Write a PR review state with `sealedCommit: null` and the explicit base; verify inspection sees it and the worktree is not created, moved or deleted.
- [x] 3.3 Pass the worktree to reviewer activation; verify the reviewer catalog and activation work from the worktree and a missing path fails before a record is written.
- [x] 3.4 Run `npm run test:affected -- lib/tools/review.js lib/review/reviewer-tool.js`.

## 4. Serialization and cleanup

- [x] 4.1 Replace the project-wide implementation apply lock with the per-change lock for git worktree apply and record its token/pid for same-pid re-entry; verify two changes apply concurrently, the same change's second start fails, the same-pid apply owner can resync with the token and a dead owner's free lock is reacquired with a replaced token/pid, and a landing state is refused by apply.
- [x] 4.2 Verify `openspec_archive` from main and from the worktree refuses a plugin-created active or landing state after the review gate, names `openspec_apply_worktree action=land`, leaves a PR state on the existing archive path, and non-git keeps the existing apply lock and archive path.
- [x] 4.3 Verify creation holds only the change lock, the lifecycle lock is scoped to removal/land/archive, another change's existing apply is not blocked, and a creation failure removes the partial worktree and releases the change lock.

## 5. Documentation and integration

- [x] 5.1 Update `docs/apply-worktree.md`, `README.md`, `docs/review.md`, the apply skill and policy text for creation, session cwd, routing, the per-change lock and the land-only archive step; state the `land-apply-worktree` deployment dependency.
- [x] 5.2 Run `npm test`, `npm run verify` and `npm run openspec:check` on Node 24.

## Workflow follow-up

- Apply review after committing the implementation.
- Land with `land-apply-worktree`; do not archive a worktree-applied change with `openspec_archive`.
