# Design: Seal the draft on the apply branch

## Context

See `proposal.md` for motivation. Today the agent commits the seal on `main` and `openspec_apply_next` verifies that `HEAD` is a pure change-directory commit before creating the worktree from it ([apply.js:118](../../../lib/tools/apply.js), [apply.js:155](../../../lib/tools/apply.js), [review.js:2110](../../../lib/tools/review.js)). Land later requires `main` to be the branch's ancestor and fast-forwards it ([land.js:421](../../../lib/worktree/land.js), [land.js:461](../../../lib/worktree/land.js)). The state schema is strict: every field is present and unknown fields are rejected.

## Goals / Non-Goals

**Goals**

- The seal commit never becomes an ancestor of `main` before its own land.
- The apply base stays reachable across a rebase that rewrites the branch's seal.
- Land keeps a clean main and a linear fast-forward, with a reversible copy removal.
- Existing states, the non-git path and the worktree-disabled path keep their behavior.

**Non-Goals**

- No read-routing change: `list`, `status`, `show`, `instructions` and `context` keep reading main.
- No state schema field and no new tool.
- No change to the rebase extra-round flow, to locks, or to push tooling.
- No repair of seals already pushed to the remote.

## Decisions

### D1: The plugin constructs the seal with a temporary index

The seal is built without touching main: `GIT_INDEX_FILE=<tmp> git read-tree HEAD`, then `git add -A -- <changePath>` and, when the plugin wrote it uncommitted, the root `.gitignore`; `git write-tree`; `git commit-tree <tree> -p HEAD`. The clean-tree gate therefore allows the change directory, other changes' directories and that ignore file, and refuses every other uncommitted path. The alternative, creating the worktree first and copying the artifacts in, was rejected: it copies files and reorders worktree creation, while the temporary index reads the same bytes without a second copy.

### D2: The branch and the seal ref are created at seal time

The seal commit is attached to the apply branch `openspec/apply/<slug>-<hash>` and to `refs/openspec-flow/seal/<slug>-<hash>`, reusing the branch's safe slug and hash rather than the raw state key, because a state key may contain `..` or a leading dot and git rejects both in a ref name. The seal creates or resets the branch when no worktree uses it, reuses it only when its tip equals the seal commit, and refuses when an attached worktree exists; `remove` keeps the branch, so a fresh draft after an abandoned checkout must reset it rather than fail or reuse the old seal. Creating the two references before the worktree means a worktree-creation failure leaves a reusable seal instead of an orphan commit. The ref is required because a rebase rewrites the branch's seal commit, and the recorded `applyBaseCommit` is only a hash; without the ref the base would be pruned and later apply-review diffs would fail. A tag was rejected because some workflows push tags and it pollutes `git tag`; the branch alone cannot survive the rebase.

### D3: Verification reads the constructed tree, not the working tree

The changed-path set comes from the constructed commit against its parent, and the artifact hashes are computed from the tree's blobs. The requirement is worded as a changed-path rule because a git tree is a full snapshot: `read-tree HEAD` makes the tree contain every tracked file, so "nothing outside the change directory" can only mean no changed path outside it. Re-reading the working files after `git add` would race a concurrent edit and could record a base that does not match the reviewed artifacts. A mismatch or an empty change directory fails before any ref or branch exists, so a failed seal leaves main and the repository unchanged.

### D4: Main keeps the untracked planning copy during apply

Removing it at apply start would break the main-worktree reads (`readCwd` maps worktree sessions back to main, query.js) and would require a `list` merge plus read routing. Keeping the copy preserves every read path, at the cost of an untracked change directory in `git status` and stale progress counters, which is the status quo for `status` today.

### D5: Land removes and restores the copy; it does not park it

Land reconciles the planning copy with the seal tree (path, content and mode) before its clean check and `--ff-only`: matching untracked files under the change directory and the plugin-written root `.gitignore` are removed, and a tracked `.gitignore` that is modified or deleted is reset to its `HEAD` version so the fast-forward can update it. A mismatch refuses and lists the paths. A failure before main is updated restores the pre-land copy — removed untracked files and the tracked ignore file's pre-land bytes — so no separate holding directory is needed: the seal ref is the durable copy. Other tracked files are left for the merge, and an absent untracked copy stays absent.

### D6: Crash re-entry is normalized from observable state

A retry with a completed merge (the existing completed-land finder) must not restore the pre-land copy. Any other retry treats a present copy as "verify and delete" and an absent copy as "nothing to delete". This removes the need for a phase field, which the strict state schema would make expensive and which could still desync from the filesystem.

### D7: The ref is deleted with the change, not before

Land success, `remove` of an archived or abandoned checkout, and abandoned-change removal delete the ref; a missing ref is tolerated. The ref never advances main, never appears in `git branch`, and a normal push does not publish it.

### D8: Resync stops reading the artifacts after apply starts

`openspec_apply_next` currently computes the draft object before checking whether apply started. After apply started it only needs the recorded hash, so the read is skipped; an accidentally deleted or edited main copy then cannot turn a resync into a missing-file error.

### D9: Compatibility paths keep the main seal

A non-git project has no seal and no base. The worktree-disabled compatibility path keeps the committed-`HEAD` seal and the agent commit, because it has no apply branch, and its skill and rule text keep that instruction. A git worktree apply constructs the seal and needs no agent commit. An existing state that already carries a base is not re-sealed; its change directory is tracked in main, so the land copy step finds nothing to remove.

### D10: The clean-tree rule allows only the reviewed change and other change directories

The seal check may ignore the reviewed change's own uncommitted directory and the plugin-written uncommitted root `.gitignore`, because the construction stages exactly those paths; other `openspec/changes/**` directories stay ignored; every other uncommitted path still refuses. The strict rule survives for everything the construction cannot capture.

## Risks / Trade-offs

- Temporary-index construction can fail on ignore rules, file modes or symlinks → the tree is built before any ref; a verification failure leaves main, refs and branches untouched, and the error names the offending path.
- The ref can leak when a change is abandoned outside the tool → deletion is idempotent at land and remove, and an orphan ref only keeps one commit reachable.
- Land now removes user files → the byte-and-mode comparison against the seal tree is the sole gate; anything unexpected refuses with a path list.
- A rebase leaves two seal commits: the original base pinned by the ref and the replayed one on the branch → the review diff is tree-based, so it still starts at the reviewed base; the design notes it in the review document.
- The status and list views stay stale during apply → accepted as the status quo, documented.

## Migration Plan

1. Land this change; the new seal applies to every change whose first apply happens afterwards.
2. Repack and reinstall the bundle so the installed plugin runs the new logic; the repository sources alone do not change the installed copy.
3. In-flight changes keep their recorded base; no state migration and no ref backfill.
4. A draft whose change directory is already committed on main (the old seal shape) is refused by the construction: uncommit that seal so the directory is untracked, then run apply again. The refusal names this recovery.
5. Rollback: revert the commit; unused seal refs are inert, and no data was moved out of main.

## Open Questions

None. The orphan-ref sweep is a follow-up that can be added to `openspec_inspect action=worktree` without changing this design.
