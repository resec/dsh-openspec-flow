# Spec Delta

## ADDED Requirements

### Requirement: Local pull-request exclusion

The watch SHALL treat a pull request recorded in `<main worktree>/.cache/pr-review/local-prs.json` as owner-managed. Polling, owner-review reconciliation, prepare, comment and landing SHALL skip it.

#### Scenario: Local pull request is skipped by polling

- **WHEN** a poll sees an eligible-looking pull request recorded as local
- **THEN** the poll reports no review candidate for it
- **AND** it reports the pull request number as owner-managed

#### Scenario: Owner-review skips a local pull request

- **WHEN** reconcile sees a local pull request that is otherwise eligible for `owner-review`
- **THEN** it does not add or remove a label on that pull request

### Requirement: Local owner entry cleanup

`state --cleanup` SHALL delete a local entry only when its pull request is closed without a landing or its phase is `pushed`. It SHALL retain and report an entry in any other phase, including `landed` and `landed-offline`.

#### Scenario: Cleanup keeps an unfinished local entry

- **WHEN** a local pull request is merged and its entry phase is not `pushed`
- **THEN** `state --cleanup` retains the entry and reports its phase

#### Scenario: Cleanup removes a completed local entry

- **WHEN** a local pull request is closed without a landing or its entry phase is `pushed`
- **THEN** `state --cleanup` deletes its `local-prs.json` entry

### Requirement: Local pull-request publication gates

`scripts/pr-publish.mjs` SHALL default to a dry run and write only with `--apply`. It SHALL verify the active plugin worktree, a passed apply review whose `treeSha` equals the worktree head tree, a clean worktree, a main planning copy matching the seal, a local `main` that does not lead `origin/main`, GitHub reachability, no unfinished landing and no `landing.lock` held by another owner.

#### Scenario: Dry run writes nothing

- **WHEN** the publish command runs without `--apply`
- **THEN** it reports the branch, head, tree and pull-request action
- **AND** it pushes nothing, creates no pull request and writes no local state

#### Scenario: Unreviewed or mismatched tree is refused

- **WHEN** the apply review is not passed, its tree differs from the worktree head tree, the worktree is dirty, or the main planning copy differs from the seal
- **THEN** the command refuses before pushing

#### Scenario: Local main leads origin/main

- **WHEN** local `main` has commits that `origin/main` does not contain
- **THEN** the command refuses and names `push-landed` as the required step

#### Scenario: GitHub is unreachable

- **WHEN** the GitHub authentication or API check fails
- **THEN** the command reports `offline-land` and writes nothing

### Requirement: Local pull-request publication effects

The publish command SHALL push the reviewed branch, create a draft pull request with an audit marker, write the local owner entry, and mark the pull request ready. It SHALL not add `mergeable` or `owner-review`, and it SHALL not publish a review comment. A repeated run SHALL reuse the existing pull request instead of creating a second one.

#### Scenario: First publication

- **WHEN** the gates pass and `--apply` is set
- **THEN** the branch is pushed, a draft pull request with the audit marker is created, the local owner entry defined by `Local owner entry fields` is written, and the pull request is marked ready

#### Scenario: Repeated publication

- **WHEN** the branch already has an open pull request for the same change
- **THEN** the command updates the local entry and marks the pull request ready without creating another one

#### Scenario: Closed pull request

- **WHEN** the branch's pull request is already closed or merged
- **THEN** the command refuses and does not reopen it

### Requirement: Local owner entry fields

The local owner entry SHALL live under `<main worktree>/.cache/pr-review/local-prs.json` and record the pull request number, change, branch, head, reviewed tree, review record id, owner session id and phase. The phase SHALL be `published`, `merged`, `retargeted`, `landed`, `pushed`, `landed-offline` or `failed`. The file SHALL be resolved against the main worktree, not the process working directory.

#### Scenario: Entry fields are recorded

- **WHEN** a local pull request is published
- **THEN** the entry records the number, change, branch, head, tree, review record, owner session and a phase

#### Scenario: Phase advances with the landing

- **WHEN** the local PR is merged, retargeted, landed or pushed
- **THEN** the entry phase advances through `merged`, `retargeted`, `landed` and `pushed`

#### Scenario: Offline fallback phase

- **WHEN** a published local PR falls back to an offline land and is later pushed
- **THEN** the entry phase is `landed-offline` and then `pushed`

#### Scenario: Failure records failed

- **WHEN** the publish or a local landing command fails
- **THEN** the entry phase is `failed`

#### Scenario: State resolves against the main worktree

- **WHEN** the publish or landing script runs from the plugin worktree
- **THEN** it reads and writes `<main worktree>/.cache/pr-review/local-prs.json`

### Requirement: Local landing lock

The repository SHALL keep a cross-session `landing.lock` under `<main worktree>/.cache/pr-review/landing.lock/`, resolved against the main worktree. A local owner SHALL acquire it after publication and before the final rebase or re-review; the lock SHALL record the owner session id and a random token; when the landing pushes a new head, the owner SHALL hold the lock through that head's CI, and it SHALL hold it through merge, retarget, land, archive and push.

#### Scenario: Owner holds the lock

- **WHEN** a local owner acquires the lock and continues the landing sequence
- **THEN** it may merge, retarget, land, archive and push until it releases the lock

### Requirement: Local landing lock ownership

The local scripts SHALL accept the recorded owner session id and token. The publish gate SHALL accept a lock whose session id equals the local entry's owner session id and refuse another session. A stale lock SHALL be reported with its owner and released only by an explicit force-release command.

#### Scenario: Owner token matches

- **WHEN** a local command passes the session id and token recorded in the lock
- **THEN** it may continue the landing sequence

#### Scenario: Another owner is refused

- **WHEN** a local command passes a session id that differs from the lock owner
- **THEN** the command refuses and names the recorded owner

#### Scenario: Stale lock is reported

- **WHEN** the lock names an owner session that is no longer active or its age exceeds the documented limit
- **THEN** the status command reports the owner and age
- **AND** the lock is released only through the explicit force-release command

### Requirement: Local landing lock isolation

Contributor landing commands SHALL refuse while a local owner holds the `landing.lock`; review commands SHALL remain available.

#### Scenario: Contributor landing refuses

- **WHEN** a local owner holds the landing lock
- **THEN** contributor merge, archive, push and finish commands refuse until the owner releases it

#### Scenario: Reviews continue while the lock is held

- **WHEN** the landing lock is held by a local owner
- **THEN** the watch may still review a contributor pull request

### Requirement: Local pull-request landing

The owner session SHALL merge a local pull request only when the head contains the current `origin/main`, CI is green, the apply review is passed and its `treeSha` equals the head tree. It SHALL run `gh pr merge --rebase` and then require the merge commit tree to equal the reviewed tree. It SHALL not require a `mergeable` label or a trusted pass comment.

#### Scenario: Up-to-date local pull request is merged

- **WHEN** the head contains `origin/main`, CI is green and the reviewed tree equals the head tree
- **THEN** the owner merges with `gh pr merge --rebase`
- **AND** it verifies the merge commit tree equals the reviewed tree

#### Scenario: Behind head is rebased and re-reviewed

- **WHEN** the head does not contain `origin/main`
- **THEN** the owner rebases the worktree, runs `npm run verify`, resumes the apply review in the same session, pushes the new head and waits for green CI before merging

#### Scenario: Tree mismatch blocks the merge record

- **WHEN** the merge commit tree differs from the reviewed tree
- **THEN** the owner records the mismatch and does not archive

#### Scenario: No label is required

- **WHEN** a local pull request has no `mergeable` label and no trusted pass comment
- **THEN** the owner may still merge it after the local gates pass

### Requirement: Local worktree retarget and land

After the merge, the owner SHALL verify `origin/main` is the merge commit, reset the plugin worktree branch to that commit, and confirm its tree still equals the reviewed tree. It SHALL then run `openspec_apply_worktree action=land` with user approval; land SHALL fast-forward `main` to the merge commit, archive, commit, write the manifest and remove the worktree and branch. The owner SHALL push the archive commit with `push-landed` and SHALL record `pushed` through `pr-local-land finish`.

#### Scenario: Retarget keeps the reviewed tree

- **WHEN** `origin/main` is the merge commit and the worktree is clean
- **THEN** the owner resets the worktree branch to the merge commit
- **AND** `HEAD^{tree}` still equals the reviewed tree

#### Scenario: Land completes the change

- **WHEN** the retargeted worktree is landed
- **THEN** `land` fast-forwards `main` to the merge commit, archives the change, writes the manifest and removes the worktree and branch

#### Scenario: Push publishes only the archive commit

- **WHEN** the land commit is already on `origin/main`
- **THEN** `push-landed --push` publishes only the archive commit
- **AND** `pr-local-land finish` records the entry phase `pushed`

### Requirement: Merged local pull-request recovery

A merged local pull request whose owner session stopped SHALL be reported by the watch with its number, phase and recorded session. A user-approved recovery session SHALL verify the merge commit and tree, retarget, land and push, and SHALL run `openspec_apply_worktree action=recover` first when the change lock is held by a dead process; `pr-local-land finish` SHALL record `pushed` after the push. The unattended watch SHALL NOT review, retarget, land or merge a local pull request.

#### Scenario: Watch reports a stopped local landing

- **WHEN** a local pull request is merged and its local entry is not landed or pushed
- **THEN** the watch reports the pull request, phase and session and stops without landing it

#### Scenario: Recovery session completes the landing

- **WHEN** a user approves recovery for a merged local pull request
- **THEN** the session verifies the merge commit and tree, retargets, lands and pushes

#### Scenario: Dead change lock is recovered first

- **WHEN** recovery finds the change lock held by a dead process
- **THEN** the session recovers it with `openspec_apply_worktree action=recover` before retargeting or landing

### Requirement: Offline local completion

When GitHub is unreachable, the local flow SHALL NOT publish a pull request. After apply review and a passing `npm run test:lab -- --mock-only`, the maintainer SHALL run `openspec_apply_worktree action=land` with user approval, archive and stop at local `main` without a push.

#### Scenario: Offline land completes locally

- **WHEN** GitHub is unreachable, the apply review is passed and the local lab passes
- **THEN** the maintainer lands locally, the change is archived and local `main` reaches the archive commit without a push

### Requirement: Offline deferred push

When GitHub returns, `push-landed` SHALL publish the deferred commits and the local entry SHALL record `pushed` through `pr-local-land finish`. A published local pull request that falls back SHALL record `landed-offline` through `pr-local-land finish` after the local land. Local `main` leading `origin/main` SHALL block a new online pull request and contributor landing until the deferred push completes.

#### Scenario: Deferred push

- **WHEN** GitHub is reachable again and local `main` leads `origin/main`
- **THEN** `push-landed --push` publishes the deferred land and archive commits
- **AND** `pr-local-land finish` records `pushed`

#### Scenario: Local main leads origin/main

- **WHEN** a contributor landing or a new online pull request is attempted while local `main` leads `origin/main`
- **THEN** the operation refuses and names `push-landed`

#### Scenario: Published pull request falls back offline

- **WHEN** a local pull request is published but not merged and GitHub becomes unreachable
- **THEN** the owner may land the same reviewed worktree locally
- **AND** `pr-local-land finish` records `landed-offline`
- **AND** the open pull request is left for reconciliation after the deferred push

### Requirement: Local preflight

`scripts/pr-review-watch.mjs preflight` SHALL report GitHub reachability, whether local `main` leads `origin/main`, unfinished landing phases and `landing.lock` ownership without writing. The scheduled session SHALL use the result to stop landing or all pull-request work.

#### Scenario: Offline preflight

- **WHEN** the GitHub authentication or API check fails
- **THEN** the preflight reports offline and the scheduled session stops without changing state

#### Scenario: Unpushed local main

- **WHEN** GitHub is reachable but local `main` leads `origin/main`
- **THEN** the preflight reports the unpushed land and the scheduled session stops landing while reviews may continue

## MODIFIED Requirements

### Requirement: Open pull-request polling

`scripts/pr-review-watch.mjs poll` SHALL report a contributor pull request as a candidate only when it is not a draft, has a green CI rollup, changes exactly one active change, and its head SHA has no published review. A prepared or failed head SHALL be re-emitted for retry. It SHALL exclude a pull request recorded as local. A pull request with pending checks or no checks SHALL NOT be a candidate.

#### Scenario: Mixed pull-request list

- **WHEN** the open list contains a draft PR, a PR with a failed check, a PR with pending checks, a PR with no checks, a PR with two active changes, an already-commented head and one eligible PR
- **THEN** only the eligible PR is reported as a candidate, with its number, head, baseRefOid, baseRefName, change, worktree, status and resume

#### Scenario: Local pull request is not a review candidate

- **WHEN** the open list contains a pull request recorded as local
- **THEN** it is not reported as a review candidate

#### Scenario: No eligible pull request

- **WHEN** every open PR is filtered out
- **THEN** the poll reports an empty candidate list and exits successfully

### Requirement: State, lock and failure recovery

The watch SHALL keep atomic state under `.cache/pr-review/state.json`, local owner state under `.cache/pr-review/local-prs.json`, a run lock under `.cache/pr-review/run.lock` and a cross-session landing lock under `.cache/pr-review/landing.lock/`. A failed prepare, review or comment SHALL leave the head retryable without duplicating a published comment. Worktrees SHALL be retained until the PR is closed or merged. A corrupt local state SHALL refuse the run.

#### Scenario: Failed publish

- **WHEN** the comment command fails after the review completed
- **THEN** the state records the failure, the next run retries the publish, and no second review is opened for the same head

#### Scenario: Overlapping scheduled runs

- **WHEN** a scheduled run finds the run lock held
- **THEN** it exits without processing a PR and reports the lock owner

#### Scenario: Corrupt local owner state

- **WHEN** the local owner state is unreadable or violates its schema
- **THEN** the watch refuses the run and reports the path

#### Scenario: Local worktree is retained

- **WHEN** a local pull request is merged but not landed
- **THEN** the plugin worktree and the local owner entry are retained for recovery

### Requirement: Scheduled run sequencing

The session SHALL reconcile `owner-review` and clean up each run. Without a held `landing.lock`, it SHALL advance one landing phase in order: resume or prepare a landing, land a mergeable candidate including a same-repository sync. When no landing phase advances, or a local owner holds the lock, it MAY review one candidate. A ready final review SHALL merge, archive and push in the same locked run. A synced head SHALL stop the run. Local pull requests SHALL be reported, never reviewed or landed.

#### Scenario: A run stops after one landing phase

- **WHEN** a run completes a sync or a prepare
- **THEN** it stops, and a later run resumes from the recorded landing phase or reviews the synced head

#### Scenario: A polling run

- **WHEN** a run runs cleanup and reviews one candidate
- **THEN** it stops and the next run polls again after cleanup without resuming a landing

#### Scenario: A cleanup-only run

- **WHEN** no candidate and no unfinished landing exist
- **THEN** the run runs cleanup and stops

#### Scenario: Final review and merge in one run

- **WHEN** the final apply review becomes ready and the landing lock is free
- **THEN** the same run records `reviewed`, merges, archives and pushes while holding the lock

#### Scenario: Archive and push wait

- **WHEN** a run records `reviewed` and merges
- **THEN** archive and push wait for the merge and complete in the same locked run before the lock is released

#### Scenario: A synced head waits for CI

- **WHEN** a sync changes the head and the new head has pending checks
- **THEN** the run stops and the head is reviewed once its CI rollup is green

#### Scenario: Contributor landing precedes review

- **WHEN** a mergeable contributor landing and a contributor review candidate are both available
- **THEN** the session advances the landing and leaves the review to a later run

#### Scenario: Landing lock is held

- **WHEN** a local owner holds the landing lock
- **THEN** the run does not start or resume a contributor landing
- **AND** it may still review one contributor candidate

#### Scenario: Local pull request needs recovery

- **WHEN** a local pull request is merged but not landed
- **THEN** the run reports it and does not retarget, land or merge it
