# Design: Land an apply worktree

## Context

See `proposal.md` — Why. Apply and apply review run in a worktree. Land must merge that tree, archive the change and commit the archive without another operation changing main or archiving the change in between. The manifest must make the sequence resumable.

## Goals / Non-Goals

Goals:

- Verify, merge, archive, commit and record one worktree in one lifecycle critical section.
- Keep the required tree equal to the merged tree.
- Keep a failed land resumable without merging or archiving twice.
- Remove only a plugin-created checkout after archive.

Non-Goals:

- Pushing branches or main.
- Dependency caches, DSH profiles, ports or CI.
- Changing review report semantics.

## Decisions

### Land is one lifecycle section

`openspec_apply_worktree action=land` runs in main. It first verifies the state pid/token, releases the apply change lock as its owner, sets the state `landing`, acquires the lifecycle lock and a fresh change lock, and records the fresh token/pid. A pre-merge failure restores `active` and reacquires the change lock and token. It requires:

- main on `main` and clean, except uncommitted files under another `openspec/changes/` directory (matching the existing seal/archive rule);
- the worktree clean and containing the latest main (`mainHead` is an ancestor of the worktree head);
- when apply review is enabled in the locked policy and available, a ready review whose `treeSha` equals the worktree `HEAD^{tree}`; when the policy disables apply review or no policy exists, the worktree head is the required tree;
- the change state is `active` or `landing` and names this worktree.

After the handover it merges `--no-ff <worktree branch>`, verifies the merged tree equals the required tree, archives, commits the archive, writes the manifest and marks `archived`.

`openspec_archive` also acquires the lifecycle lock, so a main-worktree archive cannot interleave with land. Land does not need the main worktree's implementation apply lock; it is the change lock owner for this change.

### Conditional apply-review gate

The existing archive gate skips apply review when the policy is absent, disabled or unavailable. Land mirrors that gate rather than requiring a review record unconditionally. When the review is enabled and ready, the required tree is the review's `treeSha`; otherwise it is the worktree head. The merged-tree check always runs.

This keeps a git change with `reviews.apply.enabled: false` or no policy landable without inventing an unreviewed merge or archiving the sealed main change.

### Merge and tree checks

The worktree must contain main; if not, land refuses and asks for a rebase, retest and re-review. `git merge --no-ff` creates a merge commit. After the merge, `HEAD^{tree}` must equal the required tree; if it does not, land aborts the merge (`git merge --abort` or reset to the pre-merge main) and writes no manifest. A completed merge is retained only after this check passes, so a later archive/commit/manifest failure can resume without merging again.

### Archive shares the existing implementation

The archive operation is extracted from `openspec_archive` into a reusable function used by both the tool and land. The tool keeps its result shape and gates; land passes the already-verified tree and change. The archive commit contains the archived change and merged delta specs only; it follows the merge commit, which carries the implementation and its documentation. The commit message names the change and merge.

In a git project, `openspec_archive` acquires the lifecycle lock before its checks and releases it after; a project without git proceeds without it. This is the serialization point against land; without it, a second archive could move files while land commits.

### Manifest and resume

`<common>/openspec-flow/landed/<merge>.json` records `change`, `store`, `worktree`, `branch`, `featureHead`, `featureTree`, `mergeCommit`, `mainHead` (the pre-merge main commit), `archiveCommit`, `applyReviewId`, `reviewRecordHash` (SHA-256 of `apply-review.json` when a review exists), `approvedBy` and `landedAt`.

The manifest is written after the archive commit, but a retry detects a completed archive commit through the merge ancestry and the archive directory even when the manifest is missing. A pending manifest is not published as a completed one. On resume, land first looks for a matching merge and manifest; if the merge exists and its tree matches, it reuses it; if the archive commit exists, it only writes the manifest; otherwise it resumes archive.

### Remove is narrow

`remove` takes the lifecycle lock and the same change's lock. It requires a state whose `worktree` is under `<mainRoot>/.cache/openspec-flow/worktrees/` (the plugin-created path), an `archived` state or `abandon` with a reason and `approvedBy: "user"`, and a clean checkout. It removes the checkout, keeps the branch and deletes the state. A PR worktree is outside that root and is refused; a user-created branch is never deleted.

### Documentation and policy

`AGENTS.md` step 7 changes to land, then push the merge and archive commits. `docs/apply-worktree.md`, `docs/review.md` and README describe land, archive-in-land, manifest, remove and no push. The apply/archive skills and `lib/policy.js` name land as the terminal worktree step and keep `openspec_archive` for non-worktree paths.

## Risks / Trade-offs

- [Main advances between checks and merge] → lifecycle lock serializes land and archive; a later land needs its own rebase/review.
- [Archive commit hooks fail] → keep merge and archive changes, report the commit failure; retry detects the existing archive and commits.
- [Manifest write fails after archive commit] → detect the archive commit and write only the manifest.
- [A user-created worktree has a plugin-shaped path] → path-based origin is the stated discriminator; a path under the plugin root is treated as plugin-created.
- [Land with no apply review weakens the gate] → only when the policy disables it, mirroring archive; the merged-tree check still runs.
- [Archive lifecycle-lock wait is long] → expected; the lock is the serialization point.

## Migration Plan

1. Deploy after `run-apply-in-worktree`; land requires that state/worktree contract.
2. Existing archived changes are untouched. New applies land through the action.
3. Rollback: `openspec_archive` remains for non-worktree paths; a merged but unarchived worktree can be archived manually after the merge. Plugin-created worktrees can be removed manually.

## Open Questions

None.
