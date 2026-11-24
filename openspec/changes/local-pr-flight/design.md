# Design

## Context

The repository completes a maintainer apply in a plugin-created worktree. The apply review records the committed tree under `record.treeSha`. Local owner state and the landing lock live under the main worktree's `.cache/pr-review/`, the same root the watch resolves, so a script run from the apply worktree cannot hide a local PR from the watch. `openspec_archive` refuses an active plugin worktree, and `openspec_apply_worktree land` currently requires a local fast-forward from `main` to the worktree head. A GitHub rebase merge rewrites the commits but keeps the reviewed tree.

The existing PR patrol syncs a behind same-repository branch through GitHub, reviews the current head, and merges in the same run. Local development must not pass through that loop: the reviewer and the worktree belong to the owner session, and the patrol must not start a second reviewer for a local PR.

The pre-push hook currently runs the lab scenarios. The remote `lab` CI job runs on pull requests and `main`.

## Goals / Non-Goals

- Goal: a local change with a passed apply review reaches `main` through a PR when GitHub is reachable, and through a local land when it is not.
- Goal: one local PR keeps one reviewer and one worktree until the change is archived.
- Goal: contributor landing and local landing never interleave on `main`.
- Goal: pre-push stops running the lab; remote CI owns it.
- Non-goal: changing plugin runtime behavior, review records, schemas, tool surface or tarball.
- Non-goal: changing the contributor `mergeable`/trusted-pass/sync rules.
- Non-goal: a second PR for the archive commit.

## Decisions

### Keep the worktree and retarget it after the merge

The reviewed object is the tree, not the commit SHA. After `gh pr merge --rebase`, the owner fetches `origin/main`, verifies the merge commit tree equals `record.treeSha`, and resets the worktree branch to the merge commit. `openspec_apply_worktree land` then fast-forwards `main` to the worktree head (the merge commit), archives, writes the manifest and removes the worktree and branch. `push-landed` pushes only the archive commit because the land commit is already on `origin/main`.

Alternatives considered:

- `openspec_apply_worktree action=remove` with `abandon`: clears the state but borrows recovery semantics and removes the worktree before merge; rejected.
- A new plugin `release` action or an external-merge land mode: a plugin functionality change; not needed because the tree binding already permits retargeting.
- Local land + direct push after CI: violates the PR-only implementation rule; rejected.

### Cross-session landing lock

A local owner acquires `<main worktree>/.cache/pr-review/landing.lock` after publication and before the final landing work. The lock records the owner session id and a random token; the local commands pass both, and the publish gate accepts the lock only when its session id equals the local entry's owner session id. When the landing pushes a new head the owner holds the lock through that head's CI; it holds it through merge, retarget, land, archive and push. A repeated publish accepts the owner's own lock and refuses another owner's lock. Contributor landing commands check the same lock; review commands do not. This keeps one lander mutating `main` at a time without blocking contributor reviews. Stale locks are reported and cleared only by an explicit operator command.

### Local owner state and draft-first publication

`pr-publish` verifies the apply state, the review tree, the worktree and the main planning copy, pushes the reviewed branch, creates the PR as a draft, writes `<main worktree>/.cache/pr-review/local-prs.json` with the head, tree, review record, owner session id and phase, then marks the PR ready. `pr-local-land finish` records `pushed` after `push-landed`; the offline fallback records `landed-offline` through the same command after the local land and `pushed` after the deferred push, and a failed publish or landing records `failed`. The draft window prevents the watch from reviewing a local PR before its owner state exists. The local state, not a label or a PR-body marker, is the ownership authority; the marker is audit only.

### Patrol classification

The watch excludes every PR recorded as local from polling, owner-review reconciliation, prepare, comment and landing. Contributor candidates keep the current rules: `mergeable`, trusted pass, single change, green CI, latest-main preparation, same-repository sync for a behind branch, fork refusal. Contributor work is ordered as: resume an unfinished landing, land a `mergeable` candidate, then review. Local work is outside that queue and is reported only when it needs recovery.

### Same-run contributor completion

Because the landing lock cannot be held across scheduled deliveries, a ready contributor landing merges, archives and pushes in one run while holding the lock. Prepare and sync still stop the run; a run that reviews does so only when no landing phase advanced or while a local owner holds the lock; archive and push no longer wait for a later run.

### Offline completion

The publish preflight reports `offline-land` when GitHub authentication or the API check fails. The maintainer then runs the local lab, lands with user approval, and stops at local `main`; no PR and no push. `push-landed` publishes the deferred commits when GitHub returns. A local `main` leading `origin/main` blocks new online PRs and contributor landing; reviews may continue when GitHub is reachable.

A published but unmerged local PR may fall back to the offline land because its worktree still exists. The open PR is left for reconciliation; if its head is in the landed commits, the later push closes it as merged, otherwise it is closed manually.

### Pre-push lab removal

The hook keeps strict OpenSpec validation and the coverage/verify decision, but no longer runs `npm run test:lab -- --mock-only`. The remote `lab` job guards pull requests and `main`. The offline path runs the lab locally because no remote CI runs before the deferred push.

## Risks / Trade-offs

- [The merge commit tree differs from the reviewed tree] → refuse and re-review the merged tree, or redo the landing; never retarget or land a mismatched tree.
- [A local owner holds the lock through a long CI wait] → contributor landing waits; reviews continue. Local priority is intentional.
- [The owner session dies after the merge] → the worktree and local state remain; a user-approved recovery session retargets, lands and pushes, and runs `openspec_apply_worktree action=recover` first when the change lock is held by a dead process. The unattended watch only reports.
- [A contributor or an external push moves `main` between the merge and the local land] → the lock blocks the patrol; an external push makes the retarget or push refuse, and the owner re-verifies.
- [The covering local `main` leads `origin/main`] → publish and contributor landing refuse; `push-landed` is the recovery.
- [The pre-push hook no longer runs the lab locally] → the remote `lab` job is the gate for PR and main; the offline path requires a local lab pass.
- [A corrupt local owner state hides a local PR from the watch] → the watch fails closed rather than reviewing it.

## Migration Plan

1. Land the tooling and docs change with the existing land and push path; the new flow is not used for its own delivery.
2. From the next change, publish after apply review, retarget after the merge and land; keep `push-landed` for the archive commit and for offline land.
3. Roll back by reverting the scripts and docs; the existing land path remains. An open local PR can be closed before merge; after merge, the worktree can still be retargeted and landed manually.

## Open Questions

None.
