# Design: land-with-parallel-drafts

## Context

See `proposal.md` - Why. The relevant current state:

- `scripts/pr-review-land.mjs` runs every landing command from the main worktree. Its `assertMainReady` gates the candidate listing, `plan`/`prepare`/`merge`, `sync` and `sync-batch` with one whole-worktree `git status --porcelain` check; `archiveLanding` repeats that check after the session commit.
- The landing gates derive the change from PR paths anchored at `openspec/changes/<name>/`, so in this loop the landing change directory is always `openspec/changes/<change>` relative to the main worktree.
- `lib/review/store.js` already exports `filterUnrelatedChangeStatus`, which keeps a path under the given change directory and paths outside every `openspec/changes/` directory, and drops other changes' paths. The plugin's worktree land uses it.
- The archive commit is currently created by the scheduled session; `archive` only records the resulting `HEAD`. The contributor archive commit is subject-only today, while `openspec_apply_worktree land` keeps its `Landed from` body.

## Goals / Non-Goals

**Goals**

- Narrow the landing refusal to the landing change's own directory, paths outside the changes tree, a non-empty index and a non-`main` HEAD.
- Remove the main-worktree precondition from `sync` and `sync-batch`.
- Make the archive commit path-scoped and owned by the command, with a verification path for a commit made elsewhere.

**Non-Goals**

- No plugin runtime change; the installed plugin and `openspec_apply_worktree land` keep their current behavior and archive body.
- No landing state schema change and no new command.
- No parallel landing or worktree-based contributor landing.
- No automatic cleanup of another session's staged paths.
- No fix for the same pre-staged-index hazard in the plugin's `lib/worktree/land.js`; that is a separate plugin-side change.

## Decisions

### Guard split and classification

`assertOnMain(root)` keeps only the branch check. `assertLandingReady(root, change)` performs the branch check, classifies the worktree status with `filterUnrelatedChangeStatus(status, "openspec/changes/<change>")`, and requires an empty index.

- `candidates` has no single landing change, so it uses `filterUnrelatedChangeStatus(status, '')`: every path under any `openspec/changes/` directory is tolerated, and a path outside them still blocks the listing.
- `sync` and `sync-batch` use `assertOnMain` only. They update a remote branch and write landing state under `.cache/`, so a dirty worktree is not a reason to refuse. The landing lock and the local-`main`-ahead check stay.
- `plan`, `prepare` and `merge` use `assertLandingReady` with the landing change.
- `archive` uses its own readiness check because `openspec_archive` leaves its outputs in the worktree: deletions under the source change directory, additions under the archived directory and rewritten files under the capability directories the archived change names. That check refuses a staged index, an untracked path under the source change directory, a spec change outside those capability directories, and any uncommitted path outside those outputs and another change's planning directory. It accepts the archive outputs and the parallel planning directory, then verifies the staged set before committing.

Alternatives considered:

- `git status --porcelain --untracked-files=no`: it misses untracked files that can collide with the fast-forward and does not match the plugin's existing classification.
- Dropping the checks entirely for landing: it loses the protection against the landing change's own draft and against real source edits.
- Per-candidate own-directory filtering in `candidates`: no single target change exists before a candidate is chosen.

### Empty index before landing and archive

`plan`, `prepare`, `merge` and `archive` refuse when `git diff --cached --name-only` is non-empty. The archive command commits with `git commit`, which commits the whole index; the filtered worktree check would otherwise accept a staged foreign file and include it in the archive commit. Refusing before `gh pr merge` avoids merging a pull request and then getting stuck at the archive phase. A `merge` refused for a staged index leaves the landing entry at `reviewed`, so unstaging and retrying needs no new prepare or review.

Recovery is deliberate: unstage the foreign paths (`git reset`) and retry, or commit the archive manually and record it with `archive --commit`. The command does not unstage another session's paths, because that would mutate work it does not own.

Alternative considered: `git commit -- <paths>` (path-limited commit). It also limits the commit, but it bypasses the staged-set verification and does not mirror the plugin's archive commit, so the explicit staging and verification path is preferred.

### Script-owned, path-scoped archive commit

`archive <n> --apply` without `--commit` performs the commit after `openspec_archive` has moved the change:

1. Require the active change directory to be absent, exactly one archived directory named `<date>-<change>`, a change name other than `.` or `..`, and capability names taken from the archived change's own immediate `specs/*` directory names; a capability name is valid when its composed path stays under `openspec/specs`.
2. Require an empty index and no uncommitted path outside the source change deletions, the archived directory, the named `openspec/specs` capability directories and another change's planning directory. An untracked path under the source change directory and a spec change outside the named capabilities are refused.
3. `git add -A -- <archive directory> <each named openspec/specs capability directory>`.
4. `git rm -r --cached --ignore-unmatch -q -- openspec/changes/<change>` to stage the source deletion.
5. Require `git diff --cached --name-only` to be non-empty and every path to be under one of those locations.
6. Commit with the subject `chore(openspec): archive <change>` and no body, then record the new `HEAD` as `archiveCommit`.

The allowed set is exactly the archived directory, the named capability directories under `openspec/specs` and the source change directory deletions. The repository-root paths are correct because the landing gate anchors PR paths at `openspec/changes/`.

`archive <n> --commit <sha> --apply` remains the verification and recovery path: it derives the same allowed set from the archived directory, requires `HEAD` to be `sha`, the commit's changed paths to be within that set, and the index to be empty, then records it without committing.

Alternatives considered:

- Session commit with post-hoc path verification: verification runs after the commit exists, so a broad `git add -A` would already have published another change's files; undoing it requires a history rewrite.
- Keeping the session commit and only relaxing the cleanliness check: it leaves the same hazard that motivated the path-scoped commit.

### Fast-forward collisions remain retryable

`completeMergedLanding` still runs `git merge --ff-only origin/main`. A foreign untracked path that collides with an incoming path makes the fast-forward fail; the landing records `archive-pending` with the error and the operator retries after resolving the path. Change-owned directories make this collision unlikely, and the failure does not lose the merge.

### Documentation

Update the prerequisites, the landing sequence steps for `sync`/`sync-batch` and `archive`, the command list entry for `archive`, the `archive-pending` recovery outline, and the `AGENTS.md` landing paragraph. The recovery outline shows `archive <n> --apply` as the default committing step and `--commit <sha>` as recovery for a commit made elsewhere. The documentation keeps naming `openspec_archive`, `tree-mismatch`, `state=passed`, `archive --commit` and the other tokens the documentation test asserts.

## Risks / Trade-offs

- Fast-forward collision with another change's untracked path → paths are per-change; the rare collision records a retryable `archive-pending` error.
- The shared filter treats any path containing `openspec/changes/` as a change path, so an ignored path outside the repository's OpenSpec root would also be tolerated → the landing gate anchors the change name at the repository root, so the landing change is unaffected; the semantic is inherited from the plugin and documented.
- The archive command's default behavior changes from record-only to commit → `--commit` keeps the previous protocol and the documentation names both paths; in-flight entries can use either.
- Another session leaves staged files → the landing refuses before merge; the operator unstages and retries.
- The archived directory is accepted as `openspec_archive` produced it; an untracked file that moved into it would be committed with the archive. Comparing it with the merged tree is out of scope for this change.
- The plugin's worktree land has the same staged-index hazard → separate plugin-side change; not worsened here.

## Migration Plan

No state or data migration. A landing already in `archive-pending` completes with `--commit` when its archive commit exists, or with `--apply` when it does not. Rollback is a revert of the script, documentation and delta spec; existing landing entries stay valid. No plugin repack is needed because the script runs from the main worktree.

## Open Questions

None.
