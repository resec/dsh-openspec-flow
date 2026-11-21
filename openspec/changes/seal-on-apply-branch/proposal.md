# Proposal: Seal the draft on the apply branch

## Why

The draft seal is currently committed by the agent on `main` before the first apply, so it becomes an ancestor of `main` immediately. Two collateral effects follow from a commit that belongs to one change: any other change that lands and pushes afterwards publishes an unreviewed, unlanded seal, and any new seal advances `main`, so every in-flight apply worktree is judged behind main and is forced to rebase, retest and run an extra apply-review round.

## What Changes

- **BREAKING** The plugin constructs the seal commit itself at the first apply, with a temporary index, instead of requiring the agent to commit it. The change directory stays uncommitted in the main worktree; the plugin's tree check replaces the `HEAD` check.
- The seal commit is attached to the change's apply branch and to the private ref `refs/openspec-flow/seal/<slug>-<hash>`. `main`'s `HEAD`, index and working tree are unchanged, so no seal enters main's ancestry before its own land.
- The plugin-written uncommitted `openspec/.gitignore` is staged by the seal; land removes it when untracked and restores a tracked modified or deleted copy to its `HEAD` version.
- The ref keeps the apply base reachable across a rebase, which rewrites the branch's seal commit; the apply review keeps diffing against the recorded base tree.
- Land verifies the main working copy against the seal tree, removes the untracked copy before the fast-forward, and restores it from the seal commit when the land fails before the merge. Crash re-entry normalizes from the merge state and the copy's presence.
- The plugin deletes the private ref at land success, at `remove`, and when an abandoned checkout is removed.
- The flow rule, the apply skill, the review document and `AGENTS.md` stop asking the agent to commit a seal and describe the new location.
- A non-git project has no seal and no base; the worktree-disabled compatibility path keeps the committed-`HEAD` seal and its agent commit, and its skill and rule text keep that instruction.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: the seal is constructed by the plugin and recorded as the apply base; the artifact check reads the constructed tree; a private ref keeps the base reachable across a rebase.
- `apply-worktree`: the apply branch and seal ref are created at seal time and reused by worktree creation; land removes and restores the main planning copy; land and remove delete the ref.
- `tool-surface`: the first git apply no longer needs a sealed `HEAD`; it refuses only genuine dirt and constructs the seal in the same call.
- `flow-policy`: the registered rule states the plugin seals on the apply branch and that main is not advanced.
- `skill-adaptation`: the apply skill no longer tells the agent to commit a seal.
- `review-documentation`: the review document states the new seal location, the ref and the land-time copy handling.

## Impact

- `lib/tools/review.js` (seal construction and tree check), `lib/worktree/create.js` (branch and ref creation, reuse), `lib/tools/apply.js` (call order and resync), `lib/worktree/land.js` (copy removal and restore, ref cleanup), `lib/tools/worktree.js` (remove and abandon ref cleanup), possibly `lib/worktree/state.js`.
- Specs listed above; `README.md`, `docs/review.md`, `docs/apply-worktree.md`, `AGENTS.md`, `lib/policy.js`, `skills/openspec-apply-change/SKILL.md`.
- Tests for seal construction, main staying unchanged, reuse, land removal and restore, crash re-entry, ref cleanup and legacy states.
- No new dependency, no state schema change, no push behavior change.
