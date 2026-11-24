# Spec Delta

## MODIFIED Requirements

### Requirement: Landing state and recovery

The landing command SHALL keep a landing state keyed by pull request with the head, pre-merge main, landing branch, reviewed tree, merged main head, archive commit and phase. It SHALL process one unfinished landing at a time, reuse a completed phase on retry, never merge twice and never force main. A pre-merge landing SHALL be abandonable without changing the watch entry; a post-merge landing SHALL NOT be abandoned.

#### Scenario: Retry after a partial landing

- **WHEN** a retry finds the pull request already merged and the reviewed tree matched
- **THEN** it resumes at archive instead of merging again

#### Scenario: Concurrent landing

- **WHEN** another pull request has an unfinished landing
- **THEN** the command refuses to start a second one

#### Scenario: Main moved before merge

- **WHEN** `origin/main` differs from the recorded pre-merge main
- **THEN** the command refuses and requires a fresh prepare and review

#### Scenario: A pre-merge landing is abandoned

- **WHEN** a landing is prepared or reviewed and cannot proceed
- **THEN** `abandon <n> --apply` removes its local checkout and branch without changing the watch entry

#### Scenario: A post-merge landing is not abandoned

- **WHEN** the pull request is already merged
- **THEN** abandon refuses and the landing must continue through archive and push

## ADDED Requirements

### Requirement: Pushed landing cleanup

A landing whose main is already pushed SHALL NOT count as unfinished: only the cleanup of `finish` remains. That cleanup SHALL stay retryable on the `pushed` phase, SHALL NOT push main again, and a failure SHALL NOT refuse `candidates` or `prepare` for another pull request.

#### Scenario: The cleanup fails after the push

- **WHEN** `finish` fails after the landing pushed main
- **THEN** the phase stays `pushed`, another pull request is still listed and prepared, and the failed entry keeps its manifest

#### Scenario: The cleanup is retried

- **WHEN** `finish` runs again after the failure is cleared
- **THEN** it writes the manifest, removes the checkout and branch, clears the entry and leaves `origin/main` unchanged
