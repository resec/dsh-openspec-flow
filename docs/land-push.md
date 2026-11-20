# Push landed main

This is the repository-side step after a plugin worktree land. The plugin's `openspec_apply_worktree action=land` fast-forwards main to the reviewed feature head, archives the change and writes a landed manifest under `<git common dir>/openspec-flow/landed/`; it never pushes. This page owns the verified push to `origin/main`. The plugin behavior and manifest format are documented in [`apply-worktree.md`](apply-worktree.md).

## Commands

From the main worktree:

```sh
# Default: verify and report; no push
node scripts/push-landed.mjs

# Explicit push
node scripts/push-landed.mjs --push

# Select a record instead of the latest landedAt
node scripts/push-landed.mjs --change <name>
node scripts/push-landed.mjs --land <sha>
node scripts/push-landed.mjs --manifest <path>

# Legacy selector; same as --land
node scripts/push-landed.mjs --merge <sha>
```

`npm run push:landed` is the same entrypoint; pass `--push` after `--`:

```sh
npm run push:landed -- --push
```

Exit codes are 0 for success or an already-pushed remote, 1 for a refused check or remote failure, and 2 for usage errors.

## Checks

The script reads only the landed manifest and git. It does not read apply state or review records.

- The selected manifest records `approvedBy: "user"` and has valid `change`, `featureTree`, `archiveCommit`, and either `landCommit` or a legacy `mergeCommit`.
- The main worktree is on `main`, and its HEAD equals the manifest `archiveCommit`.
- The worktree is clean apart from uncommitted paths under another change's `openspec/changes/<name>/`; an uncommitted path under the landed change's own former directory or outside `openspec/changes/` is refused.
- The resolved land commit and `archiveCommit` exist locally, the land commit is an ancestor of the archive commit, and the land tree equals `featureTree`.
- The `landCommit..archiveCommit` diff touches only `openspec/changes/archive/`, `openspec/specs/` and deletions under the change's former directory.
- A manifest that carries both fields with different commits is refused.
- The dry run and the push both fetch `origin/main` first. The remote is fixed to `origin`; there is no remote-selection flag.

A dry run prints the selected manifest and the `origin/main..HEAD` range. The range can include earlier unpushed land commits; inspect it before `--push`.

New manifests use `landCommit` and `landMode: "fast-forward"`. Manifests written before fast-forward land carry `mergeCommit`; the script resolves the commit from `landCommit`, falling back to `mergeCommit`, and reports it as `land`.

## Remote states

| Remote state | Behavior |
| --- | --- |
| equals `HEAD` | reports already pushed; exit 0 |
| is an ancestor of `HEAD` | dry run reports the range; `--push` pushes it |
| is ahead of `HEAD` | refuses; fetch and reconcile main |
| diverged | refuses; reconcile before pushing |
| `origin/main` missing | refuses with the fetch failure |

The push is always `HEAD:refs/heads/main`. It never pushes tags, feature branches, force updates or other refs.

## Pre-push hook

The script does not pass `--no-verify`. Install the repository hook once:

```sh
npm run hooks:install
```

The hook runs `npm run openspec:check`, the lab gate and the coverage decision before the push. Another active change with a strict-validation warning will block the push through the hook even when the landed manifest is valid; finish or stash that change's artifacts, or fix the warning, then retry. A fresh clone without the hook pushes unguarded, so install it before the first push.

## Recovery

| Failure | Correction |
| --- | --- |
| no manifest for an unarchived change | run `openspec_apply_worktree action=land` first; do not hand-write a manifest |
| archived change's manifest missing or unreadable | the manifest is written only by land and cannot be regenerated after archive; inspect `git log --first-parent`, the land and archive commits and the archived change, then restore or remove the damaged file deliberately; never hand-write a manifest |
| unmatched or ambiguous selection | pass a full `--land` (or legacy `--merge`) or an exact `--manifest`; remove a duplicate only after confirming which record is real |
| land commit is not an ancestor of the archive commit | do not push; re-derive the landed pair or re-land |
| dirty path outside `openspec/changes/` | commit or remove the change; only other changes' planning files are exempt |
| uncommitted path under the landed change's own directory | remove or commit it; the landed change must not reappear |
| wrong branch or detached HEAD | switch the main worktree to `main` |
| `approvedBy` is not `user` | re-run land with the user's explicit approval |
| `HEAD` is not the selected `archiveCommit` | select the latest manifest; the current main contains later commits |
| land tree does not match `featureTree` | do not push; the landed commit is not the reviewed tree |
| `landCommit` and `mergeCommit` disagree | delete or fix the damaged manifest deliberately; never choose one silently |
| archive diff touches implementation | do not push; inspect the archive commit or re-land |
| remote ahead | fetch and reconcile main; this script does not pull |
| diverged | reconcile deliberately; no force push |
| missing `origin/main` | check the remote and fetch the main ref |
| push rejected by the hook | fix the hook's finding and retry; never bypass the gate |

## Boundary

- No automatic push after land.
- No merge commit is created by the plugin land step.
- No `--force`, `--no-verify`, tag push or feature-branch push.
- The script does not create, move or delete worktrees, review records or manifests.
- The push publishes the local `main` range; the maintainer remains responsible for checking that range and the remote state.
