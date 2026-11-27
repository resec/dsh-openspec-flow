# Spec Delta: pr-review-pipeline

## ADDED Requirements

### Requirement: Stable pull-request finding numbers

The watch SHALL assign each finding a PR-level sequential number `F1`, `F2`, `F3` and persist an internal-id-to-number map in `.cache/pr-review/state.json`. A number SHALL be assigned when the finding first appears, reused across rounds and heads, and never renumbered; an internal id first seen in a readiness reason SHALL also receive one. The watch SHALL NOT render an internal finding id or a severity value in a pull-request comment.

#### Scenario: First comment assigns numbers

- **WHEN** a first comment renders two findings in report order
- **THEN** they are shown as `F1` and `F2`

#### Scenario: A later round reuses a number

- **WHEN** a later round reports or verifies the same internal finding
- **THEN** the comment shows the `F` number assigned when it first appeared

#### Scenario: A new finding gets the next number

- **WHEN** a later round records a finding that has no number
- **THEN** it receives the next unused `F` number

#### Scenario: An unmapped recorded finding is numbered

- **WHEN** the record contains a finding that predates the map
- **THEN** it receives the next unused number in record order without renumbering existing findings

#### Scenario: A reason-only id is numbered

- **WHEN** a readiness reason names an internal id that is absent from the record and the report
- **THEN** the id receives the next unused `F` number and the reason prints that number

#### Scenario: Internal identifiers stay hidden

- **WHEN** a comment renders findings or verifications
- **THEN** it does not print `R<round>-NN`, `E<n>-NN`, `critical`, `major`, `minor` or `nit`

### Requirement: Full finding state in pull-request comments

The watch SHALL read the PR change's recorded findings from `<git common dir>/openspec-flow/review/local#<change>/pr-review.json` and render every recorded finding with its `F` number, location, problem, suggestion and current lifecycle state. When the record or a finding is unavailable, it SHALL fall back to the handoff report's findings and verifications and mark the state unavailable. This read is a repository convention, not a tool contract.

#### Scenario: The record supplies the full state

- **WHEN** the record exists and lists open and closed findings
- **THEN** the comment renders every listed finding, including findings closed in earlier rounds

#### Scenario: The record is unavailable

- **WHEN** the record file is missing, unreadable or malformed
- **THEN** the comment falls back to the handoff report's findings and verifications and states that the full state is unavailable

#### Scenario: A recorded finding is missing

- **WHEN** the record exists but a finding is known only from the report or a verification
- **THEN** the comment renders it from the report and marks that finding's state unavailable

#### Scenario: State words do not reveal severity

- **WHEN** the comment renders a finding state
- **THEN** it uses lifecycle words such as open, fixed, verified or deferred and no severity word

### Requirement: Review result comes from plugin readiness

A pull-request comment SHALL show `**Review result:** passed` only when the handoff result's `ready` is true, and `**Review result:** not passed` otherwise, with the recorded `reasons`. The watch SHALL NOT derive the result from the report verdict or from finding states. A handoff without `ready` SHALL render `not passed` and name the missing readiness result.

#### Scenario: The plugin is ready

- **WHEN** the handoff carries `ready: true`
- **THEN** the comment shows `**Review result:** passed`

#### Scenario: The plugin is not ready

- **WHEN** the handoff carries `ready: false` with reasons
- **THEN** the comment shows `**Review result:** not passed` and renders the reasons

#### Scenario: A legacy handoff has no readiness

- **WHEN** the handoff carries a report object but no `ready`
- **THEN** the comment shows `**Review result:** not passed` and names the missing readiness result

#### Scenario: A pass verdict does not override readiness

- **WHEN** the stored report says `pass` and `ready` is false
- **THEN** the comment still shows `not passed`

### Requirement: Trusted review result gates labels and landing

The trusted-result check SHALL treat the latest current-format trusted comment for the current head as passed only when its body carries `**Review result:** passed`. A comment that carries only `**Verdict:** pass` SHALL NOT count. Owner-review eligibility and invalidation, landing candidate listing and landing authorization SHALL use this judgment.

#### Scenario: A new-format result is trusted

- **WHEN** the latest trusted comment for the head carries `**Review result:** passed`
- **THEN** owner-review and landing treat the head as passing

#### Scenario: An old-format comment is ignored

- **WHEN** the latest trusted comment for the head carries only `**Verdict:** pass`
- **THEN** owner-review and landing do not treat the head as passing

#### Scenario: The latest result wins

- **WHEN** a later trusted comment for the head carries `**Review result:** not passed`
- **THEN** the head is not passing even if an earlier comment passed

#### Scenario: Owner-review is not added

- **WHEN** the current head has no trusted passed review result
- **THEN** the owner-review command does not add the label

#### Scenario: Landing is refused

- **WHEN** the current head has no trusted passed review result
- **THEN** the landing command refuses before prepare

### Requirement: The pull-request review document matches the comment contract

`docs/pr-review.md` SHALL describe the handoff result with `ready` and `reasons`, the `Review result` line, stable PR-local `F` numbers and the watch state numbering fields, the full recorded finding state with its fallback, the `pr-tree` profile and `pipeline.beforeArchive`, and the `review=pr` path in the session, landing, review-failed, stalled-review and self-mode recovery sections.

#### Scenario: The document states the handoff shape

- **WHEN** a reader opens the comment section
- **THEN** the document states that the handoff carries the full report result and that the comment prints `Review result`

#### Scenario: The document states the entry

- **WHEN** a reader opens the session flow
- **THEN** the document names `openspec_review review=pr` and the `pr-tree` profile

#### Scenario: The document states the record read

- **WHEN** a reader looks for the full finding state
- **THEN** the document names the `pr-review.json` record and the report-only fallback

#### Scenario: The document states the state and recovery

- **WHEN** a reader looks for state fields or recovery commands
- **THEN** the document names `findingNumbers`, `nextFindingNumber`, `review=pr` and `pr-review.json` in the landing and recovery sections

#### Scenario: The document scopes finding numbers

- **WHEN** a reader looks for the finding number semantics
- **THEN** the document states that `F` numbers are local to one pull request

## MODIFIED Requirements

### Requirement: Apply review precondition

The review session SHALL call `openspec_review action=status review=pr` with the PR worktree before starting. When status reports `policy: false`, the session SHALL start the review with the baseline review configuration as `configPath` and then require the returned mode to be `reviewer`. When a policy exists, the session SHALL review only when the `pr` entry is available, enabled and in independent reviewer mode.

#### Scenario: No locked policy

- **WHEN** status reports `policy: false` and the first start with the baseline configuration returns reviewer mode
- **THEN** the session proceeds with the `pr` review

#### Scenario: Self mode after start

- **WHEN** the first start returns self-review mode
- **THEN** the session publishes no review, submits no self-report, and reports the baseline configuration and its recovery

#### Scenario: Disabled or unavailable policy

- **WHEN** an existing policy is disabled or the `pr` entry is unavailable
- **THEN** the session publishes no review and reports the status

#### Scenario: The baseline configuration is refused

- **WHEN** the baseline configuration path is missing or invalid at the first start
- **THEN** the start fails and the session publishes no review

### Requirement: Independent reviewer prerequisite

Before enabling the scheduled watch, the maintainer SHALL confirm that the baseline `main` `openspec/reviews.json` declares a `pr` tree profile with `reviewers: 1`. When the first start returns self-review mode, the documented recovery SHALL be: fix the baseline file on `main`, remove the change's locked `policy.json` and `pr-review.json` with user approval, remove the apply state naming the PR checkout, and rerun; a fresh change name SHALL be the alternative.

#### Scenario: Profile prerequisite

- **WHEN** the maintainer enables the scheduled watch
- **THEN** the baseline `pr` entry names a tree profile with one reviewer

#### Scenario: Self mode recovery

- **WHEN** the first start returns self-review mode and locked a policy
- **THEN** the session reports the exact files to remove, the baseline configuration to fix, and publishes no review

### Requirement: Apply review on the pull-request branch

The session SHALL call `openspec_review` with `review: "pr"`, `baseline: "none"`, the merge base as `base`, the PR worktree and the baseline review configuration as `configPath`. The review object SHALL be the committed pull-request head tree; for a prepared landing the head contains the pre-merge main and is reviewed with it as `base`. A passed record matching the landing tree SHALL replace the prepared-landing review. No PR code SHALL be executed.

#### Scenario: First review round

- **WHEN** a candidate PR has no pr review record and the preconditions pass
- **THEN** the session starts the pr review with the explicit merge-base base, the baseline configuration and an independent reviewer

#### Scenario: Landing review tree

- **WHEN** a pull request is prepared for landing
- **THEN** the session reviews the head tree whose commit contains the pre-merge main

#### Scenario: Review evidence

- **WHEN** the reviewer inspects the PR worktree
- **THEN** it reads the committed head tree and CI evidence only, and it does not run the PR's install, test or build commands

#### Scenario: Passed record replaces the landing review

- **WHEN** a pull request is prepared for landing, the recorded pr review is passed and its `treeSha` equals the landing tree
- **THEN** the session advances `reviewed` without starting the prepared-landing review

### Requirement: Finding disposition on a new head

On a new head the session SHALL dispose every open finding from the previous round as `fixed` with a note that verification is pending, then resume the `pr` review. It SHALL NOT waive, defer or reject a finding.

#### Scenario: New head after findings

- **WHEN** the previous round left open findings and the author pushes a new head
- **THEN** the session disposes those findings as pending verification and resumes the `pr` review for the new head

#### Scenario: Reviewer verification

- **WHEN** the resumed reviewer reports a finding as still open or regressed
- **THEN** the finding remains blocking and the published comment carries that status

### Requirement: Report handoff and publication

The session SHALL write the complete `openspec_review action=report review=pr` result (`report`, `ready`, `reasons`) to `.cache/pr-review/reports/pr-<n>-<head>.json`. The watch SHALL render it as a comment with the result, summary, findings, verifications and scope notes, mark it with a hidden PR/head/round marker carrying its format, record the format in watch state, default to dry-run, publish only with `--apply`, and skip a current-format marker for the head.

#### Scenario: Dry run

- **WHEN** the comment command runs without `--apply`
- **THEN** it prints or writes the rendered comment without calling GitHub, including the full finding state and the review result

#### Scenario: Repeated publish

- **WHEN** a trusted comment in the current format for the same PR and head already exists
- **THEN** the watch skips the publish, reports that the head was already commented, and records the current format in watch state when the entry lacks it

#### Scenario: Old-format marker is republished

- **WHEN** the only trusted marker for the same PR and head carries an older marker format
- **THEN** the watch treats the head as not commented, publishes a new-format comment and records the current format

#### Scenario: Missing or stale report

- **WHEN** the report file is missing or names a different head
- **THEN** the watch refuses to publish and reports the expected path and head

#### Scenario: Full result handoff

- **WHEN** the session writes the result of `action=report` to the handoff file
- **THEN** the file carries `report`, `ready` and `reasons`, and the comment renders `Review result` from `ready`

#### Scenario: Legacy handoff

- **WHEN** the handoff carries a report object without `ready` or `reasons`
- **THEN** the watch accepts it, renders `Review result: not passed`, and names the missing readiness result

### Requirement: Apply-state cleanup

The watch SHALL determine whether a tracked PR is closed or merged by querying its state, and SHALL remove the checkout and matching apply state before any merged-tree review. It SHALL provide an operator command that performs the same cleanup for a tracked change. It SHALL remove the entry only when the entry names that checkout and SHALL refuse otherwise.

#### Scenario: Removing a closed PR checkout

- **WHEN** the watch determines that a tracked PR is closed or merged and its apply state names that checkout
- **THEN** it deletes that apply state entry and reports the cleanup

#### Scenario: Merged before the final review

- **WHEN** a PR is merged and its merged tree needs a final pr review
- **THEN** the watch removes the checkout and matching apply state before that review starts

#### Scenario: Stopped schedule

- **WHEN** the schedule is stopped with a PR checkout and apply state still present
- **THEN** the operator command removes the matching checkout and state without starting a review

#### Scenario: Foreign apply state

- **WHEN** the apply state names a different worktree
- **THEN** the watch refuses to delete it and leaves the state untouched

### Requirement: Landing authorization

`scripts/pr-review-land.mjs` SHALL land only a pull request whose base is the repository main branch, that carries the `mergeable` label, is open and non-draft, changes exactly one active change, has a trusted passed review result for its current head, has a green CI rollup and is mergeable. The script SHALL NOT add or remove the label.

#### Scenario: The label is absent

- **WHEN** a reviewed pull request has no `mergeable` label
- **THEN** the landing command reports a dry-run plan and does not merge

#### Scenario: Another base branch

- **WHEN** the pull request base is not the repository main branch
- **THEN** the landing command refuses before prepare

#### Scenario: The review is not a current pass

- **WHEN** the latest trusted review result is not passed, the head moved, or CI is not green
- **THEN** the landing command refuses and keeps the pull request open

#### Scenario: The pull request is not mergeable

- **WHEN** GitHub reports `CONFLICTING` or `DIRTY`
- **THEN** the landing command refuses without changing the pull request

### Requirement: Owner-review eligibility

The owner-review command SHALL add `owner-review` only when the pull request is open, non-draft, targets `main`, changes exactly one active change, has a green CI rollup, has `mergeable: MERGEABLE`, has a `mergeStateStatus` other than `DIRTY` or `BLOCKED`, has a trusted passed review result for its current head, and has no `mergeable` label. The watch state SHALL name that head and report `commented`.

#### Scenario: Every non-label gate passes

- **WHEN** an open, non-draft pull request targets `main`, changes one active change, has green CI, is mergeable without a conflicting state, has a trusted passed result for its head, has no `mergeable` label, and its watch state names that head as commented
- **THEN** the command adds `owner-review` and records the head

#### Scenario: No trusted pass for the head

- **WHEN** the only trusted review result is a pass for an older head, or no trusted passed result exists
- **THEN** the command does not add `owner-review`

#### Scenario: The head moved

- **WHEN** the watch state names a different head, or the PR head is not the reviewed head
- **THEN** the command does not add `owner-review` for the current head

#### Scenario: Continuous integration is not green

- **WHEN** the newest run of a check is failing or pending, no check exists, or the rollup is not green
- **THEN** the command does not add `owner-review`

#### Scenario: Mergeability or conflict state fails

- **WHEN** `mergeable` is not `MERGEABLE`, or `mergeStateStatus` is `DIRTY` or `BLOCKED`
- **THEN** the command does not add `owner-review`

#### Scenario: Authorization or eligibility already changed

- **WHEN** the pull request already carries `mergeable`, is a draft, targets another base, or changes two active changes
- **THEN** the command does not add `owner-review`

### Requirement: Owner-review invalidation

The owner-review command SHALL remove `owner-review` when the head differs from the labeled head, the `mergeable` label appears, the PR closes, CI stops being green, `mergeable` becomes `CONFLICTING`, `mergeStateStatus` becomes `DIRTY` or `BLOCKED`, the trusted passed result loses the head, the watch entry is missing or names another head, or the base, draft or active-change rules fail. It SHALL keep the label while `mergeable` is `UNKNOWN` unless another removal condition applies.

#### Scenario: The author changes the head

- **WHEN** the current head differs from the head recorded with `owner-review`
- **THEN** the command removes the label without waiting for the new head to be reviewed

#### Scenario: Main advances into a conflict

- **WHEN** a main advance makes the pull request `CONFLICTING` or `DIRTY`
- **THEN** the command removes `owner-review`

#### Scenario: The maintainer authorizes landing

- **WHEN** `mergeable` appears on a pull request carrying `owner-review`
- **THEN** the command removes the advisory label

#### Scenario: CI or review coverage regresses

- **WHEN** CI stops being green or the trusted passed result no longer covers the current head
- **THEN** the command removes `owner-review`

#### Scenario: Mergeability is unknown

- **WHEN** `mergeable` is `UNKNOWN`
- **THEN** the command keeps an existing `owner-review` label on a tracked pull request and adds no new one until the state resolves

#### Scenario: A new head qualifies

- **WHEN** the author pushes a new head, the head receives a trusted passed result, and every other non-label gate passes
- **THEN** the command removes the stale label and adds `owner-review` for the new head in the same run

### Requirement: Owner-review reconciliation

Reconcile SHALL inspect tracked pull requests and open pull requests carrying the label, add eligible labels, remove ineligible or orphaned labels except while a tracked pull request's only disqualifier is `mergeable` being `UNKNOWN`, and record or clear the labeled head in watch state.

#### Scenario: Reconcile backfills an eligible pull request

- **WHEN** a tracked pull request already has a trusted passed result and every non-label gate passes but it has no `owner-review` label
- **THEN** reconcile adds the label and records the current head

#### Scenario: Reconcile removes an orphaned label

- **WHEN** an open pull request has no watch state, or a tracked pull request fails a gate other than `mergeable: UNKNOWN`
- **THEN** reconcile removes `owner-review` and clears any recorded head

#### Scenario: Reconcile preserves an unknown merge state

- **WHEN** a tracked pull request carries `owner-review` and its only disqualifier is `mergeable: UNKNOWN`
- **THEN** reconcile keeps the label and does not add a new one until the state resolves

### Requirement: Fixed-session reviewer reuse

The session SHALL reuse one fixed session for every run. The landing stage SHALL resume the `pr` review in the same DSH session that started it, so the independent reviewer stays bound to the session. It SHALL skip the resume for a passed landing record. The final review SHALL use `openspec_review action=resume`, not `start`. A failed resume SHALL be recorded as the `review-failed` landing phase and stop the run; the session SHALL NOT call `replace`, start another session, or continue to merge.

#### Scenario: Final review resumes the reviewer

- **WHEN** the landing stage starts the final review on the landing branch
- **THEN** it resumes the recorded pr review and wakes the reviewer subagent bound to the same session

#### Scenario: Resume fails

- **WHEN** the reviewer cannot be resumed
- **THEN** `state --fail <n> --error <text> --apply` records the `review-failed` phase with the error, the checkout is kept, and the run stops without replacing the reviewer, starting another session or merging

#### Scenario: Reviewer is not started twice

- **WHEN** the pr review record already exists for the change
- **THEN** the final review does not call `start`

#### Scenario: A passed record skips the resume

- **WHEN** the pr review record is passed and its `treeSha` equals the landing tree
- **THEN** `reviewed` advances without `openspec_review action=resume`; otherwise the run uses the resume path

### Requirement: Latest-main landing preparation

`plan` and `prepare` SHALL fetch `origin/main` and require the pull-request head to contain it. When it does not, they SHALL refuse before creating a landing branch and name the sync command for a same-repository head or the author update for a fork head. When the head contains main, `prepare` SHALL create a local landing branch at the head, and the final pr review SHALL run on that head tree with `base` set to the pre-merge main.

#### Scenario: Plan refuses a behind head

- **WHEN** `plan` runs for a pull request whose fetched head does not contain `origin/main`
- **THEN** it refuses and names the sync command for a same-repository head or the author update for a fork head

#### Scenario: Prepare refuses before the landing branch

- **WHEN** `prepare` sees a head that does not contain `origin/main`
- **THEN** it refuses without creating a landing entry and leaves the branch unchanged

#### Scenario: The head contains main

- **WHEN** the fetched head contains `origin/main`
- **THEN** `prepare` creates the landing branch at the head and the final review uses the pre-merge main as `base`

### Requirement: Final review record gate

`reviewed` SHALL refuse to advance a landing when the pr review record for the landing branch is not `passed` or its `treeSha` does not equal the landing tree. A refusal SHALL not reach merge.

#### Scenario: The record is not passed

- **WHEN** `reviewed` runs and the pr review record is not `passed`
- **THEN** the landing does not advance to merge

#### Scenario: The record tree differs

- **WHEN** the record is passed but its `treeSha` differs from the landing tree
- **THEN** the landing does not advance to merge

#### Scenario: The record matches

- **WHEN** the record is passed and its `treeSha` equals the landing tree
- **THEN** the landing advances to `reviewed`

### Requirement: Same-run review landing

After a review run publishes a passed review result, the session SHALL re-list landing candidates and SHALL continue in the same run only when that listing returns the reviewed pull request as a landing candidate that is not behind `origin/main`; it SHALL then acquire the lock for that pull request and run `plan`, `prepare`, `reviewed`, `merge`, `openspec_archive`, `archive`, `push` and `finish`, with `finish` releasing the lock.

#### Scenario: A review pass continues into landing

- **WHEN** the re-listing returns the reviewed pull request as a candidate with `behind: false`, no other landing is unfinished, and the landing lock is free
- **THEN** the same run acquires the lock for that pull request and runs `plan`, `prepare`, `reviewed`, `merge`, `openspec_archive`, `archive`, `push` and `finish`
- **AND** `finish` releases the lock

#### Scenario: A behind pass waits for sync

- **WHEN** the re-listing returns the reviewed pull request as a candidate behind `origin/main`
- **THEN** the run stops before acquiring the lock
- **AND** a later run syncs a same-repository branch and reviews the new head

#### Scenario: An unlisted pass stops

- **WHEN** the re-listing does not return the reviewed pull request as a candidate because it lacks `mergeable`, another landing is unfinished, the landing lock is held, or a behind fork is refused with an author-update reason
- **THEN** the run stops without acquiring the lock and the next run follows the existing flow
- **AND** a behind fork is reported to its author

### Requirement: The review session uses the baseline main configuration

The watch SHALL copy the baseline `main` `openspec/reviews.json` to a path outside the PR checkout and pass that path as `configPath` when the session locks the PR change's policy. The session SHALL use the `pr` entry, and the copy SHALL set `pipeline.beforeArchive` to `pr`; the PR head's own file SHALL NOT supply the review parameters. A missing baseline file or `pr` entry SHALL refuse the review.

#### Scenario: The baseline file is used

- **WHEN** the session locks the PR change's policy
- **THEN** it passes the copied baseline configuration and the policy records that source

#### Scenario: The PR head changes its own file

- **WHEN** the PR head carries a different `openspec/reviews.json` than the baseline
- **THEN** the review parameters come from the baseline configuration

#### Scenario: The baseline file is missing

- **WHEN** `main` has no `openspec/reviews.json`
- **THEN** the review is refused and the refusal names the missing baseline file

#### Scenario: The baseline has no pr entry

- **WHEN** the baseline file declares no `pr` entry or its profile is not a tree profile
- **THEN** the review is refused and the refusal names the missing or invalid `pr` entry

### Requirement: Same-head idempotency and new-head rounds

The watch SHALL NOT start another review for a head whose `pr` review is published in the current format. A prepared or failed head SHALL be re-emitted for retry without a new round. A commented head with an older marker format SHALL be re-emitted for publication only, without a new round. A changed head SHALL start a new round after its findings are disposed, and a passed `pr` review SHALL start no further round until the head changes.

#### Scenario: Commented head

- **WHEN** the poll sees a PR whose head equals the last processed head and its watch entry records the current comment format as `commented`
- **THEN** it skips the PR and starts no reviewer

#### Scenario: Old-format commented head

- **WHEN** the poll sees a commented head whose watch entry carries no current comment format
- **THEN** it re-emits the candidate for publication with `resume: true` and starts no new review round

#### Scenario: Unpublished head

- **WHEN** the poll sees a recorded head whose status is `prepared` or `failed`
- **THEN** it re-emits the candidate with `resume: true` and its worktree, without starting a new round

#### Scenario: Passed review

- **WHEN** the latest trusted review result is passed and its publish succeeded
- **THEN** the watch stops reviewing that head and waits for a new head or the PR to close

### Requirement: Scheduled run sequencing

The session SHALL reconcile `owner-review` and clean up each run. It SHALL advance one landing phase in order: resume or prepare a landing, land a mergeable candidate including a same-repository sync. When no landing phase advances, or a local owner holds the lock, it MAY review one candidate. A ready final pr review SHALL merge, archive and push in the same locked run. A synced head SHALL stop the run and release the lock. Local pull requests SHALL be reported, never reviewed or landed.

#### Scenario: A run stops after one landing phase

- **WHEN** a run completes a sync, or a prepare outside the same-run review landing, or a landing gate refuses
- **THEN** it stops, and a later run resumes from the recorded landing phase, syncs a same-repository branch, or reviews the new head

#### Scenario: A polling run

- **WHEN** a run runs cleanup and reviews one candidate
- **THEN** it stops after the review, or continues into landing when the same-run review landing requirement applies
- **AND** the next run polls again after cleanup without resuming a landing

#### Scenario: A cleanup-only run

- **WHEN** no candidate and no unfinished landing exist
- **THEN** the run runs cleanup and stops

#### Scenario: Final review and merge in one run

- **WHEN** the final pr review becomes ready and the landing lock is free
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

#### Scenario: A run acquires the lock before landing

- **WHEN** a run has a contributor landing phase to advance
- **THEN** it runs the read-only candidate listing before acquiring the landing lock
- **AND** it passes the recorded owner session to the landing command

#### Scenario: Local pull request needs recovery

- **WHEN** a local pull request is merged but not landed
- **THEN** the run reports it and does not retarget, land or merge it

### Requirement: Open pull-request polling

`poll` SHALL report a contributor pull request as a candidate only when it is non-draft, has a green CI rollup, changes exactly one active change, and its head SHA has no published review in the current format. A prepared or failed head SHALL be re-emitted for retry. A head with only an older-format review SHALL be re-emitted for publication without a new review. It SHALL exclude a local pull request. A pull request with pending or no checks SHALL NOT be a candidate.

#### Scenario: Mixed pull-request list

- **WHEN** the open list contains a draft PR, a PR with a failed check, a PR with pending checks, a PR with no checks, a PR with two active changes, an already-commented head in the current format, an old-format-commented head, and one eligible PR
- **THEN** the eligible PR and the old-format-commented head are reported as candidates, the current-format-commented head is excluded, and each candidate carries its number, head, baseRefOid, baseRefName, change, worktree, status and resume

#### Scenario: Local pull request is not a review candidate

- **WHEN** the open list contains a pull request recorded as local
- **THEN** it is not reported as a review candidate

#### Scenario: No eligible pull request

- **WHEN** every open PR is filtered out
- **THEN** the poll reports an empty candidate list and exits successfully
