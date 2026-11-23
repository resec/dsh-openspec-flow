## Context

See `proposal.md` for the motivation. The review watch currently stops at a published comment. Its state and detached checkout live under `.cache/pr-review/`; the plugin review record lives in the git common directory. `main` is linear: the archive commit must follow the pull-request commits, and this repository does not use squash or merge commits.

The landing phase must therefore bridge two kinds of state:

- the watch state and PR checkout;
- the plugin's apply-review record and the final archive on `main`.

## Goals / Non-Goals

**Goals**

- Run the final apply review on the rebased PR branch before the merge.
- Use `gh pr merge --rebase` so the PR displays as merged and `main` stays linear.
- Verify the merged `main` tree equals the reviewed tree before archiving.
- Archive on `main` after the merge, commit and push.
- Keep the label-authorized flow deterministic and resumable.

**Non-Goals**

- No squash, merge commit, admin bypass or force push.
- No automatic label creation or removal.
- No modification of the contributor branch.
- No change to the review comment format, plugin review record or plugin tools.
- No complex archive recovery in the first version; archive failure is a retryable state.

## Decisions

### Separate landing command

Add `scripts/pr-review-land.mjs` rather than putting landing into `pr-review-watch.mjs`. The watch script remains the read-only review/poll surface, and landing gets its own commands and state. The landing script imports the watch's exported path, state and candidate helpers rather than duplicating them. This keeps an accidental merge impossible from `poll` or `comment`.

### The `mergeable` label is the authorization

The landing command reads the PR labels and requires `mergeable`. It never writes labels. GitHub's label write permission limits who can apply it; the first version relies on that repository permission rather than querying label-event actors. A label name matching GitHub's mergeability field is intentional; the command always treats it as a label and never reads it as a merge-state value. The PR base must be the repository main branch; a PR targeting another base is refused before prepare.

### Prepare a local landing branch, never the contributor branch

`prepare` reuses the prepared PR checkout, creates `pr-land/<n>` at the PR head, and rebases it onto the fetched `origin/main` when main is not already an ancestor. The branch is local. A conflict aborts the rebase, restores the checkout and records `blocked`; nothing is pushed to the PR head. The final apply review runs with the pre-merge main as `base` and `baseline: "none"`.

The reviewed tree is recorded only after the session reports the review ready. `reviewed` reads the change's apply review record from `<git common dir>/openspec-flow/review/<store>#<change>/apply-review.json`, requires the record state to be `passed` and its `treeSha` to equal the landing head tree, then stores `reviewedTree` and advances the phase. Without that record the command refuses; a clean checkout and a recorded landing head alone are not enough.

### Merge with `gh pr merge --rebase`, then verify the tree

`merge` re-checks the head, label, CI, mergeability and base branch, requires `origin/main` to equal the recorded pre-merge main, then runs `gh pr merge <n> --rebase`. It fetches `origin/main`, requires a clean main worktree, fast-forwards local main, records the merged main head as `mergedHead`, and compares `HEAD^{tree}` with the reviewed tree.

A `merge --rebase` does not create a merge commit; the state stores the main head after the fast-forward, not a merge-commit SHA.

A mismatch stops the landing at `tree-mismatch`: the PR is already merged, but archive is refused because the review did not cover the merged tree. The operator can run a merged-tree review as a deliberate recovery; the first version does not automate that fallback.

### Archive on main after the merge

After a matching tree, the session runs `openspec_archive` on main, commits the archive and pushes. The plugin archive gate compares the apply record's tree hash with `HEAD^{tree}`, not commit ancestry, so the rebase-created commit SHA does not invalidate the record when the tree matches. The `archive` command records the archive commit and phase; the `push` command verifies local main equals `origin/main` and records `pushedHead`.

If archive, commit or push fails, the PR remains merged and the change active. The landing state records `archive-failed`, `archive-pending` or `push-pending`; retries resume at that phase and never merge again.

### Landing state is separate from watch state

Store landing records in `.cache/pr-review/landings.json`, keyed by PR number. Watch `state --cleanup` may remove a merged PR's review entry; landing state must survive that cleanup until finish. `finish` verifies the archive and the pushed head, writes a small manifest, removes the PR worktree first, deletes the landing branch after the worktree is gone, and clears the watch entry.

Only one landing may be in a non-terminal phase at a time. Commands acquire the existing run lock for their own duration and reject a second unfinished landing.

## Risks / Trade-offs

- Archive can fail after the PR is merged. Mitigation: record `archive-failed`; keep the active change; retry only archive. Accept for the first version.
- The merged tree can differ from the reviewed tree. Mitigation: mandatory tree equality check; block archive and require a deliberate merged-tree recovery.
- Rebase conflicts block landing. Mitigation: keep the PR open, do not push the rebased branch, record `blocked`.
- Branch protection may reject rebase merge. Mitigation: stop on the `gh` failure; never use `--admin` or force.
- A label named `mergeable` can be confused with GitHub's mergeability field. Mitigation: code reads `labels`, never `mergeable` as authorization; the field is read only for its own gate.
- Archive completion is not atomic across files. Mitigation: keep the phase and retry; operator inspects partial state if the CLI is interrupted.

## Migration Plan

No data migration. Existing watch state and checkouts are reused. Rollback removes the landing script, its docs, tests and package script; no committed artifact from a landing run exists before the user runs it.

## Open Questions

None.
