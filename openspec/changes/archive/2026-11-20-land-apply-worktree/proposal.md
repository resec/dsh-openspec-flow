# Proposal: Land an apply worktree

## Why

Once apply and apply review run in a worktree, the final merge and archive must happen together. If land merges first and archive runs later, the next land changes `HEAD` and invalidates the earlier apply review tree; if archive runs first, the apply review no longer covers the landed tree. One lifecycle critical section must verify, merge, archive and commit while the reviewed tree is still the current tree.

## What Changes

- `openspec_apply_worktree action=land` runs in the main worktree under the lifecycle and change locks: it checks main on `main`, clean main apart from other changes' uncommitted planning files, a clean worktree, the reviewed tree against the worktree HEAD, and that the worktree contains the latest main; it merges with `--no-ff`, verifies the merged tree, archives the change, commits the archive, writes a landed manifest and marks the state `archived`. It does not push.
- A ready apply review is required only when the change's policy has apply review enabled; a disabled or absent policy lands the worktree head and verifies the merged tree against it.
- `openspec_apply_worktree action=remove` deletes only a plugin-created checkout (a state whose worktree is under `<mainRoot>/.cache/openspec-flow/worktrees/`) after it is archived or explicitly abandoned with user approval and a reason, keeps the branch, and never removes a PR worktree.
- `openspec_archive` takes the lifecycle lock when it runs on main, so a main-worktree archive cannot interleave with land's merge/archive/commit.
- The landed manifest records the change, store, worktree, branch, feature head/tree, merge commit, pre-merge main head, archive commit, apply review id, `reviewRecordHash` (SHA-256 of `apply-review.json`), approver and landed time; a failed land keeps a resumable state and a retry does not merge or archive twice.
- `AGENTS.md`, the development workflow, the archive/apply skills and the flow policy text follow the land sequence; dependency caches, DSH profiles, ports and pushing are out of scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `apply-worktree`: add land, conditional apply-review gate, archive-in-land, landed manifest, state transitions and remove.
- `tool-surface`: replace the recover-only `openspec_apply_worktree` contract with `recover`, `land` and `remove`.
- `change-review`: bind the apply review tree to the merged tree, add the lifecycle lock to archive, and state the land clean-tree exception.
- `development-workflow`: route maintainer apply through worktree land and describe the merge plus archive commits before push.
- `flow-policy`: name the land step in the standing workflow rule.
- `skill-adaptation`: name land in the apply and archive skills.

## Impact

- New land and remove modules; `openspec_apply_worktree` actions; archive invocation and commit inside the lifecycle lock; landed manifest; it relies on the run-apply state fields `lockToken`/`lockPid` and `landing`.
- `openspec_archive` lifecycle-lock acquisition; apply lock release on land.
- Tests for tree mismatch, non-fast-forward main, archive/commit/manifest failure, retry idempotence, remove guards, archive interleaving and no push.
- `docs/apply-worktree.md`, `docs/review.md`, `README.md`, `AGENTS.md`, the apply/archive skills and policy text.
- No new dependency and no change to review report semantics.
