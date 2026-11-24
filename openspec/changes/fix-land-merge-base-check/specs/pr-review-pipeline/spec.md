# Spec Delta

## MODIFIED Requirements

### Requirement: Landing state and recovery

The landing command SHALL keep a landing state keyed by pull request with the head, pre-merge main, landing branch, reviewed tree, merged main head, archive commit and phase. It SHALL process one pull request at a time, reuse a completed phase on retry, never merge twice and never force main. A pre-merge landing SHALL be abandonable without changing the watch entry; a post-merge landing SHALL NOT be abandoned.

#### Scenario: Retry after a partial landing

- **WHEN** a retry finds the pull request already merged and the reviewed tree matched
- **THEN** it resumes at archive instead of merging again

#### Scenario: Concurrent landing

- **WHEN** another pull request has an unfinished landing
- **THEN** the command refuses to start a second one

#### Scenario: Main moved before merge

- **WHEN** the base tip GitHub reports for the pull request (`baseRefOid`) differs from the recorded pre-merge main
- **THEN** the command refuses without calling `gh pr merge`, records `failed` and asks for a fresh prepare and review

#### Scenario: The local tracking ref is stale

- **WHEN** the local `origin/main` was not fetched and still equals the recorded pre-merge main while GitHub reports a different base tip
- **THEN** the command still refuses without merging

#### Scenario: A pre-merge landing is abandoned

- **WHEN** a landing is prepared or reviewed and cannot proceed
- **THEN** `abandon <n> --apply` removes its local checkout and branch without changing the watch entry

#### Scenario: A post-merge landing is not abandoned

- **WHEN** the pull request is already merged
- **THEN** abandon refuses and the landing must continue through archive and push

## ADDED Requirements

### Requirement: Merge pins the reviewed head

`merge` SHALL pass `--match-head-commit` with the reviewed pull-request head whenever it calls `gh pr merge --rebase`, so that GitHub merges only the head the final review checked.

#### Scenario: The merge command carries the head

- **WHEN** `merge` passes its checks and the pull-request head equals the recorded head
- **THEN** the merge command carries `--rebase` and `--match-head-commit` followed by that head

#### Scenario: The head moves before GitHub merges

- **WHEN** the pull-request head changes after `merge` passed its checks and before GitHub merges
- **THEN** GitHub refuses the merge and the landing records the failed merge command without a second merge
