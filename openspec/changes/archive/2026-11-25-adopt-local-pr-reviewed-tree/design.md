# Design

## Context

See [proposal.md](proposal.md) for the motivation. The local owner entry under `<main worktree>/.cache/pr-review/local-prs.json` is the review anchor:

- `verifyLocal` requires the merge commit tree to equal `entry.tree` before it checks the apply review.
- `retargetLocal` resets the worktree and requires the reset tree to equal `entry.tree`.
- `finishLocal` looks up the landed manifest by `(entry.change, entry.tree)`.

`pr-publish` is the only command that writes `head` and `tree`; no later command updates them. A branch updated through GitHub after publication can produce a merged tree that was re-reviewed but differs from the stored tree. The local entry is then stale, `finish` cannot find the manifest, and hand-editing the untracked JSON is the only workaround.

## Goals / Non-Goals

Goals:

- Provide one supported, explicit operation that replaces only the reviewed tree and head in the local owner entry.
- Keep every existing review-tree check: the adopted tree must have the latest passed apply review and must match a current repository fact.
- Make the adoption discoverable from the commands that currently fail on the mismatch.

Non-goals:

- No automatic adoption in `finish` or `verify`; changing the reviewed tree needs an explicit operator action.
- No change to publication, merge, land, archive or push gates.
- No change to the local phase list or phase transitions.
- No new dependency and no change to the plugin's public tool surface.

## Decisions

### Decision: a dedicated `adopt` subcommand

Use `node scripts/pr-local-land.mjs adopt <n> --tree <sha> --session <id> [--token] [--apply]` rather than a `finish --tree` flag or automatic reconciliation inside `finish`.

Rationale: `finish` remains a verifier of the landed state. Adoption can run before `verify` and `retarget` (the normal pre-land order) as well as after land and before `finish`, so one command covers both windows and leaves `status`, `verify`, `retarget` and `finish` with a consistent recorded tree. A `finish --tree` flag would only patch the last step and leave the earlier commands unable to proceed.

### Decision: explicit tree plus corroboration

The operator supplies the full tree object id. The command validates it against the latest passed apply review through `assertReviewReady`, then requires at least one current-state source to corroborate the same tree:

1. **Landed manifest**: a manifest for the change whose `archiveCommit` is local `main` must have `featureTree === --tree`; its `featureHead` (or `landCommit` when `featureHead` is absent) becomes the recorded head after checking that the head commit's tree equals the tree.
2. **Merged pull request**: a `MERGED` pull request whose merge commit tree equals `--tree`, after fetching and requiring `origin/main` to be that merge commit; the merge commit becomes the recorded head.
3. **Apply worktree**: an existing, clean plugin worktree whose `HEAD^{tree}` equals `--tree`; `HEAD` becomes the recorded head.

The sources are not independent alternatives for the same state: the manifest is authoritative after land, the merged pull request is authoritative after merge, and the worktree is the pre-merge source. If a merged pull request exists whose merge tree differs from `--tree`, the command refuses even when the worktree happens to carry the requested tree, because that tree did not land. If a manifest for the change is on `main` with a different `featureTree`, the command refuses for the same reason. A stale manifest (archive commit not `main`) and a non-merged pull request do not corroborate the tree; they are ignored, and the command fails if no source remains.

Rationale: an explicit tree avoids a command that silently adopts whatever a stale worktree or manifest contains, while the corroboration requirement avoids adopting an arbitrary previously reviewed tree. Deriving the head from the same source keeps `head` and `tree` a consistent pair.

### Decision: update head and tree, clear the error, leave the phase

The write is `{ head, tree, error: null }`. The phase stays with `retarget`, `land` and `finish`: adoption repairs the review anchor and is orthogonal to landing progress. A `failed` phase may remain after adoption; the next successful landing command or `finish` advances it. The `pushed` phase is refused because the entry has completed and `state --cleanup` removes it.

The command does not acquire, release or mutate the landing lock. It requires the recorded owner session and refuses a lock held by another session, matching `finish`'s ownership rule.

### Decision: guide from the failing commands

- `verify` replaces its bare tree-mismatch error with the merged tree and the exact `adopt` command to run after re-reviewing it.
- `recover` calls the verification with an explicit mismatch-permitting mode; when the merged tree has a passed apply review it plans `adopt` before `retarget`. The normal `verify` path still refuses the mismatch.
- `finish`, after failing to find a manifest for `entry.tree`, looks for a manifest for the same change whose `archiveCommit` is `main`; when it finds one with another tree it names that tree and the `adopt` command instead of the misleading "run land first" message.

These changes do not adopt anything; they only name the supported step.

### Decision: no git mutation and one local write

`adopt` reads git and `gh`, validates everything, and then makes one `updateLocalEntry` call. It never resets a worktree, creates commits or touches the landing lock. A dry run performs the same reads and validation and writes nothing.

## Risks / Trade-offs

- **The passed review may name a different tree than the merged one.** → `assertReviewReady` refuses; the owner must re-review the merged tree first, which is the intended gate.
- **`origin/main` may be stale.** → The merged-pull-request source fetches before comparing, like `verify`. If the fetch or `gh` read fails, another source can still corroborate; otherwise the command refuses and names the fetch failure.
- **The worktree may point at an old head with the same tree.** → The worktree is the lowest-precedence source; a merged pull request or a manifest takes precedence. A merged tree that differs refuses, so an old head is not recorded when the tree did not land.
- **Several manifests can exist for one change.** → Only the manifest whose `archiveCommit` is `main` is used; stale manifests are ignored and cannot corroborate the tree.
- **A stale failure record may hide the repaired state.** → Adoption clears `error`; the phase remains until the next landing command records it.
- **The command writes only local state.** → Rollback is removing the command and docs; existing entries remain readable and `finish` still verifies the landed manifest.

## Migration Plan

No data migration or dependency change. An operator with a stale entry runs `adopt` once with the merged-tree id, then continues with `verify`/`retarget`/`land`/`finish` or `finish` after land. The command refuses entries already `pushed`, so no completed entry changes.

## Open Questions

None.
